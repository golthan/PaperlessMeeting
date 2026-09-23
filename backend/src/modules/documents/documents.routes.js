import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { uploadDocument } from "../../middlewares/upload.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  DOCUMENT_STATUSES,
  requireFields
} from "../../utils/validators.js";
import { resolveUploadPath } from "../../utils/file.js";
import {
  assertMeetingAccess,
  assertMeetingChairman,
  assertParticipantAccess,
  canSeeFullMeetingRecord,
  getMeetingRole
} from "../meetings/meetingAccess.js";
import { emitMeetingEvent, emitToUsers } from "../../config/socket.js";
import {
  NOTIFICATION_TYPES,
  notifyMeetingAudience,
  notifyUsers
} from "../notifications/notifications.service.js";
import { assertCanEditSharedNotes } from "../notes/notes.routes.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import { env } from "../../config/env.js";
import {
  askAboutDocument,
  isAiConfigured,
  summarizeDocument
} from "../ai/ai.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../..");

export const meetingDocumentsRouter = express.Router({ mergeParams: true });
export const documentsRouter = express.Router();

async function getDocument(documentId) {
  const { rows } = await pool.query(
    `SELECT doc.*, m.organizer_id, m.status AS meeting_status
     FROM documents doc
     JOIN meetings m ON m.id = doc.meeting_id
     WHERE doc.id = $1 AND doc.deleted_at IS NULL`,
    [documentId]
  );
  if (!rows[0]) throw notFound("Document not found");
  return rows[0];
}

async function assertDocumentAccess(user, document) {
  const meeting = await assertMeetingAccess(user, document.meeting_id);
  if (document.status === "APPROVED") return;
  // Người gửi luôn mở được tài liệu của chính mình để theo dõi (kể cả khi chờ duyệt / bị từ chối).
  if (document.uploaded_by === user.id) return;
  // Chủ tọa / thư ký phải đọc được tài liệu chờ duyệt thì mới duyệt được.
  if (await canSeeFullMeetingRecord(user, meeting)) return;
  throw forbidden("Tài liệu chưa được duyệt");
}

meetingDocumentsRouter.use(authenticate);
documentsRouter.use(authenticate);

meetingDocumentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingAccess(req.user, req.params.meetingId);
    const limitedView = !(await canSeeFullMeetingRecord(req.user, meeting));

    const { rows } = await pool.query(
      `SELECT doc.*, u.full_name AS uploaded_by_name
       FROM documents doc
       JOIN users u ON u.id = doc.uploaded_by
       WHERE doc.meeting_id = $1
         AND doc.deleted_at IS NULL
         AND ($2::boolean = false OR doc.status = 'APPROVED' OR doc.uploaded_by = $3)
       ORDER BY doc.created_at DESC`,
      [req.params.meetingId, limitedView, req.user.id]
    );
    res.json({ data: rows });
  })
);

/** Xoá file vừa nhận khi request bị từ chối, tránh để lại rác trong thư mục upload. */
async function discardUpload(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch {
    // File có thể đã bị xoá; bỏ qua.
  }
}

