import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { encryptLegacySigningKeys } from "../modules/minutes/minutes.signing.js";

/**
 * Chạy schema.sql mà không xoá dữ liệu.
 * Dùng khi chỉ cần cập nhật bảng / cột / ràng buộc mới cho database đang có,
 * khác với `npm run seed` (reset toàn bộ dữ liệu demo).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Schema updated. Dữ liệu hiện có được giữ nguyên.");

  const encrypted = await encryptLegacySigningKeys();
  if (encrypted) console.log(`Đã mã hoá ${encrypted} khoá ký số còn lưu dạng rõ.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
