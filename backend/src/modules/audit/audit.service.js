import { pool } from "../../config/db.js";

/**
 * Nhật ký truy vết (audit log).
 *
 * Mọi thao tác chạm vào tài liệu, biên bản, biểu quyết, điểm danh và vòng đời
 * cuộc họp đều được ghi lại: ai làm, làm gì, trên đối tượng nào, lúc nào, từ
 * địa chỉ IP nào. Đây là điều kiện bắt buộc khi hệ thống lưu tài liệu nội bộ:
 * có sự cố rò rỉ thì phải truy được ai đã mở, ai đã tải.
 *
 * Ghi log không bao giờ được làm hỏng nghiệp vụ chính, nên mọi lỗi đều được
 * nuốt và chỉ log ra console.
 */

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",

  MEETING_CREATE: "MEETING_CREATE",
  MEETING_UPDATE: "MEETING_UPDATE",
  MEETING_START: "MEETING_START",
  MEETING_FINISH: "MEETING_FINISH",
  MEETING_CANCEL: "MEETING_CANCEL",
  MEETING_DELETE: "MEETING_DELETE",
  MEETING_ONLINE_ROOM: "MEETING_ONLINE_ROOM",
  MEETING_JOIN: "MEETING_JOIN",

  PARTICIPANT_ADD: "PARTICIPANT_ADD",
  PARTICIPANT_UPDATE: "PARTICIPANT_UPDATE",
  PARTICIPANT_REMOVE: "PARTICIPANT_REMOVE",

  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  DOCUMENT_VIEW: "DOCUMENT_VIEW",
  DOCUMENT_DOWNLOAD: "DOCUMENT_DOWNLOAD",
  DOCUMENT_APPROVE: "DOCUMENT_APPROVE",
  DOCUMENT_REJECT: "DOCUMENT_REJECT",
  DOCUMENT_DELETE: "DOCUMENT_DELETE",
  DOCUMENT_PRESENT: "DOCUMENT_PRESENT",
  DOCUMENT_AI_SUMMARY: "DOCUMENT_AI_SUMMARY",
  DOCUMENT_AI_ASK: "DOCUMENT_AI_ASK",

  ATTENDANCE_CHECKIN: "ATTENDANCE_CHECKIN",
  ATTENDANCE_UPDATE: "ATTENDANCE_UPDATE",
  ATTENDANCE_QR: "ATTENDANCE_QR",

  VOTE_CREATE: "VOTE_CREATE",
  VOTE_OPEN: "VOTE_OPEN",
  VOTE_CLOSE: "VOTE_CLOSE",
  VOTE_DELETE: "VOTE_DELETE",
  VOTE_RESPONSE: "VOTE_RESPONSE",

  MINUTES_SAVE: "MINUTES_SAVE",
  MINUTES_GENERATE: "MINUTES_GENERATE",
  MINUTES_PUBLISH: "MINUTES_PUBLISH",
  MINUTES_SIGN: "MINUTES_SIGN",
  MINUTES_EXPORT: "MINUTES_EXPORT",
  MINUTES_VERIFY: "MINUTES_VERIFY",

  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE"
};

