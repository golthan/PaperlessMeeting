import { pool } from "../../config/db.js";

/**
 * Điểm danh dùng chung cho REST API (tự điểm danh, QR, organizer chỉnh tay)
 * và cho socket (vào phòng họp coi như đã có mặt).
 * Module này cố tình không import config/socket.js để tránh vòng lặp import:
 * nơi gọi tự chịu trách nhiệm phát sự kiện realtime.
 */

/** Vào họp trễ hơn mốc này (phút) so với giờ bắt đầu thì tính là đi muộn. */
export const LATE_AFTER_MINUTES = 10;

/** Các trạng thái được coi là đã điểm danh. */
export const CHECKED_IN_STATUSES = ["PRESENT", "LATE"];

/** Có mặt hay đi muộn, tính theo giờ bắt đầu của cuộc họp. */
export function resolveAttendanceStatus(meeting, at = new Date()) {
  const start = new Date(meeting.start_time).getTime();
  if (Number.isNaN(start)) return "PRESENT";
  return at.getTime() > start + LATE_AFTER_MINUTES * 60 * 1000 ? "LATE" : "PRESENT";
}

/** Ghi trạng thái điểm danh vào cả bảng thành phần tham dự và bảng lưu trữ. */
export async function markAttendance({ meetingId, userId, status, method }) {
  const { rows } = await pool.query(
    `UPDATE meeting_participants
     SET attendance_status = $1::text,
         attendance_method = $2::text,
         checked_in_at = CASE
           WHEN $1::text IN ('PRESENT', 'LATE') THEN COALESCE(checked_in_at, now())
           ELSE checked_in_at
         END,
         updated_at = now()
     WHERE meeting_id = $3 AND user_id = $4
     RETURNING *`,
    [status, method, meetingId, userId]
  );
  if (!rows[0]) return null;

  await pool.query(
    `INSERT INTO attendance (meeting_id, user_id, checkin_time, method, status, updated_at)
     VALUES ($1, $2,
             CASE WHEN $4::text IN ('PRESENT', 'LATE') THEN now() ELSE NULL END,
             $3::text, $4::text, now())
     ON CONFLICT (meeting_id, user_id) DO UPDATE
       SET checkin_time = CASE
             WHEN $4::text IN ('PRESENT', 'LATE') THEN COALESCE(attendance.checkin_time, now())
             ELSE attendance.checkin_time
           END,
           method = $3::text,
           status = $4::text,
           updated_at = now()`,
    [meetingId, userId, method, status]
  );

  return rows[0];
}

/**
 * Vào phòng họp khi cuộc họp đang diễn ra thì tự điểm danh.
 * Không ghi đè trạng thái đã có (QR, tự điểm danh, organizer đã chỉnh tay).
 */
export async function autoCheckInOnJoin(meeting, userId) {
  if (!meeting || meeting.status !== "ONGOING") return null;

  const current = await pool.query(
    `SELECT attendance_status
     FROM meeting_participants
     WHERE meeting_id = $1 AND user_id = $2`,
    [meeting.id, userId]
  );
  const participant = current.rows[0];
  if (!participant) return null;
  if (CHECKED_IN_STATUSES.includes(participant.attendance_status)) return null;

  const status = resolveAttendanceStatus(meeting);
  const row = await markAttendance({
    meetingId: meeting.id,
    userId,
    status,
    method: "JOIN_ROOM"
  });
  return row ? { status, method: "JOIN_ROOM" } : null;
}
