import { TrackSource } from "@livekit/protocol";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "../config/env.js";

export function buildLiveRoomName(meetingId) {
  return `paperless-meeting-${meetingId}`;
}

export function buildLiveRoomUrl(meetingId) {
  if (!meetingId) return null;
  return `${env.clientOrigin.replace(/\/$/, "")}/join/${meetingId}`;
}

/**
 * Dựng bộ quyền LiveKit từ quyền trong cuộc họp.
 *
 * Tách riêng để lúc cấp vé vào phòng và lúc đổi quyền giữa chừng dùng chung một
 * quy tắc — lệch nhau là sinh ra cảnh người được chủ tọa mời nói nhưng máy chủ
 * video vẫn chặn.
 */
function buildLiveGrant(roomName, permissions) {
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
  return grant;
}

let roomServiceClient = null;
function getRoomService() {
  if (!roomServiceClient) {
    roomServiceClient = new RoomServiceClient(
      env.livekitHostUrl,
      env.livekitApiKey,
      env.livekitApiSecret
    );
  }
  return roomServiceClient;
}

/**
 * Đổi quyền phát biểu của một người ĐANG ở trong phòng họp video.
 *
 * Vé LiveKit được cấp lúc vào phòng và máy chủ video tự chấp hành theo vé đó.
 * Chủ tọa mời ai nói giữa chừng mà chỉ sửa cơ sở dữ liệu thì người đó bấm mic
 * vẫn bị LiveKit từ chối, vì vé trong tay họ vẫn ghi "không được phát". Hàm này
 * đẩy quyền mới sang LiveKit để máy chủ video cập nhật ngay, không phải thoát
 * ra vào lại phòng.
 *
 * Không ném lỗi ra ngoài: cơ sở dữ liệu mới là nguồn sự thật, và lần vào phòng
 * sau vé sẽ được cấp đúng. LiveKit chết hay người đó chưa vào phòng thì việc
 * chỉ định vẫn phải thành công.
 */
export async function syncLiveRoomPermissions({ meetingId, userId, permissions }) {
  try {
    await getRoomService().updateParticipant(buildLiveRoomName(meetingId), String(userId), {
      permission: buildLiveGrant(buildLiveRoomName(meetingId), permissions)
    });
    return true;
  } catch (error) {
    // Người chưa vào phòng thì LiveKit trả "participant does not exist" — bình thường.
    const message = String(error?.message || "");
    if (!/not exist|not found/i.test(message)) {
      console.warn(`Không đẩy được quyền phát biểu sang LiveKit: ${message}`);
    }
    return false;
  }
}

export async function createLiveRoomToken({ roomName, user, permissions }) {
  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: String(user.id),
    name: user.full_name || user.email,
    ttl: "6h"
  });

  token.addGrant(buildLiveGrant(roomName, permissions));

  return token.toJwt();
}
