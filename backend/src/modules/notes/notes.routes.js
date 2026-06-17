import express from "express";
import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { forbidden } from "../../utils/httpError.js";
import { assertMeetingAccess } from "../meetings/meetingAccess.js";

export const publicNotesRouter = express.Router({ mergeParams: true });
export const personalNotesRouter = express.Router({ mergeParams: true });

function sanitizeContent(content) {
  return String(content || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 20000);
}

async function assertCanEditPublicNotes(user, meetingId) {
  const meeting = await assertMeetingAccess(user, meetingId);
  if (meeting.organizer_id === user.id || user.role === "ADMIN") return meeting;

  const { rows } = await pool.query(
    `SELECT role_in_meeting
     FROM meeting_participants
     WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, user.id]
  );
  if (rows[0]?.role_in_meeting !== "SECRETARY") {
    throw forbidden("Only organizer or secretary can edit public notes");
  }
  return meeting;
}

publicNotesRouter.use(authenticate);
personalNotesRouter.use(authenticate);

publicNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT mn.*, u.full_name AS updated_by_name
       FROM meeting_notes mn
       LEFT JOIN users u ON u.id = mn.updated_by
       WHERE mn.meeting_id = $1`,
      [req.params.meetingId]
    );
    res.json({ data: rows[0] || null });
  })
);

publicNotesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    await assertCanEditPublicNotes(req.user, req.params.meetingId);
    const content = sanitizeContent(req.body.content);

    const { rows } = await pool.query(
      `INSERT INTO meeting_notes (meeting_id, content, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (meeting_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, content, req.user.id]
    );

    emitMeetingEvent(req.params.meetingId, "public_notes_synced", rows[0]);
    res.json({ data: rows[0] });
  })
);

personalNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT *
       FROM personal_notes
       WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.user.id]
    );
    res.json({ data: rows[0] || null });
  })
);

personalNotesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const content = sanitizeContent(req.body.content);

    const { rows } = await pool.query(
      `INSERT INTO personal_notes (meeting_id, user_id, content, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (meeting_id, user_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, req.user.id, content]
    );

    res.json({ data: rows[0] });
  })
);