meetingDocumentsRouter.post(
  "/",
  uploadDocument.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Vui lòng chọn file tài liệu");

    let status = "PENDING";
    let meeting = null;
    try {
      // Chủ tọa và thư ký đăng thẳng; thành viên gửi lên chờ chủ tọa duyệt.
      meeting = await assertParticipantAccess(req.user, req.params.meetingId);
      const role = await getMeetingRole(req.user, meeting);
      if (["CHAIRMAN", "SECRETARY"].includes(role)) {
        status = "APPROVED";
      } else {
        const permission = await pool.query(
          `SELECT can_upload_document
           FROM meeting_participants
           WHERE meeting_id = $1 AND user_id = $2`,
          [req.params.meetingId, req.user.id]
        );
        if (!permission.rows[0]?.can_upload_document) {
          throw forbidden("Bạn không được cấp quyền gửi tài liệu trong cuộc họp này");
        }
      }

      // Hồ sơ cuộc họp đóng lại sau khi kết thúc hoặc bị huỷ.
      if (["FINISHED", "CANCELLED"].includes(meeting.status)) {
        throw badRequest("Cuộc họp đã kết thúc hoặc bị huỷ nên không gửi thêm tài liệu được");
      }
    } catch (error) {
      await discardUpload(req.file);
      throw error;
    }

    const relativePath = path
      .relative(backendRoot, req.file.path)
      .replaceAll(path.sep, "/");

    const { rows } = await pool.query(
      `INSERT INTO documents
        (meeting_id, uploaded_by, original_name, display_name, description,
         file_path, mime_type, size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.meetingId,
        req.user.id,
        req.file.originalname,
        req.body.displayName || req.file.originalname,
        req.body.description || null,
        relativePath,
        req.file.mimetype,
        req.file.size,
        status
      ]
    );

    const document = { ...rows[0], uploaded_by_name: req.user.full_name };
    // Tài liệu đã duyệt hiện cho cả phòng; tài liệu chờ duyệt chỉ chủ tọa và người gửi thấy.
    if (status === "APPROVED") {
      emitMeetingEvent(req.params.meetingId, "document_added", document);
    } else {
      emitToUsers([meeting.organizer_id, req.user.id], "document_added", document);
    }

    if (status === "PENDING") {
      await notifyUsers([meeting.organizer_id], {
        type: NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
        severity: "WARNING",
        meetingId: req.params.meetingId,
        actorId: req.user.id,
        title: "Tài liệu chờ duyệt",
        message: `${req.user.full_name} vừa tải lên "${document.display_name}" cho cuộc họp "${meeting.title}".`,
        metadata: { documentId: document.id },
        excludeUserId: req.user.id
      });
    } else {
      await notifyMeetingAudience(req.params.meetingId, {
        type: NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
        severity: "INFO",
        actorId: req.user.id,
        title: "Tài liệu mới trong cuộc họp",
        message: `${req.user.full_name} vừa đăng "${document.display_name}".`,
        metadata: { documentId: document.id },
        excludeUserId: req.user.id
      });
    }

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_UPLOAD,
      entityType: "DOCUMENT",
      entityId: document.id,
      meetingId: req.params.meetingId,
      description: `Đăng tài liệu "${document.display_name}" (${status === "APPROVED" ? "duyệt ngay" : "chờ duyệt"})`,
      metadata: { status, size: document.size, mimeType: document.mime_type }
    });

    res.status(201).json({ data: document });
  })
);

documentsRouter.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    // Tải tài liệu là hành vi cần truy vết nhất khi có sự cố rò rỉ.
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD,
      entityType: "DOCUMENT",
      entityId: document.id,
      meetingId: document.meeting_id,
      description: `Tải tài liệu "${document.display_name}"`
    });

    res.download(resolveUploadPath(document.file_path), document.original_name);
  })
);

documentsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);
    assertEnum(req.body.status, DOCUMENT_STATUSES, "document status");

    const { rows } = await pool.query(
      `UPDATE documents
       SET display_name = COALESCE($1, display_name),
           description = $2,
           status = COALESCE($3, status),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [
        req.body.displayName || null,
        req.body.description || null,
        req.body.status || null,
        req.params.id
      ]
    );

    res.json({ data: rows[0] });
  })
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);

    await pool.query(
      "UPDATE documents SET deleted_at = now(), updated_at = now() WHERE id = $1",
      [req.params.id]
    );
    emitMeetingEvent(document.meeting_id, "document_removed", { id: req.params.id });
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_DELETE,
      entityType: "DOCUMENT",
      entityId: req.params.id,
      meetingId: document.meeting_id,
      description: `Xoá tài liệu "${document.display_name}"`
    });
    res.status(204).send();
  })
);

