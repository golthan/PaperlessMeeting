import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { requireFields } from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingChairman,
  assertMeetingSecretaryDuties
} from "../meetings/meetingAccess.js";
import { emitMeetingEvent } from "../../config/socket.js";

export const meetingAgendaRouter = express.Router({ mergeParams: true });
export const agendaRouter = express.Router();

async function getAgendaItem(id) {
  const { rows } = await pool.query("SELECT * FROM agenda_items WHERE id = $1", [id]);
  if (!rows[0]) throw notFound("Agenda item not found");
  return rows[0];
}

meetingAgendaRouter.use(authenticate);
agendaRouter.use(authenticate);

meetingAgendaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT a.*, u.full_name AS presenter_name
       FROM agenda_items a
       LEFT JOIN users u ON u.id = a.presenter_id
       WHERE a.meeting_id = $1
       ORDER BY a.sort_order ASC, a.created_at ASC`,
      [req.params.meetingId]
    );
    res.json({ data: rows });
  })
);

meetingAgendaRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
    requireFields(req.body, ["title"]);

    const { rows } = await pool.query(
      `INSERT INTO agenda_items
        (meeting_id, title, description, presenter_id, related_document_id, duration_minutes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0))
       RETURNING *`,
      [
        req.params.meetingId,
        req.body.title.trim(),
        req.body.description || null,
        req.body.presenterId || null,
        req.body.relatedDocumentId || null,
        Number(req.body.durationMinutes || 0),
        req.body.sortOrder
      ]
    );
    res.status(201).json({ data: rows[0] });
  })
);

meetingAgendaRouter.put(
  "/reorder",
  asyncHandler(async (req, res) => {
    await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
    if (!Array.isArray(req.body.items)) {
      throw badRequest("items array is required");
    }

    for (const item of req.body.items) {
      await pool.query(
        `UPDATE agenda_items
         SET sort_order = $1, updated_at = now()
         WHERE id = $2 AND meeting_id = $3`,
        [item.sortOrder, item.id, req.params.meetingId]
      );
    }

    res.json({ message: "Agenda reordered" });
  })
);

agendaRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getAgendaItem(req.params.id);
    await assertMeetingSecretaryDuties(req.user, item.meeting_id);

    const { rows } = await pool.query(
      `UPDATE agenda_items
       SET title = COALESCE($1, title),
           description = $2,
           presenter_id = $3,
           related_document_id = $4,
           duration_minutes = COALESCE($5, duration_minutes),
           sort_order = COALESCE($6, sort_order),
           updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [
        req.body.title || null,
        req.body.description || null,
        req.body.presenterId || null,
        req.body.relatedDocumentId || null,
        req.body.durationMinutes === undefined ? null : Number(req.body.durationMinutes),
        req.body.sortOrder === undefined ? null : Number(req.body.sortOrder),
        req.params.id
      ]
    );
    res.json({ data: rows[0] });
  })
);

agendaRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getAgendaItem(req.params.id);
    await assertMeetingSecretaryDuties(req.user, item.meeting_id);
    await pool.query("DELETE FROM agenda_items WHERE id = $1", [req.params.id]);
    res.status(204).send();
  })
);

agendaRouter.put(
  "/:id/current",
  asyncHandler(async (req, res) => {
    const item = await getAgendaItem(req.params.id);
    await assertMeetingChairman(req.user, item.meeting_id);

    const { rows } = await pool.query(
      `WITH reset AS (
         UPDATE agenda_items
         SET status = 'PENDING', updated_at = now()
         WHERE meeting_id = $1 AND status = 'CURRENT'
       )
       UPDATE agenda_items
       SET status = 'CURRENT', updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [item.meeting_id, req.params.id]
    );

    emitMeetingEvent(item.meeting_id, "current_agenda_updated", rows[0]);
    res.json({ data: rows[0] });
  })
);

agendaRouter.put(
  "/:id/done",
  asyncHandler(async (req, res) => {
    const item = await getAgendaItem(req.params.id);
    await assertMeetingChairman(req.user, item.meeting_id);

    const { rows } = await pool.query(
      `UPDATE agenda_items
       SET status = 'DONE', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    emitMeetingEvent(item.meeting_id, "current_agenda_updated", rows[0]);
    res.json({ data: rows[0] });
  })
);
