import express from "express";
import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest } from "../../utils/httpError.js";
import {
  assertMeetingAccess,
  assertMeetingLeadership
} from "../meetings/meetingAccess.js";
import { isAiConfigured, summarizeDiscussion } from "../ai/ai.service.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";

export const publicNotesRouter = express.Router({ mergeParams: true });
export const personalNotesRouter = express.Router({ mergeParams: true });

function sanitizeContent(content) {
  return String(content || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 20000);
}

/** Ghi chú dùng chung (của cuộc họp và của từng tài liệu) chỉ chủ tọa hoặc thư ký được sửa. */
export async function assertCanEditSharedNotes(user, meetingId) {
  return assertMeetingLeadership(user, meetingId);
}

publicNotesRouter.use(authenticate);
personalNotesRouter.use(authenticate);

publicNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT mn.*, u.full_name AS updated_by_name
       FROM meeting_notes mn
       LEFT JOIN users u ON u.id = mn.updated_by
       WHERE mn.meeting_id = $1`,
      [req.params.meetingId]
    );
    res.json({ data: rows[0] || null });
  })
);

publicNotesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    await assertCanEditSharedNotes(req.user, req.params.meetingId);
    const content = sanitizeContent(req.body.content);

    const { rows } = await pool.query(
      `INSERT INTO meeting_notes (meeting_id, content, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (meeting_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, content, req.user.id]
    );

    emitMeetingEvent(req.params.meetingId, "public_notes_synced", rows[0]);
    res.json({ data: rows[0] });
  })
);

/**
 * AI đọc toàn bộ trao đổi trong phòng họp và dựng bản nháp mục "Diễn biến và
 * ý kiến thảo luận" của biên bản.
 *
 * Đây là mục duy nhất bộ tự sinh biên bản không lắp ráp được từ dữ liệu có cấu
 * trúc. Kết quả lưu riêng ở `ai_summary`, KHÔNG ghi đè ghi chú chung của thư ký:
 * biên bản có ký số nên phải phân biệt rõ đâu là bản máy dựng, đâu là nội dung
 * người đã rà soát.
 */
publicNotesRouter.post(
  "/ai-summary",
  asyncHandler(async (req, res) => {
    const meeting = await assertCanEditSharedNotes(req.user, req.params.meetingId);
    if (!isAiConfigured()) {
      throw badRequest("Hệ thống chưa cấu hình khoá API cho tính năng AI");
    }

    // Chỉ lấy chat chung của phòng; thảo luận trong hộp tài liệu thuộc về tài liệu đó.
    // Lời nói lấy từ bản ghi transcript — hai nguồn được trộn theo thời gian.
    const [chat, agenda, speech] = await Promise.all([
      pool.query(
        `SELECT cm.content, cm.created_at, u.full_name AS sender_name, u.email AS sender_email
         FROM chat_messages cm
         JOIN users u ON u.id = cm.sender_id
         WHERE cm.meeting_id = $1 AND cm.document_id IS NULL
         ORDER BY cm.created_at ASC`,
        [req.params.meetingId]
      ),
      pool.query(
        `SELECT title FROM agenda_items WHERE meeting_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [req.params.meetingId]
      ),
      pool.query(
        `SELECT content, spoken_at, speaker_name
         FROM meeting_transcripts
         WHERE meeting_id = $1
         ORDER BY spoken_at ASC`,
        [req.params.meetingId]
      )
    ]);

    if (chat.rows.length === 0 && speech.rows.length === 0) {
      throw badRequest(
        "Phòng họp chưa có lời nói hay trao đổi nào để tổng hợp. " +
          "Bật ghi lời nói trong phòng họp, hoặc thư ký tự ghi mục diễn biến."
      );
    }

    const { summary, model } = await summarizeDiscussion({
      meeting,
      agenda: agenda.rows,
      messages: chat.rows,
      speech: speech.rows
    });

    // Ghi lại đã lấy từ đâu để biên bản nói đúng nguồn của bản nháp.
    const source =
      speech.rows.length && chat.rows.length
        ? "BOTH"
        : speech.rows.length
          ? "SPEECH"
          : "CHAT";

    const { rows } = await pool.query(
      `INSERT INTO meeting_notes
         (meeting_id, ai_summary, ai_summary_model, ai_summary_updated_at,
          ai_summary_message_count, ai_summary_speech_count, ai_summary_source,
          updated_at)
       VALUES ($1, $2, $3, now(), $4, $5, $6, now())
       ON CONFLICT (meeting_id) DO UPDATE
         SET ai_summary = EXCLUDED.ai_summary,
             ai_summary_model = EXCLUDED.ai_summary_model,
             ai_summary_updated_at = now(),
             ai_summary_message_count = EXCLUDED.ai_summary_message_count,
             ai_summary_speech_count = EXCLUDED.ai_summary_speech_count,
             ai_summary_source = EXCLUDED.ai_summary_source,
             updated_at = now()
       RETURNING *`,
      [
        req.params.meetingId,
        summary,
        model,
        chat.rows.length,
        speech.rows.length,
        source
      ]
    );

    emitMeetingEvent(req.params.meetingId, "discussion_summary_ready", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_AI_DISCUSSION,
      entityType: "MEETING",
      entityId: req.params.meetingId,
      meetingId: req.params.meetingId,
      description:
        `AI tổng hợp ${speech.rows.length} lượt phát biểu và ` +
        `${chat.rows.length} tin nhắn thành bản nháp biên bản`,
      metadata: {
        model,
        messageCount: chat.rows.length,
        speechCount: speech.rows.length,
        source
      }
    });

    res.json({ data: rows[0] });
  })
);

personalNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { rows } = await pool.query(
      `SELECT *
       FROM personal_notes
       WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.user.id]
    );
    res.json({ data: rows[0] || null });
  })
);

personalNotesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const content = sanitizeContent(req.body.content);

    const { rows } = await pool.query(
      `INSERT INTO personal_notes (meeting_id, user_id, content, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (meeting_id, user_id) DO UPDATE
         SET content = EXCLUDED.content,
             updated_at = now()
       RETURNING *`,
      [req.params.meetingId, req.user.id, content]
    );

    res.json({ data: rows[0] });
  })
);

