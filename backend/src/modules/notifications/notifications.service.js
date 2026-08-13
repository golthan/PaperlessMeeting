import { pool } from "../../config/db.js";
import { emitToUsers } from "../../config/socket.js";

/**
 * Bộ loại thông báo dùng chung cho web và mobile.
 * Frontend dựa vào type để chọn icon, còn severity để chọn màu.
 */
export const NOTIFICATION_TYPES = {
  MEETING_INVITE: "MEETING_INVITE",
  MEETING_UPDATED: "MEETING_UPDATED",
  MEETING_CANCELLED: "MEETING_CANCELLED",
  MEETING_STARTED: "MEETING_STARTED",
  MEETING_FINISHED: "MEETING_FINISHED",
  MEETING_REMINDER: "MEETING_REMINDER",
  PARTICIPANT_REMOVED: "PARTICIPANT_REMOVED",
  INVITATION_RESPONSE: "INVITATION_RESPONSE",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  DOCUMENT_REVIEWED: "DOCUMENT_REVIEWED",
  VOTE_OPENED: "VOTE_OPENED",
  VOTE_CLOSED: "VOTE_CLOSED",
  MINUTES_PUBLISHED: "MINUTES_PUBLISHED",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  TASK_UPDATED: "TASK_UPDATED"
};

/** Danh sách user_id của toàn bộ người tham dự một cuộc họp. */
export async function getMeetingAudience(meetingId, { includeOrganizer = true } = {}) {
  const { rows } = await pool.query(
    `SELECT mp.user_id
     FROM meeting_participants mp
     WHERE mp.meeting_id = $1
     UNION
     SELECT m.organizer_id
     FROM meetings m
     WHERE m.id = $1 AND $2::boolean = true`,
    [meetingId, includeOrganizer]
  );
  return rows.map((row) => row.user_id);
}

/**
 * Ghi thông báo cho một nhóm người dùng rồi đẩy realtime tới các socket của họ.
 * Lỗi thông báo không được làm hỏng nghiệp vụ chính nên luôn được nuốt và log lại.
 */
export async function notifyUsers(userIds, payload) {
  const targets = [...new Set((userIds || []).filter(Boolean))].filter(
    (userId) => userId !== payload.excludeUserId
  );
  if (targets.length === 0) return [];

  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications
         (user_id, actor_id, meeting_id, type, severity, title, message, link, metadata)
       SELECT target_id, $2::uuid, $3::uuid, $4::varchar, $5::varchar,
              $6::varchar, $7::text, $8::text, $9::jsonb
       FROM UNNEST($1::uuid[]) AS target_id
       RETURNING *`,
      [
        targets,
        payload.actorId || null,
        payload.meetingId || null,
        payload.type,
        payload.severity || "INFO",
        payload.title,
        payload.message || null,
        payload.link || null,
        JSON.stringify(payload.metadata || {})
      ]
    );

    for (const notification of rows) {
      emitToUsers([notification.user_id], "notification:new", notification);
    }
    return rows;
  } catch (error) {
    console.error("[notifications] Không tạo được thông báo:", error.message);
    return [];
  }
}

/** Gửi thông báo cho toàn bộ thành viên của một cuộc họp. */
export async function notifyMeetingAudience(meetingId, payload) {
  const audience = await getMeetingAudience(meetingId, {
    includeOrganizer: payload.includeOrganizer !== false
  });
  return notifyUsers(audience, { ...payload, meetingId });
}
