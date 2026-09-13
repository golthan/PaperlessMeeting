import { Server } from "socket.io";
import { pool } from "./db.js";
import { env } from "./env.js";
import { verifyToken } from "../utils/jwt.js";
import { autoCheckInOnJoin } from "../modules/attendance/attendance.service.js";

let ioInstance = null;

function roomName(meetingId) {
  return `meeting:${meetingId}`;
}

/** Mỗi user có một room riêng để nhận thông báo cá nhân ở mọi màn hình. */
function userRoomName(userId) {
  return `user:${userId}`;
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 2000);
}

async function getSocketUser(token) {
  if (!token) return null;
  const payload = verifyToken(token);
  const { rows } = await pool.query(
    `SELECT id, full_name, email, role, status
     FROM users
     WHERE id = $1`,
    [payload.sub]
  );
  if (!rows[0] || rows[0].status === "LOCKED") return null;
  return rows[0];
}

async function canAccessMeeting(user, meetingId) {
  const { rows } = await pool.query(
    `SELECT m.*
     FROM meetings m
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [meetingId]
  );
  const meeting = rows[0];
  if (!meeting || ["CANCELLED", "FINISHED"].includes(meeting.status)) {
    return null;
  }
  if (user.role === "ADMIN" || meeting.organizer_id === user.id) {
    return meeting;
  }
  const participant = await pool.query(
    `SELECT * FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, user.id]
  );
  return participant.rows[0] ? meeting : null;
}

