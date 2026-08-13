import { AccessToken } from "livekit-server-sdk";
import { env } from "../config/env.js";

export function buildLiveRoomName(meetingId) {
  return `paperless-meeting-${meetingId}`;
}

export function buildLiveRoomUrl(meetingId) {
  if (!meetingId) return null;
  return `${env.clientOrigin.replace(/\/$/, "")}/join/${meetingId}`;
}

export async function createLiveRoomToken({ roomName, user, permissions }) {
  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: String(user.id),
    name: user.full_name || user.email,
    ttl: "6h"
  });

  const grant = {
    room: roomName,
    roomJoin: true,
    roomAdmin: Boolean(permissions.isOrganizer),
    canSubscribe: true,
    canPublish: permissions.canSpeak !== false,
    canPublishData: true
  };
  if (!permissions.canShareScreen) {
    grant.canPublishSources = ["camera", "microphone"];
  }
  token.addGrant(grant);

  return token.toJwt();
}
