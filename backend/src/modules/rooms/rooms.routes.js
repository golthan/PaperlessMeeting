import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  requireFields,
  ROOM_STATUSES
} from "../../utils/validators.js";

export const roomsRouter = express.Router();

roomsRouter.use(authenticate);

roomsRouter.get(
  "/",
  requireRole("ADMIN", "ORGANIZER"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query("SELECT * FROM rooms ORDER BY name ASC");
    res.json({ data: rows });
  })
);

roomsRouter.get(
  "/:id",
  requireRole("ADMIN", "ORGANIZER"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM rooms WHERE id = $1", [
      req.params.id
    ]);
    if (!rows[0]) throw notFound("Room not found");
    res.json({ data: rows[0] });
  })
);

roomsRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["name", "capacity"]);
    const { name, location, capacity, description } = req.body;
    if (Number(capacity) < 0) throw badRequest("Capacity must be positive");

    const { rows } = await pool.query(
      `INSERT INTO rooms (name, location, capacity, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), location || null, Number(capacity), description || null]
    );
    res.status(201).json({ data: rows[0] });
  })
);

roomsRouter.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { name, location, capacity, status, description } = req.body;
    assertEnum(status, ROOM_STATUSES, "status");
    if (capacity !== undefined && Number(capacity) < 0) {
      throw badRequest("Capacity must be positive");
    }

    const { rows } = await pool.query(
      `UPDATE rooms
       SET name = COALESCE($1, name),
           location = $2,
           capacity = COALESCE($3, capacity),
           status = COALESCE($4, status),
           description = $5,
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [
        name || null,
        location || null,
        capacity === undefined ? null : Number(capacity),
        status || null,
        description || null,
        req.params.id
      ]
    );
    if (!rows[0]) throw notFound("Room not found");
    res.json({ data: rows[0] });
  })
);

roomsRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const futureMeetings = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM meetings
       WHERE room_id = $1 AND deleted_at IS NULL AND status NOT IN ('CANCELLED', 'FINISHED')`,
      [req.params.id]
    );
    if (futureMeetings.rows[0].count > 0) {
      throw badRequest("Cannot delete room with active meetings");
    }

    const { rowCount } = await pool.query("DELETE FROM rooms WHERE id = $1", [
      req.params.id
    ]);
    if (!rowCount) throw notFound("Room not found");
    res.status(204).send();
  })
);

roomsRouter.get(
  "/:id/availability",
  requireRole("ADMIN", "ORGANIZER"),
  asyncHandler(async (req, res) => {
    const { startTime, endTime } = req.query;
    if (!startTime || !endTime) {
      throw badRequest("startTime and endTime are required");
    }

    const room = await pool.query("SELECT * FROM rooms WHERE id = $1", [req.params.id]);
    if (!room.rows[0]) throw notFound("Room not found");

    const conflicts = await pool.query(
      `SELECT id, title, start_time, end_time, status
       FROM meetings
       WHERE room_id = $1
         AND deleted_at IS NULL
         AND status <> 'CANCELLED'
         AND ($2::timestamptz < end_time AND $3::timestamptz > start_time)
       ORDER BY start_time ASC`,
      [req.params.id, startTime, endTime]
    );

    res.json({
      available: room.rows[0].status === "AVAILABLE" && conflicts.rows.length === 0,
      room: room.rows[0],
      conflicts: conflicts.rows
    });
  })
);

