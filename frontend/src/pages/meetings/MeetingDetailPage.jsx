import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ListChecks,
  MonitorUp,
  Mic,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  UserPlus,
  Video,
  VideoOff,
  Vote,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { DocumentWorkspace } from "../../components/DocumentWorkspace.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { MinutesPanel } from "../../components/MinutesPanel.jsx";
import { VoteCard } from "../../components/VoteCard.jsx";
import { asArray, formatDate, formatDateTime, toDateTimeLocal } from "../../utils/format.js";
import {
  attendanceMethodLabel,
  attendanceSummary,
  hasOnlineRoom,
  MEETING_MODES,
  meetingPlaceLabel,
  meetingTypeLabel,
  percent,
  resolveMeetingType
} from "../../utils/meeting.js";
import { voteAnswerLabel } from "../../utils/meeting.js";

const ROLE_LABELS = {
  CHAIRMAN: "Chủ tọa",
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên"
};

/** Vai trò gán được cho người khác; chủ tọa đổi bằng nút riêng nên không có ở đây. */
const ASSIGNABLE_ROLES = ["SECRETARY", "MEMBER"];

const BASE_TABS = [
  ["overview", "Tổng quan"],
  ["documents", "Tài liệu"],
  ["discussion", "Ý kiến"],
  ["agenda", "Chương trình"],
  ["attendance", "Điểm danh"],
  ["votes", "Biểu quyết"],
  ["minutes", "Biên bản"],
  ["tasks", "Nhiệm vụ"]
];

const SPEAKER_MODE_LABELS = {
  FREE: "Tự do phát biểu",
  MODERATED: "Chủ tọa mời mới được phát biểu"
};

function Fact({ label, children }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <strong className="fact-value">{children || "-"}</strong>
    </div>
  );
}

/** Khoảng thời gian họp, viết gọn theo giờ nếu hai đầu cùng một ngày. */
function meetingTimeRange(meeting) {
  const start = new Date(meeting.start_time);
  const end = new Date(meeting.end_time);
  const sameDay = start.toDateString() === end.toDateString();
  const endText = sameDay
    ? end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : formatDateTime(meeting.end_time);
  return `${formatDateTime(meeting.start_time)} → ${endText}`;
}

