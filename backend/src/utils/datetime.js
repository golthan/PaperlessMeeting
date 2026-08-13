const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

/** "20:30 13/08/2026" — dùng trong nội dung thông báo gửi cho người dùng. */
export function formatMeetingTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

/** So sánh hai mốc thời gian ở mức phút, bỏ qua sai khác mili giây. */
export function isSameMinute(a, b) {
  if (!a || !b) return a === b;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return Math.floor(left / 60000) === Math.floor(right / 60000);
}
