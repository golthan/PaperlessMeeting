import express from "express";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import { requireFields } from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingChairman,
  assertMeetingLeadership,
  canSeeFullMeetingRecord,
  getMeetingRole
} from "../meetings/meetingAccess.js";
import {
  NOTIFICATION_TYPES,
  notifyMeetingAudience
} from "../notifications/notifications.service.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import { generateMinutesContent } from "./minutes.generator.js";
import { streamMinutesPdf, hasVietnameseFonts } from "./minutes.pdf.js";
import {
  buildVerificationCode,
  canonicalMinutes,
  ensureSigningKey,
  hashMinutes,
  signContent,
  verifyMinutesIntegrity
} from "./minutes.signing.js";

export const meetingMinutesRouter = express.Router({ mergeParams: true });
export const minutesRouter = express.Router();

async function getMinutes(id) {
  const { rows } = await pool.query(
    `SELECT mn.*, m.title AS meeting_title, m.organizer_id, m.start_time, m.end_time,
            m.meeting_type, m.room_id
     FROM minutes mn
     JOIN meetings m ON m.id = mn.meeting_id
     WHERE mn.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound("Không tìm thấy biên bản");
  return rows[0];
}

/** Đường dẫn trang tra cứu công khai in kèm mã QR. */
function verificationUrl(code) {
  if (!code) return null;
  return `${env.clientOrigin.replace(/\/$/, "")}/verify/${code}`;
}

/**
 * Ai được ký: chủ tọa cuộc họp ký với chức danh "Chủ tọa",
 * thư ký của cuộc họp ký với chức danh "Thư ký".
 */
async function resolveSignerTitle(user, minutes) {
  const role = await getMeetingRole(user, {
    id: minutes.meeting_id,
    organizer_id: minutes.organizer_id
  });
  if (role === "CHAIRMAN") return "Chủ tọa";
  if (role === "SECRETARY") return "Thư ký";
  throw forbidden("Chỉ chủ tọa hoặc thư ký của cuộc họp được ký biên bản");
}

/** Đã có chữ ký thì nội dung bị khoá, phải gỡ chữ ký mới sửa được. */
async function assertNotSigned(minutesId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM minutes_signatures WHERE minutes_id = $1",
    [minutesId]
  );
  if (rows[0].count > 0) {
    throw badRequest(
      "Biên bản đã được ký số nên không sửa được. Hãy gỡ chữ ký trước khi chỉnh sửa."
    );
  }
}

meetingMinutesRouter.use(authenticate);
minutesRouter.use(authenticate);

meetingMinutesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingAccess(req.user, req.params.meetingId);
    // Thư ký soạn bản nháp thì phải mở lại được bản nháp đó.
    const limitedView = !(await canSeeFullMeetingRecord(req.user, meeting));
    const { rows } = await pool.query(
      `SELECT *
       FROM minutes
       WHERE meeting_id = $1
         AND ($2::boolean = false OR status = 'PUBLISHED')`,
      [req.params.meetingId, limitedView]
    );
    if (!rows[0]) return res.json({ data: null });

    const integrity = await verifyMinutesIntegrity(rows[0]);
    res.json({
      data: {
        ...rows[0],
        integrity,
        verificationUrl: verificationUrl(rows[0].verification_code)
      }
    });
  })
);

meetingMinutesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingLeadership(req.user, req.params.meetingId);
    requireFields(req.body, ["content"]);

    const existing = await pool.query("SELECT id FROM minutes WHERE meeting_id = $1", [
      req.params.meetingId
    ]);
    if (existing.rows[0]) await assertNotSigned(existing.rows[0].id);

    const { rows } = await pool.query(
      `INSERT INTO minutes (meeting_id, content, conclusion, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (meeting_id) DO UPDATE
         SET content = EXCLUDED.content,
             conclusion = COALESCE(EXCLUDED.conclusion, minutes.conclusion),
             updated_at = now()
       RETURNING *`,
      [
        req.params.meetingId,
        req.body.content.trim(),
        req.body.conclusion?.trim() || null,
        req.user.id
      ]
    );

    // Cập nhật vân tay ngay để biết nội dung hiện tại tương ứng mã băm nào.
    const hash = hashMinutes(rows[0]);
    await pool.query("UPDATE minutes SET content_hash = $1 WHERE id = $2", [
      hash,
      rows[0].id
    ]);

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_SAVE,
      entityType: "MINUTES",
      entityId: rows[0].id,
      meetingId: req.params.meetingId,
      description: "Lưu nội dung biên bản"
    });

    res.status(201).json({ data: { ...rows[0], content_hash: hash } });
  })
);

/**
 * Tự sinh biên bản từ dữ liệu cuộc họp: thành phần, điểm danh, chương trình,
 * tài liệu, kết quả biểu quyết, ghi chú chung và nhiệm vụ được giao.
 */
meetingMinutesRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    await assertMeetingLeadership(req.user, req.params.meetingId);

    const existing = await pool.query("SELECT id FROM minutes WHERE meeting_id = $1", [
      req.params.meetingId
    ]);
    if (existing.rows[0]) await assertNotSigned(existing.rows[0].id);

    const generated = await generateMinutesContent(req.params.meetingId);
    if (!generated) throw notFound("Không tìm thấy cuộc họp");

    const { rows } = await pool.query(
      `INSERT INTO minutes (meeting_id, content, decisions, created_by, generated_at, status)
       VALUES ($1, $2, $3, $4, now(), 'DRAFT')
       ON CONFLICT (meeting_id) DO UPDATE
         SET content = EXCLUDED.content,
             decisions = EXCLUDED.decisions,
             generated_at = now(),
             status = 'DRAFT',
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, generated.content, generated.decisions, req.user.id]
    );

    const hash = hashMinutes(rows[0]);
    await pool.query("UPDATE minutes SET content_hash = $1 WHERE id = $2", [
      hash,
      rows[0].id
    ]);

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_GENERATE,
      entityType: "MINUTES",
      entityId: rows[0].id,
      meetingId: req.params.meetingId,
      description: "Tự sinh biên bản từ dữ liệu cuộc họp",
      metadata: generated.stats
    });

    res.json({ data: { ...rows[0], content_hash: hash }, meta: generated.stats });
  })
);

minutesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingLeadership(req.user, minutes.meeting_id);
    await assertNotSigned(req.params.id);
    requireFields(req.body, ["content"]);

    const { rows } = await pool.query(
      `UPDATE minutes
       SET content = $1,
           conclusion = COALESCE($2, conclusion),
           status = 'DRAFT',
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [req.body.content.trim(), req.body.conclusion?.trim() || null, req.params.id]
    );

    const hash = hashMinutes(rows[0]);
    await pool.query("UPDATE minutes SET content_hash = $1 WHERE id = $2", [
      hash,
      req.params.id
    ]);

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_SAVE,
      entityType: "MINUTES",
      entityId: req.params.id,
      meetingId: minutes.meeting_id,
      description: "Cập nhật nội dung biên bản"
    });

    res.json({ data: { ...rows[0], content_hash: hash } });
  })
);

/** Ký số biên bản. Mỗi người ký một lần, ký lại thì thay chữ ký cũ. */
minutesRouter.post(
  "/:id/sign",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingAccess(req.user, minutes.meeting_id);
    const signerTitle = await resolveSignerTitle(req.user, minutes);

    if (!minutes.content?.trim()) {
      throw badRequest("Biên bản chưa có nội dung nên chưa ký được");
    }

    const key = await ensureSigningKey(req.user.id);
    const canonical = canonicalMinutes(minutes);
    const contentHash = hashMinutes(minutes);
    const signature = signContent(canonical, key.private_key);

    await pool.query(
      `INSERT INTO minutes_signatures
         (minutes_id, signer_id, signer_name, signer_title, content_hash, signature, algorithm)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (minutes_id, signer_id) DO UPDATE
         SET content_hash = EXCLUDED.content_hash,
             signature = EXCLUDED.signature,
             signer_title = EXCLUDED.signer_title,
             signed_at = now()`,
      [
        req.params.id,
        req.user.id,
        req.user.full_name,
        signerTitle,
        contentHash,
        signature,
        key.algorithm
      ]
    );

    await pool.query("UPDATE minutes SET content_hash = $1 WHERE id = $2", [
      contentHash,
      req.params.id
    ]);

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_SIGN,
      entityType: "MINUTES",
      entityId: req.params.id,
      meetingId: minutes.meeting_id,
      description: `${req.user.full_name} ký số biên bản với chức danh ${signerTitle}`,
      metadata: { contentHash, signerTitle }
    });

    const integrity = await verifyMinutesIntegrity({ ...minutes, content_hash: contentHash });
    res.json({ data: { integrity, signerTitle } });
  })
);

/** Gỡ toàn bộ chữ ký để sửa lại biên bản — thao tác này được ghi nhật ký. */
minutesRouter.delete(
  "/:id/signatures",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingChairman(req.user, minutes.meeting_id);
    if (minutes.status === "PUBLISHED") {
      throw badRequest("Biên bản đã ban hành, không gỡ chữ ký được");
    }

    const { rowCount } = await pool.query(
      "DELETE FROM minutes_signatures WHERE minutes_id = $1",
      [req.params.id]
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_SIGN,
      entityType: "MINUTES",
      entityId: req.params.id,
      meetingId: minutes.meeting_id,
      description: `Gỡ ${rowCount} chữ ký để sửa lại biên bản`
    });

    res.json({ data: { removed: rowCount } });
  })
);

minutesRouter.put(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingChairman(req.user, minutes.meeting_id);
    if (!minutes.content?.trim()) throw badRequest("Biên bản chưa có nội dung");

    const integrity = await verifyMinutesIntegrity(minutes);
    if (!integrity.signed) {
      throw badRequest("Biên bản phải được ký số trước khi ban hành");
    }
    if (!integrity.intact) {
      throw badRequest(
        "Chữ ký không còn hợp lệ vì nội dung đã thay đổi. Hãy ký lại trước khi ban hành."
      );
    }
    // Cố tình KHÔNG bắt buộc đủ cả chữ ký chủ tọa lẫn thư ký: có lúc cần ban hành
    // gấp mà một trong hai người chưa ký kịp. Ai đã ký vẫn hiện rõ trong hồ sơ
    // biên bản và bản PDF, nên trách nhiệm vẫn truy được.

    const { rows } = await pool.query(
      `UPDATE minutes
       SET status = 'PUBLISHED',
           published_at = now(),
           verification_code = COALESCE(verification_code, $2),
           content_hash = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, buildVerificationCode(), integrity.currentHash]
    );

    await notifyMeetingAudience(minutes.meeting_id, {
      type: NOTIFICATION_TYPES.MINUTES_PUBLISHED,
      severity: "SUCCESS",
      actorId: req.user.id,
      title: "Biên bản họp đã được ban hành",
      message: `Biên bản cuộc họp "${minutes.meeting_title}" đã công bố, bạn có thể xem và tải PDF có chữ ký số.`,
      metadata: { minutesId: minutes.id, verificationCode: rows[0].verification_code },
      excludeUserId: req.user.id
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_PUBLISH,
      entityType: "MINUTES",
      entityId: req.params.id,
      meetingId: minutes.meeting_id,
      description: `Ban hành biên bản, mã tra cứu ${rows[0].verification_code}`,
      metadata: { verificationCode: rows[0].verification_code, hash: integrity.currentHash }
    });

    res.json({
      data: {
        ...rows[0],
        integrity,
        verificationUrl: verificationUrl(rows[0].verification_code)
      }
    });
  })
);

