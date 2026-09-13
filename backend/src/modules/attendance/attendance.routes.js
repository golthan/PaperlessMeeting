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
  ATTENDANCE_STATUSES,
  requireFields
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertParticipantAccess
} from "../meetings/meetingAccess.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import {
  CHECKED_IN_STATUSES,
  LATE_AFTER_MINUTES,
  markAttendance,
  resolveAttendanceStatus
} from "./attendance.service.js";

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
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.ATTENDANCE_QR,
      entityType: "MEETING",
      entityId: req.params.meetingId,
      meetingId: req.params.meetingId,
      description: `Tạo mã QR điểm danh, hiệu lực ${expiresInMinutes} phút`
    });

    res.status(201).json({ data: rows[0], qrDataUrl, payload });
  })
);

attendanceRouter.post(
  "/checkin",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const meeting = await assertParticipantAccess(req.user, req.params.meetingId);
    if (meeting.status !== "ONGOING") {
      throw badRequest("Chỉ điểm danh được khi cuộc họp đang diễn ra");
    }

    let method = "MANUAL";
    if (req.body.token) {
      const { rows } = await pool.query(
        `SELECT * FROM attendance_tokens
         WHERE meeting_id = $1 AND token = $2
           AND (expires_at IS NULL OR expires_at > now())`,
        [req.params.meetingId, req.body.token]
      );
      if (!rows[0]) throw badRequest("Mã QR điểm danh không hợp lệ hoặc đã hết hạn");
      method = "QR";
    }

    const current = await pool.query(
      `SELECT attendance_status FROM meeting_participants
       WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.user.id]
    );
    if (CHECKED_IN_STATUSES.includes(current.rows[0]?.attendance_status)) {
      throw badRequest("Bạn đã điểm danh cuộc họp này rồi");
    }

    // Điểm danh sau giờ bắt đầu quá LATE_AFTER_MINUTES phút thì ghi nhận đi muộn.
    const status = resolveAttendanceStatus(meeting);
    const row = await markAttendance({
      meetingId: req.params.meetingId,
      userId: req.user.id,
      status,
      method
    });

    emitMeetingEvent(req.params.meetingId, "attendance_updated", {
      meetingId: req.params.meetingId,
      userId: req.user.id,
      status,
      method,
      checkedInAt: row?.checked_in_at || null
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.ATTENDANCE_CHECKIN,
      entityType: "MEETING",
      entityId: req.params.meetingId,
      meetingId: req.params.meetingId,
      description: `Tự điểm danh (${status}) bằng hình thức ${method}`,
      metadata: { status, method }
    });

    res.json({ data: row, meta: { status, method, lateAfterMinutes: LATE_AFTER_MINUTES } });
  })
);

attendanceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT mp.user_id, u.full_name, u.email, mp.invitation_status,
              COALESCE(mp.attendance_status, 'ABSENT') AS attendance_status,
              mp.attendance_method, mp.checked_in_at,
              a.status AS archive_status, a.method AS archive_method, a.checkin_time
       FROM meeting_participants mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN attendance a ON a.meeting_id = mp.meeting_id AND a.user_id = mp.user_id
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
    requireFields(req.body, ["status"]);
    assertEnum(req.body.status, ATTENDANCE_STATUSES, "attendance status");

    const row = await markAttendance({
      meetingId: req.params.meetingId,
      userId: req.params.userId,
      status: req.body.status,
      method: "MANUAL"
    });
    if (!row) throw notFound("Participant not found");

    emitMeetingEvent(req.params.meetingId, "attendance_updated", {
      meetingId: req.params.meetingId,
      userId: req.params.userId,
      status: req.body.status,
      method: "MANUAL",
      checkedInAt: row.checked_in_at || null
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.ATTENDANCE_UPDATE,
      entityType: "MEETING",
      entityId: req.params.meetingId,
      meetingId: req.params.meetingId,
      description: `Chủ trì ghi nhận điểm danh: ${row.full_name || req.params.userId} → ${req.body.status}`,
      metadata: { targetUserId: req.params.userId, status: req.body.status }
    });

    res.json({ data: row });
  })
);
