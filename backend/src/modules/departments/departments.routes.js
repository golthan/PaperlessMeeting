import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { requireFields } from "../../utils/validators.js";

export const departmentsRouter = express.Router();

departmentsRouter.use(authenticate);

departmentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.description, d.created_at, d.updated_at,
              COUNT(u.id)::int AS member_count
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id
       GROUP BY d.id
       ORDER BY d.name ASC`
    );
    res.json({ data: rows });
  })
);

departmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.description, d.created_at, d.updated_at,
              COUNT(u.id)::int AS member_count
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id
       WHERE d.id = $1
       GROUP BY d.id`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("Department not found");
    res.json({ data: rows[0] });
  })
);

departmentsRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["name"]);
    const { rows } = await pool.query(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [req.body.name.trim(), req.body.description || null]
    );
    res.status(201).json({ data: rows[0] });
  })
);

departmentsRouter.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["name"]);
    const { rows } = await pool.query(
      `UPDATE departments
       SET name = $1, description = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [req.body.name.trim(), req.body.description || null, req.params.id]
    );
    if (!rows[0]) throw notFound("Department not found");
    res.json({ data: rows[0] });
  })
);

departmentsRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const members = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE department_id = $1",
      [req.params.id]
    );
    if (members.rows[0].count > 0) {
      throw badRequest("Cannot delete department with users");
    }

    const { rowCount } = await pool.query("DELETE FROM departments WHERE id = $1", [
      req.params.id
    ]);
    if (!rowCount) throw notFound("Department not found");
    res.status(204).send();
  })
);

