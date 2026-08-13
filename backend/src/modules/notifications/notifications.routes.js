import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";

export const notificationsRouter = express.Router();

notificationsRouter.use(authenticate);

const SELECT_NOTIFICATION = `
  SELECT n.*,
         actor.full_name AS actor_name,
         m.title AS meeting_title,
         m.start_time AS meeting_start_time,
         m.status AS meeting_status
  FROM notifications n
  LEFT JOIN users actor ON actor.id = n.actor_id
  LEFT JOIN meetings m ON m.id = n.meeting_id
`;

async function countUnread(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return rows[0]?.unread || 0;
}

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const values = [req.user.id];
    const filters = ["n.user_id = $1"];

    if (String(req.query.unreadOnly) === "true") {
      filters.push("n.is_read = FALSE");
    }
    if (req.query.type) {
      values.push(req.query.type);
      filters.push(`n.type = $${values.length}`);
    }

    const { rows } = await pool.query(
      `${SELECT_NOTIFICATION}
       WHERE ${filters.join(" AND ")}
       ORDER BY n.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM notifications n WHERE ${filters.join(" AND ")}`,
      values
    );

    res.json(
      paged(rows, {
        page,
        limit,
        total: total.rows[0]?.total || 0,
        unread: await countUnread(req.user.id)
      })
    );
  })
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    res.json({ data: { unread: await countUnread(req.user.id) } });
  })
);

notificationsRouter.put(
  "/read-all",
  asyncHandler(async (req, res) => {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = now()
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ data: { unread: 0 } });
  })
);

notificationsRouter.put(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) throw notFound("Notification not found");
    res.json({ data: rows[0], meta: { unread: await countUnread(req.user.id) } });
  })
);

notificationsRouter.delete(
  "/read",
  asyncHandler(async (req, res) => {
    await pool.query(`DELETE FROM notifications WHERE user_id = $1 AND is_read = TRUE`, [
      req.user.id
    ]);
    res.status(204).send();
  })
);

notificationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) throw notFound("Notification not found");
    res.status(204).send();
  })
);
