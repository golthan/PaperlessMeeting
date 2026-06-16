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

export function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

