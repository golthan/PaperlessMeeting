import express from "express";
import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import { getPagination, paged } from "../../utils/pagination.js";
import { assertEnum, requireFields, TRANSCRIPT_SOURCES } from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingLeadership,
  buildMeetingPermissions,
  getMeetingRole,
  isMeetingScheduler
} from "../meetings/meetingAccess.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";

/**
 * Bản ghi lời nói của cuộc họp.
 *
 * Nhận dạng giọng nói chạy trên máy người phát biểu (Web Speech API của trình
 * duyệt), gửi về đây từng đoạn đã chốt. Nhờ vậy mỗi đoạn có sẵn tên người nói
 * mà không phải tách giọng từ luồng audio trộn, và tiếng nói không rời máy
 * người dùng — chỉ có chữ đi qua mạng.
 *
 * Cổng nhận dữ liệu không phụ thuộc nguồn nhận dạng (`source`), nên muốn cắm
 * thêm Whisper hay Deepgram phía máy chủ về sau thì chỉ thêm một nguồn ghi vào.
 */
export const meetingTranscriptRouter = express.Router({ mergeParams: true });
export const transcriptRouter = express.Router();

meetingTranscriptRouter.use(authenticate);
transcriptRouter.use(authenticate);

/** Độ dài một đoạn: Web Speech API trả về từng câu nên 2000 ký tự là rất thoáng. */
const MAX_SEGMENT_LENGTH = 2000;

async function getSegment(id) {
  const { rows } = await pool.query(
    `SELECT t.*, m.organizer_id, m.status AS meeting_status
     FROM meeting_transcripts t
     JOIN meetings m ON m.id = t.meeting_id
     WHERE t.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound("Không tìm thấy đoạn ghi lời nói");
  return rows[0];
}

/**
 * Ai được thêm vào bản ghi lời nói.
 *
 * Gắn với quyền phát biểu: ở chế độ chủ tọa mời mới được nói, người chưa được
 * mời thì lời nói của họ cũng không vào biên bản — nếu không thì tắt mic mà
 * vẫn ghi được là vô nghĩa. Riêng chủ tọa và thư ký luôn thêm được vì họ chịu
 * trách nhiệm về bản ghi (ví dụ thư ký gõ tay lại một câu máy nghe không ra).
 */
async function assertCanAddTranscript(user, meetingId) {
  const meeting = await assertMeetingAccess(user, meetingId);

  const { rows } = await pool.query(
    `SELECT * FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, user.id]
  );
  const permissions = buildMeetingPermissions(
    await getMeetingRole(user, meeting),
    rows[0] || null,
    { isScheduler: isMeetingScheduler(user, meeting) }
  );

  if (!permissions.canSpeak && !permissions.canDraftMinutes) {
    throw forbidden(
      "Bạn chưa được mời phát biểu nên lời nói không được ghi vào biên bản"
    );
  }
  return { meeting, permissions };
}

meetingTranscriptRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const { page, limit, offset } = getPagination(req.query);

    const { rows } = await pool.query(
      `SELECT t.*, a.title AS agenda_title, e.full_name AS edited_by_name,
              COUNT(*) OVER() AS total_count
       FROM meeting_transcripts t
       LEFT JOIN agenda_items a ON a.id = t.agenda_item_id
       LEFT JOIN users e ON e.id = t.edited_by
       WHERE t.meeting_id = $1
       ORDER BY t.spoken_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.meetingId, limit, offset]
    );

    const total = Number(rows[0]?.total_count || 0);
    res.json(
      paged(
        rows.map(({ total_count, ...row }) => row),
        { page, limit, total }
      )
    );
  })
);

meetingTranscriptRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { meeting } = await assertCanAddTranscript(req.user, req.params.meetingId);
    requireFields(req.body, ["content"]);

    if (["FINISHED", "CANCELLED"].includes(meeting.status)) {
      throw badRequest("Cuộc họp đã khép lại nên không ghi thêm lời nói được");
    }

    const content = String(req.body.content).trim().slice(0, MAX_SEGMENT_LENGTH);
    if (!content) throw badRequest("Đoạn ghi lời nói rỗng");

    const source = req.body.source || "BROWSER";
    assertEnum(source, TRANSCRIPT_SOURCES, "transcript source");

    // Gắn đoạn vào nội dung đang được trình bày để biên bản gom đúng theo chương trình.
    const current = await pool.query(
      `SELECT id FROM agenda_items
       WHERE meeting_id = $1 AND status = 'CURRENT'
       ORDER BY sort_order ASC
       LIMIT 1`,
      [req.params.meetingId]
    );

    const confidence = Number(req.body.confidence);
    const { rows } = await pool.query(
      `INSERT INTO meeting_transcripts
         (meeting_id, agenda_item_id, speaker_id, speaker_name, content,
          language, confidence, source, spoken_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
       RETURNING *`,
      [
        req.params.meetingId,
        current.rows[0]?.id || null,
        req.user.id,
        req.user.full_name,
        content,
        String(req.body.language || "vi-VN").slice(0, 12),
        Number.isFinite(confidence) ? confidence : null,
        source,
        req.body.spokenAt || null
      ]
    );

    emitMeetingEvent(req.params.meetingId, "transcript_segment", rows[0]);
    res.status(201).json({ data: rows[0] });
  })
);

/**
 * Sửa một đoạn máy nghe sai.
 *
 * Nhận dạng tiếng Việt sai tên riêng và số liệu là chuyện thường, mà đoạn này
 * sẽ đi vào biên bản có ký số, nên phải sửa được. Bản ghi đánh dấu `is_edited`
 * cùng người sửa để về sau vẫn phân biệt được chữ máy nghe và chữ người sửa.
 */
transcriptRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const segment = await getSegment(req.params.id);
    await assertMeetingLeadership(req.user, segment.meeting_id);
    requireFields(req.body, ["content"]);

    const content = String(req.body.content).trim().slice(0, MAX_SEGMENT_LENGTH);
    if (!content) throw badRequest("Nội dung không được để trống");

    const { rows } = await pool.query(
      `UPDATE meeting_transcripts
       SET content = $1, is_edited = TRUE, edited_by = $2, edited_at = now()
       WHERE id = $3
       RETURNING *`,
      [content, req.user.id, req.params.id]
    );

    emitMeetingEvent(segment.meeting_id, "transcript_updated", rows[0]);
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.TRANSCRIPT_EDIT,
      entityType: "MEETING",
      entityId: segment.meeting_id,
      meetingId: segment.meeting_id,
      description: `Sửa một đoạn ghi lời nói của ${segment.speaker_name}`
    });

    res.json({ data: rows[0] });
  })
);

transcriptRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const segment = await getSegment(req.params.id);
    await assertMeetingLeadership(req.user, segment.meeting_id);

    await pool.query(`DELETE FROM meeting_transcripts WHERE id = $1`, [req.params.id]);

    emitMeetingEvent(segment.meeting_id, "transcript_removed", { id: req.params.id });
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.TRANSCRIPT_DELETE,
      entityType: "MEETING",
      entityId: segment.meeting_id,
      meetingId: segment.meeting_id,
      description: `Xoá một đoạn ghi lời nói của ${segment.speaker_name}`
    });

    res.status(204).end();
  })
);
