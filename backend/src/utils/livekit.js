import { TrackSource } from "@livekit/protocol";
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
    roomAdmin: Boolean(permissions.isChairman),
    canSubscribe: true,
    canPublish: permissions.canSpeak !== false,
    canPublishData: true
  };
  // canPublishSources nhận enum TrackSource của LiveKit, truyền chuỗi thường sẽ làm hỏng token.
  if (!permissions.canShareScreen) {
    grant.canPublishSources = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  }
  token.addGrant(grant);

  return token.toJwt();
}
