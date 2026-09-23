import crypto from "crypto";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { badRequest } from "../../utils/httpError.js";

/**
 * Ký số biên bản.
 *
 * Cách làm:
 * 1. Chuẩn hoá nội dung biên bản thành một chuỗi duy nhất (canonical form) rồi
 *    băm SHA-256 — đây là "vân tay" của biên bản.
 * 2. Người ký dùng khoá riêng RSA-2048 ký lên chuỗi đó, chữ ký lưu base64 kèm
 *    vân tay tại thời điểm ký.
 * 3. Khi tra cứu, hệ thống băm lại nội dung hiện tại và kiểm tra chữ ký bằng
 *    khoá công khai. Nếu ai đó sửa dù chỉ một ký tự thì vân tay đổi, chữ ký
 *    không còn khớp và hệ thống báo biên bản đã bị thay đổi.
 *
 * Khoá riêng được mã hoá AES-256-GCM trước khi lưu vào database, bằng khoá lấy
 * từ biến môi trường SIGNING_KEY_SECRET. Lộ database hay bản sao lưu thì cũng
 * không dùng được khoá riêng để ký giả.
 *
 * Giới hạn của đồ án: máy chủ vẫn giữ khoá giải mã nên vẫn ký thay người dùng.
 * Hệ thống triển khai thật sẽ đặt khoá riêng trong USB token hoặc HSM của tổ
 * chức chứng thực số; phần còn lại của quy trình giữ nguyên.
 */

const ALGORITHM = "RSA-SHA256";

// Khoá riêng đã mã hoá lưu dạng "enc:v1:<iv>:<tag>:<bản mã>" (base64).
const ENCRYPTED_PREFIX = "enc:v1:";

let wrappingKey = null;
/** Dẫn xuất khoá AES-256 từ SIGNING_KEY_SECRET (tính một lần rồi dùng lại). */
function getWrappingKey() {
  if (!wrappingKey) {
    wrappingKey = crypto.scryptSync(env.signingKeySecret, "paperless-meeting-signing", 32);
  }
  return wrappingKey;
}

/** Mã hoá khoá riêng dạng PEM trước khi lưu. */
export function encryptPrivateKey(pem) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getWrappingKey(), iv);
  const encrypted = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    ENCRYPTED_PREFIX +
    [iv, tag, encrypted].map((part) => part.toString("base64")).join(":")
  );
}

export function isEncryptedPrivateKey(stored) {
  return String(stored || "").startsWith(ENCRYPTED_PREFIX);
}

/**
 * Giải mã khoá riêng để ký. Chỉ giữ trong bộ nhớ trong lúc ký, không trả ra API.
 * Khoá cũ còn dạng PEM rõ (trước khi có mã hoá) vẫn đọc được.
 */
export function decryptPrivateKey(stored) {
  if (!isEncryptedPrivateKey(stored)) return stored;
  const [iv, tag, encrypted] = stored
    .slice(ENCRYPTED_PREFIX.length)
    .split(":")
    .map((part) => Buffer.from(part, "base64"));
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getWrappingKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw badRequest(
      "Không giải mã được khoá ký số. Kiểm tra SIGNING_KEY_SECRET trong backend/.env có bị đổi không."
    );
  }
}

/**
 * Mã hoá các khoá riêng còn lưu dạng rõ (dữ liệu tạo trước khi có mã hoá).
 * `npm run migrate` gọi hàm này; chạy lại nhiều lần cũng không sao.
 */
export async function encryptLegacySigningKeys() {
  const { rows } = await pool.query(
    "SELECT id, private_key FROM user_signing_keys WHERE private_key NOT LIKE $1",
    [`${ENCRYPTED_PREFIX}%`]
  );
  for (const row of rows) {
    await pool.query("UPDATE user_signing_keys SET private_key = $1 WHERE id = $2", [
      encryptPrivateKey(row.private_key),
      row.id
    ]);
  }
  return rows.length;
}

/**
 * Chuẩn hoá nội dung trước khi băm: bỏ khác biệt về xuống dòng và khoảng trắng
 * thừa để cùng một biên bản luôn cho ra cùng một vân tay.
 */
