import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, HttpError } from "../../utils/httpError.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { signToken } from "../../utils/jwt.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
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
    const { fullName, email, password, departmentId } = req.body;
    assertEmail(email);
    assertPassword(password);

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase()
    ]);
    if (existing.rows[0]) {
      throw badRequest("Email already exists");
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, department_id)
       VALUES ($1, $2, $3, 'PARTICIPANT', 'ACTIVE', $4)
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [fullName.trim(), email.toLowerCase(), passwordHash, departmentId || null]
    );

    res.status(201).json({ user: rows[0], token: signToken(rows[0]) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["email", "password"]);
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT id, full_name, email, password_hash, role, status, department_id, avatar_url, created_at, updated_at
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
    const { fullName, avatarUrl } = req.body;

    if (!fullName || !fullName.trim()) {
      throw badRequest("Full name is required");
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = $1, avatar_url = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [fullName.trim(), avatarUrl || null, req.user.id]
    );

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
      throw new HttpError(401, "Current password is incorrect");
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [passwordHash, req.user.id]
    );

    res.json({ message: "Password changed" });
  })
);