documentsRouter.put(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);
    const { rows } = await pool.query(
      `UPDATE documents SET status = 'APPROVED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    emitMeetingEvent(document.meeting_id, "document_updated", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_APPROVE,
      entityType: "DOCUMENT",
      entityId: rows[0].id,
      meetingId: document.meeting_id,
      description: `Duyệt tài liệu "${rows[0].display_name}"`
    });

    await notifyUsers([document.uploaded_by], {
      type: NOTIFICATION_TYPES.DOCUMENT_REVIEWED,
      severity: "SUCCESS",
      meetingId: document.meeting_id,
      actorId: req.user.id,
      title: "Tài liệu được duyệt",
      message: `"${rows[0].display_name}" đã được duyệt và hiển thị cho cả cuộc họp.`,
      metadata: { documentId: rows[0].id },
      excludeUserId: req.user.id
    });
    await notifyMeetingAudience(document.meeting_id, {
      type: NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
      severity: "INFO",
      actorId: req.user.id,
      title: "Tài liệu mới trong cuộc họp",
      message: `"${rows[0].display_name}" đã được duyệt, bạn có thể xem trong phòng họp.`,
      metadata: { documentId: rows[0].id },
      excludeUserId: document.uploaded_by
    });

    res.json({ data: rows[0] });
  })
);

documentsRouter.put(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);
    const { rows } = await pool.query(
      `UPDATE documents SET status = 'REJECTED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    // Tài liệu bị từ chối không hiện cho cả phòng, chỉ chủ tọa và người gửi biết.
    emitToUsers([document.organizer_id, document.uploaded_by], "document_updated", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_REJECT,
      entityType: "DOCUMENT",
      entityId: rows[0].id,
      meetingId: document.meeting_id,
      description: `Từ chối tài liệu "${rows[0].display_name}"`
    });

    await notifyUsers([document.uploaded_by], {
      type: NOTIFICATION_TYPES.DOCUMENT_REVIEWED,
      severity: "DANGER",
      meetingId: document.meeting_id,
      actorId: req.user.id,
      title: "Tài liệu bị từ chối",
      message: `"${rows[0].display_name}" không được duyệt. Vui lòng kiểm tra và tải lên bản khác.`,
      metadata: { documentId: rows[0].id },
      excludeUserId: req.user.id
    });

    res.json({ data: rows[0] });
  })
);

documentsRouter.put(
  "/:id/present",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);

    const { rows } = await pool.query(
      `WITH cleared AS (
         UPDATE documents
         SET is_presenting = false, updated_at = now()
         WHERE meeting_id = $1 AND deleted_at IS NULL
       )
       UPDATE documents
       SET is_presenting = true,
           current_page = COALESCE($2, current_page),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [document.meeting_id, req.body.currentPage || 1, req.params.id]
    );

    emitMeetingEvent(document.meeting_id, "current_document_updated", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_PRESENT,
      entityType: "DOCUMENT",
      entityId: rows[0].id,
      meetingId: document.meeting_id,
      description: `Trình chiếu tài liệu "${rows[0].display_name}"`
    });
    res.json({ data: rows[0] });
  })
);

documentsRouter.put(
  "/:id/page",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingChairman(req.user, document.meeting_id);
    const currentPage = Math.max(Number(req.body.currentPage || 1), 1);

    const { rows } = await pool.query(
      `UPDATE documents
       SET current_page = $1, is_presenting = true, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [currentPage, req.params.id]
    );

    emitMeetingEvent(document.meeting_id, "current_document_updated", rows[0]);
    res.json({ data: rows[0] });
  })
);

/**
 * Xem tài liệu ngay trong hộp làm việc của phòng họp (không tải về).
 * Trình duyệt xem trực tiếp được PDF và ảnh; định dạng Office thì client
 * chuyển sang nút tải về.
 */
documentsRouter.get(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    res.setHeader("Content-Type", document.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.original_name)}"`
    );
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_VIEW,
      entityType: "DOCUMENT",
      entityId: document.id,
      meetingId: document.meeting_id,
      description: `Xem tài liệu "${document.display_name}"`
    });

    res.sendFile(resolveUploadPath(document.file_path));
  })
);

/**
 * Nội dung tài liệu dạng JSON (base64) để trình duyệt tự dựng lại file và xem trước.
 *
 * Không trả thẳng file nhị phân như /preview vì các trình quản lý tải xuống phổ biến
 * (Internet Download Manager...) chặn mọi phản hồi application/pdf của trình duyệt ở
 * tầng mạng, bật hộp thoại tải về và trả cho trang một phản hồi 204 rỗng không có
 * header CORS — khiến ô xem trước luôn báo lỗi. Phản hồi JSON không bị chặn.
 */
