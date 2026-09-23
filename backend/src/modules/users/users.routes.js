import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";
import { hashPassword } from "../../utils/password.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import {
  NOTIFICATION_TYPES,
  notifyUsers
} from "../notifications/notifications.service.js";
import {
  assertEmail,
  assertEnum,
  assertPassword,
  requireFields,
  ROLES,
  USER_STATUSES
} from "../../utils/validators.js";

export const usersRouter = express.Router();

usersRouter.use(authenticate);

usersRouter.get(
  "/",
  requireRole("ADMIN", "ORGANIZER"),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const filters = [];
    const values = [];

    if (req.user.role === "ORGANIZER") {
      filters.push("u.role = 'PARTICIPANT'");
      filters.push("u.status = 'ACTIVE'");
    }

    if (req.query.role) {
      values.push(req.query.role);
      filters.push(`u.role = $${values.length}`);
    }
    if (req.query.status) {
      values.push(req.query.status);
      filters.push(`u.status = $${values.length}`);
    }
    if (req.query.departmentId) {
      values.push(req.query.departmentId);
      filters.push(`u.department_id = $${values.length}`);
    }
    if (req.query.q) {
      values.push(`%${req.query.q}%`);
      filters.push(
        `(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`
      );
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.department_id,
              d.name AS department_name, u.avatar_url, u.phone, u.job_title,
              u.registered_at, u.created_at, u.updated_at,
              count(*) OVER() AS total_count
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const total = Number(rows[0]?.total_count || 0);
    res.json(paged(rows.map(({ total_count, ...row }) => row), { page, limit, total }));
  })
);

/**
 * Danh sách hồ sơ đăng ký đang chờ duyệt.
 * Phải khai báo TRƯỚC route "/:id", nếu không Express sẽ hiểu "pending" là một id.
 */
usersRouter.get(
  "/pending",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.department_id,
              d.name AS department_name, u.phone, u.job_title,
              COALESCE(u.registered_at, u.created_at) AS registered_at, u.created_at
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.status = 'PENDING'
       ORDER BY COALESCE(u.registered_at, u.created_at) ASC`
    );
    res.json({ data: rows });
  })
);

usersRouter.get(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.department_id,
              d.name AS department_name, u.avatar_url, u.phone, u.job_title,
              u.approved_at, u.review_note, u.created_at, u.updated_at
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("User not found");
    res.json({ data: rows[0] });
  })
);

usersRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["fullName", "email", "password", "role"]);
    const { fullName, email, password, role, departmentId, status = "ACTIVE" } = req.body;
    assertEmail(email);
    assertPassword(password);
    assertEnum(role, ROLES, "role");
    assertEnum(status, USER_STATUSES, "status");

    const duplicate = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase()
    ]);
    if (duplicate.rows[0]) throw badRequest("Email already exists");

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [
        fullName.trim(),
        email.toLowerCase(),
        passwordHash,
        role,
        status,
        departmentId || null
      ]
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_CREATE,
      entityType: "USER",
      entityId: rows[0].id,
      description: "Tao tai khoan " + rows[0].email + " (" + rows[0].role + ")"
    });

    res.status(201).json({ data: rows[0] });
  })
);

usersRouter.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { fullName, role, status, departmentId } = req.body;
    assertEnum(role, ROLES, "role");
    assertEnum(status, USER_STATUSES, "status");

    if (req.params.id === req.user.id && status === "LOCKED") {
      throw badRequest("Admin cannot lock own account");
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role),
           status = COALESCE($3, status),
           department_id = $4,
           updated_at = now()
       WHERE id = $5
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [fullName || null, role || null, status || null, departmentId || null, req.params.id]
    );

    if (!rows[0]) throw notFound("User not found");
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      entityType: "USER",
      entityId: rows[0].id,
      description: `Cập nhật tài khoản ${rows[0].email}: vai trò ${rows[0].role}, trạng thái ${rows[0].status}`
    });
    res.json({ data: rows[0] });
  })
);

usersRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw badRequest("Admin cannot delete own account");
    }

    const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [
      req.params.id
    ]);
    if (!rowCount) throw notFound("User not found");
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_DELETE,
      entityType: "USER",
      entityId: req.params.id,
      description: "Xoá tài khoản người dùng"
    });
    res.status(204).send();
  })
);

usersRouter.put(
  "/:id/role",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["role"]);
    assertEnum(req.body.role, ROLES, "role");

    const { rows } = await pool.query(
      `UPDATE users SET role = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [req.body.role, req.params.id]
    );
    if (!rows[0]) throw notFound("User not found");
    res.json({ data: rows[0] });
  })
);

