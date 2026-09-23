export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(value)
  );
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Cuộc họp này có phòng video hay không. */
export function hasOnlineRoom(meeting) {
  return Boolean(meeting) && meeting.meeting_type !== "OFFLINE";
}

/** Địa điểm rút gọn: phòng vật lý, phòng trực tuyến hoặc cả hai. */
export function meetingPlaceLabel(meeting) {
  if (!meeting) return "-";
  if (meeting.meeting_type === "ONLINE") return "Phòng họp trực tuyến";
  const room = meeting.room_name || "Chưa chọn phòng";
  return meeting.meeting_type === "HYBRID" ? room + " + phòng trực tuyến" : room;
}

/** Tổng hợp điểm danh của một cuộc họp. */
export function attendanceSummary(participants) {
  const list = asArray(participants);
  const present = list.filter((item) => item.attendance_status === "PRESENT").length;
  const late = list.filter((item) => item.attendance_status === "LATE").length;
  return {
    total: list.length,
    present,
    late,
    checkedIn: present + late,
    absent: list.length - present - late
  };
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

/** "5 phút trước" — dùng cho danh sách thông báo. */
export function timeAgo(value) {
  if (!value) return "";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatDate(value);
}


/**
 * Nhãn tiếng Việt cho phương án biểu quyết "Tán thành / Không / Không ý kiến".
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