function meetingDuration(meeting) {
  const minutes = Math.round(
    (new Date(meeting.end_time) - new Date(meeting.start_time)) / 60000
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

async function downloadBlob(path, filename) {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MeetingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [newParticipant, setNewParticipant] = useState({ userId: "", roleInMeeting: "MEMBER" });
  const [agendaEditId, setAgendaEditId] = useState(null);
  const [agendaEditForm, setAgendaEditForm] = useState(null);
  const [voteResults, setVoteResults] = useState({});
  const [agendaForm, setAgendaForm] = useState({
    title: "",
    description: "",
    presenterId: "",
    durationMinutes: 10
  });
  const [voteForm, setVoteForm] = useState({
    title: "",
    description: "",
    type: "YES_NO_ABSTAIN",
    isAnonymous: false,
    options: "Phương án 1\nPhương án 2"
  });
  const [auditLogs, setAuditLogs] = useState([]);
  // Ý kiến nêu trong phòng họp và phần tổng hợp của thư ký / AI.
  const [roomMessages, setRoomMessages] = useState([]);
  const [publicNotes, setPublicNotes] = useState(null);
  // Hộp tài liệu dùng chung với phòng họp, nhưng ở đây chạy hoàn toàn bằng REST
  // nên vẫn mở được sau khi cuộc họp kết thúc — phòng họp realtime thì đã đóng.
  const [documentMessages, setDocumentMessages] = useState([]);
  const [documentNotes, setDocumentNotes] = useState({});
  const [documentQuestions, setDocumentQuestions] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const [taskForm, setTaskForm] = useState({
    assignedTo: "",
    title: "",
    description: "",
    deadline: "",
    priority: "MEDIUM"
  });

  // Vai trò toàn cục chỉ còn quyết định đường dẫn; mọi quyền thao tác lấy từ
  // vai trò trong chính cuộc họp này do máy chủ trả về.
  const isOrganizer = user.role === "ORGANIZER";
  const isParticipant = user.role === "PARTICIPANT";
  const perm = meeting?.permissions || {};
  const onlineRoomOn = hasOnlineRoom(meeting);
  const canSignMinutes = perm.canSignMinutes === true;
  // Cột quyền hiện cho cả chủ tọa lẫn thư ký, nhưng mỗi người chỉ bấm được
  // đúng ô thuộc thẩm quyền của mình.
  const showPermissionColumn = Boolean(
    perm.canManageParticipants || perm.canControlSpeakers
  );
  const tabs = perm.canViewAuditLog ? [...BASE_TABS, ["audit", "Nhật ký"]] : BASE_TABS;
  const livePath = isOrganizer
    ? `/organizer/meetings/${id}/live`
    : isParticipant
      ? `/participant/meetings/${id}/live`
      : null;
  const meetingsListPath = isOrganizer
    ? "/organizer/meetings"
    : isParticipant
      ? "/participant/meetings"
      : "/admin/meetings";

  async function load() {
    const res = await api.get(`/meetings/${id}`);
    setMeeting(res.data.data);
    setTaskForm((current) => ({
      ...current,
      assignedTo: current.assignedTo || res.data.data.participants?.[0]?.user_id || ""
    }));
  }

  /** Thảo luận gắn với từng tài liệu, tách khỏi chat chung của phòng họp. */
  const loadDocumentMessages = useCallback(async () => {
    try {
      const res = await api.get(`/meetings/${id}/chat`, { params: { limit: 200 } });
      setDocumentMessages((res.data.data || []).filter((item) => item.document_id));
    } catch {
      setDocumentMessages([]);
    }
  }, [id]);

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

  const loadDocumentQuestions = useCallback(async (documentId) => {
    try {
      const res = await api.get(`/documents/${documentId}/questions`);
      setDocumentQuestions((current) => ({ ...current, [documentId]: res.data.data || [] }));
    } catch {
      // Không tải được thì để trống.
    }
  }, []);

  /**
   * Ý kiến nêu trong phòng họp — phần "thảo luận chung", không gắn tài liệu nào.
   *
   * Đọc bằng REST nên xem lại được cả khi cuộc họp đã kết thúc và phòng realtime
   * đã đóng, đúng tinh thần hồ sơ cuộc họp còn nguyên sau khi họp xong.
   */
  const loadDiscussion = useCallback(async () => {
    const [chat, notes] = await Promise.allSettled([
      api.get(`/meetings/${id}/chat`, { params: { scope: "room", limit: 200 } }),
      api.get(`/meetings/${id}/public-notes`)
    ]);
    setRoomMessages(chat.status === "fulfilled" ? chat.value.data.data || [] : []);
    setPublicNotes(notes.status === "fulfilled" ? notes.value.data.data : null);
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được cuộc họp"));
  }, [id]);

  /**
   * Danh bạ và danh sách phòng để mời thêm người / đổi phòng.
   *
   * Điều kiện là quyền TRONG cuộc họp chứ không phải vai trò toàn cục: thư ký
   * hoặc chủ tọa có thể là một tài khoản Participant, mà trước đây nhánh này chỉ
   * chạy cho ORGANIZER nên họ mở ra chỉ thấy ô chọn rỗng.
   */
  useEffect(() => {
    if (!perm.canManageParticipants && !perm.canEditMeeting) return;
    api
      .get(`/meetings/${id}/scheduling-options`)
      .then((res) => {
        setRooms(res.data.data?.rooms || []);
        setAllUsers(res.data.data?.invitableUsers || []);
      })
      .catch(() => {});
  }, [id, perm.canManageParticipants, perm.canEditMeeting]);

  // Nhật ký của riêng cuộc họp này — theo quyền trong cuộc họp, giống hệt điều
  // kiện hiện tab, nếu không thì tab mở ra mà không bao giờ có dữ liệu.
  useEffect(() => {
    if (activeTab !== "audit" || !perm.canViewAuditLog) return;
    api
      .get(`/meetings/${id}/audit-logs`, { params: { limit: 100 } })
      .then((res) => setAuditLogs(res.data.data || []))
      .catch(() => setAuditLogs([]));
  }, [activeTab, id, perm.canViewAuditLog]);

  // Mọi thông báo thành công/lỗi của trang đều bật thêm toast ở góc phải trên.
  useEffect(() => {
    if (message) toast.success(message);
  }, [message, toast]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  // Tài liệu là phần dùng lại nhiều nhất sau khi họp xong, nên nạp thảo luận
  // ngay khi mở tab thay vì chờ người dùng bấm vào từng file.
  useEffect(() => {
    if (activeTab === "documents") loadDocumentMessages();
    if (activeTab === "discussion") loadDiscussion();
  }, [activeTab, loadDocumentMessages, loadDiscussion]);

  // Tính năng AI chỉ hiện khi backend đã cấu hình khoá API.
  useEffect(() => {
    api
      .get("/documents/ai/status")
      .then((res) => setAiEnabled(Boolean(res.data.data?.configured)))
      .catch(() => setAiEnabled(false));
  }, []);

  const participants = asArray(meeting?.participants);
  const myParticipant = participants.find((item) => item.user_id === user.id);
  const checkedIn = ["PRESENT", "LATE"].includes(myParticipant?.attendance_status);
  const attendance = useMemo(() => attendanceSummary(participants), [participants]);
  const chairman = participants.find((item) => item.role_in_meeting === "CHAIRMAN");
  const secretary = participants.find((item) => item.role_in_meeting === "SECRETARY");
  const participantOptions = useMemo(
    () => participants.map((item) => ({ value: item.user_id, label: `${item.full_name} - ${item.email}` })),
    [participants]
  );

  async function run(action, success = "Đã cập nhật") {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Thao tác thất bại");
      return false;
    }
  }

  const meetingEditable = meeting && !["FINISHED", "CANCELLED"].includes(meeting.status);
  // Máy chủ đã loại người có trong cuộc họp, nhưng vẫn lọc lại để danh sách
  // không hiện người vừa được mời xong trong lúc chờ tải lại.
  const invitableUsers = allUsers.filter(
    (item) => !participants.some((p) => p.user_id === item.id)
  );

  function openEdit() {
    setEditForm({
      title: meeting.title || "",
      description: meeting.description || "",
      notes: meeting.notes || "",
      meetingMode: meeting.meeting_type === "ONLINE" ? "ONLINE" : "OFFLINE",
      onlineRoom: meeting.meeting_type !== "OFFLINE",
      startTime: toDateTimeLocal(new Date(meeting.start_time)),
      endTime: toDateTimeLocal(new Date(meeting.end_time)),
      roomId: meeting.room_id || "",
      status: meeting.status
    });
    setEditOpen(true);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (editForm.meetingMode === "OFFLINE" && !editForm.roomId) {
      setError("Cuộc họp tập trung cần chọn phòng họp vật lý");
      return;
    }
    await run(
      () =>
        api.put(`/meetings/${id}`, {
          title: editForm.title,
          description: editForm.description || null,
          notes: editForm.notes || null,
          meetingType: resolveMeetingType(editForm.meetingMode, editForm.onlineRoom),
          // Ô datetime-local không kèm múi giờ; gửi ISO để server không hiểu nhầm thành giờ UTC
          startTime: new Date(editForm.startTime).toISOString(),
          endTime: new Date(editForm.endTime).toISOString(),
          roomId: editForm.meetingMode === "ONLINE" ? null : editForm.roomId,
          status: editForm.status
        }),
      "Đã lưu thay đổi cuộc họp"
    );
    setEditOpen(false);
  }

  async function addParticipant(event) {
    event.preventDefault();
    if (!newParticipant.userId) {
      setError("Chọn người cần mời thêm");
      return;
    }
    await run(
      () =>
        api.post(`/meetings/${id}/participants`, {
          userIds: [newParticipant.userId],
          roleInMeeting: newParticipant.roleInMeeting,
          canSpeak: true,
          canUploadDocument: true,
          canShareScreen: false
        }),
      "Đã thêm người tham dự"
    );
    setNewParticipant({ userId: "", roleInMeeting: "MEMBER" });
  }

  async function saveDocumentNotes(documentId, content) {
    try {
      const res = await api.put(`/documents/${documentId}/notes`, { content });
      setDocumentNotes((current) => ({ ...current, [documentId]: res.data.data }));
      setMessage("Đã lưu ghi chú tài liệu");
    } catch (err) {
      setError(err.response?.data?.message || "Không lưu được ghi chú tài liệu");
    }
  }

  /**
   * Gửi tin qua REST rồi tự chèn bản ghi trả về: trang này không mở socket nên
   * không nhận được bản máy chủ phát lại.
   */
  async function sendDocumentMessage(documentId, content) {
    try {
      const res = await api.post(`/meetings/${id}/chat`, { content, documentId });
      const sent = res.data.data;
      setDocumentMessages((current) =>
        current.some((item) => item.id === sent.id) ? current : [...current, sent]
      );
    } catch (err) {
      setError(err.response?.data?.message || "Không gửi được tin nhắn");
    }
  }

  async function askDocumentAi(document, question) {
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

  async function summarizeDocumentAi(document) {
    try {
      await api.post(`/documents/${document.id}/summary`);
      setMessage("AI đã tóm tắt xong tài liệu");
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Không tóm tắt được tài liệu");
      return false;
    }
  }

  /** Đăng tài liệu từ hộp làm việc; trả bản ghi để hộp mở luôn file vừa gửi. */
  async function uploadDocumentFile(formData) {
    try {
      const res = await api.post(`/meetings/${id}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setMessage(
        res.data.data.status === "APPROVED"
          ? "Đã đăng tài liệu cho cả cuộc họp"
          : "Đã gửi tài liệu, chờ chủ tọa duyệt"
      );
      await load();
      return res.data.data;
    } catch (err) {
      setError(err.response?.data?.message || "Không đăng được tài liệu");
      return null;
    }
  }

  async function updateParticipantPermissions(userId, patch) {
    await run(
      () => api.put(`/meetings/${id}/participants/${userId}/permissions`, patch),
      "Đã cập nhật quyền người tham dự"
    );
  }

  /** Quyền phát biểu — chủ tọa quyết định. */
  async function updateParticipantSpeak(userId, canSpeak) {
    await run(
      () => api.put(`/meetings/${id}/participants/${userId}/speak`, { canSpeak }),
      canSpeak ? "Đã cấp quyền phát biểu" : "Đã thu quyền phát biểu"
    );
  }

  /** Chỉ định thư ký — chủ tọa quyết định. */
  async function updateParticipantRole(userId, roleInMeeting) {
    await run(
      () => api.put(`/meetings/${id}/participants/${userId}/role`, { roleInMeeting }),
      "Đã đổi vai trò trong cuộc họp"
    );
  }

  async function removeParticipant(userId) {
    await run(
      () => api.delete(`/meetings/${id}/participants/${userId}`),
      "Đã xóa người tham dự"
    );
  }

  const sortedAgenda = useMemo(() => {
    const items = asArray(meeting?.agenda);
    return [...items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at?.localeCompare?.(b.created_at ?? "") || 0
    );
  }, [meeting?.agenda]);

  async function moveAgenda(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= sortedAgenda.length) return;
    const next = [...sortedAgenda];
    [next[index], next[target]] = [next[target], next[index]];
    await run(
      () =>
        api.put(`/meetings/${id}/agenda/reorder`, {
          items: next.map((item, sortOrder) => ({ id: item.id, sortOrder }))
        }),
      "Đã sắp xếp lại chương trình"
    );
  }

  function openAgendaEdit(item) {
    setAgendaEditId(item.id);
    setAgendaEditForm({
      title: item.title || "",
      description: item.description || "",
      presenterId: item.presenter_id || "",
      durationMinutes: item.duration_minutes || 0
    });
  }

  async function saveAgendaEdit(event) {
    event.preventDefault();
    await run(
      () =>
        api.put(`/agenda/${agendaEditId}`, {
          title: agendaEditForm.title,
          description: agendaEditForm.description || null,
          presenterId: agendaEditForm.presenterId || null,
          durationMinutes: Number(agendaEditForm.durationMinutes || 0)
        }),
      "Đã cập nhật nội dung chương trình"
    );
    setAgendaEditId(null);
    setAgendaEditForm(null);
  }

  async function changeMeetingStatus(action) {
    if (action === "start" && livePath) {
      setError("");
      setMessage("");
      try {
        await api.put(`/meetings/${id}/start`);
        navigate(livePath);
      } catch (err) {
        setError(err.response?.data?.message || "Không bắt đầu được cuộc họp");
      }
      return;
    }
    await run(() => api.put(`/meetings/${id}/${action}`), "Đã cập nhật trạng thái cuộc họp");
  }

  /** Bật / tắt phòng video cho cuộc họp tập trung. */
  async function changeOnlineRoom(enabled) {
    await run(
      () => api.put(`/meetings/${id}/online-room`, { enabled }),
      enabled
        ? "Đã bật phòng họp trực tuyến và báo cho người tham dự"
        : "Đã tắt phòng họp trực tuyến"
    );
  }

  async function addAgenda(event) {
    event.preventDefault();
    await run(
      () =>
        api.post(`/meetings/${id}/agenda`, {
          ...agendaForm,
          presenterId: agendaForm.presenterId || null,
          durationMinutes: Number(agendaForm.durationMinutes)
        }),
      "Đã thêm agenda"
    );
    setAgendaForm({ title: "", description: "", presenterId: "", durationMinutes: 10 });
  }

  /** Tạo biểu quyết: mặc định lưu nháp, openNow = true thì mở lấy ý kiến ngay. */
  async function createVote(event, openNow = false) {
    event?.preventDefault?.();
    if (!voteForm.title.trim()) {
      setError("Nhập nội dung cần biểu quyết");
      return;
    }
    const options =
      voteForm.type === "MULTIPLE_CHOICE"
        ? voteForm.options
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    const ok = await run(
      () =>
        api.post(`/meetings/${id}/votes`, {
          title: voteForm.title,
          description: voteForm.description,
          type: voteForm.type,
          isAnonymous: voteForm.isAnonymous,
          options,
          openNow
        }),
      openNow ? "Đã tạo và mở biểu quyết" : "Đã lưu biểu quyết ở dạng nháp"
    );
    if (ok) {
      setVoteForm({
        title: "",
        description: "",
        type: "YES_NO_ABSTAIN",
        isAnonymous: false,
        options: ["Phương án 1", "Phương án 2"].join("\n")
      });
    }
  }

  async function openVote(vote) {
    await run(
      () => api.put(`/votes/${vote.id}/open`),
      "Đã mở biểu quyết, người tham dự nhận được thông báo"
    );
  }

  async function closeVote(vote) {
    const ok = await run(() => api.put(`/votes/${vote.id}/close`), "Đã chốt biểu quyết");
    if (ok) await loadVoteResults(vote.id);
  }

  async function deleteVote(vote) {
    await run(() => api.delete(`/votes/${vote.id}`), "Đã xoá biểu quyết nháp");
  }

  async function answerVote(voteId, answer) {
    await run(
      () => api.post(`/votes/${voteId}/responses`, { answer }),
      `Đã gửi phiếu: ${voteAnswerLabel(answer)}`
    );
  }

  async function loadVoteResults(voteId) {
    setError("");
    try {
      const res = await api.get(`/votes/${voteId}/results`);
      setVoteResults((current) => ({
        ...current,
        [voteId]: { results: res.data.data.results, summary: res.data.data.summary }
      }));
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được kết quả");
    }
  }

  async function createTask(event) {
    event.preventDefault();
    await run(() => api.post(`/meetings/${id}/tasks`, taskForm), "Đã giao nhiệm vụ");
    setTaskForm({
      assignedTo: participantOptions[0]?.value || "",
      title: "",
      description: "",
      deadline: "",
      priority: "MEDIUM"
    });
  }

  if (!meeting) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Cuộc họp"
          title="Chi tiết cuộc họp"
          backTo={meetingsListPath}
          backLabel="Danh sách cuộc họp"
        />
        {error ? <div className="alert error">{error}</div> : <div className="boot-screen">Đang tải...</div>}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Hồ sơ cuộc họp"
        title={meeting.title}
        subtitle={`${formatDateTime(meeting.start_time)} · ${meeting.status}`}
        backTo={meetingsListPath}
        backLabel="Danh sách cuộc họp"
      />

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="meeting-hero">
        <div>
          <div className="eyebrow">Cuộc họp</div>
          <h2>{meeting.title}</h2>
          <p>{meeting.description || "Không có mô tả"}</p>
          <div className="detail-line">
            <span>{formatDateTime(meeting.start_time)}</span>
            <span>{meetingPlaceLabel(meeting)}</span>
            <StatusPill value={meeting.meeting_type} />
            <StatusPill value={meeting.status} />
          </div>
          <p className="muted small">
            {onlineRoomOn
              ? "Phòng họp trực tuyến đang bật — người dự có thể tham gia từ xa bằng video."
              : "Cuộc họp tập trung theo chuẩn không giấy tờ. Bật phòng trực tuyến khi có người cần dự từ xa."}
          </p>
        </div>
        <div className="hero-actions">
          {livePath && meeting.status === "ONGOING" && (
            <Link className="primary-button" to={livePath}>
              <Video size={16} />
              Vào phòng họp
            </Link>
          )}
          {perm.canEditMeeting && (
            <>
              {meetingEditable && meeting.meeting_type !== "ONLINE" && (
                <button
                  className="secondary-button"
                  onClick={() => changeOnlineRoom(!onlineRoomOn)}
                >
                  {onlineRoomOn ? <VideoOff size={16} /> : <Video size={16} />}
                  {onlineRoomOn ? "Tắt phòng trực tuyến" : "Bật phòng trực tuyến"}
                </button>
              )}
              {meetingEditable && (
                <button
                  className="secondary-button"
                  onClick={() => (editOpen ? setEditOpen(false) : openEdit())}
                >
                  <Pencil size={16} />
                  {editOpen ? "Đóng chỉnh sửa" : "Chỉnh sửa"}
                </button>
              )}
              {["UPCOMING", "DRAFT"].includes(meeting.status) && (
                <button className="primary-button" onClick={() => changeMeetingStatus("start")}>
                  <Video size={16} />
                  Bắt đầu &amp; vào phòng
                </button>
              )}
              {meeting.status === "ONGOING" && (
                <button className="secondary-button" onClick={() => changeMeetingStatus("finish")}>
                  Kết thúc
                </button>
              )}
              {!["FINISHED", "CANCELLED"].includes(meeting.status) && (
                <button className="danger-button" onClick={() => changeMeetingStatus("cancel")}>
                  Hủy
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {perm.canEditMeeting && editOpen && editForm && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Chỉnh sửa cuộc họp</span>
              <h2>Cập nhật thông tin</h2>
            </div>
          </div>
          <form className="form-grid four" onSubmit={saveEdit}>
            <label className="wide">
              Tên cuộc họp
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                required
                maxLength={255}
              />
            </label>
            <label>
              Bắt đầu
              <input
                type="datetime-local"
                value={editForm.startTime}
                onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                required
              />
            </label>
            <label>
              Kết thúc
              <input
                type="datetime-local"
                value={editForm.endTime}
                onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                required
              />
            </label>
            <label>
              Hình thức
              <select
                value={editForm.meetingMode}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    meetingMode: e.target.value,
                    roomId:
                      e.target.value === "ONLINE"
                        ? ""
                        : editForm.roomId || rooms[0]?.id || ""
                  })
                }
              >
                {MEETING_MODES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phòng họp vật lý
              <select
                value={editForm.roomId}
                onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })}
                disabled={editForm.meetingMode === "ONLINE"}
              >
                <option value="">-- Chọn phòng --</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id} disabled={room.status !== "AVAILABLE"}>
                    {room.name} · {room.capacity} chỗ
                    {room.status !== "AVAILABLE" ? " (không khả dụng)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="inline-note wide">
              <Video size={14} />
              {editForm.meetingMode === "ONLINE"
                ? "Cuộc họp trực tuyến luôn có sẵn phòng video."
                : editForm.onlineRoom
                  ? "Cuộc họp này đang bật thêm phòng trực tuyến. Tắt bằng nút ở đầu trang."
                  : "Chưa bật phòng trực tuyến. Bật bằng nút ở đầu trang khi có người cần dự từ xa."}
            </p>
            {["DRAFT", "UPCOMING"].includes(meeting.status) && (
              <label>
                Trạng thái
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="DRAFT">Bản nháp</option>
                  <option value="UPCOMING">Đã lên lịch</option>
                </select>
              </label>
            )}
            <label className="wide">
              Mục tiêu / nội dung chính
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
              />
            </label>
            <label className="wide">
              Ghi chú nội bộ
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
              />
            </label>
            <div className="row-actions start wide">
              <button className="primary-button" type="submit">
                <Save size={16} />
                Lưu thay đổi
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditOpen(false)}
              >
                <X size={16} />
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      <nav className="tabbar">
        {tabs.map(([key, label]) => (
          <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Thông tin cuộc họp</span>
              <h2>Những gì đã chốt khi lập lịch</h2>
            </div>
          </div>
          <div className="fact-grid">
            <Fact label="Thời gian">{meetingTimeRange(meeting)}</Fact>
            <Fact label="Thời lượng dự kiến">{meetingDuration(meeting)}</Fact>
            <Fact label="Địa điểm">
              {meetingPlaceLabel(meeting)}
              {meeting.room_location ? ` · ${meeting.room_location}` : ""}
            </Fact>
            <Fact label="Hình thức">{meetingTypeLabel(meeting.meeting_type)}</Fact>
            <Fact label="Trạng thái">
              <StatusPill value={meeting.status} />
            </Fact>
            <Fact label="Chủ tọa">{chairman?.full_name}</Fact>
            <Fact label="Thư ký">{secretary?.full_name}</Fact>
            <Fact label="Người lập lịch">{meeting.organizer_name}</Fact>
            <Fact label="Chế độ phát biểu">
              {SPEAKER_MODE_LABELS[meeting.speaker_mode || "FREE"]}
            </Fact>
            <Fact label="Tạo lúc">{formatDateTime(meeting.created_at)}</Fact>
            <Fact label="Thành phần">{participants.length} người</Fact>
            <Fact label="Tài liệu">{asArray(meeting.documents).length} tệp</Fact>
            <Fact label="Nội dung chương trình">
              {asArray(meeting.agenda).length} mục
            </Fact>
            <Fact label="Biểu quyết">{asArray(meeting.votes).length} phiên</Fact>
            <Fact label="Nhiệm vụ">{asArray(meeting.tasks).length} việc</Fact>
            <Fact label="Biên bản">
              {meeting.minutes ? <StatusPill value={meeting.minutes.status} /> : "Chưa có"}
            </Fact>
          </div>

          {meeting.description && (
            <div className="fact-block">
              <span className="fact-label">Mô tả</span>
              <p>{meeting.description}</p>
            </div>
          )}
          {meeting.notes && (
            <div className="fact-block">
              <span className="fact-label">Ghi chú khi lập lịch</span>
              <p>{meeting.notes}</p>
            </div>
          )}
          {asArray(meeting.agenda).length > 0 && (
            <div className="fact-block">
              <span className="fact-label">Chương trình dự kiến</span>
              <ol className="fact-agenda">
                {asArray(meeting.agenda).map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="muted small">
                      {item.presenter_name ? `${item.presenter_name} · ` : ""}
                      {item.duration_minutes || 0} phút
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {activeTab === "overview" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Người tham dự ({participants.length})</h2>
          </div>
          {perm.canManageParticipants && meetingEditable && (
            <form className="inline-form" onSubmit={addParticipant}>
              <select
                value={newParticipant.userId}
                onChange={(e) => setNewParticipant({ ...newParticipant, userId: e.target.value })}
              >
                <option value="">-- Mời thêm người tham dự --</option>
                {invitableUsers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name} · {item.email}
                  </option>
                ))}
              </select>
              <select
                value={newParticipant.roleInMeeting}
                onChange={(e) =>
                  setNewParticipant({ ...newParticipant, roleInMeeting: e.target.value })
                }
              >
                {ASSIGNABLE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              <span />
              <button className="primary-button">
                <UserPlus size={16} />
                Mời
              </button>
            </form>
          )}
          {participants.length === 0 ? (
            <EmptyState title="Chưa có người tham dự" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Phòng ban</th>
                    <th>Vai trò</th>
                    {showPermissionColumn && <th>Quyền trong họp</th>}
                    <th>Lời mời</th>
                    <th>Điểm danh</th>
                    {perm.canManageParticipants && meetingEditable && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {participants.map((item) => (
                    <tr key={item.user_id}>
                      <td>
                        <strong>{item.full_name}</strong>
                        <span className="table-subtext">{item.email}</span>
                      </td>
                      <td>{item.department_name || "-"}</td>
                      <td>
                        {perm.canEditMeeting &&
                        meetingEditable &&
                        item.role_in_meeting !== "CHAIRMAN" ? (
                          <select
                            className="table-select"
                            value={item.role_in_meeting || "MEMBER"}
                            onChange={(e) =>
                              updateParticipantRole(item.user_id, e.target.value)
                            }
                          >
                            <option value="MEMBER">{ROLE_LABELS.MEMBER}</option>
                            <option value="SECRETARY">{ROLE_LABELS.SECRETARY}</option>
                          </select>
                        ) : (
                          ROLE_LABELS[item.role_in_meeting] || item.role_in_meeting
                        )}
                      </td>
                      {showPermissionColumn && (
                        <td>
                          <div className="person-config">
                            <label
                              className="perm-toggle"
                              title="Quyền phát biểu — chủ tọa quyết định"
                            >
                              <input
                                type="checkbox"
                                checked={item.can_speak !== false}
                                disabled={!meetingEditable || !perm.canControlSpeakers}
                                onChange={(e) =>
                                  updateParticipantSpeak(item.user_id, e.target.checked)
                                }
                              />
                              <Mic size={13} />
                              Phát biểu
                            </label>
                            <label
                              className="perm-toggle"
                              title="Quyền chia sẻ màn hình — thư ký quyết định"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(item.can_share_screen)}
                                disabled={!meetingEditable || !perm.canManageParticipants}
                                onChange={(e) =>
                                  updateParticipantPermissions(item.user_id, {
                                    canShareScreen: e.target.checked
                                  })
                                }
                              />
                              <MonitorUp size={13} />
                              Chia sẻ
                            </label>
                            <label
                              className="perm-toggle"
                              title="Quyền gửi tài liệu — thư ký quyết định"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(item.can_upload_document)}
                                disabled={!meetingEditable || !perm.canManageParticipants}
                                onChange={(e) =>
                                  updateParticipantPermissions(item.user_id, {
                                    canUploadDocument: e.target.checked
                                  })
                                }
                              />
                              <Upload size={13} />
                              Tài liệu
                            </label>
                          </div>
                        </td>
                      )}
                      <td>
                        <StatusPill value={item.invitation_status} kind="invitation" />
                      </td>
                      <td>
                        <StatusPill value={item.attendance_status || "ABSENT"} />
                      </td>
                      {perm.canManageParticipants && meetingEditable && (
                        <td className="row-actions">
                          <button
                            className="icon-button danger"
                            title="Xóa khỏi cuộc họp"
                            onClick={() => removeParticipant(item.user_id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "documents" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Tài liệu</span>
              <h2>Hồ sơ tài liệu cuộc họp</h2>
            </div>
          </div>
          <p className="muted small">
            {meetingEditable
              ? "Chọn một tài liệu để xem nội dung, trao đổi và ghi chú cùng cả phòng."
              : "Cuộc họp đã khép lại nhưng hồ sơ tài liệu vẫn mở: xem nội dung, đọc lại trao đổi, ghi chú và tóm tắt AI đều còn nguyên."}
          </p>
          <DocumentWorkspace
            documents={asArray(meeting.documents)}
            messages={documentMessages}
            notes={documentNotes}
            questions={documentQuestions}
            canManage={perm.canReviewDocument && meetingEditable}
            canUpload={perm.canUploadDocument && meetingEditable}
            canEditNotes={perm.canEditSharedNotes}
            canSummarize={perm.canEditSharedNotes}
            aiEnabled={aiEnabled}
            meetingClosed={!meetingEditable}
            currentUserId={user.id}
            onUpload={uploadDocumentFile}
            onApprove={(doc) =>
              run(() => api.put(`/documents/${doc.id}/approve`), "Đã duyệt tài liệu")
            }
            onReject={(doc) =>
              run(() => api.put(`/documents/${doc.id}/reject`), "Đã từ chối tài liệu")
            }
            onDelete={(doc) =>
              run(() => api.delete(`/documents/${doc.id}`), "Đã xoá tài liệu")
            }
            onSend={sendDocumentMessage}
            onLoadNotes={loadDocumentNotes}
            onSaveNotes={saveDocumentNotes}
            onLoadQuestions={loadDocumentQuestions}
            onAsk={askDocumentAi}
            onSummarize={summarizeDocumentAi}
          />
        </section>
      )}

      {activeTab === "discussion" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ý kiến</span>
              <h2>Thảo luận chung của cuộc họp</h2>
            </div>
          </div>
          <p className="muted small">
            Toàn bộ ý kiến nêu trong phòng họp, đọc lại được cả sau khi cuộc họp
            kết thúc. Trao đổi gắn với từng tài liệu nằm ở tab Tài liệu.
          </p>

          {publicNotes?.ai_summary && (
            <div className="fact-block ai-summary">
              <span className="fact-label">
                Bản tổng hợp của AI
                {publicNotes.ai_summary_message_count
                  ? ` · từ ${publicNotes.ai_summary_message_count} ý kiến`
                  : ""}
                {publicNotes.ai_summary_updated_at
                  ? ` · ${formatDateTime(publicNotes.ai_summary_updated_at)}`
                  : ""}
              </span>
              <pre className="summary-text">{publicNotes.ai_summary}</pre>
            </div>
          )}

          {publicNotes?.content && (
            <div className="fact-block">
              <span className="fact-label">
                Ghi chú chung của thư ký
                {publicNotes.updated_by_name ? ` · ${publicNotes.updated_by_name}` : ""}
              </span>
              <pre className="summary-text">{publicNotes.content}</pre>
            </div>
          )}

          {roomMessages.length === 0 ? (
            <EmptyState
              title="Chưa có ý kiến nào"
              description="Ý kiến nêu trong phòng họp trực tuyến sẽ hiện ở đây."
            />
          ) : (
            <ul className="opinion-list">
              {roomMessages.map((item) => (
                <li key={item.id} className="opinion-item">
                  <div className="opinion-head">
                    <strong>{item.sender_name}</strong>
                    <span className="muted small">{formatDateTime(item.created_at)}</span>
                  </div>
                  <p>{item.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === "agenda" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Chương trình họp</h2>
          </div>
          {perm.canManageAgendaItems && (
            <form className="inline-form" onSubmit={addAgenda}>
              <input
                placeholder="Tiêu đề"
                value={agendaForm.title}
                onChange={(e) => setAgendaForm({ ...agendaForm, title: e.target.value })}
                required
              />
              <select
                value={agendaForm.presenterId}
                onChange={(e) => setAgendaForm({ ...agendaForm, presenterId: e.target.value })}
              >
                <option value="">Người trình bày</option>
                {participantOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={agendaForm.durationMinutes}
                onChange={(e) => setAgendaForm({ ...agendaForm, durationMinutes: e.target.value })}
              />
              <input
                placeholder="Mô tả"
                value={agendaForm.description}
                onChange={(e) => setAgendaForm({ ...agendaForm, description: e.target.value })}
              />
              <button className="primary-button">
                <Plus size={16} />
                Thêm
              </button>
            </form>
          )}
          {sortedAgenda.length === 0 ? (
            <EmptyState title="Chưa có agenda" />
          ) : (
            <ol className="agenda-list">
              {sortedAgenda.map((item, index) => (
                <li key={item.id}>
                  {agendaEditId === item.id && agendaEditForm ? (
                    <form className="agenda-edit-form" onSubmit={saveAgendaEdit}>
                      <input
                        value={agendaEditForm.title}
                        onChange={(e) =>
                          setAgendaEditForm({ ...agendaEditForm, title: e.target.value })
                        }
                        required
                      />
                      <div className="agenda-row-sub">
                        <select
                          value={agendaEditForm.presenterId}
                          onChange={(e) =>
                            setAgendaEditForm({ ...agendaEditForm, presenterId: e.target.value })
                          }
                        >
                          <option value="">Người trình bày (tùy chọn)</option>
                          {participantOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="duration-input">
                          <input
                            type="number"
                            min="0"
                            max="480"
                            value={agendaEditForm.durationMinutes}
                            onChange={(e) =>
                              setAgendaEditForm({
                                ...agendaEditForm,
                                durationMinutes: e.target.value
                              })
                            }
                          />
                          <span>phút</span>
                        </div>
                      </div>
                      <input
                        value={agendaEditForm.description}
                        onChange={(e) =>
                          setAgendaEditForm({ ...agendaEditForm, description: e.target.value })
                        }
                        placeholder="Mô tả (tùy chọn)"
                      />
                      <div className="row-actions start">
                        <button className="primary-button" type="submit">
                          <Save size={15} />
                          Lưu
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setAgendaEditId(null);
                            setAgendaEditForm(null);
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div>
                        <strong>
                          {index + 1}. {item.title}
                        </strong>
                        <p>{item.description}</p>
                        <span>
                          {item.presenter_name || "Chưa chọn"} · {item.duration_minutes || 0} phút
                        </span>{" "}
                        <StatusPill value={item.status} kind="agenda" />
                      </div>
                      {perm.canManageAgendaItems && (
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            title="Chuyển lên"
                            disabled={index === 0}
                            onClick={() => moveAgenda(index, -1)}
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="Chuyển xuống"
                            disabled={index === sortedAgenda.length - 1}
                            onClick={() => moveAgenda(index, 1)}
                          >
                            <ChevronDown size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="Sửa"
                            onClick={() => openAgendaEdit(item)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            title="Xóa"
                            onClick={() => run(() => api.delete(`/agenda/${item.id}`))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {activeTab === "attendance" && (
        <section className="panel">
          <div className="section-heading row">
            <div>
              <span className="eyebrow">Điểm danh</span>
              <h2>Thành phần có mặt</h2>
            </div>
            <div className="row-actions">
              {!perm.isChairman && (
                <button
                  className="primary-button"
                  disabled={meeting.status !== "ONGOING" || checkedIn}
                  onClick={() =>
                    run(
                      () => api.post(`/meetings/${id}/attendance/checkin`, {}),
                      "Đã điểm danh"
                    )
                  }
                >
                  <Check size={16} />
                  {checkedIn ? "Bạn đã điểm danh" : "Điểm danh"}
                </button>
              )}
            </div>
          </div>

          <div className="mini-stats">
            <div className="mini-stat success">
              <span>Có mặt</span>
              <strong>{attendance.present}</strong>
            </div>
            <div className="mini-stat warning">
              <span>Đi muộn</span>
              <strong>{attendance.late}</strong>
            </div>
            <div className="mini-stat">
              <span>Chưa điểm danh</span>
              <strong>{attendance.absent}</strong>
            </div>
            <div className="mini-stat info">
              <span>Tỉ lệ tham dự</span>
              <strong>{percent(attendance.checkedIn, attendance.total)}%</strong>
            </div>
          </div>

          <p className="muted small">
            Ba cách ghi nhận: người dự tự bấm điểm danh khi cuộc họp đang diễn ra, tự
            động khi vào phòng họp trên hệ thống, hoặc chủ tọa ghi nhận thủ công. Vào sau
            giờ bắt đầu quá 10 phút được tính là đi muộn; không vào thì để là vắng mặt.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Người tham dự</th>
                  <th>Trạng thái</th>
                  <th>Hình thức</th>
                  <th>Thời gian</th>
                  {perm.canMarkAttendance && <th>Thư ký ghi nhận</th>}
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
                    {perm.canMarkAttendance && (
                      <td className="row-actions">
                        <button
                          className="ghost-button"
                          disabled={!meetingEditable}
                          onClick={() =>
                            run(() =>
                              api.put(`/meetings/${id}/attendance/${item.user_id}`, {
                                status: "PRESENT"
                              })
                            )
                          }
                        >
                          Có mặt
                        </button>
                        <button
                          className="ghost-button"
                          disabled={!meetingEditable}
                          onClick={() =>
                            run(() =>
                              api.put(`/meetings/${id}/attendance/${item.user_id}`, {
                                status: "LATE"
                              })
                            )
                          }
                        >
                          Muộn
                        </button>
                        <button
                          className="ghost-button danger"
                          disabled={!meetingEditable}
                          onClick={() =>
                            run(() =>
                              api.put(`/meetings/${id}/attendance/${item.user_id}`, {
                                status: "ABSENT"
                              })
                            )
                          }
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
        </section>
      )}

      {activeTab === "votes" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Biểu quyết</span>
              <h2>Lấy ý kiến của thành phần dự họp</h2>
            </div>
          </div>

          {perm.canManageTasks && (
            <form className="form-grid four compact-form" onSubmit={createVote}>
              <label className="wide">
                Nội dung cần biểu quyết *
                <input
                  value={voteForm.title}
                  onChange={(e) => setVoteForm({ ...voteForm, title: e.target.value })}
                  placeholder="Ví dụ: Thông qua kế hoạch công tác quý IV"
                  required
                />
              </label>
              <label>
                Hình thức phiếu
                <select
                  value={voteForm.type}
                  onChange={(e) => setVoteForm({ ...voteForm, type: e.target.value })}
                >
                  <option value="YES_NO_ABSTAIN">Tán thành / Không / Không ý kiến</option>
                  <option value="MULTIPLE_CHOICE">Chọn một trong nhiều phương án</option>
                </select>
              </label>
              <label className="perm-toggle self-end">
                <input
                  type="checkbox"
                  checked={voteForm.isAnonymous}
                  onChange={(e) =>
                    setVoteForm({ ...voteForm, isAnonymous: e.target.checked })
                  }
                />
                Biểu quyết kín (không lưu ai chọn gì)
              </label>
              <label className="wide">
                Mô tả thêm
                <input
                  value={voteForm.description}
                  onChange={(e) =>
                    setVoteForm({ ...voteForm, description: e.target.value })
                  }
                />
              </label>
              {voteForm.type === "MULTIPLE_CHOICE" && (
                <label className="wide">
                  Phương án, mỗi dòng một lựa chọn
                  <textarea
                    value={voteForm.options}
                    onChange={(e) => setVoteForm({ ...voteForm, options: e.target.value })}
                  />
                </label>
              )}
              <div className="row-actions start wide">
                <button className="secondary-button" type="submit">
                  <Save size={16} />
                  Lưu nháp
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={(event) => createVote(event, true)}
                >
                  <Vote size={16} />
                  Tạo &amp; mở lấy ý kiến
                </button>
              </div>
            </form>
          )}

          {asArray(meeting.votes).length === 0 ? (
            <EmptyState
              title="Chưa có nội dung biểu quyết"
              description={
                perm.canManageVotes
                  ? "Tạo biểu quyết ở trên, lưu nháp trước rồi mở lấy ý kiến đúng lúc cần."
                  : "Chủ tọa sẽ mở biểu quyết khi cần lấy ý kiến."
              }
            />
          ) : (
            <div className="vote-board">
              {meeting.votes.map((vote) => (
                <VoteCard
                  key={vote.id}
                  vote={vote}
                  result={voteResults[vote.id]}
                  canManage={perm.canManageVotes}
                  canVote
                  participantCount={participants.length}
                  onOpen={openVote}
                  onClose={closeVote}
                  onAnswer={(item, answer) => answerVote(item.id, answer)}
                  onResults={loadVoteResults}
                  onDelete={deleteVote}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "minutes" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Biên bản</span>
              <h2>Biên bản điện tử có ký số</h2>
            </div>
          </div>
          <MinutesPanel
            meetingId={id}
            isOrganizer={perm.canPublishMinutes}
            canSign={canSignMinutes}
            canDraft={perm.canDraftMinutes}
            onNotice={setMessage}
            onError={setError}
          />
        </section>
      )}

      {activeTab === "audit" && perm.canViewAuditLog && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Nhật ký truy vết</span>
              <h2>Ai đã làm gì với cuộc họp này</h2>
            </div>
          </div>
          {auditLogs.length === 0 ? (
            <EmptyState title="Chưa có thao tác nào được ghi nhận" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Thời điểm</th>
                    <th>Người thao tác</th>
                    <th>Hành động</th>
                    <th>Chi tiết</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="nowrap">{formatDateTime(log.created_at)}</td>
                      <td>{log.actor_name || "Khách"}</td>
                      <td>{log.action}</td>
                      <td>{log.description || "-"}</td>
                      <td className="nowrap">{log.ip_address || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "tasks" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Nhiệm vụ sau họp</h2>
          </div>
          {perm.canManageTasks && (
            <form className="form-grid four compact-form" onSubmit={createTask}>
              <label>
                Giao cho
                <select
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                  required
                >
                  {participantOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tiêu đề
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Deadline
                <input
                  type="date"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                />
              </label>
              <label>
                Ưu tiên
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </label>
              <label className="wide">
                Mô tả
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                />
              </label>
              <button className="primary-button">
                <ListChecks size={16} />
                Giao nhiệm vụ
              </button>
            </form>
          )}
          {asArray(meeting.tasks).length === 0 ? (
            <EmptyState title="Chưa có nhiệm vụ" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nhiệm vụ</th>
                    <th>Người nhận</th>
                    <th>Deadline</th>
                    <th>Ưu tiên</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {meeting.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        <span className="table-subtext">{task.description}</span>
                      </td>
                      <td>{task.assigned_to_name}</td>
                      <td>{formatDate(task.deadline)}</td>
                      <td>
                        <StatusPill value={task.priority} />
                      </td>
                      <td>
                        <StatusPill value={task.status} />
                      </td>
                      <td className="row-actions">
                        {(perm.canManageTasks || task.assigned_to === user.id) && task.status !== "DONE" && (
                          <button
                            className="secondary-button"
                            onClick={() => run(() => api.put(`/tasks/${task.id}/status`, { status: "DONE" }))}
                          >
                            Hoàn thành
                          </button>
                        )}
                        {perm.canManageTasks && (
                          <button className="icon-button danger" title="Xóa" onClick={() => run(() => api.delete(`/tasks/${task.id}`))}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
