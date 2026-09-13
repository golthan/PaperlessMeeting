import express from "express";
import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";
import { assertMeetingAccess } from "../meetings/meetingAccess.js";

export const chatRouter = express.Router({ mergeParams: true });

chatRouter.use(authenticate);

function sanitizeContent(content) {
  return String(content || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 2000);
}

/** Bảo đảm tài liệu được nhắc tới thuộc đúng cuộc họp đang mở. */
async function assertDocumentInMeeting(documentId, meetingId) {
  const { rows } = await pool.query(
    "SELECT id FROM documents WHERE id = $1 AND meeting_id = $2 AND deleted_at IS NULL",
    [documentId, meetingId]
  );
  if (!rows[0]) throw notFound("Tài liệu không thuộc cuộc họp này");
}

/**
 * Tin nhắn của phòng họp.
 * - Không truyền gì: lấy tất cả (giữ nguyên hành vi cũ cho app mobile).
 * - scope=room: chỉ tin nhắn chung, bỏ tin thảo luận trong hộp tài liệu.
 * - documentId=<id>: chỉ tin thảo luận của đúng tài liệu đó.
 */
chatRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { page, limit, offset } = getPagination(req.query);

    const values = [req.params.meetingId];
    let scopeFilter = "";
    if (req.query.documentId) {
      await assertDocumentInMeeting(req.query.documentId, req.params.meetingId);
      values.push(req.query.documentId);
      scopeFilter = "AND cm.document_id = $" + values.length;
    } else if (req.query.scope === "room") {
      scopeFilter = "AND cm.document_id IS NULL";
    }

    const { rows } = await pool.query(
      `SELECT cm.*, u.full_name AS sender_name, u.email AS sender_email,
              COUNT(*) OVER() AS total_count
       FROM chat_messages cm
       JOIN users u ON u.id = cm.sender_id
       WHERE cm.meeting_id = $1
         ${scopeFilter}
       ORDER BY cm.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const total = Number(rows[0]?.total_count || 0);
    res.json(
      paged(
        rows
          .map(({ total_count, ...row }) => row)
          .reverse(),
        { page, limit, total }
      )
    );
  })
);

chatRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const content = sanitizeContent(req.body.content);
    if (!content) throw badRequest("Nội dung tin nhắn không được để trống");

    const documentId = req.body.documentId || null;
    if (documentId) {
      await assertDocumentInMeeting(documentId, req.params.meetingId);
    }

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (meeting_id, sender_id, document_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.meetingId, req.user.id, documentId, content]
    );

    const message = {
      ...rows[0],
      sender_name: req.user.full_name,
      sender_email: req.user.email
    };
    emitMeetingEvent(req.params.meetingId, "new_chat_message", message);
    res.status(201).json({ data: message });
  })
);