documentsRouter.get(
  "/:id/content",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    const buffer = await fs.promises.readFile(resolveUploadPath(document.file_path));
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_VIEW,
      entityType: "DOCUMENT",
      entityId: document.id,
      meetingId: document.meeting_id,
      description: `Xem tài liệu "${document.display_name}"`
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: {
        id: document.id,
        name: document.original_name,
        mimeType: document.mime_type || "application/octet-stream",
        size: buffer.length,
        base64: buffer.toString("base64")
      }
    });
  })
);

/** Ghi chú chung gắn với một tài liệu — nội dung hiển thị trong hộp tài liệu. */
documentsRouter.get(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    const { rows } = await pool.query(
      `SELECT dn.*, u.full_name AS updated_by_name
       FROM document_notes dn
       LEFT JOIN users u ON u.id = dn.updated_by
       WHERE dn.document_id = $1`,
      [req.params.id]
    );
    res.json({ data: rows[0] || null });
  })
);

documentsRouter.put(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertCanEditSharedNotes(req.user, document.meeting_id);

    const content = String(req.body.content || "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 20000);

    const { rows } = await pool.query(
      `INSERT INTO document_notes (document_id, meeting_id, content, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (document_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING *`,
      [req.params.id, document.meeting_id, content, req.user.id]
    );

    const note = { ...rows[0], updated_by_name: req.user.full_name };
    emitMeetingEvent(document.meeting_id, "document_notes_synced", note);
    res.json({ data: note });
  })
);

/**
 * Tóm tắt tài liệu bằng AI.
 * Chỉ chủ tọa và thư ký được bấm tóm tắt (vừa là khâu kiểm duyệt nội dung,
 * vừa tránh nhiều người cùng gọi API tốn chi phí); kết quả lưu vào tài liệu
 * nên cả phòng họp đều đọc được.
 */
documentsRouter.post(
  "/:id/summary",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertCanEditSharedNotes(req.user, document.meeting_id);

    const { summary, model } = await summarizeDocument(document);

    const { rows } = await pool.query(
      `UPDATE documents
       SET ai_summary = $1, ai_summary_model = $2, ai_summary_updated_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [summary, model, req.params.id]
    );

    emitMeetingEvent(document.meeting_id, "document_updated", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_AI_SUMMARY,
      entityType: "DOCUMENT",
      entityId: req.params.id,
      meetingId: document.meeting_id,
      description: `Tóm tắt tài liệu "${document.display_name}" bằng AI`,
      metadata: { model }
    });

    res.json({ data: rows[0] });
  })
);

/** Lịch sử hỏi đáp của một tài liệu, cả phòng họp cùng xem được. */
documentsRouter.get(
  "/:id/questions",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    const { rows } = await pool.query(
      `SELECT * FROM document_questions
       WHERE document_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [req.params.id]
    );
    res.json({ data: rows });
  })
);

/** Hỏi AI về nội dung tài liệu, câu trả lời kèm trích dẫn trang. */
documentsRouter.post(
  "/:id/ask",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    const question = String(req.body.question || "").trim().slice(0, 500);
    if (!question) throw badRequest("Nhập câu hỏi về tài liệu");

    const { answer, citations, model } = await askAboutDocument(document, question);

    const { rows } = await pool.query(
      `INSERT INTO document_questions
         (document_id, meeting_id, asked_by, asked_by_name, question, answer, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.params.id,
        document.meeting_id,
        req.user.id,
        req.user.full_name,
        question,
        answer,
        model
      ]
    );

    const record = { ...rows[0], citations };
    emitMeetingEvent(document.meeting_id, "document_question_added", record);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.DOCUMENT_AI_ASK,
      entityType: "DOCUMENT",
      entityId: req.params.id,
      meetingId: document.meeting_id,
      description: `Hỏi AI về tài liệu "${document.display_name}": ${question}`,
      metadata: { model }
    });

    res.status(201).json({ data: record });
  })
);

/** Cho giao diện biết đã cấu hình khoá API hay chưa. */
documentsRouter.get(
  "/ai/status",
  asyncHandler(async (_req, res) => {
    res.json({ data: { configured: isAiConfigured(), model: env.aiModel } });
  })
);