/** Trạng thái ký và toàn vẹn của biên bản, dùng cho giao diện. */
minutesRouter.get(
  "/:id/integrity",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingAccess(req.user, minutes.meeting_id);
    const integrity = await verifyMinutesIntegrity(minutes);
    res.json({
      data: { ...integrity, verificationUrl: verificationUrl(minutes.verification_code) }
    });
  })
);

async function exportPdf(req, res) {
  const minutes = await getMinutes(req.params.id);
  const meeting = await assertMeetingAccess(req.user, minutes.meeting_id);
  if (
    minutes.status !== "PUBLISHED" &&
    !(await canSeeFullMeetingRecord(req.user, meeting))
  ) {
    throw forbidden("Biên bản chưa được ban hành");
  }
  if (!hasVietnameseFonts()) {
    throw badRequest(
      "Thiếu font tiếng Việt trong backend/assets/fonts, không xuất được PDF"
    );
  }

  const [meetingRow, integrity] = await Promise.all([
    pool.query(
      `SELECT m.*, r.name AS room_name FROM meetings m
       LEFT JOIN rooms r ON r.id = m.room_id WHERE m.id = $1`,
      [minutes.meeting_id]
    ),
    verifyMinutesIntegrity(minutes)
  ]);

  await writeAuditLog(req, {
    action: AUDIT_ACTIONS.MINUTES_EXPORT,
    entityType: "MINUTES",
    entityId: minutes.id,
    meetingId: minutes.meeting_id,
    description: "Xuất PDF biên bản"
  });

  await streamMinutesPdf(res, {
    minutes,
    meeting: meetingRow.rows[0],
    integrity,
    verificationUrl: verificationUrl(minutes.verification_code)
  });
}

minutesRouter.get("/:id/pdf", asyncHandler(exportPdf));
minutesRouter.post("/:id/export-pdf", asyncHandler(exportPdf));
