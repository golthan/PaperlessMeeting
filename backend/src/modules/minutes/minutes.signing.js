import crypto from "crypto";
import { pool } from "../../config/db.js";

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
 * Giới hạn của đồ án: khoá riêng sinh tự động và lưu trong database. Hệ thống
 * triển khai thật phải đặt khoá trong USB token hoặc HSM của tổ chức chứng
 * thực số, phần còn lại của quy trình giữ nguyên.
 */

const ALGORITHM = "RSA-SHA256";

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
  if (existing.rows[0]) return existing.rows[0];

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
    [userId, publicKey, privateKey, ALGORITHM]
  );
  return rows[0];
}

/** Ký chuỗi canonical bằng khoá riêng, trả chữ ký base64. */
export function signContent(canonical, privateKeyPem) {
  return crypto
    .sign("sha256", Buffer.from(canonical, "utf8"), privateKeyPem)
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
