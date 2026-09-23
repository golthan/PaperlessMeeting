import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  ArrowLeft,
  Building2,
  Camera,
  CameraOff,
  Check,
  ClipboardList,
  FileText,
  Hand,
  ListChecks,
  Mic,
  MicOff,
  MonitorUp,
  NotebookPen,
  PhoneOff,
  Search,
  Send,
  Square,
  UserCheck,
  Users,
  Video,
  VideoOff,
  Vote
} from "lucide-react";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { DocumentWorkspace } from "../../components/DocumentWorkspace.jsx";
import { TranscriptPanel } from "../../components/TranscriptPanel.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { VoteCard } from "../../components/VoteCard.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { asArray, formatDateTime } from "../../utils/format.js";
import {
  attendanceMethodLabel,
  attendanceSummary,
  hasOnlineRoom,
  meetingPlaceLabel,
  onlineCount,
  percent
} from "../../utils/meeting.js";
import { voteAnswerLabel } from "../../utils/meeting.js";

const LIVE_TABS = [
  { key: "agenda", label: "Chương trình", icon: ClipboardList },
  { key: "documents", label: "Tài liệu", icon: FileText },
  { key: "attendance", label: "Điểm danh", icon: UserCheck },
  { key: "votes", label: "Biểu quyết", icon: Vote },
  { key: "transcript", label: "Lời nói", icon: Mic },
  { key: "notes", label: "Ghi chú", icon: NotebookPen },
  { key: "tasks", label: "Nhiệm vụ", icon: ListChecks }
];

/**
 * Dịch lỗi bật mic / camera thành câu người dùng hiểu và sửa được.
 *
 * Trước đây mọi lỗi đều hiện một dòng "Không bật được micro", che mất nguyên
 * nhân thật — mà ba nguyên nhân hay gặp cần ba cách xử lý hoàn toàn khác nhau:
 * trình duyệt chặn quyền, thiết bị đang bị cửa sổ khác chiếm, và máy chủ video
 * chưa cho phát.
 */
function mediaErrorMessage(error, device) {
  const name = error?.name || "";
  const text = String(error?.message || "");

  if (["NotAllowedError", "SecurityError"].includes(name)) {
    return `Trình duyệt đang chặn quyền dùng ${device}. Bấm vào biểu tượng ổ khóa cạnh thanh địa chỉ để cấp lại quyền.`;
  }
  if (name === "NotReadableError" || /in use|could not start/i.test(text)) {
    return `${device} đang bị một cửa sổ hoặc ứng dụng khác chiếm. Nếu bạn đang mở cuộc họp ở hai cửa sổ trên cùng một máy thì chỉ một cửa sổ dùng được ${device}.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `Máy không có ${device} nào đang hoạt động.`;
  }
  if (name === "OverconstrainedError") {
    return `${device} không đáp ứng được cấu hình yêu cầu. Thử chọn thiết bị khác.`;
  }
  // LiveKit từ chối ở tầng máy chủ khi vé không có quyền phát.
  if (/permission|not allowed to publish|insufficient/i.test(text)) {
    return `Bạn chưa được phép phát ${device} trong phòng họp này. Chủ tọa cần mời bạn phát biểu trước.`;
  }
  return `Không bật được ${device}${text ? `: ${text}` : ""}`;
}

function apiOrigin() {
  const base = api.defaults.baseURL || "http://localhost:4000/api";
  return base.replace(/\/api\/?$/, "");
}

export function defaultLivekitUrl() {
  return `ws://${window.location.hostname}:7880`;
}

export function VideoStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  const last = parts[parts.length - 1] || "?";
  return last.slice(0, 1).toUpperCase();
}

