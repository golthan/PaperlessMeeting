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
  if (!meeting) throw notFound("Không tìm thấy cuộc họp");
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

  throw forbidden("Bạn không có quyền xem cuộc họp này");
}

/**
 * Vai trò của một người TRONG một cuộc họp cụ thể.
 *
 * Quyền điều hành gắn với vai trò này chứ không gắn với người tạo cuộc họp:
 * một tài khoản Participant vẫn có thể được cử làm chủ tọa hoặc thư ký, và
 * ngược lại người tạo có thể trao quyền chủ tọa cho người khác.
 *
 * Trả về "CHAIRMAN" | "SECRETARY" | "MEMBER" | null (không liên quan).
 */
export async function getMeetingRole(user, meeting) {
  const { rows } = await pool.query(
    `SELECT role_in_meeting FROM meeting_participants
     WHERE meeting_id = $1 AND user_id = $2`,
    [meeting.id, user.id]
  );
  if (rows[0]) return rows[0].role_in_meeting;

  // Cuộc họp cũ tạo trước khi tách vai trò có thể chưa có hàng chủ tọa nào.
  // CHỈ khi đó mới coi người tạo là chủ tọa — nếu không, người tạo đã giao chủ
  // tọa cho người khác vẫn âm thầm giữ toàn quyền điều hành.
  if (meeting.organizer_id !== user.id) return null;

  const chairman = await pool.query(
    `SELECT 1 FROM meeting_participants
     WHERE meeting_id = $1 AND role_in_meeting = 'CHAIRMAN' LIMIT 1`,
    [meeting.id]
  );
  return chairman.rows[0] ? null : "CHAIRMAN";
}

/**
 * Người này có được xem TOÀN BỘ hồ sơ cuộc họp không?
 *
 * "Toàn bộ" ở đây là những thứ chưa công bố: tài liệu còn chờ duyệt, biên bản
 * còn là bản nháp, nhiệm vụ giao cho người khác. Thành viên thường chỉ thấy
 * phần đã công khai cộng với thứ của chính mình.
 *
 * Phải xét vai trò TRONG cuộc họp chứ không phải vai trò toàn cục: thư ký là
 * người giao nhiệm vụ và soạn biên bản, mà tài khoản của họ hoàn toàn có thể
 * mang vai trò PARTICIPANT — xét nhầm thì thư ký mở hồ sơ cuộc họp do chính
 * mình phụ trách lại chỉ thấy đúng phần việc của bản thân.
 */
export async function canSeeFullMeetingRecord(user, meeting) {
  if (user.role === "ADMIN") return true;
  return ["CHAIRMAN", "SECRETARY"].includes(await getMeetingRole(user, meeting));
}

/**
 * Người lập lịch: người tạo cuộc họp.
 *
 * Họ có thể không phải chủ tọa cũng chẳng phải thư ký (ví dụ văn phòng khoa lập
 * lịch cho trưởng khoa chủ tọa), nhưng vẫn cần sửa được giờ giấc, phòng, thành
 * phần và đổi người giữ vai — nếu không, đặt nhầm một chữ là phải đi nhờ người
 * khác sửa hộ. Quyền này tắt ngay khi cuộc họp bắt đầu.
 */
export function isMeetingScheduler(user, meeting) {
  return (
    meeting.organizer_id === user.id &&
    !["ONGOING", "FINISHED", "CANCELLED"].includes(meeting.status)
  );
}

/**
 * Quy đổi vai trò thành danh sách việc được phép làm.
 *
 * Giao diện chỉ hỏi "tôi được làm gì" chứ không tự suy từ vai trò, nên muốn đổi
 * luật phân quyền thì chỉ cần sửa đúng một chỗ này.
 *
 * Chủ tọa là TẬP CHA của thư ký: là người đứng đầu cuộc họp nên làm được cả
 * phần việc hành chính, tránh tình trạng thư ký vắng là cuộc họp đứng bánh.
 * Chiều ngược lại thì không: thư ký không với sang việc điều hành của chủ tọa.
 */
