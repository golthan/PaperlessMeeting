import express from "express";
import { pool, withTransaction } from "../../config/db.js";
import { env } from "../../config/env.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import {
  buildLiveRoomName,
  buildLiveRoomUrl,
  createLiveRoomToken
} from "../../utils/livekit.js";
import {
  NOTIFICATION_TYPES,
  notifyMeetingAudience,
  notifyUsers
} from "../notifications/notifications.service.js";
import { formatMeetingTime, isSameMinute } from "../../utils/datetime.js";
import { getPagination, paged } from "../../utils/pagination.js";
import {
  assertEnum,
  assertTimeRange,
  MEETING_ROLES,
  MEETING_STATUSES,
  MEETING_TYPES,
  ONLINE_PROVIDERS,
  requireFields
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  hasRoomConflict
} from "./meetingAccess.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";

export const meetingsRouter = express.Router();

/** Nhãn tiếng Việt của hình thức họp, dùng trong nội dung thông báo. */
const MEETING_TYPE_LABELS = {
  OFFLINE: "họp tập trung",
  ONLINE: "họp trực tuyến",
  HYBRID: "tập trung + phòng trực tuyến"
};

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
      `SELECT v.*, COUNT(vr.id)::int AS response_count, mine.answer AS my_answer
       FROM votes v
       LEFT JOIN vote_responses vr ON vr.vote_id = v.id
       LEFT JOIN vote_responses mine ON mine.vote_id = v.id AND mine.user_id = $2
       WHERE v.meeting_id = $1
       GROUP BY v.id, mine.answer
       ORDER BY v.created_at DESC`,
      [meetingId, user.id]
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
       LEFT JOIN rooms r ON r.id = m.room_id
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
       LEFT JOIN rooms r ON r.id = m.room_id
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
              mp.invitation_status, mp.attendance_status, mp.checked_in_at,
              (
                SELECT COUNT(*)::int
                FROM meeting_participants mp_count
                WHERE mp_count.meeting_id = m.id
              ) AS participant_count
       FROM meeting_participants mp
       JOIN meetings m ON m.id = mp.meeting_id
       LEFT JOIN rooms r ON r.id = m.room_id
       JOIN users u ON u.id = m.organizer_id
       WHERE mp.user_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.start_time DESC`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

meetingsRouter.get(
  "/:id/live-config",
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingAccess(req.user, req.params.id);
    if (["CANCELLED", "FINISHED"].includes(meeting.status)) {
      throw badRequest("Phòng họp đã đóng vì cuộc họp kết thúc hoặc bị huỷ");
    }

    const participant = await pool.query(
      `SELECT role_in_meeting, can_share_screen, can_upload_document, can_speak,
              is_online, is_hand_raised
       FROM meeting_participants
       WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    const permissions =
      meeting.organizer_id === req.user.id || req.user.role === "ADMIN"
        ? {
            roleInMeeting: "CHAIRMAN",
            canShareScreen: true,
            canUploadDocument: true,
            canSpeak: true,
            isOrganizer: true
          }
        : {
            roleInMeeting: participant.rows[0]?.role_in_meeting || "MEMBER",
            canShareScreen: Boolean(participant.rows[0]?.can_share_screen),
            canUploadDocument: Boolean(participant.rows[0]?.can_upload_document),
            canSpeak: participant.rows[0]?.can_speak !== false,
            isOrganizer: false
          };

    const roomName =
      meeting.online_room_name ||
      (["ONLINE", "HYBRID"].includes(meeting.meeting_type)
        ? buildLiveRoomName(meeting.id)
        : null);
    const livekitToken = roomName
      ? await createLiveRoomToken({ roomName, user: req.user, permissions })
      : null;

    res.json({
      data: {
        meetingId: meeting.id,
        title: meeting.title,
        status: meeting.status,
        meetingType: meeting.meeting_type,
        provider: meeting.online_provider,
        roomName,
        roomUrl: roomName ? buildLiveRoomUrl(meeting.id) : null,
        livekitUrl: env.livekitWsUrl || null,
        livekitToken,
        onlineRoomEnabled: Boolean(roomName),
        onlineEnabledAt: meeting.online_enabled_at || null,
        permissions
      }
    });
  })
);

