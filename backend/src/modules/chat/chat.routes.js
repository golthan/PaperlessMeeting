import express from "express";
import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest } from "../../utils/httpError.js";
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

chatRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { page, limit, offset } = getPagination(req.query);

    const { rows } = await pool.query(
      `SELECT cm.*, u.full_name AS sender_name, u.email AS sender_email,
              COUNT(*) OVER() AS total_count
       FROM chat_messages cm
       JOIN users u ON u.id = cm.sender_id
       WHERE cm.meeting_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.meetingId, limit, offset]
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
    if (!content) throw badRequest("Message content is required");

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (meeting_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.meetingId, req.user.id, content]
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

