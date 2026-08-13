import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  requireFields,
  TASK_PRIORITIES,
  TASK_STATUSES
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertUserIsParticipantOfMeeting
} from "../meetings/meetingAccess.js";
import { NOTIFICATION_TYPES, notifyUsers } from "../notifications/notifications.service.js";

const TASK_STATUS_LABELS = {
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
  OVERDUE: "Quá hạn"
};

export const meetingTasksRouter = express.Router({ mergeParams: true });
export const tasksRouter = express.Router();

async function getTask(id) {
  const { rows } = await pool.query(
    `SELECT t.*, m.organizer_id, m.title AS meeting_title,
            assignee.full_name AS assigned_to_name,
            assigner.full_name AS assigned_by_name
     FROM meeting_tasks t
     JOIN meetings m ON m.id = t.meeting_id
     JOIN users assignee ON assignee.id = t.assigned_to
     JOIN users assigner ON assigner.id = t.assigned_by
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) throw notFound("Task not found");
  return rows[0];
}

meetingTasksRouter.use(authenticate);
tasksRouter.use(authenticate);

meetingTasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const participantOnly = req.user.role === "PARTICIPANT";
    const { rows } = await pool.query(
      `SELECT t.*, assignee.full_name AS assigned_to_name, assigner.full_name AS assigned_by_name
       FROM meeting_tasks t
       JOIN users assignee ON assignee.id = t.assigned_to
       JOIN users assigner ON assigner.id = t.assigned_by
       WHERE t.meeting_id = $1
         AND t.deleted_at IS NULL
         AND ($2::boolean = false OR t.assigned_to = $3)
       ORDER BY t.created_at DESC`,
      [req.params.meetingId, participantOnly, req.user.id]
    );
    res.json({ data: rows });
  })
);

meetingTasksRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.meetingId);
    requireFields(req.body, ["assignedTo", "title"]);
    assertEnum(req.body.priority || "MEDIUM", TASK_PRIORITIES, "task priority");
    await assertUserIsParticipantOfMeeting(req.params.meetingId, req.body.assignedTo);

    if (req.body.deadline) {
      const deadline = new Date(req.body.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deadline < today) throw badRequest("Deadline cannot be in the past");
    }

    const { rows } = await pool.query(
      `INSERT INTO meeting_tasks
        (meeting_id, assigned_to, assigned_by, title, description, deadline, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.params.meetingId,
        req.body.assignedTo,
        req.user.id,
        req.body.title.trim(),
        req.body.description || null,
        req.body.deadline || null,
        req.body.priority || "MEDIUM"
      ]
    );

    await notifyUsers([rows[0].assigned_to], {
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      severity: "INFO",
      meetingId: req.params.meetingId,
      actorId: req.user.id,
      title: "Bạn được giao nhiệm vụ mới",
      message: `${req.user.full_name} giao "${rows[0].title}" từ cuộc họp "${meeting.title}"${
        rows[0].deadline ? `, hạn ${rows[0].deadline}` : ""
      }.`,
      metadata: { taskId: rows[0].id, target: "TASKS" },
      excludeUserId: req.user.id
    });

    res.status(201).json({ data: rows[0] });
  })
);

tasksRouter.get(
  "/my",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT t.*, m.title AS meeting_title, m.start_time, m.end_time,
              assigner.full_name AS assigned_by_name
       FROM meeting_tasks t
       JOIN meetings m ON m.id = t.meeting_id
       JOIN users assigner ON assigner.id = t.assigned_by
       WHERE t.assigned_to = $1 AND t.deleted_at IS NULL
       ORDER BY COALESCE(t.deadline, CURRENT_DATE + INTERVAL '100 years') ASC`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

tasksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.params.id);
    if (
      req.user.role !== "ADMIN" &&
      task.organizer_id !== req.user.id &&
      task.assigned_to !== req.user.id
    ) {
      throw forbidden("You do not have access to this task");
    }
    res.json({ data: task });
  })
);

tasksRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const task = await getTask(req.params.id);
    if (task.organizer_id !== req.user.id) {
      throw forbidden("Only the meeting organizer can update this task");
    }
    assertEnum(req.body.priority, TASK_PRIORITIES, "task priority");
    assertEnum(req.body.status, TASK_STATUSES, "task status");

    if (req.body.assignedTo) {
      await assertUserIsParticipantOfMeeting(task.meeting_id, req.body.assignedTo);
    }

    const { rows } = await pool.query(
      `UPDATE meeting_tasks
       SET assigned_to = COALESCE($1, assigned_to),
           title = COALESCE($2, title),
           description = $3,
           deadline = $4,
           priority = COALESCE($5, priority),
           status = COALESCE($6, status),
           updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [
        req.body.assignedTo || null,
        req.body.title || null,
        req.body.description || null,
        req.body.deadline || null,
        req.body.priority || null,
        req.body.status || null,
        req.params.id
      ]
    );

    await notifyUsers([rows[0].assigned_to], {
      type: NOTIFICATION_TYPES.TASK_UPDATED,
      severity: "INFO",
      meetingId: task.meeting_id,
      actorId: req.user.id,
      title: "Nhiệm vụ của bạn được cập nhật",
      message: `${req.user.full_name} đã chỉnh sửa nhiệm vụ "${rows[0].title}" (${
        TASK_STATUS_LABELS[rows[0].status] || rows[0].status
      }).`,
      metadata: { taskId: rows[0].id, target: "TASKS" },
      excludeUserId: req.user.id
    });

    res.json({ data: rows[0] });
  })
);

tasksRouter.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    assertEnum(req.body.status, TASK_STATUSES, "task status");
    const task = await getTask(req.params.id);

    if (
      task.assigned_to !== req.user.id &&
      task.organizer_id !== req.user.id &&
      req.user.role !== "ADMIN"
    ) {
      throw forbidden("You cannot update this task status");
    }

    const { rows } = await pool.query(
      `UPDATE meeting_tasks
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.body.status, req.params.id]
    );

    await notifyUsers([task.organizer_id, task.assigned_to], {
      type: NOTIFICATION_TYPES.TASK_UPDATED,
      severity: rows[0].status === "DONE" ? "SUCCESS" : "INFO",
      meetingId: task.meeting_id,
      actorId: req.user.id,
      title: "Nhiệm vụ đổi trạng thái",
      message: `${req.user.full_name} chuyển "${rows[0].title}" sang ${
        TASK_STATUS_LABELS[rows[0].status] || rows[0].status
      }.`,
      metadata: { taskId: rows[0].id, target: "TASKS" },
      excludeUserId: req.user.id
    });

    res.json({ data: rows[0] });
  })
);

tasksRouter.delete(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const task = await getTask(req.params.id);
    if (task.organizer_id !== req.user.id) {
      throw forbidden("Only the meeting organizer can delete this task");
    }
    await pool.query(
      "UPDATE meeting_tasks SET deleted_at = now(), updated_at = now() WHERE id = $1",
      [req.params.id]
    );
    res.status(204).send();
  })
);

