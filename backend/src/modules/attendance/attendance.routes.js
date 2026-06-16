import express from "express";
import QRCode from "qrcode";
import { v4 as uuid } from "uuid";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  ATTENDANCE_STATUSES
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertParticipantAccess
} from "../meetings/meetingAccess.js";

export const attendanceRouter = express.Router({ mergeParams: true });

attendanceRouter.use(authenticate);

attendanceRouter.post(
  "/qr",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    const token = uuid();
    const expiresInMinutes = Number(req.body.expiresInMinutes || 60);
    const expiresAt =
      expiresInMinutes > 0
        ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
        : null;

    const { rows } = await pool.query(
      `INSERT INTO attendance_tokens (meeting_id, token, expires_at, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.meetingId, token, expiresAt, req.user.id]
    );

    const payload = JSON.stringify({ meetingId: req.params.meetingId, token });
    const qrDataUrl = await QRCode.toDataURL(payload);
    res.status(201).json({ data: rows[0], qrDataUrl, payload });
  })
);

attendanceRouter.post(
  "/checkin",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const meeting = await assertParticipantAccess(req.user, req.params.meetingId);
    if (meeting.status !== "ONGOING") {
      throw badRequest("Check-in is allowed only when meeting is ongoing");
    }

    let method = "MANUAL";
    if (req.body.token) {
      const { rows } = await pool.query(
        `SELECT * FROM attendance_tokens
         WHERE meeting_id = $1 AND token = $2
           AND (expires_at IS NULL OR expires_at > now())`,
        [req.params.meetingId, req.body.token]
      );
      if (!rows[0]) throw badRequest("Invalid or expired attendance token");
      method = "QR";
    }

    const current = await pool.query(
      `SELECT attendance_status FROM meeting_participants
       WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.user.id]
    );
    if (current.rows[0]?.attendance_status === "PRESENT") {
      throw badRequest("Already checked in");
    }

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET attendance_status = 'PRESENT',
           attendance_method = $1,
           checked_in_at = now(),
           updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3
       RETURNING *`,
      [method, req.params.meetingId, req.user.id]
    );

    res.json({ data: rows[0] });
  })
);

attendanceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT mp.user_id, u.full_name, u.email, mp.invitation_status,
              COALESCE(mp.attendance_status, 'ABSENT') AS attendance_status,
              mp.attendance_method, mp.checked_in_at
       FROM meeting_participants mp
       JOIN users u ON u.id = mp.user_id
       WHERE mp.meeting_id = $1
       ORDER BY u.full_name ASC`,
      [req.params.meetingId]
    );
    res.json({ data: rows });
  })
);

attendanceRouter.put(
  "/:userId",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    assertEnum(req.body.status, ATTENDANCE_STATUSES, "attendance status");

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET attendance_status = $1,
           attendance_method = 'MANUAL',
           checked_in_at = CASE WHEN $1 = 'PRESENT' THEN now() ELSE checked_in_at END,
           updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3
       RETURNING *`,
      [req.body.status, req.params.meetingId, req.params.userId]
    );
    if (!rows[0]) throw notFound("Participant not found");
    res.json({ data: rows[0] });
  })
);