meetingsRouter.get(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const data = await getMeetingDetail(req.user, req.params.id);
    const [chat, publicNotes, sessions, attendance] = await Promise.all([
      pool.query(
        `SELECT cm.*, u.full_name AS sender_name
         FROM chat_messages cm
         JOIN users u ON u.id = cm.sender_id
         WHERE cm.meeting_id = $1
         ORDER BY cm.created_at ASC`,
        [req.params.id]
      ),
      pool.query("SELECT * FROM meeting_notes WHERE meeting_id = $1", [req.params.id]),
      pool.query(
        `SELECT ms.*, u.full_name, u.email
         FROM meeting_sessions ms
         JOIN users u ON u.id = ms.user_id
         WHERE ms.meeting_id = $1
         ORDER BY ms.joined_at ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT a.*, u.full_name, u.email
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.meeting_id = $1`,
        [req.params.id]
      )
    ]);

    res.json({
      data: {
        ...data,
        chat: chat.rows,
        publicNotes: publicNotes.rows[0] || null,
        sessions: sessions.rows,
        attendance: attendance.rows
      }
    });
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
    requireFields(req.body, ["title", "startTime", "endTime"]);
    const {
      title,
      description,
      startTime,
      endTime,
      roomId,
      meetingType = "OFFLINE",
      onlineProvider = "LIVEKIT",
      participantIds = [],
      participants = [],
      agenda = [],
      notes
    } = req.body;
    assertTimeRange(startTime, endTime);
    assertEnum(meetingType, MEETING_TYPES, "meeting type");
    assertEnum(onlineProvider, ONLINE_PROVIDERS, "online provider");

    if (["OFFLINE", "HYBRID"].includes(meetingType) && !roomId) {
      throw badRequest("Cuộc họp tập trung cần chọn phòng họp vật lý");
    }

    if (!Array.isArray(participants) || !Array.isArray(agenda)) {
      throw badRequest("participants and agenda must be arrays");
    }

    const participantList =
      participants.length > 0
        ? participants
        : participantIds.map((userId) => ({ userId }));

    for (const person of participantList) {
      if (!person.userId) throw badRequest("participants[].userId is required");
      assertEnum(person.roleInMeeting, MEETING_ROLES, "role in meeting");
    }
    const secretaryCount = participantList.filter(
      (person) => person.roleInMeeting === "SECRETARY"
    ).length;
    if (secretaryCount > 1) {
      throw badRequest("Mỗi cuộc họp chỉ có một thư ký");
    }

    for (const item of agenda) {
      if (!item.title || !String(item.title).trim()) {
        throw badRequest("agenda[].title is required");
      }
      if (item.durationMinutes !== undefined && Number(item.durationMinutes) < 0) {
        throw badRequest("agenda[].durationMinutes must be >= 0");
      }
    }

    if (roomId) {
      const room = await pool.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
      if (!room.rows[0]) throw notFound("Room not found");
      if (room.rows[0].status !== "AVAILABLE") {
        throw badRequest("Phòng họp này đang không khả dụng");
      }

      const conflict = await hasRoomConflict(roomId, startTime, endTime);
      if (conflict) {
        throw badRequest("Phòng họp đã có lịch trùng khung giờ này", { conflict });
      }
    }

    const meeting = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO meetings
          (title, description, meeting_type, start_time, end_time, room_id,
           organizer_id, online_provider, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          title.trim(),
          description || null,
          meetingType,
          startTime,
          endTime,
          roomId || null,
          req.user.id,
          onlineProvider,
          notes || null
        ]
      );

      let created = rows[0];
      if (["ONLINE", "HYBRID"].includes(meetingType)) {
        const roomName = buildLiveRoomName(created.id);
        const roomUrl = buildLiveRoomUrl(created.id);
        const updated = await client.query(
          `UPDATE meetings
           SET online_room_name = $1, online_room_url = $2
           WHERE id = $3
           RETURNING *`,
          [roomName, roomUrl, created.id]
        );
        created = updated.rows[0];
      }

      for (const person of participantList) {
        const found = await client.query("SELECT id FROM users WHERE id = $1", [
          person.userId
        ]);
        if (!found.rows[0]) throw notFound(`User ${person.userId} not found`);

        await client.query(
          `INSERT INTO meeting_participants
            (meeting_id, user_id, role_in_meeting, can_share_screen, can_upload_document, can_speak)
           VALUES ($1, $2, COALESCE($3, 'MEMBER'), $4, $5, $6)
           ON CONFLICT (meeting_id, user_id) DO NOTHING`,
          [
            created.id,
            person.userId,
            person.roleInMeeting || null,
            Boolean(person.canShareScreen),
            person.canUploadDocument !== false,
            person.canSpeak !== false
          ]
        );
        await client.query(
          `INSERT INTO attendance (meeting_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (meeting_id, user_id) DO NOTHING`,
          [created.id, person.userId]
        );
      }

      for (const [index, item] of agenda.entries()) {
        await client.query(
          `INSERT INTO agenda_items
            (meeting_id, title, description, presenter_id, duration_minutes, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            created.id,
            String(item.title).trim(),
            item.description || null,
            item.presenterId || null,
            Number(item.durationMinutes || 0),
            index
          ]
        );
      }
      return created;
    });

    await notifyUsers(
      participantList.map((person) => person.userId),
      {
        type: NOTIFICATION_TYPES.MEETING_INVITE,
        severity: "INFO",
        meetingId: meeting.id,
        actorId: req.user.id,
        title: `Bạn được mời họp: ${meeting.title}`,
        message: `${req.user.full_name} mời bạn tham dự lúc ${formatMeetingTime(
          meeting.start_time
        )}. Vào chi tiết cuộc họp để xác nhận tham dự.`,
        metadata: { startTime: meeting.start_time, meetingType: meeting.meeting_type },
        excludeUserId: req.user.id
      }
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_CREATE,
      entityType: "MEETING",
      entityId: meeting.id,
      meetingId: meeting.id,
      description: `Tạo cuộc họp "${meeting.title}" (${meeting.meeting_type})`,
      metadata: { participants: participantList.length, agenda: agenda.length }
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
      throw badRequest("Cuộc họp đã kết thúc nên không sửa được");
    }

    const nextStart = req.body.startTime || meeting.start_time;
    const nextEnd = req.body.endTime || meeting.end_time;
    const nextMeetingType = req.body.meetingType || meeting.meeting_type;
    const nextRoomId =
      req.body.roomId !== undefined ? req.body.roomId || null : meeting.room_id;
    assertTimeRange(nextStart, nextEnd);
    assertEnum(req.body.status, MEETING_STATUSES, "status");
    assertEnum(nextMeetingType, MEETING_TYPES, "meeting type");

    if (["OFFLINE", "HYBRID"].includes(nextMeetingType) && !nextRoomId) {
      throw badRequest("Cuộc họp tập trung cần chọn phòng họp vật lý");
    }

    if (nextRoomId) {
      const conflict = await hasRoomConflict(nextRoomId, nextStart, nextEnd, req.params.id);
      if (conflict) throw badRequest("Phòng họp đã có lịch trùng khung giờ này", { conflict });
    }

    const { rows } = await pool.query(
      `UPDATE meetings
       SET title = COALESCE($1, title),
           description = $2,
           meeting_type = $3,
           start_time = $4,
           end_time = $5,
           room_id = $6,
           status = COALESCE($7, status),
           notes = $8,
           online_room_name = CASE
             WHEN $3 IN ('ONLINE', 'HYBRID') AND online_room_name IS NULL THEN 'paperless-meeting-' || id::text
             WHEN $3 = 'OFFLINE' THEN NULL
             ELSE online_room_name
           END,
           online_room_url = CASE
             WHEN $3 IN ('ONLINE', 'HYBRID') AND online_room_url IS NULL THEN $10 || id::text
             WHEN $3 = 'OFFLINE' THEN NULL
             ELSE online_room_url
           END,
           online_enabled_at = CASE
             WHEN $3 IN ('ONLINE', 'HYBRID') THEN COALESCE(online_enabled_at, now())
             ELSE NULL
           END,
           updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        req.body.title || null,
        req.body.description || null,
        nextMeetingType,
        nextStart,
        nextEnd,
        nextRoomId,
        req.body.status || null,
        req.body.notes || null,
        req.params.id,
        `${env.clientOrigin.replace(/\/$/, "")}/join/`
      ]
    );

    const updated = rows[0];
    const changes = [];
    if (!isSameMinute(meeting.start_time, updated.start_time)) {
      changes.push(`giờ bắt đầu → ${formatMeetingTime(updated.start_time)}`);
    }
    if (!isSameMinute(meeting.end_time, updated.end_time)) {
      changes.push(`giờ kết thúc → ${formatMeetingTime(updated.end_time)}`);
    }
    if (meeting.room_id !== updated.room_id) {
      const room = updated.room_id
        ? await pool.query("SELECT name FROM rooms WHERE id = $1", [updated.room_id])
        : null;
      changes.push(`phòng họp → ${room?.rows[0]?.name || "họp trực tuyến"}`);
    }
    if (meeting.meeting_type !== updated.meeting_type) {
      changes.push(`hình thức → ${MEETING_TYPE_LABELS[updated.meeting_type]}`);
    }
    if (meeting.title !== updated.title) {
      changes.push(`tên cuộc họp → ${updated.title}`);
    }

    if (changes.length > 0) {
      emitMeetingEvent(req.params.id, "meeting_status_updated", updated);
      await notifyMeetingAudience(req.params.id, {
        type: NOTIFICATION_TYPES.MEETING_UPDATED,
        severity: "WARNING",
        actorId: req.user.id,
        title: `Lịch họp thay đổi: ${updated.title}`,
        message: `${req.user.full_name} đã cập nhật ${changes.join(", ")}.`,
        metadata: { changes },
        excludeUserId: req.user.id
      });
    }

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_UPDATE,
      entityType: "MEETING",
      entityId: updated.id,
      meetingId: updated.id,
      description: changes.length > 0 ? `Sửa cuộc họp: ${changes.join(", ")}` : "Sửa cuộc họp",
      metadata: { changes }
    });

    res.json({ data: updated });
  })
);

