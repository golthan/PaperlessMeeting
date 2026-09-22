const tones = {
  ADMIN: "danger",
  ORGANIZER: "info",
  PARTICIPANT: "neutral",
  ACTIVE: "success",
  LOCKED: "danger",
  AVAILABLE: "success",
  UNAVAILABLE: "danger",
  UPCOMING: "info",
  ONGOING: "warning",
  FINISHED: "success",
  CANCELLED: "danger",
  PENDING: "warning",
  ACCEPTED: "success",
  DECLINED: "danger",
  APPROVED: "success",
  REJECTED: "danger",
  OPEN: "success",
  CLOSED: "neutral",
  DRAFT: "warning",
  PUBLISHED: "success",
  CURRENT: "info",
  TODO: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  OVERDUE: "danger",
  PRESENT: "success",
  ABSENT: "neutral",
  LATE: "warning",
  ONLINE: "success",
  HAND: "warning",
  HYBRID: "info",
  OFFLINE: "neutral",
  CHAIRMAN: "info",
  SECRETARY: "info",
  MEMBER: "neutral",
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "danger"
};

/** Nhãn tiếng Việt mặc định cho từng giá trị trạng thái. */
const labels = {
  ADMIN: "Quản trị",
  ORGANIZER: "Người tổ chức",
  PARTICIPANT: "Người dự",
  ACTIVE: "Đang hoạt động",
  LOCKED: "Đã khoá",
  AVAILABLE: "Sẵn sàng",
  UNAVAILABLE: "Không dùng được",
  DRAFT: "Nháp",
  UPCOMING: "Sắp diễn ra",
  ONGOING: "Đang họp",
  FINISHED: "Đã kết thúc",
  CANCELLED: "Đã huỷ",
  PENDING: "Chờ xử lý",
  ACCEPTED: "Đã nhận lời",
  DECLINED: "Từ chối",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  OPEN: "Đang mở",
  CLOSED: "Đã chốt",
  PUBLISHED: "Đã ban hành",
  CURRENT: "Đang trình bày",
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
  OVERDUE: "Quá hạn",
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  LATE: "Đi muộn",
  ONLINE: "Trực tuyến",
  OFFLINE: "Tập trung",
  HYBRID: "Tập trung + trực tuyến",
  HAND: "Giơ tay",
  CHAIRMAN: "Chủ tọa",
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên",
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao"
};

/** Một số giá trị trùng tên nhưng khác nghĩa tuỳ ngữ cảnh. */
const contextLabels = {
  invitation: { PENDING: "Chờ phản hồi" },
  document: { PENDING: "Chờ duyệt" },
  account: { PENDING: "Chờ quản trị duyệt", REJECTED: "Đã bị từ chối" },
  agenda: { PENDING: "Chưa trình bày", DONE: "Đã xong" },
  vote: { DRAFT: "Nháp", OPEN: "Đang lấy ý kiến", CLOSED: "Đã chốt" },
  presence: { ONLINE: "Trong phòng" }
};

/**
 * @param value  Giá trị enum lấy từ API.
 * @param kind   Ngữ cảnh để chọn nhãn chính xác (invitation, document, agenda, vote, presence).
 * @param label  Ghi đè nhãn khi cần hiển thị khác.
 */
export function StatusPill({ value, kind, label }) {
  if (!value) return <span className="pill neutral">-</span>;
  const text = label || contextLabels[kind]?.[value] || labels[value] || value;
  return <span className={`pill ${tones[value] || "neutral"}`}>{text}</span>;
}
