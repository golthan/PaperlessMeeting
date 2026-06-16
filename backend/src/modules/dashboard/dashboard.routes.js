import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const dashboardRouter = express.Router();

dashboardRouter.use(authenticate);

dashboardRouter.get(
  "/admin",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [users, meetings, ongoing, upcoming, rooms, tasks] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM meetings WHERE deleted_at IS NULL"),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM meetings WHERE status = 'ONGOING' AND deleted_at IS NULL"
      ),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM meetings WHERE status = 'UPCOMING' AND deleted_at IS NULL"
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM rooms"),
      pool.query(
        "SELECT status, COUNT(*)::int AS count FROM meeting_tasks WHERE deleted_at IS NULL GROUP BY status"
      )
    ]);

    res.json({
      data: {
        totalUsers: users.rows[0].count,
        totalMeetings: meetings.rows[0].count,
        ongoingMeetings: ongoing.rows[0].count,
        upcomingMeetings: upcoming.rows[0].count,
        totalRooms: rooms.rows[0].count,
        tasksByStatus: tasks.rows
      }
    });
  })
);

dashboardRouter.get(
  "/organizer",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const [meetings, upcoming, ongoing, tasks, votes] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS count FROM meetings WHERE organizer_id = $1 AND deleted_at IS NULL",
        [req.user.id]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM meetings WHERE organizer_id = $1 AND status = 'UPCOMING' AND deleted_at IS NULL",
        [req.user.id]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM meetings WHERE organizer_id = $1 AND status = 'ONGOING' AND deleted_at IS NULL",
        [req.user.id]
      ),
      pool.query(
        `SELECT t.status, COUNT(*)::int AS count
         FROM meeting_tasks t
         JOIN meetings m ON m.id = t.meeting_id
         WHERE m.organizer_id = $1 AND t.deleted_at IS NULL
         GROUP BY t.status`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM votes v
         JOIN meetings m ON m.id = v.meeting_id
         WHERE m.organizer_id = $1`,
        [req.user.id]
      )
    ]);

    res.json({
      data: {
        totalMeetings: meetings.rows[0].count,
        upcomingMeetings: upcoming.rows[0].count,
        ongoingMeetings: ongoing.rows[0].count,
        tasksByStatus: tasks.rows,
        totalVotes: votes.rows[0].count
      }
    });
  })
);

dashboardRouter.get(
  "/participant",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const [meetings, pendingInvites, tasks, openVotes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM meeting_participants mp
         JOIN meetings m ON m.id = mp.meeting_id
         WHERE mp.user_id = $1 AND m.deleted_at IS NULL`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM meeting_participants mp
         JOIN meetings m ON m.id = mp.meeting_id
         WHERE mp.user_id = $1 AND mp.invitation_status = 'PENDING' AND m.deleted_at IS NULL`,
        [req.user.id]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM meeting_tasks
         WHERE assigned_to = $1 AND deleted_at IS NULL
         GROUP BY status`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM votes v
         JOIN meeting_participants mp ON mp.meeting_id = v.meeting_id
         WHERE mp.user_id = $1 AND v.status = 'OPEN'`,
        [req.user.id]
      )
    ]);

    res.json({
      data: {
        invitedMeetings: meetings.rows[0].count,
        pendingInvites: pendingInvites.rows[0].count,
        tasksByStatus: tasks.rows,
        openVotes: openVotes.rows[0].count
      }
    });
  })
);