usersRouter.put(
  "/:id/lock",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw badRequest("Admin cannot lock own account");
    }

    const { rows } = await pool.query(
      `UPDATE users SET status = 'LOCKED', updated_at = now()
       WHERE id = $1
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("User not found");
    res.json({ data: rows[0] });
  })
);

usersRouter.put(
  "/:id/unlock",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE users SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1
       RETURNING id, full_name, email, role, status, department_id, avatar_url, created_at, updated_at`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("User not found");
    res.json({ data: rows[0] });
  })
);

/**
 * Duyệt một hồ sơ đăng ký: mở tài khoản và cấp vai trò.
 * Đây là bước quyết định người mới được vào hệ thống với quyền gì.
 */
usersRouter.put(
  "/:id/approve",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const role = req.body.role || "PARTICIPANT";
    assertEnum(role, ROLES, "role");

    const current = await pool.query("SELECT id, status, email FROM users WHERE id = $1", [
      req.params.id
    ]);
    if (!current.rows[0]) throw notFound("Không tìm thấy tài khoản");
    if (current.rows[0].status !== "PENDING") {
      throw badRequest("Hồ sơ này không còn ở trạng thái chờ duyệt");
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET status = 'ACTIVE',
           role = $1,
           department_id = $2,
           approved_by = $3,
           approved_at = now(),
           review_note = $4,
           updated_at = now()
       WHERE id = $5
       RETURNING id, full_name, email, role, status, department_id, avatar_url,
                 phone, job_title, approved_at, created_at, updated_at`,
      [
        role,
        req.body.departmentId || null,
        req.user.id,
        req.body.note?.trim() || null,
        req.params.id
      ]
    );

    const approved = rows[0];
    await notifyUsers([approved.id], {
      type: NOTIFICATION_TYPES.ACCOUNT_APPROVED,
      severity: "SUCCESS",
      actorId: req.user.id,
      title: "Tài khoản của bạn đã được duyệt",
      message: `Quản trị viên đã phê duyệt tài khoản và cấp quyền ${approved.role}. Bạn có thể đăng nhập và sử dụng hệ thống.`,
      metadata: { role: approved.role }
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_APPROVE,
      entityType: "USER",
      entityId: approved.id,
      description: `Duyệt tài khoản ${approved.email} và cấp quyền ${approved.role}`,
      metadata: { role: approved.role }
    });

    res.json({ data: approved });
  })
);

/** Từ chối hồ sơ đăng ký. Giữ lại bản ghi để truy vết, không cho đăng nhập. */
usersRouter.put(
  "/:id/reject",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const current = await pool.query("SELECT id, status FROM users WHERE id = $1", [
      req.params.id
    ]);
    if (!current.rows[0]) throw notFound("Không tìm thấy tài khoản");
    if (current.rows[0].status !== "PENDING") {
      throw badRequest("Hồ sơ này không còn ở trạng thái chờ duyệt");
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET status = 'REJECTED',
           review_note = $1,
           approved_by = $2,
           approved_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING id, full_name, email, role, status, review_note, created_at, updated_at`,
      [req.body.note?.trim() || null, req.user.id, req.params.id]
    );

    const rejected = rows[0];
    await notifyUsers([rejected.id], {
      type: NOTIFICATION_TYPES.ACCOUNT_REJECTED,
      severity: "DANGER",
      actorId: req.user.id,
      title: "Đăng ký của bạn bị từ chối",
      message: rejected.review_note
        ? `Lý do: ${rejected.review_note}`
        : "Liên hệ quản trị viên để biết thêm chi tiết.",
      metadata: {}
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.USER_REJECT,
      entityType: "USER",
      entityId: rejected.id,
      description: `Từ chối hồ sơ đăng ký ${rejected.email}`,
      metadata: { note: rejected.review_note }
    });

    res.json({ data: rejected });
  })
);
