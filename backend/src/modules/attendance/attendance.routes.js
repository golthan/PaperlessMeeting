import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  ATTENDANCE_STATUSES,
  requireFields
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingSecretaryDuties,
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
  "/checkin",
  asyncHandler(async (req, res) => {
    const meeting = await assertParticipantAccess(req.user, req.params.meetingId);
    if (meeting.status !== "ONGOING") {
      throw badRequest("Chỉ điểm danh được khi cuộc họp đang diễn ra");
    }

    const method = "MANUAL";
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
      description: `Tự điểm danh (${status})`,
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
  asyncHandler(async (req, res) => {
    await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
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
      description: `Thư ký ghi nhận điểm danh: ${row.full_name || req.params.userId} → ${req.body.status}`,
      metadata: { targetUserId: req.params.userId, status: req.body.status }
    });

    res.json({ data: row });
  })
);