meetingsRouter.put(
  "/:id/cancel",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    await assertMeetingOrganizer(req.user, req.params.id);
    const { rows } = await pool.query(
      `UPDATE meetings SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    emitMeetingEvent(req.params.id, "meeting_status_updated", rows[0]);
    await notifyMeetingAudience(req.params.id, {
      type: NOTIFICATION_TYPES.MEETING_CANCELLED,
      severity: "DANGER",
      actorId: req.user.id,
      title: `Cuộc họp bị huỷ: ${rows[0].title}`,
      message: `${req.user.full_name} đã huỷ cuộc họp dự kiến lúc ${formatMeetingTime(
        rows[0].start_time
      )}.`,
      excludeUserId: req.user.id
    });
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_CANCEL,
      entityType: "MEETING",
      entityId: rows[0].id,
      meetingId: rows[0].id,
      description: `Huỷ cuộc họp "${rows[0].title}"`
    });
    res.json({ data: rows[0] });
  })
);

meetingsRouter.put(
  "/:id/start",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (!["UPCOMING", "DRAFT"].includes(meeting.status)) {
      throw badRequest("Chỉ bắt đầu được cuộc họp đang ở trạng thái nháp hoặc sắp diễn ra");
    }

    const { rows } = await pool.query(
      `UPDATE meetings
       SET status = 'ONGOING',
           online_room_name = CASE
             WHEN meeting_type IN ('ONLINE', 'HYBRID') AND online_room_name IS NULL THEN 'paperless-meeting-' || id::text
             ELSE online_room_name
           END,
           online_room_url = CASE
             WHEN meeting_type IN ('ONLINE', 'HYBRID') AND online_room_url IS NULL THEN $2 || id::text
             ELSE online_room_url
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, `${env.clientOrigin.replace(/\/$/, "")}/join/`]
    );
    emitMeetingEvent(req.params.id, "meeting_status_updated", rows[0]);
    await notifyMeetingAudience(req.params.id, {
      type: NOTIFICATION_TYPES.MEETING_STARTED,
      severity: "SUCCESS",
      actorId: req.user.id,
      title: `Cuộc họp đã bắt đầu: ${rows[0].title}`,
      message: "Phòng họp đã mở, bạn có thể vào phòng ngay bây giờ.",
      excludeUserId: req.user.id
    });
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_START,
      entityType: "MEETING",
      entityId: rows[0].id,
      meetingId: rows[0].id,
      description: `Bắt đầu cuộc họp "${rows[0].title}"`
    });
    res.json({ data: rows[0] });
  })
);


