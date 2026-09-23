import { badRequest } from "./httpError.js";

export const ROLES = ["ADMIN", "ORGANIZER", "PARTICIPANT"];
// PENDING: vua dang ky, dang cho quan tri vien duyet.
// REJECTED: bi tu choi - giu lai ban ghi de truy vet, khong cho dang nhap.
export const USER_STATUSES = ["ACTIVE", "LOCKED", "PENDING", "REJECTED"];
export const ROOM_STATUSES = ["AVAILABLE", "UNAVAILABLE"];
export const MEETING_STATUSES = [
  "DRAFT",
  "UPCOMING",
  "ONGOING",
  "FINISHED",
  "CANCELLED"
];
export const MEETING_TYPES = ["ONLINE", "OFFLINE", "HYBRID"];
export const ONLINE_PROVIDERS = ["LIVEKIT", "CUSTOM"];
export const MEETING_ROLES = ["CHAIRMAN", "SECRETARY", "MEMBER"];
// FREE: ai cũng tự bật mic. MODERATED: phải được chủ tọa mời mới phát biểu được.
export const SPEAKER_MODES = ["FREE", "MODERATED"];
export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "DECLINED"];
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE"];
export const DOCUMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
export const AGENDA_STATUSES = ["PENDING", "CURRENT", "DONE"];
export const VOTE_STATUSES = ["DRAFT", "OPEN", "CLOSED"];
export const VOTE_TYPES = ["YES_NO_ABSTAIN", "MULTIPLE_CHOICE"];
export const MINUTES_STATUSES = ["DRAFT", "PUBLISHED"];
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "OVERDUE"];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

/** Nguồn của một đoạn ghi lời nói. SERVER để dành cho Whisper/Deepgram sau này. */
export const TRANSCRIPT_SOURCES = ["BROWSER", "MOBILE", "SERVER", "MANUAL"];

export function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });

  if (missing.length > 0) {
    throw badRequest("Missing required fields", { missing });
  }
}

export function assertEnum(value, values, field) {
  if (value !== undefined && value !== null && !values.includes(value)) {
    throw badRequest(`Invalid ${field}`, { allowed: values });
  }
}

export function assertEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest("Invalid email");
  }
}

export function assertPassword(password) {
  if (!password || password.length < 6) {
    throw badRequest("Mật khẩu cần tối thiểu 6 ký tự");
  }
}

export function assertTimeRange(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badRequest("Invalid meeting time");
  }
  if (start >= end) {
    throw badRequest("Start time must be before end time");
  }
}
