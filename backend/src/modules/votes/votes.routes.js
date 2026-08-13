import express from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  requireFields,
  VOTE_TYPES
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertParticipantAccess
} from "../meetings/meetingAccess.js";
import { emitMeetingEvent } from "../../config/socket.js";
import {
  NOTIFICATION_TYPES,
  notifyMeetingAudience
} from "../notifications/notifications.service.js";

export const meetingVotesRouter = express.Router({ mergeParams: true });
export const votesRouter = express.Router();

async function getVote(voteId) {
  const { rows } = await pool.query(
    `SELECT v.*, m.organizer_id
     FROM votes v
     JOIN meetings m ON m.id = v.meeting_id
     WHERE v.id = $1`,
    [voteId]
  );
  if (!rows[0]) throw notFound("Vote not found");
  return rows[0];
}

function normalizeOptions(type, options) {
  if (type === "YES_NO_ABSTAIN") {
    return ["YES", "NO", "ABSTAIN"];
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw badRequest("Multiple choice votes need at least 2 options");
  }
  return options.map((item) => String(item).trim()).filter(Boolean);
}

meetingVotesRouter.use(authenticate);
votesRouter.use(authenticate);

meetingVotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT v.*,
              COUNT(vr.id)::int AS response_count,
              mine.answer AS my_answer
       FROM votes v
       LEFT JOIN vote_responses vr ON vr.vote_id = v.id
       LEFT JOIN vote_responses mine ON mine.vote_id = v.id AND mine.user_id = $2
       WHERE v.meeting_id = $1
       GROUP BY v.id, mine.answer
       ORDER BY v.created_at DESC`,
      [req.params.meetingId, req.user.id]
    );
    res.json({ data: rows });
  })
);

meetingVotesRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    requireFields(req.body, ["title"]);
    const type = req.body.type || "YES_NO_ABSTAIN";
    assertEnum(type, VOTE_TYPES, "vote type");
    const options = normalizeOptions(type, req.body.options);

    const { rows } = await pool.query(
      `INSERT INTO votes (meeting_id, title, description, type, options, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        req.params.meetingId,
        req.body.title.trim(),
        req.body.description || null,
        type,
        JSON.stringify(options),
        req.user.id
      ]
    );
    res.status(201).json({ data: rows[0] });
  })
);

votesRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingOrganizer(req.user, vote.meeting_id);
    if (vote.status === "CLOSED") throw badRequest("Closed votes cannot be updated");

    const type = req.body.type || vote.type;
    assertEnum(type, VOTE_TYPES, "vote type");
    const options = normalizeOptions(type, req.body.options || vote.options);

    const { rows } = await pool.query(
      `UPDATE votes
       SET title = COALESCE($1, title),
           description = $2,
           type = $3,
           options = $4::jsonb,
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [
        req.body.title || null,
        req.body.description || null,
        type,
        JSON.stringify(options),
        req.params.id
      ]
    );
    res.json({ data: rows[0] });
  })
);

votesRouter.put(
  "/:id/open",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingOrganizer(req.user, vote.meeting_id);

    const { rows } = await pool.query(
      `UPDATE votes
       SET status = 'OPEN', opened_at = COALESCE(opened_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    emitMeetingEvent(vote.meeting_id, "vote_opened", rows[0]);
    await notifyMeetingAudience(vote.meeting_id, {
      type: NOTIFICATION_TYPES.VOTE_OPENED,
      severity: "WARNING",
      actorId: req.user.id,
      title: "Có phiên biểu quyết đang mở",
      message: `"${rows[0].title}" đang chờ ý kiến của bạn.`,
      metadata: { voteId: rows[0].id },
      excludeUserId: req.user.id
    });
    res.json({ data: rows[0] });
  })
);

votesRouter.put(
  "/:id/close",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingOrganizer(req.user, vote.meeting_id);

    const { rows } = await pool.query(
      `UPDATE votes SET status = 'CLOSED', closed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    emitMeetingEvent(vote.meeting_id, "vote_closed", rows[0]);
    res.json({ data: rows[0] });
  })
);

votesRouter.post(
  "/:id/responses",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertParticipantAccess(req.user, vote.meeting_id);
    if (vote.status !== "OPEN") throw badRequest("Vote is closed");
    requireFields(req.body, ["answer"]);

    const answer = String(req.body.answer).trim();
    const options = Array.isArray(vote.options) ? vote.options : JSON.parse(vote.options);
    if (!options.includes(answer)) {
      throw badRequest("Answer is not in vote options");
    }

    const existing = await pool.query(
      "SELECT id FROM vote_responses WHERE vote_id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (existing.rows[0]) {
      throw badRequest("You have already voted");
    }

    const { rows } = await pool.query(
      `INSERT INTO vote_responses (vote_id, user_id, answer)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.id, answer]
    );
    const resultRows = await pool.query(
      `SELECT answer, COUNT(*)::int AS count
       FROM vote_responses
       WHERE vote_id = $1
       GROUP BY answer
       ORDER BY answer ASC`,
      [req.params.id]
    );
    emitMeetingEvent(vote.meeting_id, "vote_result_updated", {
      voteId: req.params.id,
      results: resultRows.rows
    });
    res.status(201).json({ data: rows[0] });
  })
);

votesRouter.get(
  "/:id/results",
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingAccess(req.user, vote.meeting_id);

    const { rows } = await pool.query(
      `SELECT answer, COUNT(*)::int AS count
       FROM vote_responses
       WHERE vote_id = $1
       GROUP BY answer
       ORDER BY answer ASC`,
      [req.params.id]
    );
    res.json({ data: { vote, results: rows } });
  })
);
