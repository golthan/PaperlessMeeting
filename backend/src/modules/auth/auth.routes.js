import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, HttpError } from "../../utils/httpError.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { signToken } from "../../utils/jwt.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import {
  NOTIFICATION_TYPES,
  notifyAdmins
} from "../notifications/notifications.service.js";
import {
  assertEmail,
  assertPassword,
  requireFields
} from "../../utils/validators.js";

export const authRouter = express.Router();

function sanitizeUser(user) {
  if (!user) return user;
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["fullName", "email", "password"]);
    const { fullName, email, password, phone, jobTitle } = req.body;
    assertEmail(email);
    assertPassword(password);

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase()
    ]);
    if (existing.rows[0]) {
      throw badRequest("Email này đã được đăng ký trên hệ thống");
    }

    // Người tự đăng ký KHÔNG được dùng ngay: tài khoản nằm ở trạng thái chờ
    // duyệt, quản trị viên là người quyết định có nhận và cấp quyền gì.
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users
         (full_name, email, password_hash, role, status, phone, job_title, registered_at)
       VALUES ($1, $2, $3, 'PARTICIPANT', 'PENDING', $4, $5, now())
       RETURNING id, full_name, email, role, status, department_id, avatar_url,
                 phone, job_title, registered_at, created_at, updated_at`,
      [
        fullName.trim(),
        email.toLowerCase(),
        passwordHash,
        phone?.trim() || null,
        jobTitle?.trim() || null
      ]
    );
    const created = rows[0];

    await notifyAdmins({
      type: NOTIFICATION_TYPES.ACCOUNT_REGISTERED,
      severity: "WARNING",
      title: "Có tài khoản mới chờ duyệt",
      message: `${created.full_name} (${created.email}) vừa đăng ký. Vào mục Người dùng để duyệt và cấp quyền.`,
      metadata: { userId: created.id, target: "USERS" }
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_REGISTER,
      entityType: "USER",
      entityId: created.id,
      actorName: created.full_name,
      description: `${created.full_name} (${created.email}) đăng ký tài khoản, chờ quản trị viên duyệt`
    });

    res.status(201).json({
      data: created,
      message:
        "Đăng ký thành công. Tài khoản đang chờ quản trị viên phê duyệt và cấp quyền. Bạn sẽ đăng nhập được ngay sau khi hồ sơ được duyệt."
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["email", "password"]);
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT id, full_name, email, password_hash, role, status, department_id, avatar_url,
              phone, job_title, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()]
    );
    const user = rows[0];

    if (!user || !(await comparePassword(password, user.password_hash))) {
      // Ghi cả lần đăng nhập hỏng để phát hiện hành vi dò mật khẩu.
      await writeAuditLog(req, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: "USER",
        entityId: user?.id || null,
        actorName: email,
        description: "Đăng nhập thất bại với email " + email
      });
      throw new HttpError(401, "Sai email hoặc mật khẩu");
    }

    if (user.status === "LOCKED") {
      throw new HttpError(403, "Tài khoản đã bị khoá");
    }

    if (user.status === "PENDING") {
      throw new HttpError(
        403,
        "Tài khoản đang chờ quản trị viên phê duyệt. Vui lòng quay lại sau khi được duyệt."
      );
    }

    if (user.status === "REJECTED") {
      throw new HttpError(
        403,
        "Đăng ký của bạn đã bị từ chối. Liên hệ quản trị viên nếu cần hỗ trợ."
      );
    }

    const safeUser = sanitizeUser(user);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.LOGIN,
      entityType: "USER",
      entityId: user.id,
      actor: safeUser,
      description: safeUser.full_name + " đăng nhập hệ thống"
    });
    res.json({ user: safeUser, token: signToken(safeUser) });
  })
);

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", authenticate, (_req, res) => {
  res.json({ message: "Logged out" });
});

authRouter.put(
  "/profile",
  authenticate,
  asyncHandler(async (req, res) => {
    const { fullName, avatarUrl, phone, jobTitle } = req.body;

    if (!fullName || !fullName.trim()) {
      throw badRequest("Vui lòng nhập họ tên");
    }

    // Người dùng chỉ sửa được thông tin cá nhân của chính mình.
    // Vai trò, trạng thái và phòng ban vẫn do quản trị viên quyết định.
    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = $1,
           avatar_url = $2,
           phone = $3,
           job_title = $4,
           updated_at = now()
       WHERE id = $5
       RETURNING id, full_name, email, role, status, department_id, avatar_url,
                 phone, job_title, created_at, updated_at`,
      [
        fullName.trim(),
        avatarUrl?.trim() || null,
        phone?.trim() || null,
        jobTitle?.trim() || null,
        req.user.id
      ]
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_PROFILE_UPDATE,
      entityType: "USER",
      entityId: req.user.id,
      description: `${rows[0].full_name} cập nhật hồ sơ cá nhân`
    });

    res.json({ user: rows[0] });
  })
);

authRouter.put(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["currentPassword", "newPassword"]);
    assertPassword(req.body.newPassword);

    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!(await comparePassword(req.body.currentPassword, rows[0].password_hash))) {
      throw new HttpError(401, "Mật khẩu hiện tại không đúng");
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [passwordHash, req.user.id]
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGE,
      entityType: "USER",
      entityId: req.user.id,
      description: `${req.user.full_name} đổi mật khẩu`
    });

    res.json({ message: "Đã đổi mật khẩu" });
  })
);

