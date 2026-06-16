import express from "express";
import { pool, withTransaction } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";
import {
  assertEnum,
  assertTimeRange,
  MEETING_STATUSES,
  requireFields
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  hasRoomConflict
} from "./meetingAccess.js";

export const meetingsRouter = express.Router();

meetingsRouter.use(authenticate);

async function getMeetingDetail(user, meetingId) {
  const meeting = await assertMeetingAccess(user, meetingId);
  const participantCanOnlySeePublished = user.role === "PARTICIPANT";

  const [participants, documents, agenda, votes, minutes, tasks] = await Promise.all([
    pool.query(
      `SELECT mp.*, u.full_name, u.email, d.name AS department_name
       FROM meeting_participants mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE mp.meeting_id = $1
       ORDER BY u.full_name ASC`,
      [meetingId]
    ),
    pool.query(
      `SELECT doc.*, u.full_name AS uploaded_by_name
       FROM documents doc
       JOIN users u ON u.id = doc.uploaded_by
       WHERE doc.meeting_id = $1
         AND doc.deleted_at IS NULL
         AND ($2::boolean = false OR doc.status = 'APPROVED')
       ORDER BY doc.created_at DESC`,
      [meetingId, participantCanOnlySeePublished]
    ),
    pool.query(
      `SELECT a.*, u.full_name AS presenter_name
       FROM agenda_items a
       LEFT JOIN users u ON u.id = a.presenter_id
       WHERE a.meeting_id = $1
       ORDER BY a.sort_order ASC, a.created_at ASC`,
      [meetingId]
    ),
    pool.query(
      `SELECT v.*, COUNT(vr.id)::int AS response_count
       FROM votes v
       LEFT JOIN vote_responses vr ON vr.vote_id = v.id
       WHERE v.meeting_id = $1
       GROUP BY v.id
       ORDER BY v.created_at DESC`,
      [meetingId]
    ),
    pool.query(
      `SELECT *
       FROM minutes
       WHERE meeting_id = $1
         AND ($2::boolean = false OR status = 'PUBLISHED')`,
      [meetingId, participantCanOnlySeePublished]
    ),
    pool.query(
      `SELECT t.*, assignee.full_name AS assigned_to_name, assigner.full_name AS assigned_by_name
       FROM meeting_tasks t
       JOIN users assignee ON assignee.id = t.assigned_to
       JOIN users assigner ON assigner.id = t.assigned_by
       WHERE t.meeting_id = $1 AND t.deleted_at IS NULL
         AND ($2::boolean = false OR t.assigned_to = $3)
       ORDER BY t.created_at DESC`,
      [meetingId, participantCanOnlySeePublished, user.id]
    )
  ]);

  return {
    ...meeting,
    participants: participants.rows,
    documents: documents.rows,
    agenda: agenda.rows,
    votes: votes.rows,
    minutes: minutes.rows[0] || null,
    tasks: tasks.rows
  };
}

meetingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const values = [];
    const filters = ["m.deleted_at IS NULL"];
    let join = "";

    if (req.user.role === "ORGANIZER") {
      values.push(req.user.id);
      filters.push(`m.organizer_id = $${values.length}`);
    } else if (req.user.role === "PARTICIPANT") {
      join = "JOIN meeting_participants mp_self ON mp_self.meeting_id = m.id";
      values.push(req.user.id);
      filters.push(`mp_self.user_id = $${values.length}`);
    }

    if (req.query.status) {
      values.push(req.query.status);
      filters.push(`m.status = $${values.length}`);
    }
    if (req.query.roomId) {
      values.push(req.query.roomId);
      filters.push(`m.room_id = $${values.length}`);
    }
    if (req.query.date) {
      values.push(req.query.date);
      filters.push(`DATE(m.start_time) = $${values.length}::date`);
    }

    const { rows } = await pool.query(
      `SELECT m.*, r.name AS room_name, u.full_name AS organizer_name,
              COUNT(mp.id)::int AS participant_count,
              COUNT(*) OVER() AS total_count
       FROM meetings m
       JOIN rooms r ON r.id = m.room_id
       JOIN users u ON u.id = m.organizer_id
       ${join}
       LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
       WHERE ${filters.join(" AND ")}
       GROUP BY m.id, r.name, u.full_name
       ORDER BY m.start_time DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const total = Number(rows[0]?.total_count || 0);
    res.json(paged(rows.map(({ total_count, ...row }) => row), { page, limit, total }));
  })
);

meetingsRouter.get(
  "/my-created",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.*, r.name AS room_name, COUNT(mp.id)::int AS participant_count
       FROM meetings m
       JOIN rooms r ON r.id = m.room_id
       LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
       WHERE m.organizer_id = $1 AND m.deleted_at IS NULL
       GROUP BY m.id, r.name
       ORDER BY m.start_time DESC`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

meetingsRouter.get(
  "/my-invited",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.*, r.name AS room_name, u.full_name AS organizer_name,
              mp.invitation_status, mp.attendance_status, mp.checked_in_at
       FROM meeting_participants mp
       JOIN meetings m ON m.id = mp.meeting_id
       JOIN rooms r ON r.id = m.room_id
       JOIN users u ON u.id = m.organizer_id
       WHERE mp.user_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.start_time DESC`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

meetingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ data: await getMeetingDetail(req.user, req.params.id) });
  })
);

meetingsRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["title", "startTime", "endTime", "roomId"]);
    const {
      title,
      description,
      startTime,
      endTime,
      roomId,
      participantIds = [],
      notes
    } = req.body;
    assertTimeRange(startTime, endTime);

    const room = await pool.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
    if (!room.rows[0]) throw notFound("Room not found");
    if (room.rows[0].status !== "AVAILABLE") {
      throw badRequest("Room is unavailable");
    }

    const conflict = await hasRoomConflict(roomId, startTime, endTime);
    if (conflict) {
      throw badRequest("Room schedule conflict", { conflict });
    }

    const meeting = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO meetings (title, description, start_time, end_time, room_id, organizer_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          title.trim(),
          description || null,
          startTime,
          endTime,
          roomId,
          req.user.id,
          notes || null
        ]
      );

      const created = rows[0];
      for (const userId of participantIds) {
        await client.query(
          `INSERT INTO meeting_participants (meeting_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (meeting_id, user_id) DO NOTHING`,
          [created.id, userId]
        );
      }
      return created;
    });

    res.status(201).json({ data: meeting });
  })
);

meetingsRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot update a finished meeting");
    }

    const nextStart = req.body.startTime || meeting.start_time;
    const nextEnd = req.body.endTime || meeting.end_time;
    const nextRoomId = req.body.roomId || meeting.room_id;
    assertTimeRange(nextStart, nextEnd);
    assertEnum(req.body.status, MEETING_STATUSES, "status");

    const conflict = await hasRoomConflict(nextRoomId, nextStart, nextEnd, req.params.id);
    if (conflict) throw badRequest("Room schedule conflict", { conflict });

    const { rows } = await pool.query(
      `UPDATE meetings
       SET title = COALESCE($1, title),
           description = $2,
           start_time = $3,
           end_time = $4,
           room_id = $5,
           status = COALESCE($6, status),
           notes = $7,
           updated_at = now()
       WHERE id = $8
       RETURNING *`,
      [
        req.body.title || null,
        req.body.description || null,
        nextStart,
        nextEnd,
        nextRoomId,
        req.body.status || null,
        req.body.notes || null,
        req.params.id
      ]
    );

    res.json({ data: rows[0] });
  })
);

meetingsRouter.put(
  "/:id/cancel",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.id);
    const { rows } = await pool.query(
      `UPDATE meetings SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

meetingsRouter.put(
  "/:id/start",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (!["UPCOMING", "DRAFT"].includes(meeting.status)) {
      throw badRequest("Only upcoming meetings can be started");
    }

    const { rows } = await pool.query(
      `UPDATE meetings SET status = 'ONGOING', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

meetingsRouter.put(
  "/:id/finish",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (meeting.status !== "ONGOING") {
      throw badRequest("Only ongoing meetings can be finished");
    }

    const { rows } = await pool.query(
      `UPDATE meetings SET status = 'FINISHED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

meetingsRouter.delete(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot delete a finished meeting");
    }

    await pool.query(
      `UPDATE meetings
       SET deleted_at = now(), status = 'CANCELLED', updated_at = now()
       WHERE id = $1`,
      [req.params.id]
    );
    res.status(204).send();
  })
);