/** Nhãn tiếng Việt để hiển thị trong trang nhật ký. */
export const AUDIT_ACTION_LABELS = {
  LOGIN: "Đăng nhập",
  LOGIN_FAILED: "Đăng nhập thất bại",
  MEETING_CREATE: "Tạo cuộc họp",
  MEETING_UPDATE: "Sửa cuộc họp",
  MEETING_START: "Bắt đầu họp",
  MEETING_FINISH: "Kết thúc họp",
  MEETING_CANCEL: "Huỷ cuộc họp",
  MEETING_DELETE: "Xoá cuộc họp",
  MEETING_ONLINE_ROOM: "Bật/tắt phòng trực tuyến",
  MEETING_JOIN: "Vào phòng họp",
  PARTICIPANT_ADD: "Thêm người dự",
  PARTICIPANT_UPDATE: "Đổi quyền người dự",
  PARTICIPANT_REMOVE: "Xoá người dự",
  DOCUMENT_UPLOAD: "Đăng tài liệu",
  DOCUMENT_VIEW: "Xem tài liệu",
  DOCUMENT_DOWNLOAD: "Tải tài liệu",
  DOCUMENT_APPROVE: "Duyệt tài liệu",
  DOCUMENT_REJECT: "Từ chối tài liệu",
  DOCUMENT_DELETE: "Xoá tài liệu",
  DOCUMENT_PRESENT: "Trình chiếu tài liệu",
  DOCUMENT_AI_SUMMARY: "Tóm tắt tài liệu bằng AI",
  DOCUMENT_AI_ASK: "Hỏi AI về tài liệu",
  ATTENDANCE_CHECKIN: "Điểm danh",
  ATTENDANCE_UPDATE: "Sửa điểm danh",
  ATTENDANCE_QR: "Tạo mã QR điểm danh",
  VOTE_CREATE: "Tạo biểu quyết",
  VOTE_OPEN: "Mở biểu quyết",
  VOTE_CLOSE: "Chốt biểu quyết",
  VOTE_DELETE: "Xoá biểu quyết",
  VOTE_RESPONSE: "Bỏ phiếu",
  MINUTES_SAVE: "Lưu biên bản",
  MINUTES_GENERATE: "Tự sinh biên bản",
  MINUTES_PUBLISH: "Ban hành biên bản",
  MINUTES_SIGN: "Ký số biên bản",
  MINUTES_EXPORT: "Xuất PDF biên bản",
  MINUTES_VERIFY: "Tra cứu biên bản",
  USER_CREATE: "Tạo tài khoản",
  USER_UPDATE: "Sửa tài khoản",
  USER_DELETE: "Xoá tài khoản"
};

/** Nhóm hành động, dùng cho bộ lọc nhanh trên giao diện. */
export const AUDIT_GROUPS = {
  DOCUMENT: Object.keys(AUDIT_ACTIONS).filter((key) => key.startsWith("DOCUMENT")),
  MINUTES: Object.keys(AUDIT_ACTIONS).filter((key) => key.startsWith("MINUTES")),
  MEETING: Object.keys(AUDIT_ACTIONS).filter(
    (key) => key.startsWith("MEETING") || key.startsWith("PARTICIPANT")
  ),
  VOTE: Object.keys(AUDIT_ACTIONS).filter((key) => key.startsWith("VOTE")),
  ATTENDANCE: Object.keys(AUDIT_ACTIONS).filter((key) => key.startsWith("ATTENDANCE")),
  ACCOUNT: ["LOGIN", "LOGIN_FAILED", "USER_CREATE", "USER_UPDATE", "USER_DELETE"]
};

function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 60);
  }
  return String(req?.socket?.remoteAddress || "").slice(0, 60) || null;
}

/**
 * Ghi một dòng nhật ký.
 * @param req    Request để lấy người thao tác, IP và trình duyệt.
 * @param entry  { action, entityType, entityId, meetingId, description, metadata, actor }
 */
export async function writeAuditLog(req, entry) {
  try {
    const actor = entry.actor || req?.user || null;
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, actor_name, actor_role, action, entity_type, entity_id,
          meeting_id, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        actor?.id || null,
        actor?.full_name || actor?.email || entry.actorName || null,
        actor?.role || null,
        entry.action,
        entry.entityType || null,
        entry.entityId || null,
        entry.meetingId || null,
        entry.description || null,
        JSON.stringify(entry.metadata || {}),
        clientIp(req),
        String(req?.headers?.["user-agent"] || "").slice(0, 500) || null
      ]
    );
  } catch (error) {
    console.error("[audit] Không ghi được nhật ký:", error.message);
  }
}
