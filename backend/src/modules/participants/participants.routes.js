import express from "express";
import { pool, withTransaction } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { syncLiveRoomPermissions } from "../../utils/livekit.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { formatMeetingTime } from "../../utils/datetime.js";
import {
  assertEnum,
  INVITATION_STATUSES,
  requireFields
} from "../../utils/validators.js";
import {
  assertMeetingAccess,
  assertMeetingChairman,
  assertMeetingScheduling,
  assertMeetingSecretaryDuties,
  assertParticipantAccess,
  buildMeetingPermissions
} from "../meetings/meetingAccess.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { NOTIFICATION_TYPES, notifyUsers } from "../notifications/notifications.service.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";

export const participantsRouter = express.Router({ mergeParams: true });
export const invitationRouter = express.Router({ mergeParams: true });

participantsRouter.use(authenticate);
invitationRouter.use(authenticate);

async function updateMyInvitation(user, meetingId, status) {
  const meeting = await assertParticipantAccess(user, meetingId);
  const { rows } = await pool.query(
    `UPDATE meeting_participants
     SET invitation_status = $1, updated_at = now()
     WHERE meeting_id = $2 AND user_id = $3
     RETURNING *`,
    [status, meetingId, user.id]
  );

  // Thư ký lo thành phần tham dự nên phải biết ai nhận lời, ai từ chối;
  // chủ tọa cũng cần nắm để điều chỉnh chương trình.
  const leaders = await pool.query(
    `SELECT user_id FROM meeting_participants
     WHERE meeting_id = $1 AND role_in_meeting IN ('CHAIRMAN', 'SECRETARY')`,
    [meetingId]
  );
  const leaderIds = leaders.rows.map((row) => row.user_id);

  await notifyUsers([...leaderIds, meeting.organizer_id], {
    type: NOTIFICATION_TYPES.INVITATION_RESPONSE,
    severity: status === "ACCEPTED" ? "SUCCESS" : "WARNING",
    meetingId,
    actorId: user.id,
    title: status === "ACCEPTED" ? "Có người xác nhận tham dự" : "Có người từ chối tham dự",
    message: `${user.full_name} ${
      status === "ACCEPTED" ? "sẽ tham dự" : "không tham dự"
    } cuộc họp "${meeting.title}".`,
    metadata: { invitationStatus: status },
    excludeUserId: user.id
  });

  return rows[0];
}

participantsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);

    const { rows } = await pool.query(
      `SELECT mp.*, u.full_name, u.email, d.name AS department_name
       FROM meeting_participants mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE mp.meeting_id = $1
       ORDER BY u.full_name ASC`,
      [req.params.meetingId]
    );
    res.json({ data: rows });
  })
);

participantsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot add participants to a finished meeting");
    }

    const userIds = Array.isArray(req.body.userIds)
      ? req.body.userIds
      : [req.body.userId].filter(Boolean);

    if (userIds.length === 0) {
      throw badRequest("userIds is required");
    }

    const inserted = [];
    for (const userId of userIds) {
      const user = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
      if (!user.rows[0]) throw notFound(`User ${userId} not found`);

      const { rows } = await pool.query(
        `INSERT INTO meeting_participants
           (meeting_id, user_id, role_in_meeting, can_share_screen, can_upload_document, can_speak)
         VALUES ($1, $2, COALESCE($3, 'MEMBER'), $4, $5, $6)
         ON CONFLICT (meeting_id, user_id) DO NOTHING
         RETURNING *`,
        [
          req.params.meetingId,
          userId,
          req.body.roleInMeeting || null,
          Boolean(req.body.canShareScreen),
          req.body.canUploadDocument !== false,
          req.body.canSpeak !== false
        ]
      );
      await pool.query(
        `INSERT INTO attendance (meeting_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (meeting_id, user_id) DO NOTHING`,
        [req.params.meetingId, userId]
      );
      if (rows[0]) inserted.push(rows[0]);
    }

    await notifyUsers(
      inserted.map((row) => row.user_id),
      {
        type: NOTIFICATION_TYPES.MEETING_INVITE,
        severity: "INFO",
        meetingId: meeting.id,
        actorId: req.user.id,
        title: `Bạn được mời họp: ${meeting.title}`,
        message: `${req.user.full_name} vừa thêm bạn vào cuộc họp lúc ${formatMeetingTime(
          meeting.start_time
        )}.`,
        excludeUserId: req.user.id
      }
    );

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.PARTICIPANT_ADD,
      entityType: "MEETING",
      entityId: meeting.id,
      meetingId: meeting.id,
      description: `Thêm ${inserted.length} người vào cuộc họp "${meeting.title}"`,
      metadata: { userIds: inserted.map((row) => row.user_id) }
    });

    res.status(201).json({ data: inserted });
  })
);

