import express from "express";
import PDFDocument from "pdfkit";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import { requireFields } from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer
} from "../meetings/meetingAccess.js";

export const meetingMinutesRouter = express.Router({ mergeParams: true });
export const minutesRouter = express.Router();

async function getMinutes(id) {
  const { rows } = await pool.query(
    `SELECT mn.*, m.title AS meeting_title, m.organizer_id
     FROM minutes mn
     JOIN meetings m ON m.id = mn.meeting_id
     WHERE mn.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound("Minutes not found");
  return rows[0];
}

function streamMinutesPdf(res, minutes) {
  const doc = new PDFDocument({ margin: 48 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="minutes-${minutes.id}.pdf"`
  );
  doc.pipe(res);
  doc.fontSize(18).text("Meeting Minutes", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Meeting: ${minutes.meeting_title}`);
  doc.text(`Status: ${minutes.status}`);
  doc.text(`Published at: ${minutes.published_at || "Not published"}`);
  doc.moveDown();
  doc.fontSize(11).text(minutes.content || "");
  doc.end();
}

meetingMinutesRouter.use(authenticate);
minutesRouter.use(authenticate);

meetingMinutesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const participantOnly = req.user.role === "PARTICIPANT";
    const { rows } = await pool.query(
      `SELECT *
       FROM minutes
       WHERE meeting_id = $1
         AND ($2::boolean = false OR status = 'PUBLISHED')`,
      [req.params.meetingId, participantOnly]
    );
    res.json({ data: rows[0] || null });
  })
);

meetingMinutesRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    requireFields(req.body, ["content"]);

    const { rows } = await pool.query(
      `INSERT INTO minutes (meeting_id, content, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, req.body.content.trim(), req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  })
);

minutesRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingOrganizer(req.user, minutes.meeting_id);
    requireFields(req.body, ["content"]);

    const { rows } = await pool.query(
      `UPDATE minutes
       SET content = $1, status = 'DRAFT', updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.body.content.trim(), req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

minutesRouter.put(
  "/:id/publish",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingOrganizer(req.user, minutes.meeting_id);
    if (!minutes.content.trim()) throw badRequest("Cannot publish empty minutes");

    const { rows } = await pool.query(
      `UPDATE minutes
       SET status = 'PUBLISHED', published_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

minutesRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingAccess(req.user, minutes.meeting_id);
    if (req.user.role === "PARTICIPANT" && minutes.status !== "PUBLISHED") {
      throw forbidden("Minutes are not published");
    }
    streamMinutesPdf(res, minutes);
  })
);

minutesRouter.post(
  "/:id/export-pdf",
  asyncHandler(async (req, res) => {
    const minutes = await getMinutes(req.params.id);
    await assertMeetingAccess(req.user, minutes.meeting_id);
    if (req.user.role === "PARTICIPANT" && minutes.status !== "PUBLISHED") {
      throw forbidden("Minutes are not published");
    }
    streamMinutesPdf(res, minutes);
  })
);

