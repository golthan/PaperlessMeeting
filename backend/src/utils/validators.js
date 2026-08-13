import { badRequest } from "./httpError.js";

export const ROLES = ["ADMIN", "ORGANIZER", "PARTICIPANT"];
export const USER_STATUSES = ["ACTIVE", "LOCKED"];
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
export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "DECLINED"];
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE"];
export const DOCUMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
export const AGENDA_STATUSES = ["PENDING", "CURRENT", "DONE"];
export const VOTE_STATUSES = ["DRAFT", "OPEN", "CLOSED"];
export const VOTE_TYPES = ["YES_NO_ABSTAIN", "MULTIPLE_CHOICE"];
export const MINUTES_STATUSES = ["DRAFT", "PUBLISHED"];
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "OVERDUE"];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

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
    throw badRequest("Password must have at least 6 characters");
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