/**
 * Bật / tắt phòng họp trực tuyến cho một cuộc họp đã tạo.
 * Cuộc họp tập trung (OFFLINE) khi bật phòng video sẽ thành HYBRID
 * mà vẫn giữ nguyên phòng vật lý, tài liệu, agenda, điểm danh đang có.
 */
meetingsRouter.put(
  "/:id/online-room",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (["FINISHED", "CANCELLED"].includes(meeting.status)) {
      throw badRequest("Cuộc họp đã kết thúc hoặc bị huỷ nên không đổi được phòng trực tuyến");
    }

    const enabled = req.body.enabled !== false;
    const isOn = meeting.meeting_type !== "OFFLINE";
    // Dữ liệu cũ có thể ở dạng ONLINE/HYBRID mà thiếu tên phòng: vẫn cần tạo lại.
    const missingRoom = isOn && !meeting.online_room_name;

    if (enabled && isOn && !missingRoom) {
      return res.json({ data: meeting, meta: { changed: false } });
    }
    if (!enabled && !isOn) {
      return res.json({ data: meeting, meta: { changed: false } });
    }
    if (!enabled && meeting.meeting_type === "ONLINE") {
      throw badRequest(
        "Cuộc họp trực tuyến bắt buộc có phòng video. Hãy đổi sang hình thức tập trung và chọn phòng họp vật lý trước."
      );
    }
    if (enabled && meeting.meeting_type === "OFFLINE" && !meeting.room_id) {
      throw badRequest("Cuộc họp chưa có phòng vật lý, hãy chọn phòng hoặc đổi sang hình thức trực tuyến");
    }

    const { rows } = enabled
      ? await pool.query(
          `UPDATE meetings
           SET meeting_type = CASE WHEN meeting_type = 'OFFLINE' THEN 'HYBRID' ELSE meeting_type END,
               online_room_name = COALESCE(online_room_name, $2),
               online_room_url = COALESCE(online_room_url, $3),
               online_enabled_at = COALESCE(online_enabled_at, now()),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [meeting.id, buildLiveRoomName(meeting.id), buildLiveRoomUrl(meeting.id)]
        )
      : await pool.query(
          `UPDATE meetings
           SET meeting_type = 'OFFLINE',
               online_room_name = NULL,
               online_room_url = NULL,
               online_enabled_at = NULL,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [meeting.id]
        );

    const updated = rows[0];
    emitMeetingEvent(req.params.id, "meeting_status_updated", updated);
    emitMeetingEvent(req.params.id, "online_room_updated", {
      meetingId: updated.id,
      enabled,
      meetingType: updated.meeting_type,
      roomUrl: updated.online_room_url
    });

    await notifyMeetingAudience(req.params.id, {
      type: enabled
        ? NOTIFICATION_TYPES.MEETING_ONLINE_ENABLED
        : NOTIFICATION_TYPES.MEETING_ONLINE_DISABLED,
      severity: enabled ? "SUCCESS" : "INFO",
      actorId: req.user.id,
      title: enabled
        ? `Đã mở phòng trực tuyến: ${updated.title}`
        : `Đã tắt phòng trực tuyến: ${updated.title}`,
      message: enabled
        ? `${req.user.full_name} đã bật phòng họp video. Bạn có thể tham gia từ xa khi cuộc họp diễn ra.`
        : `${req.user.full_name} đã tắt phòng họp video. Cuộc họp trở lại hình thức tập trung tại phòng.`,
      metadata: { meetingType: updated.meeting_type },
      excludeUserId: req.user.id
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_ONLINE_ROOM,
      entityType: "MEETING",
      entityId: updated.id,
      meetingId: updated.id,
      description: `${enabled ? "Bật" : "Tắt"} phòng họp trực tuyến cho "${updated.title}"`,
      metadata: { enabled, meetingType: updated.meeting_type }
    });

    res.json({ data: updated, meta: { changed: true } });
  })
);

