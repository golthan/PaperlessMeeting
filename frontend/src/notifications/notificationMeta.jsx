import {
  CalendarClock,
  CalendarX2,
  CheckSquare,
  FileText,
  Info,
  ListChecks,
  Mail,
  PlayCircle,
  Timer,
  UserMinus,
  Video,
  Vote
} from "lucide-react";

/** Icon + nhãn tiếng Việt cho từng loại thông báo. */
const META = {
  MEETING_INVITE: { icon: Mail, label: "Lời mời họp" },
  MEETING_UPDATED: { icon: CalendarClock, label: "Đổi lịch họp" },
  MEETING_CANCELLED: { icon: CalendarX2, label: "Huỷ họp" },
  MEETING_STARTED: { icon: PlayCircle, label: "Bắt đầu họp" },
  MEETING_FINISHED: { icon: ListChecks, label: "Kết thúc họp" },
  MEETING_REMINDER: { icon: Timer, label: "Nhắc lịch" },
  MEETING_ONLINE_ENABLED: { icon: Video, label: "Phòng trực tuyến" },
  MEETING_ONLINE_DISABLED: { icon: Video, label: "Phòng trực tuyến" },
  PARTICIPANT_REMOVED: { icon: UserMinus, label: "Thay đổi thành phần" },
  INVITATION_RESPONSE: { icon: CheckSquare, label: "Phản hồi lời mời" },
  DOCUMENT_UPLOADED: { icon: FileText, label: "Tài liệu mới" },
  DOCUMENT_REVIEWED: { icon: FileText, label: "Duyệt tài liệu" },
  VOTE_OPENED: { icon: Vote, label: "Biểu quyết" },
  VOTE_CLOSED: { icon: Vote, label: "Biểu quyết" },
  MINUTES_PUBLISHED: { icon: FileText, label: "Biên bản" },
  TASK_ASSIGNED: { icon: CheckSquare, label: "Nhiệm vụ mới" },
  TASK_UPDATED: { icon: CheckSquare, label: "Cập nhật nhiệm vụ" }
};

export const NOTIFICATION_FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "MEETING", label: "Lịch họp" },
  { value: "TASK", label: "Nhiệm vụ" },
  { value: "DOCUMENT", label: "Tài liệu & biên bản" }
];

export function notificationMeta(type) {
  return META[type] || { icon: Info, label: "Thông báo" };
}

export function matchesFilter(notification, filter) {
  if (filter === "ALL") return true;
  if (filter === "UNREAD") return !notification.is_read;
  if (filter === "MEETING") {
    return (
      notification.type.startsWith("MEETING") ||
      notification.type === "INVITATION_RESPONSE" ||
      notification.type === "PARTICIPANT_REMOVED"
    );
  }
  if (filter === "TASK") return notification.type.startsWith("TASK");
  if (filter === "DOCUMENT") {
    return (
      notification.type.startsWith("DOCUMENT") ||
      notification.type === "MINUTES_PUBLISHED" ||
      notification.type.startsWith("VOTE")
    );
  }
  return true;
}

export function severityClass(severity) {
  return `notif-${String(severity || "INFO").toLowerCase()}`;
}
