import { pool } from "../../config/db.js";
import { forbidden, notFound } from "../../utils/httpError.js";

export async function getMeeting(meetingId) {
  const { rows } = await pool.query(
    `SELECT m.*, r.name AS room_name, r.location AS room_location,
            u.full_name AS organizer_name, u.email AS organizer_email
     FROM meetings m
     LEFT JOIN rooms r ON r.id = m.room_id
     JOIN users u ON u.id = m.organizer_id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [meetingId]
  );
  return rows[0];
}

export async function assertMeetingExists(meetingId) {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw notFound("Meeting not found");
  return meeting;
}

export async function isMeetingParticipant(meetingId, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, userId]
  );
  return Boolean(rows[0]);
}

export async function assertMeetingAccess(user, meetingId) {
  const meeting = await assertMeetingExists(meetingId);

  if (user.role === "ADMIN" || meeting.organizer_id === user.id) {
    return meeting;
  }

  if (await isMeetingParticipant(meetingId, user.id)) {
    return meeting;
  }

  throw forbidden("You do not have access to this meeting");
}

export async function assertMeetingOrganizer(user, meetingId) {
  const meeting = await assertMeetingExists(meetingId);

  if (meeting.organizer_id !== user.id) {
    throw forbidden("Only the meeting organizer can do this");
  }

  return meeting;
}

export async function assertParticipantAccess(user, meetingId) {
  const meeting = await assertMeetingExists(meetingId);

  if (!(await isMeetingParticipant(meetingId, user.id))) {
    throw forbidden("Only invited participants can do this");
  }

  return meeting;
}

export async function hasRoomConflict(roomId, startTime, endTime, excludeMeetingId = null) {
  const values = [roomId, startTime, endTime];
  let exclude = "";
  if (excludeMeetingId) {
    values.push(excludeMeetingId);
    exclude = `AND id <> $${values.length}`;
  }

  const { rows } = await pool.query(
    `SELECT id, title, start_time, end_time
     FROM meetings
     WHERE room_id = $1
       AND deleted_at IS NULL
       AND status <> 'CANCELLED'
       AND ($2::timestamptz < end_time AND $3::timestamptz > start_time)
       ${exclude}
     LIMIT 1`,
    values
  );

  return rows[0] || null;
}

export async function assertUserIsParticipantOfMeeting(meetingId, userId) {
  if (!(await isMeetingParticipant(meetingId, userId))) {
    throw forbidden("Assigned user must be a meeting participant");
  }
}
