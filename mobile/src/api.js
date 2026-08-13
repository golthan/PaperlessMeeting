export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000/api";

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
    throw new Error(message);
  }

  return data;
}

export function liveJoinUrl(meetingId, livekitToken) {
  const host = API_URL.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  const webBase = process.env.EXPO_PUBLIC_WEB_URL || `http://${host}:5173`;
  const livekitUrl = process.env.EXPO_PUBLIC_LIVEKIT_URL || `ws://${host}:7880`;
  return `${webBase.replace(/\/$/, "")}/join/${meetingId}#token=${encodeURIComponent(
    livekitToken
  )}&url=${encodeURIComponent(livekitUrl)}`;
}

export function documentDownloadUrl(documentId, token) {
  return `${API_URL}/documents/${documentId}/download?access_token=${encodeURIComponent(
    token
  )}`;
}

