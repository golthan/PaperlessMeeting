import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";
import { hashPassword } from "../../utils/password.js";
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
              d.name AS department_name, u.avatar_url, u.created_at, u.updated_at,
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

usersRouter.get(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.department_id,
              d.name AS department_name, u.avatar_url, u.created_at, u.updated_at
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
