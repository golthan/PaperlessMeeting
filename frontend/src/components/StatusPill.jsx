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
  ONLINE_MEETING: "info",
  OFFLINE: "neutral"
};

export function StatusPill({ value }) {
  if (!value) return <span className="pill neutral">-</span>;
  return <span className={`pill ${tones[value] || "neutral"}`}>{value}</span>;
}
