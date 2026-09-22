import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { API_URL, apiRequest, documentDownloadUrl } from "./api";

const EXTENSION_BY_MIME = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/plain": "txt"
};

/** Ảnh và văn bản thuần xem thẳng trong app được; còn lại giao cho ứng dụng ngoài. */
export function isPreviewableInApp(mimeType) {
  return /^image\//.test(String(mimeType || "")) || mimeType === "text/plain";
}

/**
 * Tên file an toàn cho bộ nhớ đệm: bỏ dấu tiếng Việt và ký tự lạ nhưng giữ đuôi.
 * Tên gốc tiếng Việt vẫn được giữ nguyên trong cơ sở dữ liệu, đây chỉ là bản sao tạm.
 */
function cacheFileName(name, mimeType) {
  const raw = String(name || "tai-lieu");
  const dot = raw.lastIndexOf(".");
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const extension =
    (dot > 0 ? raw.slice(dot + 1) : "") || EXTENSION_BY_MIME[mimeType] || "bin";
  const safeBase = base.replace(/[^\w.-]+/g, "_").slice(0, 60) || "tai-lieu";
  return `${safeBase}.${extension.replace(/[^\w]+/g, "")}`;
}

/**
 * Mở một file đã nằm trong máy bằng ứng dụng phù hợp.
 *
 * Android dùng Intent VIEW để trình đọc PDF/Office mở trực tiếp; nếu máy không
 * có ứng dụng nào nhận thì chuyển sang bảng chia sẻ.
 */
async function openLocalFile(uri, mimeType) {
  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: mimeType || "application/octet-stream"
      });
      return;
    } catch {
      // Không có ứng dụng đọc định dạng này -> để người dùng tự chọn ở bước dưới.
    }
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
    return;
  }
  throw new Error("Máy chưa có ứng dụng nào mở được định dạng này");
}

/**
 * Tải tài liệu về bộ nhớ đệm rồi mở bằng ứng dụng đọc của máy.
 *
 * Dùng endpoint /content (JSON base64) thay vì tải thẳng file nhị phân: một số
 * trình quản lý tải xuống chặn phản hồi application/pdf khiến việc xem tài liệu
 * thất bại, còn JSON thì không bị đụng tới.
 */
export async function openDocument(document, token) {
  try {
    const result = await apiRequest(`/documents/${document.id}/content`, { token });
    const data = result?.data;
    if (!data?.base64) throw new Error("Máy chủ không trả về nội dung tài liệu");

    const uri = FileSystem.cacheDirectory + cacheFileName(data.name, data.mimeType);
    await FileSystem.writeAsStringAsync(uri, data.base64, {
      encoding: FileSystem.EncodingType.Base64
    });
    await openLocalFile(uri, data.mimeType);
  } catch (error) {
    // Phương án cuối: đẩy sang trình duyệt hệ thống bằng link có access_token.
    const opened = await Linking.openURL(documentDownloadUrl(document.id, token)).then(
      () => true,
      () => false
    );
    if (!opened) throw error;
  }
}

/** Lấy nội dung tài liệu để xem trước ngay trong app (ảnh, văn bản thuần). */
export async function fetchDocumentContent(documentId, token) {
  const result = await apiRequest(`/documents/${documentId}/content`, { token });
  return result?.data || null;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Giải mã base64 sang chuỗi UTF-8 để xem trước file .txt.
 *
 * Tự viết thay vì dùng atob vì React Native không bảo đảm có sẵn hàm đó, và
 * atob cũng chỉ trả về từng byte nên chữ tiếng Việt sẽ hỏng.
 */
export function decodeBase64Text(base64) {
  const clean = String(base64 || "").replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = [];
  for (let index = 0; index < clean.length; index += 4) {
    const chunk = [0, 1, 2, 3].map((offset) =>
      BASE64_ALPHABET.indexOf(clean[index + offset] || "A")
    );
    const value = (chunk[0] << 18) | (chunk[1] << 12) | (chunk[2] << 6) | chunk[3];
    bytes.push((value >> 16) & 0xff);
    if (clean[index + 2] !== undefined) bytes.push((value >> 8) & 0xff);
    if (clean[index + 3] !== undefined) bytes.push(value & 0xff);
  }

  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x80) {
      text += String.fromCharCode(byte);
    } else if (byte < 0xe0) {
      text += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++index] & 0x3f));
    } else {
      text += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((bytes[++index] & 0x3f) << 6) | (bytes[++index] & 0x3f)
      );
    }
  }
  return text;
}

/** Tải PDF biên bản (có ký số + mã tra cứu) rồi mở bằng trình đọc của máy. */
export async function openMinutesPdf(minutes, token) {
  const name = `bien-ban-${minutes.verification_code || minutes.id}.pdf`;
  const uri = FileSystem.cacheDirectory + cacheFileName(name, "application/pdf");
  const url = `${API_URL}/minutes/${minutes.id}/pdf?access_token=${encodeURIComponent(token)}`;

  const result = await FileSystem.downloadAsync(url, uri);
  if (result.status !== 200) {
    throw new Error("Không tải được PDF biên bản");
  }
  await openLocalFile(result.uri, "application/pdf");
}
