import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { verifyToken } from "../utils/jwt.js";

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, headerToken] = header.split(" ");
  const token = scheme === "Bearer" && headerToken ? headerToken : req.query.access_token;

  if (!token) {
    throw new HttpError(401, "Missing token");
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, "Invalid token");
  }

  const { rows } = await pool.query(
    `SELECT id, full_name, email, role, status, department_id, avatar_url,
            phone, job_title, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [payload.sub]
  );

  if (!rows[0]) {
    throw new HttpError(401, "User not found");
  }

  if (rows[0].status === "LOCKED") {
    throw new HttpError(403, "Tài khoản đã bị khoá");
  }

  // Token cấp trước khi bị từ chối / hạ về chờ duyệt vẫn phải bị chặn ngay.
  if (rows[0].status === "PENDING") {
    throw new HttpError(403, "Tài khoản đang chờ quản trị viên phê duyệt");
  }

  if (rows[0].status === "REJECTED") {
    throw new HttpError(403, "Đăng ký của tài khoản này đã bị từ chối");
  }

  req.user = rows[0];
  next();
});
