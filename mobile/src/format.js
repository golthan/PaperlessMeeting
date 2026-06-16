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

