/**
 * Quy ước hình thức họp dùng chung cho toàn bộ giao diện.
 *
 * Khi tạo cuộc họp organizer chỉ chọn giữa hai hình thức:
 *   - OFFLINE: họp tập trung tại phòng, chuẩn "không giấy tờ" (tài liệu số,
 *     chương trình, điểm danh, biểu quyết, biên bản, nhiệm vụ).
 *   - ONLINE: họp trực tuyến, bắt buộc có phòng video.
 *
 * HYBRID không phải lựa chọn khi tạo mà là kết quả của việc bật thêm phòng
 * trực tuyến cho một cuộc họp tập trung (trước hoặc ngay trong lúc họp).
 */

export const MEETING_MODES = [
  {
    value: "OFFLINE",
    title: "Họp tập trung",
    short: "Tập trung",
    desc: "Mọi người ngồi cùng phòng họp. Tài liệu, chương trình, điểm danh, biểu quyết và biên bản đều làm trên hệ thống — không dùng giấy."
  },
  {
    value: "ONLINE",
    title: "Họp trực tuyến",
    short: "Trực tuyến",
    desc: "Không cần phòng vật lý. Hệ thống mở sẵn phòng video LiveKit để mọi người tham gia từ xa."
  }
];

/** Cuộc họp này có phòng video hay không. */
export function hasOnlineRoom(meeting) {
  return Boolean(meeting) && meeting.meeting_type !== "OFFLINE";
}

/** Hình thức gốc của cuộc họp: tập trung hay trực tuyến. */
export function meetingMode(meeting) {
  return meeting?.meeting_type === "ONLINE" ? "ONLINE" : "OFFLINE";
}

/** Nhãn hiển thị hình thức họp. */
export function meetingTypeLabel(meetingType) {
  if (meetingType === "ONLINE") return "Trực tuyến";
  if (meetingType === "HYBRID") return "Tập trung + trực tuyến";
  return "Tập trung";
}

/** Địa điểm rút gọn để hiển thị trên thẻ và tiêu đề. */
export function meetingPlaceLabel(meeting) {
  if (!meeting) return "-";
  if (meeting.meeting_type === "ONLINE") {
    return "Phòng họp trực tuyến";
  }
  const room = meeting.room_name || "Chưa chọn phòng";
  return meeting.meeting_type === "HYBRID" ? `${room} + phòng trực tuyến` : room;
}

/** Ghép hình thức + trạng thái phòng video thành một payload gửi lên API. */
export function resolveMeetingType(mode, onlineRoom) {
  if (mode === "ONLINE") return "ONLINE";
  return onlineRoom ? "HYBRID" : "OFFLINE";
}

/** Tổng hợp điểm danh để hiển thị dải số liệu. */
export function attendanceSummary(participants) {
  const list = Array.isArray(participants) ? participants : [];
  const present = list.filter((item) => item.attendance_status === "PRESENT").length;
  const late = list.filter((item) => item.attendance_status === "LATE").length;
  const total = list.length;
  return {
    total,
    present,
    late,
    checkedIn: present + late,
    absent: total - present - late
  };
}

/** Số người đang mở phòng họp. */
export function onlineCount(participants) {
  return (Array.isArray(participants) ? participants : []).filter(
    (item) => item.is_online
  ).length;
}

export function percent(count, total) {
  if (!total) return 0;
  return Math.round((Number(count || 0) / total) * 100);
}

/** Cách một người được ghi nhận điểm danh. */
export function attendanceMethodLabel(method) {
  if (method === "JOIN_ROOM") return "Vào phòng họp";
  if (method === "MANUAL") return "Bấm điểm danh";
  return "-";
}

/** Đọc danh sách phương án của một biểu quyết (JSONB hoặc chuỗi JSON). */
export function voteOptions(vote) {
  if (Array.isArray(vote?.options)) return vote.options;
  try {
    return JSON.parse(vote?.options || "[]");
  } catch {
    return [];
  }
}

/**
 * Nhãn tiếng Việt cho phương án của biểu quyết "Tán thành / Không / Không ý kiến".
 * Máy chủ vẫn lưu mã YES / NO / ABSTAIN; chỉ đổi cách hiển thị (khớp nhãn trong biên bản).
 */
const VOTE_ANSWER_LABELS = {
  YES: "Tán thành",
  NO: "Không tán thành",
  ABSTAIN: "Không ý kiến"
};

export function voteAnswerLabel(answer) {
  return VOTE_ANSWER_LABELS[answer] || answer;
}
