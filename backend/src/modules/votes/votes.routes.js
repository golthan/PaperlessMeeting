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
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";

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
    throw badRequest("Biểu quyết nhiều lựa chọn cần tối thiểu 2 phương án");
  }
  return options.map((item) => String(item).trim()).filter(Boolean);
}

/**
 * Kết quả biểu quyết kèm tỉ lệ tham gia.
 * Mọi phương án đều xuất hiện (kể cả 0 phiếu) để biểu đồ không nhảy cột,
 * còn biểu quyết công khai thì kèm danh sách ai đã chọn gì.
 */
async function buildVoteResult(vote) {
  const [counts, eligible, voters] = await Promise.all([
    pool.query(
      `SELECT answer, COUNT(*)::int AS count
       FROM vote_responses
       WHERE vote_id = $1
       GROUP BY answer`,
      [vote.id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM meeting_participants
       WHERE meeting_id = $1`,
      [vote.meeting_id]
    ),
    vote.is_anonymous
      ? Promise.resolve({ rows: [] })
      : pool.query(
          `SELECT vr.user_id, vr.answer, vr.created_at, u.full_name
           FROM vote_responses vr
           JOIN users u ON u.id = vr.user_id
           WHERE vr.vote_id = $1
           ORDER BY vr.created_at ASC`,
          [vote.id]
        )
  ]);

  const options = Array.isArray(vote.options)
    ? vote.options
    : JSON.parse(vote.options || "[]");
  const byAnswer = new Map(counts.rows.map((row) => [row.answer, row.count]));
  const results = options.map((answer) => ({
    answer,
    count: byAnswer.get(answer) || 0
  }));
  for (const row of counts.rows) {
    if (!options.includes(row.answer)) results.push(row);
  }

  const totalResponses = results.reduce((sum, row) => sum + row.count, 0);
  const eligibleVoters = eligible.rows[0]?.total || 0;

  return {
    results,
    voters: voters.rows,
    summary: {
      totalResponses,
      eligibleVoters,
      notVoted: Math.max(eligibleVoters - totalResponses, 0),
      isAnonymous: Boolean(vote.is_anonymous)
    }
  };
}

async function broadcastVoteResult(vote) {
  const payload = await buildVoteResult(vote);
  emitMeetingEvent(vote.meeting_id, "vote_result_updated", {
    voteId: vote.id,
    results: payload.results,
    summary: payload.summary
  });
  return payload;
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

/**
 * Tạo biểu quyết. Mặc định lưu ở trạng thái nháp để chủ trì rà soát trước;
 * truyền openNow = true nếu muốn mở lấy ý kiến ngay và bắn thông báo.
 */
meetingVotesRouter.post(
  "/",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.meetingId);
    requireFields(req.body, ["title"]);
    const type = req.body.type || "YES_NO_ABSTAIN";
    assertEnum(type, VOTE_TYPES, "vote type");
    const options = normalizeOptions(type, req.body.options);
    const openNow = req.body.openNow === true;

    const { rows } = await pool.query(
      `INSERT INTO votes
         (meeting_id, title, description, type, options, is_anonymous, status, opened_at, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::text,
               CASE WHEN $7::text = 'OPEN' THEN now() ELSE NULL END, $8)
       RETURNING *`,
      [
        req.params.meetingId,
        req.body.title.trim(),
        req.body.description || null,
        type,
        JSON.stringify(options),
        req.body.isAnonymous === true,
        openNow ? "OPEN" : "DRAFT",
        req.user.id
      ]
    );

    const vote = rows[0];
    if (openNow) {
      emitMeetingEvent(req.params.meetingId, "vote_opened", vote);
      await notifyMeetingAudience(req.params.meetingId, {
        type: NOTIFICATION_TYPES.VOTE_OPENED,
        severity: "WARNING",
        actorId: req.user.id,
        title: "Có phiên biểu quyết đang mở",
        message: `"${vote.title}" đang chờ ý kiến của bạn.`,
        metadata: { voteId: vote.id },
        excludeUserId: req.user.id
      });
    }

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.VOTE_CREATE,
      entityType: "VOTE",
      entityId: vote.id,
      meetingId: req.params.meetingId,
      description: `Tạo biểu quyết "${vote.title}" (${vote.status})`,
      metadata: { isAnonymous: vote.is_anonymous, openNow }
    });

    res.status(201).json({ data: vote });
  })
);

votesRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingOrganizer(req.user, vote.meeting_id);
    if (vote.status === "CLOSED") throw badRequest("Biểu quyết đã đóng nên không sửa được");

    const type = req.body.type || vote.type;
    assertEnum(type, VOTE_TYPES, "vote type");
    const options = normalizeOptions(type, req.body.options || vote.options);

    const { rows } = await pool.query(
      `UPDATE votes
       SET title = COALESCE($1, title),
           description = $2,
           type = $3,
           options = $4::jsonb,
           is_anonymous = COALESCE($6, is_anonymous),
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [
        req.body.title || null,
        req.body.description || null,
        type,
        JSON.stringify(options),
        req.params.id,
        req.body.isAnonymous === undefined ? null : req.body.isAnonymous === true
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
    if (vote.status === "OPEN") throw badRequest("Biểu quyết đang mở");

    const { rows } = await pool.query(
      `UPDATE votes
       SET status = 'OPEN',
           opened_at = COALESCE(opened_at, now()),
           closed_at = NULL,
           updated_at = now()
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
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.VOTE_OPEN,
      entityType: "VOTE",
      entityId: rows[0].id,
      meetingId: vote.meeting_id,
      description: `Mở biểu quyết "${rows[0].title}"`
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
    if (vote.status !== "OPEN") throw badRequest("Chỉ đóng được biểu quyết đang mở");

    const { rows } = await pool.query(
      `UPDATE votes SET status = 'CLOSED', closed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    const closed = rows[0];
    const { results, summary } = await buildVoteResult(closed);
    emitMeetingEvent(vote.meeting_id, "vote_closed", { ...closed, results, summary });

    const topLine = results
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((row) => `${row.answer}: ${row.count}`)
      .join(" · ");
    await notifyMeetingAudience(vote.meeting_id, {
      type: NOTIFICATION_TYPES.VOTE_CLOSED,
      severity: "INFO",
      actorId: req.user.id,
      title: `Đã có kết quả biểu quyết: ${closed.title}`,
      message: `${summary.totalResponses}/${summary.eligibleVoters} phiếu — ${topLine}`,
      metadata: { voteId: closed.id, results },
      excludeUserId: req.user.id
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.VOTE_CLOSE,
      entityType: "VOTE",
      entityId: closed.id,
      meetingId: vote.meeting_id,
      description: `Chốt biểu quyết "${closed.title}": ${topLine}`,
      metadata: { results, summary }
    });

    res.json({ data: closed, results, summary });
  })
);

votesRouter.delete(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingOrganizer(req.user, vote.meeting_id);
    if (vote.status !== "DRAFT") {
      throw badRequest("Chỉ xoá được biểu quyết còn ở trạng thái nháp");
    }
    await pool.query("DELETE FROM votes WHERE id = $1", [req.params.id]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.VOTE_DELETE,
      entityType: "VOTE",
      entityId: req.params.id,
      meetingId: vote.meeting_id,
      description: `Xoá biểu quyết nháp "${vote.title}"`
    });
    res.status(204).send();
  })
);

votesRouter.post(
  "/:id/responses",
  requireRole("PARTICIPANT"),
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertParticipantAccess(req.user, vote.meeting_id);
    if (vote.status !== "OPEN") throw badRequest("Biểu quyết chưa mở hoặc đã đóng");
    requireFields(req.body, ["answer"]);

    const answer = String(req.body.answer).trim();
    const options = Array.isArray(vote.options) ? vote.options : JSON.parse(vote.options);
    if (!options.includes(answer)) {
      throw badRequest("Phương án không hợp lệ");
    }

    const existing = await pool.query(
      "SELECT id FROM vote_responses WHERE vote_id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (existing.rows[0]) {
      throw badRequest("Bạn đã bỏ phiếu cho nội dung này rồi");
    }

    const { rows } = await pool.query(
      `INSERT INTO vote_responses (vote_id, user_id, answer)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.id, answer]
    );
    const { results, summary } = await broadcastVoteResult(vote);
    // Biểu quyết kín chỉ ghi nhận là đã bỏ phiếu, không lưu lựa chọn vào nhật ký.
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.VOTE_RESPONSE,
      entityType: "VOTE",
      entityId: vote.id,
      meetingId: vote.meeting_id,
      description: vote.is_anonymous
        ? `Bỏ phiếu kín cho "${vote.title}"`
        : `Bỏ phiếu "${answer}" cho "${vote.title}"`,
      metadata: vote.is_anonymous ? { anonymous: true } : { answer }
    });

    res.status(201).json({ data: rows[0], results, summary });
  })
);

votesRouter.get(
  "/:id/results",
  asyncHandler(async (req, res) => {
    const vote = await getVote(req.params.id);
    await assertMeetingAccess(req.user, vote.meeting_id);
    const { results, voters, summary } = await buildVoteResult(vote);
    res.json({ data: { vote, results, voters, summary } });
  })
);