meetingsRouter.put(
  "/:id/finish",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (meeting.status !== "ONGOING") {
      throw badRequest("Chỉ kết thúc được cuộc họp đang diễn ra");
    }

    const { rows } = await pool.query(
      `UPDATE meetings SET status = 'FINISHED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    emitMeetingEvent(req.params.id, "meeting_status_updated", rows[0]);
    await notifyMeetingAudience(req.params.id, {
      type: NOTIFICATION_TYPES.MEETING_FINISHED,
      severity: "INFO",
      actorId: req.user.id,
      title: `Cuộc họp đã kết thúc: ${rows[0].title}`,
      message: "Bạn có thể xem lại biên bản, tài liệu và nhiệm vụ được giao trong hồ sơ cuộc họp.",
      excludeUserId: req.user.id
    });
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_FINISH,
      entityType: "MEETING",
      entityId: rows[0].id,
      meetingId: rows[0].id,
      description: `Kết thúc cuộc họp "${rows[0].title}"`
    });
    res.json({ data: rows[0] });
  })
);

meetingsRouter.delete(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingOrganizer(req.user, req.params.id);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cuộc họp đã kết thúc nên không xoá được");
    }

    await notifyMeetingAudience(req.params.id, {
      type: NOTIFICATION_TYPES.MEETING_CANCELLED,
      severity: "DANGER",
      actorId: req.user.id,
      title: `Cuộc họp bị huỷ: ${meeting.title}`,
      message: `${req.user.full_name} đã xoá cuộc họp khỏi lịch.`,
      excludeUserId: req.user.id
    });

    await pool.query(
      `UPDATE meetings
       SET deleted_at = now(), status = 'CANCELLED', updated_at = now()
       WHERE id = $1`,
      [req.params.id]
    );
    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MEETING_DELETE,
      entityType: "MEETING",
      entityId: req.params.id,
      meetingId: req.params.id,
      description: `Xoá cuộc họp "${meeting.title}" khỏi lịch`
    });
    res.status(204).send();
  })
);