export function LiveMeetingPage() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [meeting, setMeeting] = useState(null);
  const [config, setConfig] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
  const [activeTab, setActiveTab] = useState("agenda");
  const [sideTab, setSideTab] = useState("people");
  const [peopleFilter, setPeopleFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voteResults, setVoteResults] = useState({});
  const [documentNotes, setDocumentNotes] = useState({});
  const [documentQuestions, setDocumentQuestions] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  // Bản ghi lời nói: nhận dạng chạy trên máy người nói, socket phát lại cho cả phòng.
  const [transcript, setTranscript] = useState([]);
  const [publicNotesRow, setPublicNotesRow] = useState(null);
  const [socketState, setSocketState] = useState("connecting");
  const [media, setMedia] = useState({ mic: false, camera: false, screen: false });
  const [busy, setBusy] = useState(false);
  const [lkRoom] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const socketRef = useRef(null);
  const fetchedResultsRef = useRef(new Set());

  // Quyền do máy chủ tính theo vai trò TRONG cuộc họp (chủ tọa / thư ký / thành viên),
  // không suy từ vai trò toàn cục nữa.
  const perm = config?.permissions || {};
  const liveBackPath =
    user.role === "ORGANIZER" ? `/organizer/meetings/${id}` : `/participant/meetings/${id}`;

  useEffect(() => {
    if (notice) toast.success(notice);
  }, [notice, toast]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const loadData = useCallback(async () => {
    const [
      meetingRes,
      configRes,
      chatRes,
      publicNotesRes,
      personalNotesRes,
      transcriptRes
    ] = await Promise.all([
      api.get(`/meetings/${id}`),
      api.get(`/meetings/${id}/live-config`),
      api.get(`/meetings/${id}/chat`, { params: { limit: 200 } }),
      api.get(`/meetings/${id}/public-notes`),
      api.get(`/meetings/${id}/personal-notes`),
      api.get(`/meetings/${id}/transcript`, { params: { limit: 100 } })
    ]);
    setMeeting(meetingRes.data.data);
    setConfig(configRes.data.data);
    setChat(chatRes.data.data || []);
    setPublicNotes(publicNotesRes.data.data?.content || "");
    setPublicNotesRow(publicNotesRes.data.data || null);
    setPersonalNotes(personalNotesRes.data.data?.content || "");
    setTranscript(transcriptRes.data.data || []);
  }, [id]);

  /** Nạp lại riêng bản ghi lời nói sau khi sửa hoặc xoá một đoạn. */
  const reloadTranscript = useCallback(async () => {
    const [transcriptRes, notesRes] = await Promise.all([
      api.get(`/meetings/${id}/transcript`, { params: { limit: 100 } }),
      api.get(`/meetings/${id}/public-notes`)
    ]);
    setTranscript(transcriptRes.data.data || []);
    setPublicNotesRow(notesRes.data.data || null);
  }, [id]);

  useEffect(() => {
    loadData().catch((err) =>
      setError(err.response?.data?.message || "Không mở được phòng họp")
    );
  }, [loadData]);

  // Tính năng AI chỉ hiện khi backend đã cấu hình khoá API.
  useEffect(() => {
    api
      .get("/documents/ai/status")
      .then((res) => setAiEnabled(Boolean(res.data.data?.configured)))
      .catch(() => setAiEnabled(false));
  }, []);

  const livekitUrl = config?.livekitUrl || defaultLivekitUrl();

  useEffect(() => {
    return () => {
      lkRoom.disconnect();
    };
  }, [lkRoom]);

  // Đồng bộ trạng thái mic/camera/chia sẻ để nút bấm phản ánh đúng thực tế.
  useEffect(() => {
    function sync() {
      const me = lkRoom.localParticipant;
      setMedia({
        mic: me.isMicrophoneEnabled,
        camera: me.isCameraEnabled,
        screen: me.isScreenShareEnabled
      });
    }
    const events = [
      RoomEvent.Connected,
      RoomEvent.Disconnected,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted
    ];
    events.forEach((event) => lkRoom.on(event, sync));
    return () => events.forEach((event) => lkRoom.off(event, sync));
  }, [lkRoom]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(`${apiOrigin()}/meeting`, {
      auth: { token },
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketState("online");
      socket.emit("join_meeting_room", { meetingId: id }, (reply) => {
        if (!reply?.ok) setError(reply?.message || "Không vào được phòng realtime");
        else if (reply.autoAttendance) {
          setNotice(
            reply.autoAttendance.status === "LATE"
              ? "Đã ghi nhận bạn vào họp (đi muộn)"
              : "Đã ghi nhận bạn có mặt"
          );
        }
      });
    });
    socket.on("disconnect", () => setSocketState("offline"));
    socket.on("new_chat_message", (message) => {
      setChat((current) => [...current, message].slice(-120));
    });
    socket.on("hand_status_updated", ({ userId, isHandRaised }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId
                  ? { ...item, is_hand_raised: isHandRaised }
                  : item
              )
            }
          : current
      );
    });
    socket.on("participant_status_updated", ({ userId, isOnline }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId ? { ...item, is_online: isOnline } : item
              )
            }
          : current
      );
    });
    socket.on("meeting_status_updated", (nextMeeting) => {
      setMeeting((current) => (current ? { ...current, ...nextMeeting } : nextMeeting));
      if (nextMeeting.status === "FINISHED") setNotice("Cuộc họp đã kết thúc");
      if (nextMeeting.status === "CANCELLED") setError("Cuộc họp đã bị huỷ");
    });
    // Chủ tọa bật / tắt phòng video: phải lấy lại token LiveKit mới.
    socket.on("online_room_updated", ({ enabled }) => {
      setNotice(
        enabled ? "Chủ tọa đã mở phòng họp trực tuyến" : "Phòng họp trực tuyến đã tắt"
      );
      loadData().catch(() => {});
    });
    // Chủ tọa đổi luật phát biểu hoặc mời người khác: mọi người phải thấy ngay.
    socket.on("speaker_mode_updated", ({ mode }) => {
      setConfig((current) => (current ? { ...current, speakerMode: mode } : current));
      setNotice(
        mode === "MODERATED"
          ? "Chủ tọa đang điều hành lượt phát biểu"
          : "Đã chuyển sang tự do phát biểu"
      );
      loadData().catch(() => {});
    });
    socket.on("speaker_updated", ({ userId }) => {
      setConfig((current) => (current ? { ...current, currentSpeakerId: userId } : current));
      loadData().catch(() => {});
    });
    socket.on("speak_permission_updated", ({ userId: targetId, canSpeak }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === targetId ? { ...item, can_speak: canSpeak } : item
              )
            }
          : current
      );
      // Quyền của chính mình đổi thì phải lấy lại vé LiveKit cho khớp.
      if (targetId === user.id) loadData().catch(() => {});
    });
    socket.on("chairman_changed", ({ fullName }) => {
      setNotice(`${fullName} đang là chủ tọa cuộc họp`);
      loadData().catch(() => {});
    });
    socket.on("attendance_updated", ({ userId, status, method }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId
                  ? { ...item, attendance_status: status, attendance_method: method }
                  : item
              )
            }
          : current
      );
    });
    socket.on("document_added", (document) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              documents: [
                document,
                ...asArray(current.documents).filter((item) => item.id !== document.id)
              ]
            }
          : current
      );
      setNotice(`Tài liệu mới: ${document.display_name}`);
    });
    socket.on("document_updated", (document) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              documents: asArray(current.documents).some((item) => item.id === document.id)
                ? asArray(current.documents).map((item) =>
                    item.id === document.id ? { ...item, ...document } : item
                  )
                : [document, ...asArray(current.documents)]
            }
          : current
      );
    });
    socket.on("document_removed", ({ id: documentId }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              documents: asArray(current.documents).filter((item) => item.id !== documentId)
            }
          : current
      );
    });
    socket.on("document_question_added", (record) => {
      setDocumentQuestions((current) => {
        const existing = current[record.document_id] || [];
        if (existing.some((item) => item.id === record.id)) return current;
        return { ...current, [record.document_id]: [...existing, record] };
      });
    });
    socket.on("document_notes_synced", (note) => {
      setDocumentNotes((current) => ({ ...current, [note.document_id]: note }));
    });
    socket.on("public_notes_synced", (notes) => setPublicNotes(notes.content || ""));

    // Bản ghi lời nói: mỗi người nhận dạng trên máy mình rồi gửi lên, máy chủ
    // phát lại cho cả phòng nên ai cũng theo được lời nói đang diễn ra.
    socket.on("transcript_segment", (segment) => {
      setTranscript((current) =>
        current.some((item) => item.id === segment.id) ? current : [...current, segment]
      );
    });
    socket.on("transcript_updated", (segment) => {
      setTranscript((current) =>
        current.map((item) => (item.id === segment.id ? { ...item, ...segment } : item))
      );
    });
    socket.on("transcript_removed", ({ id: segmentId }) => {
      setTranscript((current) => current.filter((item) => item.id !== segmentId));
    });
    socket.on("discussion_summary_ready", (notes) => setPublicNotesRow(notes));
    socket.on("current_agenda_updated", (agendaItem) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              agenda: current.agenda.map((item) =>
                item.id === agendaItem.id
                  ? agendaItem
                  : agendaItem.status === "CURRENT"
                    ? { ...item, status: item.status === "CURRENT" ? "PENDING" : item.status }
                    : item
              )
            }
          : current
      );
    });
    socket.on("current_document_updated", (document) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((item) =>
                item.id === document.id
                  ? document
                  : document.is_presenting
                    ? { ...item, is_presenting: false }
                    : item
              )
            }
          : current
      );
    });
    socket.on("vote_opened", (vote) => {
      setNotice(`Biểu quyết đang mở: ${vote.title}`);
      loadData().catch(() => {});
    });
    socket.on("vote_closed", (vote) => {
      if (vote?.results) {
        setVoteResults((current) => ({
          ...current,
          [vote.id]: { results: vote.results, summary: vote.summary }
        }));
      }
      loadData().catch(() => {});
    });
    socket.on("vote_result_updated", ({ voteId, results, summary }) => {
      setVoteResults((current) => ({
        ...current,
        [voteId]: { results, summary: summary || current[voteId]?.summary }
      }));
    });

    return () => {
      socket.emit("leave_meeting_room", { meetingId: id });
      socket.disconnect();
    };
  }, [id, token, loadData, user.id]);

  const participants = asArray(meeting?.participants);
  const votes = asArray(meeting?.votes);
  // Chat chung của phòng và chat trong hộp tài liệu dùng chung một luồng realtime,
  // phân biệt bằng document_id.
  const roomMessages = useMemo(
    () => chat.filter((item) => !item.document_id),
    [chat]
  );
  const documentMessages = useMemo(
    () => chat.filter((item) => item.document_id),
    [chat]
  );
  const moderated = config?.speakerMode === "MODERATED";
  const canUploadDocument = perm.canUploadDocument === true;
  const canEditSharedNotes = perm.canEditSharedNotes === true;
  const summary = useMemo(() => attendanceSummary(participants), [participants]);
  const inRoom = onlineCount(participants);
  const me = participants.find((item) => item.user_id === user.id);
  const onlineRoomOn = hasOnlineRoom(meeting);
  const meetingClosed = ["FINISHED", "CANCELLED"].includes(meeting?.status);

  const currentDocument = useMemo(
    () => asArray(meeting?.documents).find((item) => item.is_presenting),
    [meeting?.documents]
  );
  const currentAgenda = useMemo(
    () => asArray(meeting?.agenda).find((item) => item.status === "CURRENT"),
    [meeting?.agenda]
  );

  // Kết quả biểu quyết đã chốt luôn hiện sẵn, không cần bấm xem.
  useEffect(() => {
    const pending = votes.filter(
      (vote) =>
        vote.status === "CLOSED" &&
        !voteResults[vote.id] &&
        !fetchedResultsRef.current.has(vote.id)
    );
    pending.forEach((vote) => {
      fetchedResultsRef.current.add(vote.id);
      api
        .get(`/votes/${vote.id}/results`)
        .then((res) =>
          setVoteResults((current) => ({
            ...current,
            [vote.id]: { results: res.data.data.results, summary: res.data.data.summary }
          }))
        )
        .catch(() => fetchedResultsRef.current.delete(vote.id));
    });
  }, [votes, voteResults]);

  async function run(action, success) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (success) setNotice(success);
      await loadData();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Thao tác thất bại");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    await run(
      () => api.post(`/meetings/${id}/attendance/checkin`, {}),
      "Đã điểm danh"
    );
  }

  /** Mời một người phát biểu; truyền null để thu lượt đang nói. */
  async function inviteSpeaker(userId) {
    await run(
      () => api.put(`/meetings/${id}/speaker`, { userId }),
      userId ? "Đã mời phát biểu" : "Đã thu lượt phát biểu"
    );
  }

  /** Bật / tắt quyền nói của một người mà không đụng tới lượt đang diễn ra. */
  async function toggleSpeakPermission(userId, canSpeak) {
    await run(
      () => api.put(`/meetings/${id}/participants/${userId}/speak`, { canSpeak }),
      canSpeak ? "Đã cấp quyền phát biểu" : "Đã thu quyền phát biểu"
    );
  }

  async function changeSpeakerMode(mode) {
    await run(
      () => api.put(`/meetings/${id}/speaker-mode`, { mode }),
      mode === "MODERATED"
        ? "Chuyển sang chế độ chủ tọa mời phát biểu"
        : "Chuyển sang chế độ tự do phát biểu"
    );
  }

  async function markAttendance(userId, status) {
    await run(
      () => api.put(`/meetings/${id}/attendance/${userId}`, { status }),
      "Đã cập nhật điểm danh"
    );
  }

  async function toggleOnlineRoom(enabled) {
    await run(
      () => api.put(`/meetings/${id}/online-room`, { enabled }),
      enabled
        ? "Đã mở phòng họp trực tuyến, mọi người có thể tham gia từ xa"
        : "Đã tắt phòng họp trực tuyến"
    );
  }

  // Kết thúc xong thì phòng họp đóng lại, quay về hồ sơ cuộc họp để làm biên bản.
  async function finishMeeting() {
    setError("");
    setBusy(true);
    try {
      await api.put(`/meetings/${id}/finish`);
      navigate(liveBackPath);
    } catch (err) {
      setError(err.response?.data?.message || "Không kết thúc được cuộc họp");
    } finally {
      setBusy(false);
    }
  }

  function sendChat(event) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    socketRef.current?.emit("send_chat_message", { meetingId: id, content }, (reply) => {
      if (!reply?.ok) setError(reply?.message || "Không gửi được tin nhắn");
    });
    setChatInput("");
  }

  function toggleHand() {
    socketRef.current?.emit(me?.is_hand_raised ? "lower_hand" : "raise_hand", {
      meetingId: id
    });
  }

  async function savePublicNotes() {
    const res = await api.put(`/meetings/${id}/public-notes`, { content: publicNotes });
    socketRef.current?.emit("public_notes_updated", {
      meetingId: id,
      content: res.data.data.content
    });
    setNotice("Đã lưu ghi chú chung");
  }

  async function savePersonalNotes() {
    await api.put(`/meetings/${id}/personal-notes`, { content: personalNotes });
    setNotice("Đã lưu ghi chú cá nhân");
  }

  async function setAgendaCurrent(item) {
    const res = await api.put(`/agenda/${item.id}/current`);
    socketRef.current?.emit("agenda_current_changed", {
      meetingId: id,
      agendaItem: res.data.data
    });
    await loadData();
  }

  async function setAgendaDone(item) {
    const res = await api.put(`/agenda/${item.id}/done`);
    socketRef.current?.emit("agenda_current_changed", {
      meetingId: id,
      agendaItem: res.data.data
    });
    await loadData();
  }

  /** Đăng tài liệu ngay trong phòng họp. Trả về bản ghi để hộp tài liệu mở luôn file vừa gửi. */
  async function uploadDocument(formData) {
    setError("");
    try {
      const res = await api.post(`/meetings/${id}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setNotice(
        res.data.data.status === "APPROVED"
          ? "Đã đăng tài liệu cho cả phòng họp"
          : "Đã gửi tài liệu, chờ chủ tọa duyệt"
      );
      await loadData();
      return res.data.data;
    } catch (err) {
      setError(err.response?.data?.message || "Không đăng được tài liệu");
      return null;
    }
  }

  async function approveDocument(document) {
    await run(() => api.put(`/documents/${document.id}/approve`), "Đã duyệt tài liệu");
  }

  async function rejectDocument(document) {
    await run(() => api.put(`/documents/${document.id}/reject`), "Đã từ chối tài liệu");
  }

  async function deleteDocument(document) {
    await run(() => api.delete(`/documents/${document.id}`), "Đã xoá tài liệu");
  }

  /** Ghi chú riêng của từng tài liệu, tải một lần rồi giữ trong bộ nhớ trang. */
  const loadDocumentNotes = useCallback(async (documentId) => {
    try {
      const res = await api.get(`/documents/${documentId}/notes`);
      setDocumentNotes((current) => ({
        ...current,
        [documentId]: res.data.data || { document_id: documentId, content: "" }
      }));
    } catch {
      // Không tải được ghi chú thì để trống, không chặn thao tác khác.
    }
  }, []);

  /** Lịch sử hỏi đáp AI của từng tài liệu. */
  const loadDocumentQuestions = useCallback(async (documentId) => {
    try {
      const res = await api.get(`/documents/${documentId}/questions`);
      setDocumentQuestions((current) => ({ ...current, [documentId]: res.data.data || [] }));
    } catch {
      // Không tải được thì để trống, không chặn thao tác khác.
    }
  }, []);

  async function summarizeDocumentAi(document) {
    setError("");
    try {
      await api.post(`/documents/${document.id}/summary`);
      setNotice("AI đã tóm tắt xong tài liệu");
      await loadData();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Không tóm tắt được tài liệu");
      return false;
    }
  }

  async function askDocumentAi(document, question) {
    setError("");
    try {
      const res = await api.post(`/documents/${document.id}/ask`, { question });
      setDocumentQuestions((current) => ({
        ...current,
        [document.id]: [...(current[document.id] || []), res.data.data]
      }));
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Không hỏi được AI về tài liệu");
      return false;
    }
  }

  async function saveDocumentNotes(documentId, content) {
    try {
      const res = await api.put(`/documents/${documentId}/notes`, { content });
      setDocumentNotes((current) => ({ ...current, [documentId]: res.data.data }));
      setNotice("Đã lưu ghi chú tài liệu");
    } catch (err) {
      setError(err.response?.data?.message || "Không lưu được ghi chú tài liệu");
    }
  }

  /** Tin nhắn gắn với một tài liệu cụ thể, tách khỏi chat chung của phòng. */
  function sendDocumentMessage(documentId, content) {
    socketRef.current?.emit(
      "send_chat_message",
      { meetingId: id, content, documentId },
      (reply) => {
        if (!reply?.ok) setError(reply?.message || "Không gửi được tin nhắn");
      }
    );
  }

  async function presentDocument(document) {
    const res = await api.put(`/documents/${document.id}/present`, { currentPage: 1 });
    socketRef.current?.emit("document_presented", {
      meetingId: id,
      document: res.data.data
    });
    await loadData();
  }

  async function changeDocumentPage(document, delta) {
    const nextPage = Math.max(Number(document.current_page || 1) + delta, 1);
    const res = await api.put(`/documents/${document.id}/page`, { currentPage: nextPage });
    socketRef.current?.emit("document_page_changed", {
      meetingId: id,
      document: res.data.data
    });
    await loadData();
  }

  async function answerVote(vote, answer) {
    await run(
      () => api.post(`/votes/${vote.id}/responses`, { answer }),
      `Đã gửi phiếu: ${voteAnswerLabel(answer)}`
    );
  }

  async function openVote(vote) {
    const res = await api.put(`/votes/${vote.id}/open`).catch((err) => {
      setError(err.response?.data?.message || "Không mở được biểu quyết");
      return null;
    });
    if (!res) return;
    socketRef.current?.emit("vote_opened", { meetingId: id, vote: res.data.data });
    setNotice("Đã mở biểu quyết");
    await loadData();
  }

  async function closeVote(vote) {
    const res = await api.put(`/votes/${vote.id}/close`).catch((err) => {
      setError(err.response?.data?.message || "Không đóng được biểu quyết");
      return null;
    });
    if (!res) return;
    setVoteResults((current) => ({
      ...current,
      [vote.id]: { results: res.data.results, summary: res.data.summary }
    }));
    socketRef.current?.emit("vote_closed", { meetingId: id, vote: res.data.data });
    setNotice("Đã chốt biểu quyết");
    await loadData();
  }

  async function loadVoteResults(voteId) {
    const res = await api.get(`/votes/${voteId}/results`);
    setVoteResults((current) => ({
      ...current,
      [voteId]: { results: res.data.data.results, summary: res.data.data.summary }
    }));
  }

  function toggleMic() {
    const local = lkRoom.localParticipant;
    local
      .setMicrophoneEnabled(!local.isMicrophoneEnabled)
      .catch((err) => setError(mediaErrorMessage(err, "micro")));
  }

  function toggleCamera() {
    const local = lkRoom.localParticipant;
    local
      .setCameraEnabled(!local.isCameraEnabled)
      .catch((err) => setError(mediaErrorMessage(err, "camera")));
  }

  function toggleShareScreen() {
    const local = lkRoom.localParticipant;
    local
      .setScreenShareEnabled(!local.isScreenShareEnabled)
      .catch((err) => setError(mediaErrorMessage(err, "chia sẻ màn hình")));
  }

  if (!meeting || !config) {
    return (
      <div className="page-stack">
        <div className="live-topbar">
          <Link className="back-button" to={liveBackPath}>
            <ArrowLeft size={16} />
            <span>Quay lại chi tiết cuộc họp</span>
          </Link>
        </div>
        {error ? (
          <div className="alert error">{error}</div>
        ) : (
          <div className="boot-screen">Đang mở phòng họp...</div>
        )}
      </div>
    );
  }

  return (
    <div className="live-room">
      <section className="live-topbar">
        <div className="live-topbar-left">
          <Link className="back-button" to={liveBackPath}>
            <ArrowLeft size={16} />
            <span>Quay lại</span>
          </Link>
          <div>
            <h2>{meeting.title}</h2>
            <p>
              {formatDateTime(meeting.start_time)} · {meetingPlaceLabel(meeting)} ·{" "}
              <span className={`live-signal is-${socketState}`}>
                realtime{" "}
                {socketState === "online"
                  ? "đã kết nối"
                  : socketState === "offline"
                    ? "mất kết nối"
                    : "đang kết nối"}
              </span>
            </p>
          </div>
        </div>
        <div className="row-actions">
          <span className="live-count">
            <Users size={15} />
            {inRoom}/{participants.length} trong phòng
          </span>
          <StatusPill value={meeting.meeting_type} />
          <StatusPill value={meeting.status} />
          {moderated && (
            <span className="pill warning">
              <Hand size={11} /> Chủ tọa mời mới được nói
            </span>
          )}
          <Link className="danger-button" to={liveBackPath}>
            <PhoneOff size={16} />
            Rời phòng
          </Link>
        </div>
      </section>

      <section className="live-main">
        <div className="live-stage">
          {onlineRoomOn && config.roomName && config.livekitToken ? (
            <LiveKitRoom
              room={lkRoom}
              serverUrl={livekitUrl}
              token={config.livekitToken}
              connect
              audio={false}
              video={false}
              data-lk-theme="default"
              style={{ height: "100%" }}
              onError={() => setError("Không kết nối được máy chủ video (LiveKit)")}
            >
              <VideoStage />
              <RoomAudioRenderer />
            </LiveKitRoom>
          ) : (
            <div className="stage-placeholder">
              <span className="stage-placeholder-icon">
                <Building2 size={26} />
              </span>
              <strong>Cuộc họp tập trung tại {meeting.room_name || "phòng họp"}</strong>
              <p>
                Phòng họp trực tuyến chưa được bật. Mọi nội dung không giấy tờ — chương
                trình, tài liệu, điểm danh, biểu quyết, ghi chú — vẫn hoạt động bình
                thường ở bên dưới.
              </p>
              {perm.canEditMeeting && !meetingClosed && (
                <button
                  className="primary-button"
                  onClick={() => toggleOnlineRoom(true)}
                  disabled={busy}
                >
                  <Video size={16} />
                  Bật phòng họp trực tuyến
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="live-side">
          <nav className="side-tabs">
            <button
              className={sideTab === "people" ? "active" : ""}
              onClick={() => setSideTab("people")}
            >
              <Users size={15} />
              Người tham dự
              <em>{participants.length}</em>
            </button>
            <button
              className={sideTab === "chat" ? "active" : ""}
              onClick={() => setSideTab("chat")}
            >
              <Send size={15} />
              Trò chuyện
              <em>{roomMessages.length}</em>
            </button>
          </nav>

          {sideTab === "people" ? (
            <ParticipantPanel
              participants={participants}
              filter={peopleFilter}
              onFilter={setPeopleFilter}
              organizerName={meeting.organizer_name}
              currentUserId={user.id}
              canMark={perm.canMarkAttendance && !meetingClosed}
              onMark={markAttendance}
              inRoom={inRoom}
              canControlSpeakers={perm.canControlSpeakers && !meetingClosed}
              currentSpeakerId={config.currentSpeakerId}
              onInviteSpeaker={inviteSpeaker}
              onToggleSpeak={toggleSpeakPermission}
            />
          ) : (
            <div className="live-chat">
              <div className="chat-list">
                {roomMessages.length === 0 ? (
                  <p className="muted">Chưa có tin nhắn nào.</p>
                ) : (
                  roomMessages.map((message) => (
                    <div
                      key={message.id || `${message.sender_id}-${message.created_at}`}
                      className={`chat-message ${
                        message.sender_id === user.id ? "is-mine" : ""
                      }`}
                    >
                      <strong>{message.sender_name || message.sender_email}</strong>
                      <p>{message.content}</p>
                    </div>
                  ))
                )}
              </div>
              <form className="chat-form" onSubmit={sendChat}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Nhập tin nhắn..."
                />
                <button className="primary-button" aria-label="Gửi tin nhắn">
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </aside>
      </section>

      <section className="live-controls">
        {onlineRoomOn && config.livekitToken && (
          <>
            <button
              className={`secondary-button ${media.mic ? "is-on" : ""}`}
              onClick={toggleMic}
              disabled={!config.permissions.canSpeak}
              title={
                config.permissions.canSpeak
                  ? "Bật / tắt micro"
                  : "Chủ tọa chưa cấp quyền phát biểu"
              }
            >
              {media.mic ? <Mic size={16} /> : <MicOff size={16} />}
              {media.mic ? "Đang bật mic" : "Bật mic"}
            </button>
            <button
              className={`secondary-button ${media.camera ? "is-on" : ""}`}
              onClick={toggleCamera}
              disabled={!config.permissions.canSpeak}
            >
              {media.camera ? <Camera size={16} /> : <CameraOff size={16} />}
              {media.camera ? "Đang bật camera" : "Bật camera"}
            </button>
            <button
              className={`secondary-button ${media.screen ? "is-on" : ""}`}
              disabled={!config.permissions.canShareScreen}
              onClick={toggleShareScreen}
              title={
                config.permissions.canShareScreen
                  ? "Chia sẻ màn hình"
                  : "Chủ tọa chưa cấp quyền chia sẻ màn hình"
              }
            >
              {media.screen ? <VideoOff size={16} /> : <MonitorUp size={16} />}
              {media.screen ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
            </button>
          </>
        )}

        <button
          className={`secondary-button ${me?.is_hand_raised ? "is-on" : ""}`}
          onClick={toggleHand}
        >
          <Hand size={16} />
          {me?.is_hand_raised ? "Hạ tay" : "Giơ tay"}
        </button>

        {!perm.isChairman && (
          <button
            className="primary-button"
            onClick={checkIn}
            disabled={
              busy ||
              meeting.status !== "ONGOING" ||
              ["PRESENT", "LATE"].includes(me?.attendance_status)
            }
          >
            <Check size={16} />
            {["PRESENT", "LATE"].includes(me?.attendance_status)
              ? "Đã điểm danh"
              : "Điểm danh"}
          </button>
        )}

        {perm.canEditMeeting && !meetingClosed && (
          <>
            <button
              className={`secondary-button ${onlineRoomOn ? "is-on" : ""}`}
              onClick={() => toggleOnlineRoom(!onlineRoomOn)}
              disabled={busy || meeting.meeting_type === "ONLINE"}
              title={
                meeting.meeting_type === "ONLINE"
                  ? "Cuộc họp trực tuyến luôn có phòng video"
                  : "Bật / tắt phòng họp trực tuyến"
              }
            >
              <Video size={16} />
              {onlineRoomOn ? "Phòng trực tuyến: bật" : "Bật phòng trực tuyến"}
            </button>
            <button
              className={`secondary-button ${moderated ? "is-on" : ""}`}
              onClick={() => changeSpeakerMode(moderated ? "FREE" : "MODERATED")}
              disabled={busy}
              title={
                moderated
                  ? "Đang điều hành lượt nói — bấm để cho tự do phát biểu"
                  : "Chuyển sang chế độ chỉ ai được mời mới phát biểu"
              }
            >
              <Hand size={16} />
              {moderated ? "Điều hành lượt nói" : "Tự do phát biểu"}
            </button>
            {meeting.status === "ONGOING" && (
              <button className="danger-button" onClick={finishMeeting} disabled={busy}>
                <Square size={16} />
                Kết thúc cuộc họp
              </button>
            )}
          </>
        )}
      </section>

      <section className="live-bottom">
        <nav className="tabbar">
          {LIVE_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "agenda" && (
          <LiveAgenda
            agenda={asArray(meeting.agenda)}
            currentAgenda={currentAgenda}
            canControl={perm.canControlAgenda}
            onCurrent={setAgendaCurrent}
            onDone={setAgendaDone}
          />
        )}
        {activeTab === "documents" && (
          <DocumentWorkspace
            documents={asArray(meeting.documents)}
            currentDocument={currentDocument}
            messages={documentMessages}
            notes={documentNotes}
            canManage={perm.canReviewDocument}
            canUpload={canUploadDocument}
            canEditNotes={canEditSharedNotes}
            meetingClosed={meetingClosed}
            currentUserId={user.id}
            onUpload={uploadDocument}
            onPresent={presentDocument}
            onPage={changeDocumentPage}
            onApprove={approveDocument}
            onReject={rejectDocument}
            onDelete={deleteDocument}
            onSend={sendDocumentMessage}
            onLoadNotes={loadDocumentNotes}
            onSaveNotes={saveDocumentNotes}
            aiEnabled={aiEnabled}
            canSummarize={canEditSharedNotes}
            questions={documentQuestions}
            onLoadQuestions={loadDocumentQuestions}
            onAsk={askDocumentAi}
            onSummarize={summarizeDocumentAi}
          />
        )}
        {activeTab === "attendance" && (
          <LiveAttendance
            participants={participants}
            summary={summary}
            canMark={perm.canMarkAttendance && !meetingClosed}
            onMark={markAttendance}
          />
        )}
        {activeTab === "votes" && (
          <LiveVotes
            votes={votes}
            voteResults={voteResults}
            canManage={perm.canManageVotes}
            participantCount={participants.length}
            busy={busy}
            onOpen={openVote}
            onClose={closeVote}
            onAnswer={answerVote}
            onResults={loadVoteResults}
          />
        )}
        {activeTab === "transcript" && (
          <TranscriptPanel
            meetingId={id}
            segments={transcript}
            canRecord={perm.canSpeak || canEditSharedNotes}
            canEdit={canEditSharedNotes}
            canSummarize={canEditSharedNotes}
            aiEnabled={aiEnabled}
            aiSummary={publicNotesRow}
            onSegment={(segment) =>
              setTranscript((current) =>
                current.some((item) => item.id === segment.id)
                  ? current
                  : [...current, segment]
              )
            }
            onReload={reloadTranscript}
            onNotice={setNotice}
            onError={setError}
          />
        )}
        {activeTab === "notes" && (
          <LiveNotes
            publicNotes={publicNotes}
            personalNotes={personalNotes}
            onPublicChange={setPublicNotes}
            onPersonalChange={setPersonalNotes}
            onSavePublic={savePublicNotes}
            onSavePersonal={savePersonalNotes}
            canEditPublic={canEditSharedNotes}
          />
        )}
        {activeTab === "tasks" && <LiveTasks tasks={asArray(meeting.tasks)} />}
      </section>
    </div>
  );
}

/** Danh sách người tham dự: tách rõ ai đang trong phòng, ai chưa vào. */
function ParticipantPanel({
  participants,
  filter,
  onFilter,
  organizerName,
  currentUserId,
  canMark,
  onMark,
  inRoom,
  canControlSpeakers,
  currentSpeakerId,
  onInviteSpeaker,
  onToggleSpeak
}) {
  const query = filter.trim().toLowerCase();
  const matched = participants.filter(
    (item) =>
      !query ||
      (item.full_name || "").toLowerCase().includes(query) ||
      (item.email || "").toLowerCase().includes(query) ||
      (item.department_name || "").toLowerCase().includes(query)
  );
  const joined = matched.filter((item) => item.is_online);
  const away = matched.filter((item) => !item.is_online);

  return (
    <div className="people-panel">
      <div className="people-head">
        <div className="search-box">
          <Search size={14} />
          <input
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder="Tìm người tham dự..."
          />
        </div>
        <p className="muted">
          {inRoom} người đang trong phòng · Chủ tọa: {organizerName || "-"}
        </p>
      </div>

      {canControlSpeakers && (
        <SpeakerQueue
          participants={participants}
          currentSpeakerId={currentSpeakerId}
          onInvite={onInviteSpeaker}
        />
      )}

      <div className="people-list">
        <PeopleGroup
          title="Đang trong phòng"
          count={joined.length}
          people={joined}
          currentUserId={currentUserId}
          canMark={canMark}
          onMark={onMark}
          canControlSpeakers={canControlSpeakers}
          currentSpeakerId={currentSpeakerId}
          onInviteSpeaker={onInviteSpeaker}
          onToggleSpeak={onToggleSpeak}
          emptyText="Chưa có ai vào phòng."
        />
        <PeopleGroup
          title="Chưa vào phòng"
          count={away.length}
          people={away}
          currentUserId={currentUserId}
          canMark={canMark}
          onMark={onMark}
          canControlSpeakers={canControlSpeakers}
          currentSpeakerId={currentSpeakerId}
          onInviteSpeaker={onInviteSpeaker}
          onToggleSpeak={onToggleSpeak}
          emptyText="Tất cả đã vào phòng."
        />
      </div>
    </div>
  );
}

/**
 * Hàng đợi phát biểu: ai giơ tay trước đứng trước, chủ tọa bấm mời là người đó
 * được bật mic và hạ tay xuống.
 */
function SpeakerQueue({ participants, currentSpeakerId, onInvite }) {
  const queue = participants
    .filter((item) => item.is_hand_raised)
    .sort(
      (a, b) =>
        new Date(a.hand_raised_at || 0).getTime() -
        new Date(b.hand_raised_at || 0).getTime()
    );
  const speaker = participants.find((item) => item.user_id === currentSpeakerId);

  return (
    <div className="speaker-queue">
      <div className="speaker-now">
        <span className="eyebrow">Đang phát biểu</span>
        {speaker ? (
          <div className="row-actions">
            <strong>{speaker.full_name}</strong>
            <button className="ghost-button" onClick={() => onInvite(null)}>
              Thu lượt
            </button>
          </div>
        ) : (
          <p className="muted small">Chưa mời ai phát biểu.</p>
        )}
      </div>

      <h4>
        Đang giơ tay <em>{queue.length}</em>
      </h4>
      {queue.length === 0 ? (
        <p className="muted small">Chưa có ai xin phát biểu.</p>
      ) : (
        queue.map((item, index) => (
          <div key={item.user_id} className="queue-row">
            <span className="queue-index">{index + 1}</span>
            <div className="people-identity">
              <strong>{item.full_name}</strong>
              <small>{item.department_name || "Thành viên"}</small>
            </div>
            <button className="secondary-button" onClick={() => onInvite(item.user_id)}>
              <Mic size={14} />
              Mời phát biểu
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function PeopleGroup({
  title,
  count,
  people,
  currentUserId,
  canMark,
  onMark,
  canControlSpeakers,
  currentSpeakerId,
  onInviteSpeaker,
  onToggleSpeak,
  emptyText
}) {
  return (
    <div className="people-group">
      <h4>
        {title} <em>{count}</em>
      </h4>
      {people.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        people.map((item) => (
          <div
            key={item.user_id}
            className={`people-row ${item.is_online ? "is-online" : ""}`}
          >
            <span className="people-avatar">{initials(item.full_name)}</span>
            <div className="people-identity">
              <strong>
                {item.full_name}
                {item.user_id === currentUserId ? " (bạn)" : ""}
              </strong>
              <small>
                {item.role_in_meeting === "SECRETARY" ? "Thư ký" : "Thành viên"}
                {item.department_name ? ` · ${item.department_name}` : ""}
              </small>
            </div>
            <div className="people-tags">
              {item.is_hand_raised && (
                <span className="pill warning">
                  <Hand size={11} /> Giơ tay
                </span>
              )}
              <StatusPill value={item.attendance_status || "ABSENT"} />
              {canControlSpeakers && item.user_id !== currentUserId && (
                <button
                  className={`icon-button ${item.can_speak ? "is-on" : ""}`}
                  title={item.can_speak ? "Thu quyền phát biểu" : "Cấp quyền phát biểu"}
                  onClick={() => onToggleSpeak(item.user_id, !item.can_speak)}
                >
                  {item.can_speak ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
              )}
              {canMark && !["PRESENT", "LATE"].includes(item.attendance_status) && (
                <button
                  className="icon-button"
                  title="Đánh dấu có mặt"
                  onClick={() => onMark(item.user_id, "PRESENT")}
                >
                  <UserCheck size={15} />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LiveAgenda({ agenda, currentAgenda, canControl, onCurrent, onDone }) {
  if (agenda.length === 0) return <EmptyState title="Cuộc họp chưa có chương trình nghị sự" />;
  return (
    <div className="live-panel-grid">
      {currentAgenda && (
        <article className="live-focus">
          <span>Đang trình bày</span>
          <strong>{currentAgenda.title}</strong>
          <p>{currentAgenda.presenter_name || "Chưa chỉ định người trình bày"}</p>
        </article>
      )}
      {agenda.map((item, index) => (
        <article key={item.id} className="live-card">
          <div>
            <h3>
              {index + 1}. {item.title}
            </h3>
            <p>{item.description || "Không có mô tả"}</p>
            <div className="row-actions">
              <StatusPill value={item.status} kind="agenda" />
              <span className="muted">{item.duration_minutes || 0} phút</span>
            </div>
          </div>
          {canControl && (
            <div className="row-actions">
              <button
                className="secondary-button"
                onClick={() => onCurrent(item)}
                disabled={item.status === "CURRENT"}
              >
                Trình bày mục này
              </button>
              <button
                className="secondary-button"
                onClick={() => onDone(item)}
                disabled={item.status === "DONE"}
              >
                Đánh dấu xong
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function LiveAttendance({ participants, summary, canMark, onMark }) {
  return (
    <div className="live-attendance">
      <div className="mini-stats">
        <div className="mini-stat success">
          <span>Có mặt</span>
          <strong>{summary.present}</strong>
        </div>
        <div className="mini-stat warning">
          <span>Đi muộn</span>
          <strong>{summary.late}</strong>
        </div>
        <div className="mini-stat">
          <span>Chưa điểm danh</span>
          <strong>{summary.absent}</strong>
        </div>
        <div className="mini-stat info">
          <span>Tỉ lệ tham dự</span>
          <strong>{percent(summary.checkedIn, summary.total)}%</strong>
        </div>
      </div>
      <p className="muted small">
        Người tham dự vào phòng họp khi cuộc họp đang diễn ra sẽ được điểm danh tự động;
        vào sau giờ bắt đầu quá 10 phút thì ghi nhận là đi muộn.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Người tham dự</th>
              <th>Trạng thái</th>
              <th>Hình thức</th>
              <th>Thời gian</th>
              {canMark && <th>Chỉnh tay</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((item) => (
              <tr key={item.user_id}>
                <td>
                  <strong>{item.full_name}</strong>
                  <span className="table-subtext">{item.email}</span>
                </td>
                <td>
                  <StatusPill value={item.attendance_status || "ABSENT"} />
                </td>
                <td>{attendanceMethodLabel(item.attendance_method)}</td>
                <td>{item.checked_in_at ? formatDateTime(item.checked_in_at) : "-"}</td>
                {canMark && (
                  <td className="row-actions">
                    <button
                      className="ghost-button"
                      disabled={!canMark}
                      onClick={() => onMark(item.user_id, "PRESENT")}
                    >
                      Có mặt
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!canMark}
                      onClick={() => onMark(item.user_id, "LATE")}
                    >
                      Muộn
                    </button>
                    <button
                      className="ghost-button danger"
                      disabled={!canMark}
                      onClick={() => onMark(item.user_id, "ABSENT")}
                    >
                      Vắng
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveNotes({
  publicNotes,
  personalNotes,
  onPublicChange,
  onPersonalChange,
  onSavePublic,
  onSavePersonal,
  canEditPublic
}) {
  return (
    <div className="live-notes-grid">
      <label>
        Ghi chú chung {canEditPublic ? "" : "(chỉ chủ tọa và thư ký được sửa)"}
        <textarea
          value={publicNotes}
          onChange={(event) => onPublicChange(event.target.value)}
          readOnly={!canEditPublic}
          placeholder="Nội dung trao đổi, kết luận trong cuộc họp..."
        />
      </label>
      <label>
        Ghi chú cá nhân
        <textarea
          value={personalNotes}
          onChange={(event) => onPersonalChange(event.target.value)}
          placeholder="Chỉ mình bạn nhìn thấy"
        />
      </label>
      <div className="row-actions start">
        {canEditPublic && (
          <button className="primary-button" onClick={onSavePublic}>
            Lưu ghi chú chung
          </button>
        )}
        <button className="secondary-button" onClick={onSavePersonal}>
          Lưu ghi chú cá nhân
        </button>
      </div>
    </div>
  );
}

function LiveVotes({
  votes,
  voteResults,
  canManage,
  participantCount,
  busy,
  onOpen,
  onClose,
  onAnswer,
  onResults
}) {
  if (votes.length === 0) {
    return (
      <EmptyState
        title="Chưa có nội dung biểu quyết"
        description="Chủ tọa tạo biểu quyết trong trang chi tiết cuộc họp, sau đó mở lấy ý kiến tại đây."
      />
    );
  }
  return (
    <div className="vote-board">
      {votes.map((vote) => (
        <VoteCard
          key={vote.id}
          vote={vote}
          result={voteResults[vote.id]}
          canManage={canManage}
          canVote
          participantCount={participantCount}
          busy={busy}
          onOpen={onOpen}
          onClose={onClose}
          onAnswer={onAnswer}
          onResults={onResults}
        />
      ))}
    </div>
  );
}

function LiveTasks({ tasks }) {
  if (tasks.length === 0) return <EmptyState title="Chưa có nhiệm vụ nào được giao" />;
  return (
    <div className="live-panel-grid">
      {tasks.map((task) => (
        <article key={task.id} className="live-card">
          <h3>{task.title}</h3>
          <p>{task.description || "Không có mô tả"}</p>
          <div className="row-actions">
            <StatusPill value={task.priority} />
            <StatusPill value={task.status} />
          </div>
        </article>
      ))}
    </div>
  );
}