participantsRouter.delete(
  "/:userId",
  asyncHandler(async (req, res) => {
    const meeting = await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
    if (meeting.status === "FINISHED") {
      throw badRequest("Cannot remove participants from a finished meeting");
    }

    const { rowCount } = await pool.query(
      `DELETE FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [req.params.meetingId, req.params.userId]
    );
    if (!rowCount) throw notFound("Participant not found");

    await notifyUsers([req.params.userId], {
      type: NOTIFICATION_TYPES.PARTICIPANT_REMOVED,
      severity: "WARNING",
      meetingId: meeting.id,
      actorId: req.user.id,
      title: `Bạn không còn trong cuộc họp: ${meeting.title}`,
      message: `${req.user.full_name} đã gỡ bạn khỏi danh sách tham dự.`,
      excludeUserId: req.user.id
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.PARTICIPANT_REMOVE,
      entityType: "MEETING",
      entityId: meeting.id,
      meetingId: meeting.id,
      description: `Gỡ một người khỏi cuộc họp "${meeting.title}"`,
      metadata: { targetUserId: req.params.userId }
    });

    res.status(204).send();
  })
);

/**
 * Quyền hành chính của một người dự: chia sẻ màn hình và gửi tài liệu.
 * Thư ký phụ trách vì đây là phần kiểm soát thành viên.
 */
participantsRouter.put(
  "/:userId/permissions",
  asyncHandler(async (req, res) => {
    await assertMeetingSecretaryDuties(req.user, req.params.meetingId);

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET can_share_screen = COALESCE($1, can_share_screen),
           can_upload_document = COALESCE($2, can_upload_document),
           updated_at = now()
       WHERE meeting_id = $3 AND user_id = $4
       RETURNING *`,
      [
        req.body.canShareScreen === undefined ? null : Boolean(req.body.canShareScreen),
        req.body.canUploadDocument === undefined ? null : Boolean(req.body.canUploadDocument),
        req.params.meetingId,
        req.params.userId
      ]
    );
    if (!rows[0]) throw notFound("Participant not found");
    res.json({ data: rows[0] });
  })
);

/**
 * Quyền phát biểu: việc của chủ tọa vì nó quyết định ai được nói trong cuộc họp.
 * Thu quyền của người đang giữ lượt thì xoá luôn lượt đó.
 */