async function getVoteResults(voteId) {
  const { rows } = await pool.query(
    `SELECT answer, COUNT(*)::int AS count
     FROM vote_responses
     WHERE vote_id = $1
     GROUP BY answer
     ORDER BY answer ASC`,
    [voteId]
  );
  return rows;
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true
    }
  });

  const meetingNamespace = io.of("/meeting");

  meetingNamespace.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");
      const user = await getSocketUser(token);
      if (!user) return next(new Error("Unauthorized"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  meetingNamespace.on("connection", (socket) => {
    socket.join(userRoomName(socket.user.id));

    socket.on("join_meeting_room", async ({ meetingId }, callback) => {
      try {
        const meeting = await canAccessMeeting(socket.user, meetingId);
        if (!meeting) throw new Error("Cannot join this meeting");

        socket.join(roomName(meetingId));
        socket.meetingId = meetingId;

        let autoAttendance = null;
        if (socket.user.role !== "ADMIN") {
          await pool.query(
            `UPDATE meeting_participants
             SET is_online = true,
                 joined_at = COALESCE(joined_at, now()),
                 left_at = NULL,
                 updated_at = now()
             WHERE meeting_id = $1 AND user_id = $2`,
            [meetingId, socket.user.id]
          );
          // Vào phòng họp khi đang diễn ra thì tính là đã điểm danh.
          autoAttendance = await autoCheckInOnJoin(meeting, socket.user.id);
        }

        await pool.query(
          `INSERT INTO meeting_sessions (meeting_id, user_id, socket_id)
           VALUES ($1, $2, $3)`,
          [meetingId, socket.user.id, socket.id]
        );

        meetingNamespace.to(roomName(meetingId)).emit("user_joined_meeting", {
          meetingId,
          user: socket.user,
          at: new Date().toISOString()
        });
        meetingNamespace.to(roomName(meetingId)).emit("participant_status_updated", {
          meetingId,
          userId: socket.user.id,
          isOnline: true
        });
        if (autoAttendance) {
          meetingNamespace.to(roomName(meetingId)).emit("attendance_updated", {
            meetingId,
            userId: socket.user.id,
            status: autoAttendance.status,
            method: autoAttendance.method
          });
        }
        callback?.({ ok: true, autoAttendance });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("leave_meeting_room", async ({ meetingId }, callback) => {
      await markOffline(socket, meetingId);
      socket.leave(roomName(meetingId));
      callback?.({ ok: true });
    });

    // documentId != null: tin nhắn thuộc phần thảo luận của một tài liệu.
    socket.on("send_chat_message", async ({ meetingId, content, documentId }, callback) => {
      try {
        const meeting = await canAccessMeeting(socket.user, meetingId);
        if (!meeting) throw new Error("Cannot send chat to this meeting");
        const cleanContent = sanitizeText(content);
        if (!cleanContent) throw new Error("Message is empty");

        if (documentId) {
          const document = await pool.query(
            "SELECT id FROM documents WHERE id = $1 AND meeting_id = $2 AND deleted_at IS NULL",
            [documentId, meetingId]
          );
          if (!document.rows[0]) throw new Error("Tài liệu không thuộc cuộc họp này");
        }

        const { rows } = await pool.query(
          `INSERT INTO chat_messages (meeting_id, sender_id, document_id, content)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [meetingId, socket.user.id, documentId || null, cleanContent]
        );

        const message = {
          ...rows[0],
          sender_name: socket.user.full_name,
          sender_email: socket.user.email
        };
        meetingNamespace.to(roomName(meetingId)).emit("new_chat_message", message);
        callback?.({ ok: true, data: message });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("raise_hand", async ({ meetingId }, callback) => {
      await updateHand(socket, meetingId, true, callback);
    });

    socket.on("lower_hand", async ({ meetingId }, callback) => {
      await updateHand(socket, meetingId, false, callback);
    });

    socket.on("public_notes_updated", async ({ meetingId, content }, callback) => {
      try {
        const meeting = await canAccessMeeting(socket.user, meetingId);
        if (!meeting) throw new Error("Cannot update notes");
        const participant = await pool.query(
          `SELECT role_in_meeting FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
          [meetingId, socket.user.id]
        );
        const isSecretary = participant.rows[0]?.role_in_meeting === "SECRETARY";
        const isOrganizer = meeting.organizer_id === socket.user.id;
        if (!isOrganizer && !isSecretary) throw new Error("Only organizer or secretary can update public notes");

        const { rows } = await pool.query(
          `INSERT INTO meeting_notes (meeting_id, content, updated_by, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (meeting_id) DO UPDATE
             SET content = EXCLUDED.content,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = now()
           RETURNING *`,
          [meetingId, sanitizeText(content), socket.user.id]
        );
        meetingNamespace.to(roomName(meetingId)).emit("public_notes_synced", rows[0]);
        callback?.({ ok: true, data: rows[0] });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("agenda_current_changed", ({ meetingId, agendaItem }) => {
      meetingNamespace.to(roomName(meetingId)).emit("current_agenda_updated", agendaItem);
    });

    socket.on("document_presented", ({ meetingId, document }) => {
      meetingNamespace.to(roomName(meetingId)).emit("current_document_updated", document);
    });

    socket.on("document_page_changed", ({ meetingId, document }) => {
      meetingNamespace.to(roomName(meetingId)).emit("current_document_updated", document);
    });

    socket.on("vote_opened", ({ meetingId, vote }) => {
      meetingNamespace.to(roomName(meetingId)).emit("vote_opened", vote);
    });

    socket.on("vote_closed", ({ meetingId, vote }) => {
      meetingNamespace.to(roomName(meetingId)).emit("vote_closed", vote);
    });

    socket.on("submit_vote_response", async ({ voteId, answer }, callback) => {
      try {
        const vote = await pool.query(
          `SELECT v.*, m.id AS meeting_id
           FROM votes v
           JOIN meetings m ON m.id = v.meeting_id
           WHERE v.id = $1`,
          [voteId]
        );
        const found = vote.rows[0];
        if (!found || found.status !== "OPEN") throw new Error("Vote is not open");
        const meeting = await canAccessMeeting(socket.user, found.meeting_id);
        if (!meeting) throw new Error("Cannot vote in this meeting");
        const options = Array.isArray(found.options) ? found.options : JSON.parse(found.options);
        if (!options.includes(answer)) throw new Error("Invalid answer");

        await pool.query(
          `INSERT INTO vote_responses (vote_id, user_id, answer)
           VALUES ($1, $2, $3)
           ON CONFLICT (vote_id, user_id) DO NOTHING`,
          [voteId, socket.user.id, answer]
        );
        const results = await getVoteResults(voteId);
        meetingNamespace.to(roomName(found.meeting_id)).emit("vote_result_updated", {
          voteId,
          results
        });
        callback?.({ ok: true, results });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("disconnect", async () => {
      if (socket.meetingId) {
        await markOffline(socket, socket.meetingId);
      }
    });
  });

  ioInstance = io;
  return io;
}

export function getIO() {
  return ioInstance;
}

export function emitMeetingEvent(meetingId, event, payload) {
  ioInstance?.of("/meeting").to(roomName(meetingId)).emit(event, payload);
}

/** Đẩy sự kiện tới toàn bộ thiết bị đang mở của những user chỉ định. */
export function emitToUsers(userIds, event, payload) {
  const namespace = ioInstance?.of("/meeting");
  if (!namespace) return;
  for (const userId of new Set((userIds || []).filter(Boolean))) {
    namespace.to(userRoomName(userId)).emit(event, payload);
  }
}

async function updateHand(socket, meetingId, isRaised, callback) {
  try {
    const meeting = await canAccessMeeting(socket.user, meetingId);
    if (!meeting) throw new Error("Cannot update hand status");
    await pool.query(
      `UPDATE meeting_participants
       SET is_hand_raised = $1, updated_at = now()
       WHERE meeting_id = $2 AND user_id = $3`,
      [isRaised, meetingId, socket.user.id]
    );
    const payload = {
      meetingId,
      userId: socket.user.id,
      fullName: socket.user.full_name,
      isHandRaised: isRaised
    };
    getIO()?.of("/meeting").to(roomName(meetingId)).emit("hand_status_updated", payload);
    callback?.({ ok: true, data: payload });
  } catch (error) {
    callback?.({ ok: false, message: error.message });
  }
}

async function markOffline(socket, meetingId) {
  if (!meetingId || !socket.user) return;
  await pool.query(
    `UPDATE meeting_participants
     SET is_online = false, left_at = now(), updated_at = now()
     WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, socket.user.id]
  );
  await pool.query(
    `UPDATE meeting_sessions
     SET left_at = now(),
         duration_seconds = EXTRACT(EPOCH FROM (now() - joined_at))::int
     WHERE socket_id = $1 AND left_at IS NULL`,
    [socket.id]
  );
  getIO()?.of("/meeting").to(roomName(meetingId)).emit("user_left_meeting", {
    meetingId,
    userId: socket.user.id,
    at: new Date().toISOString()
  });
  getIO()?.of("/meeting").to(roomName(meetingId)).emit("participant_status_updated", {
    meetingId,
    userId: socket.user.id,
    isOnline: false
  });
}

