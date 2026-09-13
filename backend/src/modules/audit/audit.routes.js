import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getPagination, paged } from "../../utils/pagination.js";
import { assertMeetingOrganizer } from "../meetings/meetingAccess.js";
import { AUDIT_ACTION_LABELS, AUDIT_GROUPS } from "./audit.service.js";

export const auditRouter = express.Router();
export const meetingAuditRouter = express.Router({ mergeParams: true });

auditRouter.use(authenticate);
meetingAuditRouter.use(authenticate);

/** Dựng mệnh đề lọc dùng chung cho cả hai endpoint. */
function buildFilters(query, baseValues, baseFilters) {
  const values = [...baseValues];
  const filters = [...baseFilters];

  if (query.action) {
    values.push(query.action);
    filters.push(`al.action = $${values.length}`);
  }
  if (query.group && AUDIT_GROUPS[query.group]) {
    values.push(AUDIT_GROUPS[query.group]);
    filters.push(`al.action = ANY($${values.length})`);
  }
  if (query.userId) {
    values.push(query.userId);
    filters.push(`al.user_id = $${values.length}`);
  }
  if (query.entityType) {
    values.push(query.entityType);
    filters.push(`al.entity_type = $${values.length}`);
  }
  if (query.from) {
    values.push(query.from);
    filters.push(`al.created_at >= $${values.length}::timestamptz`);
  }
  if (query.to) {
    values.push(query.to);
    filters.push(`al.created_at <= $${values.length}::timestamptz`);
  }
  if (query.q) {
    values.push(`%${String(query.q).trim()}%`);
    filters.push(
      `(al.description ILIKE $${values.length} OR al.actor_name ILIKE $${values.length})`
    );
  }

  return { values, filters };
}

async function queryLogs(query, baseValues, baseFilters) {
  const { page, limit, offset } = getPagination(query);
  const { values, filters } = buildFilters(query, baseValues, baseFilters);

  const { rows } = await pool.query(
    `SELECT al.*, u.email AS actor_email, m.title AS meeting_title,
            COUNT(*) OVER() AS total_count
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN meetings m ON m.id = al.meeting_id
     ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY al.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const total = Number(rows[0]?.total_count || 0);
  return paged(
    rows.map(({ total_count, ...row }) => row),
    { page, limit, total }
  );
}

/** Toàn bộ nhật ký hệ thống — chỉ quản trị viên. */
auditRouter.get(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(await queryLogs(req.query, [], []));
  })
);

/** Danh mục hành động để dựng bộ lọc trên giao diện. */
auditRouter.get(
  "/actions",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        actions: Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
          value,
          label
        })),
        groups: Object.keys(AUDIT_GROUPS)
      }
    });
  })
);

/** Thống kê nhanh cho trang nhật ký. */
auditRouter.get(
  "/summary",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [today, byAction, topUsers] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS count FROM audit_logs WHERE created_at >= date_trunc('day', now())"
      ),
      pool.query(
        `SELECT action, COUNT(*)::int AS count
         FROM audit_logs
         WHERE created_at >= now() - interval '7 days'
         GROUP BY action
         ORDER BY count DESC
         LIMIT 8`
      ),
      pool.query(
        `SELECT actor_name, COUNT(*)::int AS count
         FROM audit_logs
         WHERE created_at >= now() - interval '7 days' AND actor_name IS NOT NULL
         GROUP BY actor_name
         ORDER BY count DESC
         LIMIT 5`
      )
    ]);

    res.json({
      data: {
        todayCount: today.rows[0].count,
        byAction: byAction.rows,
        topUsers: topUsers.rows
      }
    });
  })
);

/** Nhật ký của một cuộc họp — chủ trì cuộc họp đó hoặc quản trị viên xem được. */
meetingAuditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "ADMIN") {
      await assertMeetingOrganizer(req.user, req.params.meetingId);
    }
    res.json(
      await queryLogs(req.query, [req.params.meetingId], ["al.meeting_id = $1"])
    );
  })
);