participantsRouter.put(
  "/:userId/speak",
  asyncHandler(async (req, res) => {
    await assertMeetingChairman(req.user, req.params.meetingId);
    if (req.body.canSpeak === undefined) throw badRequest("Thiếu canSpeak");
    const canSpeak = Boolean(req.body.canSpeak);

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET can_speak = $1, updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3
       RETURNING *`,
      [canSpeak, req.params.meetingId, req.params.userId]
    );
    if (!rows[0]) throw notFound("Participant not found");

    if (!canSpeak) {
      await pool.query(
        `UPDATE meetings SET current_speaker_id = NULL
         WHERE id = $1 AND current_speaker_id = $2`,
        [req.params.meetingId, req.params.userId]
      );
    }

    // Máy chủ video chấp hành theo vé cấp lúc vào phòng, nên phải đẩy quyền mới
    // sang ngay — không thì người được cấp quyền bấm mic vẫn bị từ chối.
    await syncLiveRoomPermissions({
      meetingId: req.params.meetingId,
      userId: req.params.userId,
      permissions: buildMeetingPermissions(rows[0].role_in_meeting, rows[0])
    });

    emitMeetingEvent(req.params.meetingId, "speak_permission_updated", {
      meetingId: req.params.meetingId,
      userId: req.params.userId,
      canSpeak
    });
    res.json({ data: rows[0] });
  })
);

/**
 * Đổi vai trò trong cuộc họp (chủ yếu là chỉ định thư ký).
 * Chủ tọa quyết định, và mỗi cuộc họp chỉ giữ đúng một thư ký.
 */
participantsRouter.put(
  "/:userId/role",
  asyncHandler(async (req, res) => {
    await assertMeetingScheduling(req.user, req.params.meetingId);
    requireFields(req.body, ["roleInMeeting"]);
    const role = req.body.roleInMeeting;
    if (!["SECRETARY", "MEMBER"].includes(role)) {
      throw badRequest("Chỉ đặt được vai trò Thư ký hoặc Thành viên tại đây");
    }
    if (req.params.userId === req.user.id) {
      throw badRequest("Không tự đổi vai trò của chính mình");
    }

    const updated = await withTransaction(async (client) => {
      if (role === "SECRETARY") {
        await client.query(
          `UPDATE meeting_participants
           SET role_in_meeting = 'MEMBER', updated_at = now()
           WHERE meeting_id = $1 AND role_in_meeting = 'SECRETARY'`,
          [req.params.meetingId]
        );
      }
      const { rows } = await client.query(
        `UPDATE meeting_participants
         SET role_in_meeting = $1, updated_at = now()
         WHERE meeting_id = $2 AND user_id = $3
         RETURNING *`,
        [role, req.params.meetingId, req.params.userId]
      );
      return rows[0];
    });
    if (!updated) throw notFound("Participant not found");

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.PARTICIPANT_UPDATE,
      entityType: "MEETING",
      entityId: req.params.meetingId,
      meetingId: req.params.meetingId,
      description: `Đổi vai trò trong cuộc họp thành ${
        role === "SECRETARY" ? "Thư ký" : "Thành viên"
      }`,
      metadata: { targetUserId: req.params.userId, roleInMeeting: role }
    });

    res.json({ data: updated });
  })
);

participantsRouter.put(
  "/invitation/accept",
  asyncHandler(async (req, res) => {
    res.json({
      data: await updateMyInvitation(req.user, req.params.meetingId, "ACCEPTED")
    });
  })
);

participantsRouter.put(
  "/invitation/decline",
  asyncHandler(async (req, res) => {
    res.json({
      data: await updateMyInvitation(req.user, req.params.meetingId, "DECLINED")
    });
  })
);

invitationRouter.put(
  "/accept",
  asyncHandler(async (req, res) => {
    res.json({
      data: await updateMyInvitation(req.user, req.params.meetingId, "ACCEPTED")
    });
  })
);

invitationRouter.put(
  "/decline",
  asyncHandler(async (req, res) => {
    res.json({
      data: await updateMyInvitation(req.user, req.params.meetingId, "DECLINED")
    });
  })
);

participantsRouter.put(
  "/:userId/invitation",
  asyncHandler(async (req, res) => {
    await assertMeetingSecretaryDuties(req.user, req.params.meetingId);
    assertEnum(req.body.status, INVITATION_STATUSES, "invitation status");

    const { rows } = await pool.query(
      `UPDATE meeting_participants
       SET invitation_status = $1, updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3
       RETURNING *`,
      [req.body.status, req.params.meetingId, req.params.userId]
    );
    if (!rows[0]) throw notFound("Participant not found");
    res.json({ data: rows[0] });
  })
);
