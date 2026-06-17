import { env } from "../config/env.js";

export function buildJitsiRoomName(meetingId) {
  return `paperless-meeting-${meetingId}`;
}

export function buildJitsiRoomUrl(roomName) {
  if (!roomName) return null;
  return `${env.jitsiRoomUrlBase.replace(/\/$/, "")}/${encodeURIComponent(roomName)}`;
}