export function buildMeetingPermissions(role, participant = null, options = {}) {
  const isChairman = role === "CHAIRMAN";
  const isSecretary = role === "SECRETARY";
  // Người tạo cuộc họp, chỉ còn hiệu lực trước giờ khai mạc.
  const isScheduler = Boolean(options.isScheduler);

  return {
    roleInMeeting: role || "MEMBER",
    isChairman,
    isSecretary,
    isScheduler,
    // Chủ tọa luôn phát biểu được; người khác theo quyền được cấp.
    canSpeak: isChairman || (participant ? participant.can_speak !== false : false),
    canShareScreen: isChairman || Boolean(participant?.can_share_screen),
    canUploadDocument:
      isChairman || isSecretary || Boolean(participant?.can_upload_document),

    // Chủ tọa: điều hành nội dung và diễn biến.
    // Riêng việc sửa lịch thì người lập lịch cũng làm được tới trước giờ họp.
    canEditMeeting: isChairman || isScheduler,
    canControlAgenda: isChairman,
    canPresentDocument: isChairman,
    canReviewDocument: isChairman,
    canManageVotes: isChairman,
    canControlSpeakers: isChairman,
    canPublishMinutes: isChairman,

    // Đổi người giữ vai chủ tọa / thư ký.
    canAssignRoles: isChairman || isScheduler,

    // Thư ký phụ trách thường ngày, chủ tọa vẫn làm được khi cần.
    canManageParticipants: isChairman || isSecretary || isScheduler,
    canManageAgendaItems: isChairman || isSecretary || isScheduler,
    canMarkAttendance: isChairman || isSecretary,
    canManageTasks: isChairman || isSecretary,

    // Việc chung của hai người chủ chốt.
    canEditSharedNotes: isChairman || isSecretary,
    canDraftMinutes: isChairman || isSecretary,
    canSignMinutes: isChairman || isSecretary,
    canViewAuditLog: isChairman || isSecretary
  };
}

/** Ném lỗi 403 nếu người dùng không giữ một trong các vai trò yêu cầu. */
async function assertMeetingRole(user, meetingId, roles, message, options = {}) {
  const meeting = await assertMeetingExists(meetingId);
  const role = await getMeetingRole(user, meeting);

  if (roles.includes(role)) return meeting;
  if (options.allowScheduler && isMeetingScheduler(user, meeting)) return meeting;

  throw forbidden(message);
}

/** Chủ tọa: điều hành nội dung và diễn biến cuộc họp. */
export function assertMeetingChairman(user, meetingId) {
  return assertMeetingRole(
    user,
    meetingId,
    ["CHAIRMAN"],
    "Chỉ chủ tọa cuộc họp được làm việc này"
  );
}

/**
 * Việc lập lịch: sửa thông tin cuộc họp, đổi người giữ vai chủ tọa / thư ký.
 *
 * Chủ tọa làm bất cứ lúc nào; người tạo cuộc họp cũng làm được nhưng chỉ tới
 * khi cuộc họp bắt đầu — sau đó cuộc họp thuộc về người điều hành.
 */
export function assertMeetingScheduling(user, meetingId) {
  return assertMeetingRole(
    user,
    meetingId,
    ["CHAIRMAN"],
    "Chỉ chủ tọa, hoặc người tạo cuộc họp khi chưa khai mạc, được làm việc này",
    { allowScheduler: true }
  );
}

/**
 * Phần việc của thư ký: thành phần tham dự, chương trình, điểm danh, nhiệm vụ.
 *
 * Chủ tọa cũng qua được cửa này — thư ký là người phụ trách thường ngày, còn
 * chủ tọa là người chịu trách nhiệm cuối nên phải làm thay được lúc cần.
 */
export function assertMeetingSecretaryDuties(user, meetingId) {
  return assertMeetingRole(
    user,
    meetingId,
    ["CHAIRMAN", "SECRETARY"],
    "Chỉ chủ tọa hoặc thư ký cuộc họp được làm việc này",
    // Người tạo cần sắp thành phần và chương trình lúc lập lịch; cờ này tự hết
    // hiệu lực khi cuộc họp bắt đầu nên không đụng tới điểm danh hay nhiệm vụ.
    { allowScheduler: true }
  );
}

/** Việc chung của hai người chủ chốt: tài liệu, ghi chú, soạn biên bản. */
export function assertMeetingLeadership(user, meetingId) {
  return assertMeetingRole(
    user,
    meetingId,
    ["CHAIRMAN", "SECRETARY"],
    "Chỉ chủ tọa hoặc thư ký cuộc họp được làm việc này"
  );
}

export async function assertParticipantAccess(user, meetingId) {
  const meeting = await assertMeetingExists(meetingId);

  if (!(await isMeetingParticipant(meetingId, user.id))) {
    throw forbidden("Chỉ người được mời dự mới làm được việc này");
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
    throw forbidden("Người được giao việc phải có tên trong thành phần cuộc họp");
  }
}
