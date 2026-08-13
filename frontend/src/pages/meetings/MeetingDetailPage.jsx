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
  QrCode,
  Save,
  Send,
  Trash2,
  Upload,
  UserPlus,
  Video,
  Vote,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { asArray, formatDate, formatDateTime, toDateTimeLocal } from "../../utils/format.js";

const ROLE_LABELS = {
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên"
};

const tabs = [
  ["overview", "Tổng quan"],
  ["documents", "Tài liệu"],
  ["agenda", "Agenda"],
  ["attendance", "Điểm danh"],
  ["votes", "Biểu quyết"],
  ["minutes", "Biên bản"],
  ["tasks", "Nhiệm vụ"]
];

function voteOptions(vote) {
  if (Array.isArray(vote.options)) return vote.options;
  try {
    return JSON.parse(vote.options || "[]");
  } catch {
    return [];
  }
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
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [newParticipant, setNewParticipant] = useState({ userId: "", roleInMeeting: "MEMBER" });
  const [agendaEditId, setAgendaEditId] = useState(null);
  const [agendaEditForm, setAgendaEditForm] = useState(null);
  const [voteResults, setVoteResults] = useState({});
  const [documentForm, setDocumentForm] = useState({ file: null, displayName: "", description: "" });
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
    options: "Phương án 1\nPhương án 2"
  });
  const [minutesContent, setMinutesContent] = useState("");
  const [taskForm, setTaskForm] = useState({
    assignedTo: "",
    title: "",
    description: "",
    deadline: "",
    priority: "MEDIUM"
  });

  const isOrganizer = user.role === "ORGANIZER";
  const isParticipant = user.role === "PARTICIPANT";
  const hasOnlineRoom = meeting?.meeting_type !== "OFFLINE";
  const livePath = isOrganizer
    ? `/organizer/meetings/${id}/live`
    : isParticipant
      ? `/participant/meetings/${id}/live`
      : null;

  async function load() {
    const res = await api.get(`/meetings/${id}`);
    setMeeting(res.data.data);
    setMinutesContent(res.data.data.minutes?.content || "");
    setTaskForm((current) => ({
      ...current,
      assignedTo: current.assignedTo || res.data.data.participants?.[0]?.user_id || ""
    }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được cuộc họp"));
    if (user.role === "ORGANIZER") {
      Promise.all([api.get("/rooms"), api.get("/users", { params: { limit: 200 } })])
        .then(([roomsRes, usersRes]) => {
          setRooms(roomsRes.data.data || []);
          setAllUsers(usersRes.data.data || []);
        })
        .catch(() => {});
    }
  }, [id, user.role]);

  const participants = asArray(meeting?.participants);
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
    } catch (err) {
      setError(err.response?.data?.message || "Thao tác thất bại");
    }
  }

  const meetingEditable = meeting && !["FINISHED", "CANCELLED"].includes(meeting.status);
  const invitableUsers = allUsers.filter(
    (item) =>
      item.role === "PARTICIPANT" &&
      item.status === "ACTIVE" &&
      !participants.some((p) => p.user_id === item.id)
  );

  function openEdit() {
    setEditForm({
      title: meeting.title || "",
      description: meeting.description || "",
      notes: meeting.notes || "",
      meetingType: meeting.meeting_type,
      startTime: toDateTimeLocal(new Date(meeting.start_time)),
      endTime: toDateTimeLocal(new Date(meeting.end_time)),
      roomId: meeting.room_id || "",
      status: meeting.status
    });
    setEditOpen(true);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (editForm.meetingType !== "ONLINE" && !editForm.roomId) {
      setError("Cuộc họp tập trung / kết hợp cần chọn phòng họp vật lý");
      return;
    }
    await run(
      () =>
        api.put(`/meetings/${id}`, {
          title: editForm.title,
          description: editForm.description || null,
          notes: editForm.notes || null,
          meetingType: editForm.meetingType,
          startTime: editForm.startTime,
          endTime: editForm.endTime,
          roomId: editForm.meetingType === "ONLINE" ? null : editForm.roomId,
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

  async function updateParticipant(userId, patch) {
    await run(
      () => api.put(`/meetings/${id}/participants/${userId}`, patch),
      "Đã cập nhật quyền người tham dự"
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
    if (action === "start" && livePath && hasOnlineRoom) {
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

  async function uploadDocument(event) {
    event.preventDefault();
    if (!documentForm.file) {
      setError("Vui lòng chọn file");
      return;
    }
    const payload = new FormData();
    payload.append("file", documentForm.file);
    payload.append("displayName", documentForm.displayName);
    payload.append("description", documentForm.description);
    await run(
      () => api.post(`/meetings/${id}/documents`, payload, { headers: { "Content-Type": "multipart/form-data" } }),
      isOrganizer ? "Đã upload tài liệu" : "Đã gửi tài liệu chờ duyệt"
    );
    setDocumentForm({ file: null, displayName: "", description: "" });
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

  async function createQr() {
    setError("");
    try {
      const res = await api.post(`/meetings/${id}/attendance/qr`, { expiresInMinutes: 60 });
      setQr(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được QR");
    }
  }

  async function createVote(event) {
    event.preventDefault();
    const options =
      voteForm.type === "MULTIPLE_CHOICE"
        ? voteForm.options.split("\n").map((item) => item.trim()).filter(Boolean)
        : undefined;
    await run(
      () => api.post(`/meetings/${id}/votes`, { ...voteForm, options }),
      "Đã tạo biểu quyết"
    );
    setVoteForm({ title: "", description: "", type: "YES_NO_ABSTAIN", options: "Phương án 1\nPhương án 2" });
  }

  async function answerVote(voteId, answer) {
    await run(() => api.post(`/votes/${voteId}/responses`, { answer }), "Đã gửi phiếu biểu quyết");
  }

  async function loadVoteResults(voteId) {
    setError("");
    try {
      const res = await api.get(`/votes/${voteId}/results`);
      setVoteResults((current) => ({ ...current, [voteId]: res.data.data.results }));
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được kết quả");
    }
  }

  async function saveMinutes(event) {
    event.preventDefault();
    await run(() => api.post(`/meetings/${id}/minutes`, { content: minutesContent }), "Đã lưu biên bản");
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
        {error ? <div className="alert error">{error}</div> : <div className="boot-screen">Đang tải...</div>}
      </div>
    );
  }

  return (
    <div className="page-stack">
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="meeting-hero">
        <div>
          <div className="eyebrow">Cuộc họp</div>
          <h2>{meeting.title}</h2>
          <p>{meeting.description || "Không có mô tả"}</p>
          <div className="detail-line">
            <span>{formatDateTime(meeting.start_time)}</span>
            <span>
              {meeting.meeting_type === "HYBRID"
                ? [meeting.room_name, meeting.online_room_name].filter(Boolean).join(" + ")
                : meeting.room_name || meeting.online_room_name || "Phòng online"}
            </span>
            <StatusPill value={meeting.meeting_type} />
            <StatusPill value={meeting.status} />
          </div>
        </div>
        <div className="hero-actions">
          {livePath && hasOnlineRoom && meeting.status === "ONGOING" && (
            <Link className="primary-button" to={livePath}>
              <Video size={16} />
              Vào phòng đang họp
            </Link>
          )}
          {isOrganizer && (
            <>
            {meetingEditable && (
              <button className="secondary-button" onClick={() => (editOpen ? setEditOpen(false) : openEdit())}>
                <Pencil size={16} />
                {editOpen ? "Đóng chỉnh sửa" : "Chỉnh sửa"}
              </button>
            )}
            {["UPCOMING", "DRAFT"].includes(meeting.status) && (
              <button
                className={hasOnlineRoom ? "primary-button" : "secondary-button"}
                onClick={() => changeMeetingStatus("start")}
              >
                {hasOnlineRoom && <Video size={16} />}
                {hasOnlineRoom ? "Bắt đầu & vào phòng" : "Bắt đầu"}
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

      {isOrganizer && editOpen && editForm && (
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
                value={editForm.meetingType}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    meetingType: e.target.value,
                    roomId:
                      e.target.value === "ONLINE"
                        ? ""
                        : editForm.roomId || rooms[0]?.id || ""
                  })
                }
              >
                <option value="ONLINE">Trực tuyến</option>
                <option value="HYBRID">Kết hợp</option>
                <option value="OFFLINE">Tập trung</option>
              </select>
            </label>
            <label>
              Phòng họp vật lý
              <select
                value={editForm.roomId}
                onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })}
                disabled={editForm.meetingType === "ONLINE"}
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
            <h2>Người tham dự ({participants.length})</h2>
          </div>
          {isOrganizer && meetingEditable && (
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
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
                    {isOrganizer && <th>Quyền trong họp</th>}
                    <th>Lời mời</th>
                    <th>Điểm danh</th>
                    {isOrganizer && meetingEditable && <th></th>}
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
                        {isOrganizer && meetingEditable ? (
                          <select
                            className="table-select"
                            value={item.role_in_meeting || "MEMBER"}
                            onChange={(e) =>
                              updateParticipant(item.user_id, { roleInMeeting: e.target.value })
                            }
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          ROLE_LABELS[item.role_in_meeting] || item.role_in_meeting
                        )}
                      </td>
                      {isOrganizer && (
                        <td>
                          <div className="person-config">
                            <label className="perm-toggle" title="Quyền phát biểu (mic/camera)">
                              <input
                                type="checkbox"
                                checked={item.can_speak !== false}
                                disabled={!meetingEditable}
                                onChange={(e) =>
                                  updateParticipant(item.user_id, { canSpeak: e.target.checked })
                                }
                              />
                              <Mic size={13} />
                              Phát biểu
                            </label>
                            <label className="perm-toggle" title="Quyền chia sẻ màn hình">
                              <input
                                type="checkbox"
                                checked={Boolean(item.can_share_screen)}
                                disabled={!meetingEditable}
                                onChange={(e) =>
                                  updateParticipant(item.user_id, {
                                    canShareScreen: e.target.checked
                                  })
                                }
                              />
                              <MonitorUp size={13} />
                              Chia sẻ
                            </label>
                            <label className="perm-toggle" title="Quyền tải tài liệu lên">
                              <input
                                type="checkbox"
                                checked={Boolean(item.can_upload_document)}
                                disabled={!meetingEditable}
                                onChange={(e) =>
                                  updateParticipant(item.user_id, {
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
                        <StatusPill value={item.invitation_status} />
                      </td>
                      <td>
                        <StatusPill value={item.attendance_status || "ABSENT"} />
                      </td>
                      {isOrganizer && meetingEditable && (
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
            <h2>Tài liệu cuộc họp</h2>
          </div>
          {(isOrganizer || isParticipant) && (
            <form className="inline-form" onSubmit={uploadDocument}>
              <input type="file" onChange={(e) => setDocumentForm({ ...documentForm, file: e.target.files[0] })} />
              <input
                placeholder="Tên hiển thị"
                value={documentForm.displayName}
                onChange={(e) => setDocumentForm({ ...documentForm, displayName: e.target.value })}
              />
              <input
                placeholder="Mô tả"
                value={documentForm.description}
                onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })}
              />
              <button className="primary-button">
                <FileText size={16} />
                Upload
              </button>
            </form>
          )}
          {asArray(meeting.documents).length === 0 ? (
            <EmptyState title="Chưa có tài liệu" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tài liệu</th>
                    <th>Người gửi</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {meeting.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.display_name}</strong>
                        <span className="table-subtext">{doc.original_name}</span>
                      </td>
                      <td>{doc.uploaded_by_name}</td>
                      <td>
                        <StatusPill value={doc.status} />
                      </td>
                      <td className="row-actions">
                        <button className="icon-button" title="Tải xuống" onClick={() => downloadBlob(`/documents/${doc.id}/download`, doc.original_name)}>
                          <Download size={16} />
                        </button>
                        {isOrganizer && doc.status === "PENDING" && (
                          <>
                            <button className="icon-button" title="Duyệt" onClick={() => run(() => api.put(`/documents/${doc.id}/approve`))}>
                              <Check size={16} />
                            </button>
                            <button className="icon-button danger" title="Từ chối" onClick={() => run(() => api.put(`/documents/${doc.id}/reject`))}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {isOrganizer && (
                          <button className="icon-button danger" title="Xóa" onClick={() => run(() => api.delete(`/documents/${doc.id}`))}>
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

      {activeTab === "agenda" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Chương trình họp</h2>
          </div>
          {isOrganizer && (
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
                        <StatusPill value={item.status} />
                      </div>
                      {isOrganizer && (
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
            <h2>Điểm danh</h2>
            {isOrganizer && (
              <button className="secondary-button" onClick={createQr}>
                <QrCode size={16} />
                Tạo QR
              </button>
            )}
            {isParticipant && (
              <button className="primary-button" onClick={() => run(() => api.post(`/meetings/${id}/attendance/checkin`, {}), "Đã điểm danh")}>
                <Check size={16} />
                Điểm danh
              </button>
            )}
          </div>
          {qr?.qrDataUrl && (
            <div className="qr-box">
              <img src={qr.qrDataUrl} alt="Attendance QR" />
              <span>Token hết hạn: {formatDateTime(qr.data.expires_at)}</span>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Người tham dự</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                  {isOrganizer && <th></th>}
                </tr>
              </thead>
              <tbody>
                {participants.map((item) => (
                  <tr key={item.user_id}>
                    <td>{item.full_name}</td>
                    <td>
                      <StatusPill value={item.attendance_status || "ABSENT"} />
                    </td>
                    <td>{formatDateTime(item.checked_in_at)}</td>
                    {isOrganizer && (
                      <td className="row-actions">
                        <button
                          className="secondary-button"
                          onClick={() =>
                            run(() =>
                              api.put(`/meetings/${id}/attendance/${item.user_id}`, { status: "PRESENT" })
                            )
                          }
                        >
                          Có mặt
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() =>
                            run(() => api.put(`/meetings/${id}/attendance/${item.user_id}`, { status: "LATE" }))
                          }
                        >
                          Muộn
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
            <h2>Biểu quyết</h2>
          </div>
          {isOrganizer && (
            <form className="form-grid four compact-form" onSubmit={createVote}>
              <label>
                Câu hỏi
                <input
                  value={voteForm.title}
                  onChange={(e) => setVoteForm({ ...voteForm, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Loại
                <select value={voteForm.type} onChange={(e) => setVoteForm({ ...voteForm, type: e.target.value })}>
                  <option value="YES_NO_ABSTAIN">YES/NO/ABSTAIN</option>
                  <option value="MULTIPLE_CHOICE">Nhiều lựa chọn</option>
                </select>
              </label>
              <label className="wide">
                Mô tả
                <input
                  value={voteForm.description}
                  onChange={(e) => setVoteForm({ ...voteForm, description: e.target.value })}
                />
              </label>
              {voteForm.type === "MULTIPLE_CHOICE" && (
                <label className="wide">
                  Phương án, mỗi dòng một lựa chọn
                  <textarea value={voteForm.options} onChange={(e) => setVoteForm({ ...voteForm, options: e.target.value })} />
                </label>
              )}
              <button className="primary-button">
                <Vote size={16} />
                Tạo vote
              </button>
            </form>
          )}
          {asArray(meeting.votes).length === 0 ? (
            <EmptyState title="Chưa có biểu quyết" />
          ) : (
            <div className="vote-list">
              {meeting.votes.map((vote) => (
                <article key={vote.id} className="vote-row">
                  <div>
                    <h3>{vote.title}</h3>
                    <p>{vote.description}</p>
                    <StatusPill value={vote.status} />
                    <span className="muted"> {vote.response_count} phiếu</span>
                  </div>
                  {isParticipant && vote.status === "OPEN" && !vote.my_answer && (
                    <div className="option-row">
                      {voteOptions(vote).map((option) => (
                        <button key={option} className="secondary-button" onClick={() => answerVote(vote.id, option)}>
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                  {vote.my_answer && <div className="muted">Bạn đã chọn: {vote.my_answer}</div>}
                  <div className="row-actions">
                    {isOrganizer && vote.status === "OPEN" && (
                      <button className="secondary-button" onClick={() => run(() => api.put(`/votes/${vote.id}/close`))}>
                        Đóng vote
                      </button>
                    )}
                    <button className="secondary-button" onClick={() => loadVoteResults(vote.id)}>
                      Kết quả
                    </button>
                  </div>
                  {voteResults[vote.id] && (
                    <div className="result-bars">
                      {voteResults[vote.id].map((item) => (
                        <div key={item.answer}>
                          <span>{item.answer}</span>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "minutes" && (
        <section className="panel">
          <div className="section-heading row">
            <h2>Biên bản</h2>
            {meeting.minutes && (
              <button className="secondary-button" onClick={() => downloadBlob(`/minutes/${meeting.minutes.id}/pdf`, `minutes-${meeting.id}.pdf`)}>
                <Download size={16} />
                PDF
              </button>
            )}
          </div>
          {isOrganizer ? (
            <form className="form-grid" onSubmit={saveMinutes}>
              <textarea
                className="minutes-editor"
                value={minutesContent}
                onChange={(e) => setMinutesContent(e.target.value)}
                placeholder="Nhập nội dung biên bản..."
                required
              />
              <div className="row-actions start">
                <button className="primary-button">
                  <Save size={16} />
                  Lưu biên bản
                </button>
                {meeting.minutes && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => run(() => api.put(`/minutes/${meeting.minutes.id}/publish`), "Đã công bố biên bản")}
                  >
                    <Send size={16} />
                    Công bố
                  </button>
                )}
              </div>
              {meeting.minutes && <StatusPill value={meeting.minutes.status} />}
            </form>
          ) : meeting.minutes ? (
            <article className="minutes-view">
              <StatusPill value={meeting.minutes.status} />
              <p>{meeting.minutes.content}</p>
            </article>
          ) : (
            <EmptyState title="Biên bản chưa được công bố" />
          )}
        </section>
      )}

      {activeTab === "tasks" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Nhiệm vụ sau họp</h2>
          </div>
          {isOrganizer && (
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
                        {(isOrganizer || task.assigned_to === user.id) && task.status !== "DONE" && (
                          <button
                            className="secondary-button"
                            onClick={() => run(() => api.put(`/tasks/${task.id}/status`, { status: "DONE" }))}
                          >
                            Hoàn thành
                          </button>
                        )}
                        {isOrganizer && (
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
