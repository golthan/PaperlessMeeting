import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { assertEnum, INVITATION_STATUSES } from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertParticipantAccess
} from "../meetings/meetingAccess.js";

export const participantsRouter = express.Router({ mergeParams: true });

participantsRouter.use(authenticate);

participantsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);

    const { rows } = await pool.query(
      `SELECT mp.*, u.full_name, u.email, d.name AS department_name
       FROM meeting_participants mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE mp.meeting_id = $1
       ORDER BY u.full_name ASC`,
      [req.params.meetingId]
    );
    res.json({ data: rows });
  })
);

participantsRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.meetingId);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot add participants to a finished meeting");
    }

    const userIds = Array.isArray(req.body.userIds)
      ? req.body.userIds
      : [req.body.userId].filter(Boolean);

    if (userIds.length === 0) {
      throw badRequest("userIds is required");
    }

    const inserted = [];
    for (const userId of userIds) {
      const user = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
      if (!user.rows[0]) throw notFound(`User ${userId} not found`);

      const { rows } = await pool.query(
        `INSERT INTO meeting_participants (meeting_id, user_id, role_in_meeting)
         VALUES ($1, $2, COALESCE($3, 'MEMBER'))
         ON CONFLICT (meeting_id, user_id) DO NOTHING
         RETURNING *`,
        [req.params.meetingId, userId, req.body.roleInMeeting || null]
      );
      if (rows[0]) inserted.push(rows[0]);
    }

    res.status(201).json({ data: inserted });
  })
);

participantsRouter.delete(
  "/:userId",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.meetingId);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot remove participants from a finished meeting");
    }

    const { rowCount } = await pool.query(
      `DELETE FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.params.userId]
    );
    if (!rowCount) throw notFound("Participant not found");
    res.status(204).send();
  })
);

participantsRouter.put(
  "/invitation/accept",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    await assertParticipantAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET invitation_status = 'ACCEPTED', updated_at = now()
       WHERE meeting_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.meetingId, req.user.id]
    );
    res.json({ data: rows[0] });
  })
);

participantsRouter.put(
  "/invitation/decline",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    await assertParticipantAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET invitation_status = 'DECLINED', updated_at = now()
       WHERE meeting_id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.meetingId, req.user.id]
    );
    res.json({ data: rows[0] });
  })
);

participantsRouter.put(
  "/:userId/invitation",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    assertEnum(req.body.status, INVITATION_STATUSES, "invitation status");

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET invitation_status = $1, updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3
       RETURNING *`,
      [req.body.status, req.params.meetingId, req.params.userId]
    );
    if (!rows[0]) throw notFound("Participant not found");
    res.json({ data: rows[0] });
  })
);