export function canonicalMinutes(minutes) {
  const normalize = (value) =>
    String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim();

  return [
    `MEETING:${minutes.meeting_id}`,
    `MINUTES:${minutes.id}`,
    `CONTENT:\n${normalize(minutes.content)}`,
    `CONCLUSION:\n${normalize(minutes.conclusion)}`,
    `DECISIONS:\n${normalize(minutes.decisions)}`
  ].join("\n=====\n");
}

export function hashMinutes(minutes) {
  return crypto.createHash("sha256").update(canonicalMinutes(minutes), "utf8").digest("hex");
}

/** Mã tra cứu ngắn, in kèm QR trên biên bản để đối chiếu bản giấy. */
export function buildVerificationCode() {
  return `BB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Lấy cặp khoá của người ký, chưa có thì sinh mới (RSA-2048). */
export async function ensureSigningKey(userId) {
  const existing = await pool.query(
    "SELECT * FROM user_signing_keys WHERE user_id = $1",
    [userId]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    // Khoá cũ còn dạng rõ thì mã hoá luôn, phòng khi chưa chạy migrate.
    if (!isEncryptedPrivateKey(row.private_key)) {
      const encrypted = encryptPrivateKey(row.private_key);
      await pool.query("UPDATE user_signing_keys SET private_key = $1 WHERE id = $2", [
        encrypted,
        row.id
      ]);
      row.private_key = encrypted;
    }
    return row;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const { rows } = await pool.query(
    `INSERT INTO user_signing_keys (user_id, public_key, private_key, algorithm)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key
     RETURNING *`,
    [userId, publicKey, encryptPrivateKey(privateKey), ALGORITHM]
  );
  return rows[0];
}

/** Ký chuỗi canonical bằng khoá riêng (dạng đã lưu), trả chữ ký base64. */
export function signContent(canonical, storedPrivateKey) {
  return crypto
    .sign("sha256", Buffer.from(canonical, "utf8"), decryptPrivateKey(storedPrivateKey))
    .toString("base64");
}

/** Kiểm tra chữ ký với khoá công khai của người ký. */
export function verifySignature(canonical, signatureBase64, publicKeyPem) {
  try {
    return crypto.verify(
      "sha256",
      Buffer.from(canonical, "utf8"),
      publicKeyPem,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Kiểm tra toàn vẹn một biên bản: băm lại nội dung hiện tại rồi đối chiếu với
 * từng chữ ký đã lưu.
 */
export async function verifyMinutesIntegrity(minutes) {
  const canonical = canonicalMinutes(minutes);
  const currentHash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");

  const { rows } = await pool.query(
    `SELECT ms.*, k.public_key
     FROM minutes_signatures ms
     LEFT JOIN user_signing_keys k ON k.user_id = ms.signer_id
     WHERE ms.minutes_id = $1
     ORDER BY ms.signed_at ASC`,
    [minutes.id]
  );

  const signatures = rows.map((row) => {
    const hashMatched = row.content_hash === currentHash;
    const signatureValid = row.public_key
      ? verifySignature(canonical, row.signature, row.public_key)
      : false;
    return {
      id: row.id,
      signerId: row.signer_id,
      signerName: row.signer_name,
      signerTitle: row.signer_title,
      signedAt: row.signed_at,
      algorithm: row.algorithm,
      contentHash: row.content_hash,
      // Chữ ký chỉ hợp lệ khi vừa đúng khoá vừa đúng nội dung.
      valid: hashMatched && signatureValid,
      // Xét mã băm trước: nội dung bị sửa cũng làm chữ ký sai, nhưng nguyên nhân
      // gốc là nội dung thay đổi nên phải báo đúng như vậy.
      reason: !hashMatched
        ? "Nội dung biên bản đã bị thay đổi sau khi ký"
        : !signatureValid
          ? "Chữ ký không khớp khoá công khai"
          : null
    };
  });

  return {
    currentHash,
    signatures,
    signed: signatures.length > 0,
    // Toàn vẹn khi có ít nhất một chữ ký và tất cả chữ ký đều hợp lệ.
    intact: signatures.length > 0 && signatures.every((item) => item.valid)
  };
}
