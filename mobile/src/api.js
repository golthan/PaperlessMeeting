export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000/api";

let sessionExpiredHandler = null;

/** App đăng ký hàm xử lý khi phiên đăng nhập đang lưu trong máy không còn hợp lệ. */
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

/**
 * Chỉ coi là hết phiên khi lỗi thực sự nói về token / tài khoản.
 * Không tính 401 "mật khẩu hiện tại không đúng" hay 403 do thiếu quyền trong cuộc họp.
 */
function isSessionInvalid(status, message) {
  if (status === 401) return /token|user not found/i.test(message);
  if (status === 403) return /bị khoá|chờ quản trị viên|bị từ chối|locked/i.test(message);
  return false;
}

export async function apiRequest(path, options = {}) {
  const { token, body, multipart, headers, ...rest } = options;
  const requestHeaders = {
    ...(headers || {})
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let payload = body;
  if (body && !multipart) {
    requestHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: payload
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.message || "Không thể kết nối máy chủ";
    const error = new Error(message);
    error.status = response.status;
    if (token && sessionExpiredHandler && isSessionInvalid(response.status, message)) {
      sessionExpiredHandler(message);
    }
    throw error;
  }

  return data;
}

/** Máy chủ API và máy chủ LiveKit chạy cùng một máy trong bản triển khai nội bộ. */
function apiHost() {
  return API_URL.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
}

/** Địa chỉ LiveKit dùng khi máy chủ chưa khai báo LIVEKIT_WS_URL. */
export function defaultLivekitUrl() {
  return process.env.EXPO_PUBLIC_LIVEKIT_URL || `ws://${apiHost()}:7880`;
}

export function liveJoinUrl(meetingId, livekitToken) {
  const webBase = process.env.EXPO_PUBLIC_WEB_URL || `http://${apiHost()}:5173`;
  return `${webBase.replace(/\/$/, "")}/join/${meetingId}#token=${encodeURIComponent(
    livekitToken
  )}&url=${encodeURIComponent(defaultLivekitUrl())}`;
}

export function documentDownloadUrl(documentId, token) {
  return `${API_URL}/documents/${documentId}/download?access_token=${encodeURIComponent(
    token
  )}`;
}

