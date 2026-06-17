import {
  CalendarPlus,
  Check,
  Clock,
  DoorOpen,
  Eye,
  Plus,
  Users,
  Video,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { formatDateTime, toDateTimeLocal } from "../../utils/format.js";

function detailHref(role, id) {
  const base =
    role === "ADMIN"
      ? "/admin/meetings"
      : role === "ORGANIZER"
        ? "/organizer/meetings"
        : "/participant/meetings";
  return `${base}/${id}`;
}

function liveHref(role, id) {
  if (role === "ORGANIZER") return `/organizer/meetings/${id}/live`;
  if (role === "PARTICIPANT") return `/participant/meetings/${id}/live`;
  return null;
}

function meetingPlace(meeting) {
  if (meeting.meeting_type === "ONLINE") {
    return meeting.online_room_name || "Phòng Jitsi sẽ tạo khi bắt đầu";
  }
  if (meeting.meeting_type === "HYBRID") {
    return [meeting.room_name, meeting.online_room_name].filter(Boolean).join(" + ");
  }
  return meeting.room_name || "Chưa chọn phòng";
}

function canJoinLive(role, meeting) {
  return (
    liveHref(role, meeting.id) &&
    meeting.status === "ONGOING" &&
    meeting.meeting_type !== "OFFLINE"
  );
}

function canStartLive(role, meeting) {
  return (
    role === "ORGANIZER" &&
    ["UPCOMING", "DRAFT"].includes(meeting.status) &&
    meeting.meeting_type !== "OFFLINE"
  );
}

const initialMeetingForm = {
  title: "",
  description: "",
  startTime: toDateTimeLocal(),
  endTime: toDateTimeLocal(new Date(Date.now() + 2 * 60 * 60 * 1000)),
  roomId: "",
  meetingType: "HYBRID",
  participantIds: [],
  notes: ""
};

export function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialMeetingForm);
  const [showForm, setShowForm] = useState(user.role === "ORGANIZER");
  const [error, setError] = useState("");
  const [busyMeetingId, setBusyMeetingId] = useState(null);

  const participantUsers = useMemo(
    () => users.filter((item) => item.role === "PARTICIPANT" && item.status === "ACTIVE"),
    [users]
  );
  const selectedParticipantCount = form.participantIds.length;

  async function load() {
    let path = "/meetings";
    if (user.role === "ORGANIZER") path = "/meetings/my-created";
    if (user.role === "PARTICIPANT") path = "/meetings/my-invited";

    const requests = [api.get(path)];
    if (user.role === "ORGANIZER") {
      requests.push(api.get("/rooms"));
      requests.push(api.get("/users", { params: { limit: 200 } }));
    }
    const [meetingRes, roomsRes, usersRes] = await Promise.all(requests);
    setMeetings(meetingRes.data.data || []);
    if (roomsRes) {
      const nextRooms = roomsRes.data.data || [];
      setRooms(nextRooms);
      setForm((current) => ({
        ...current,
        roomId: current.roomId || nextRooms[0]?.id || ""
      }));
    }
    if (usersRes) {
      const nextUsers = usersRes.data.data || [];
      const nextParticipantIds = nextUsers
        .filter((item) => item.role === "PARTICIPANT" && item.status === "ACTIVE")
        .map((item) => item.id);
      setUsers(nextUsers);
      setForm((current) => ({
        ...current,
        participantIds:
          current.participantIds.length > 0 ? current.participantIds : nextParticipantIds
      }));
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được cuộc họp"));
  }, [user.role]);

  async function createMeeting(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        roomId: form.meetingType === "ONLINE" ? null : form.roomId,
        participantIds: form.participantIds
      };
      await api.post("/meetings", payload);
      setForm({
        ...initialMeetingForm,
        roomId: rooms[0]?.id || "",
        participantIds: participantUsers.map((item) => item.id)
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được cuộc họp");
    }
  }

  async function invitation(id, action) {
    setError("");
    try {
      await api.put(`/meetings/${id}/invitation/${action}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật lời mời");
    }
  }

  async function startAndJoin(meeting) {
    const href = liveHref(user.role, meeting.id);
    if (!href) return;
    setError("");
    setBusyMeetingId(meeting.id);
    try {
      await api.put(`/meetings/${meeting.id}/start`);
      navigate(href);
    } catch (err) {
      setError(err.response?.data?.message || "Không bắt đầu được cuộc họp");
    } finally {
      setBusyMeetingId(null);
    }
  }

  function toggleParticipant(userId) {
    setForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(userId)
        ? current.participantIds.filter((id) => id !== userId)
        : [...current.participantIds, userId]
    }));
  }

  function selectAllParticipants() {
    setForm((current) => ({
      ...current,
      participantIds: participantUsers.map((item) => item.id)
    }));
  }

  function clearParticipants() {
    setForm((current) => ({ ...current, participantIds: [] }));
  }

  return (
    <div className="page-stack">
      {user.role === "ORGANIZER" && (
        <section className="panel create-meeting-panel">
          <div className="section-heading row">
            <div>
              <span className="eyebrow">Organizer workspace</span>
              <h2>Tạo cuộc họp</h2>
            </div>
            <button className="secondary-button" onClick={() => setShowForm(!showForm)}>
              <CalendarPlus size={16} />
              {showForm ? "Thu gọn" : "Tạo mới"}
            </button>
          </div>
          {showForm && (
            <form className="form-grid four" onSubmit={createMeeting}>
              <label className="wide">
                Tên cuộc họp
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ví dụ: Họp triển khai kế hoạch tháng"
                  required
                />
              </label>
              <label>
                Bắt đầu
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  required
                />
              </label>
              <label>
                Kết thúc
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  required
                />
              </label>
              <label>
                Loại họp
                <select
                  value={form.meetingType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      meetingType: e.target.value,
                      roomId: e.target.value === "ONLINE" ? "" : form.roomId || rooms[0]?.id || ""
                    })
                  }
                >
                  <option value="ONLINE">Online</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="OFFLINE">Offline</option>
                </select>
              </label>
              <label>
                Phòng vật lý
                <select
                  value={form.roomId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  required={form.meetingType !== "ONLINE"}
                  disabled={form.meetingType === "ONLINE"}
                >
                  <option value="">Không cần phòng</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.capacity})
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Mô tả
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mục tiêu, phạm vi, nội dung chính..."
                />
              </label>
              <div className="wide participant-picker">
                <div className="participant-picker-head">
                  <div>
                    <span className="eyebrow">Người tham dự</span>
                    <strong>
                      {selectedParticipantCount}/{participantUsers.length} participant được mời
                    </strong>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="ghost-button" onClick={selectAllParticipants}>
                      Chọn tất cả
                    </button>
                    <button type="button" className="ghost-button" onClick={clearParticipants}>
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="participant-check-grid">
                  {participantUsers.map((item) => (
                    <label key={item.id} className="participant-check">
                      <input
                        type="checkbox"
                        checked={form.participantIds.includes(item.id)}
                        onChange={() => toggleParticipant(item.id)}
                      />
                      <span>
                        <strong>{item.full_name}</strong>
                        <small>{item.email}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="wide">
                Ghi chú nội bộ
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              {error && <div className="alert error wide">{error}</div>}
              <button className="primary-button">
                <Plus size={16} />
                Tạo cuộc họp
              </button>
            </form>
          )}
        </section>
      )}

      {error && user.role !== "ORGANIZER" && <div className="alert error">{error}</div>}

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {user.role === "PARTICIPANT" ? "Lời mời của tôi" : "Meeting hub"}
            </span>
            <h2>{user.role === "PARTICIPANT" ? "Cuộc họp được mời" : "Danh sách cuộc họp"}</h2>
          </div>
        </div>
        {meetings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="meeting-grid">
            {meetings.map((item) => (
              <article key={item.id} className={`meeting-card ${item.status === "ONGOING" ? "is-live" : ""}`}>
                <div className="meeting-card-main">
                  <div className="meeting-card-top">
                    <StatusPill value={item.meeting_type} />
                    <StatusPill value={item.status} />
                    {user.role === "PARTICIPANT" && <StatusPill value={item.invitation_status} />}
                  </div>
                  <h3>{item.title}</h3>
                  <div className="meeting-meta-grid">
                    <span>
                      <Clock size={15} />
                      {formatDateTime(item.start_time)}
                    </span>
                    <span>
                      <DoorOpen size={15} />
                      {meetingPlace(item)}
                    </span>
                    <span>
                      <Users size={15} />
                      {item.participant_count ?? "-"} người tham dự
                    </span>
                  </div>
                  {item.organizer_name && (
                    <p className="meeting-owner">Organizer: {item.organizer_name}</p>
                  )}
                  {item.online_room_url && (
                    <p className="meeting-online-room">{item.online_room_url}</p>
                  )}
                </div>
                <div className="meeting-card-actions">
                  {user.role === "PARTICIPANT" && (
                    <div className="invite-actions">
                      <button className="ghost-button" onClick={() => invitation(item.id, "accept")}>
                        <Check size={15} />
                        Nhận
                      </button>
                      <button className="ghost-button" onClick={() => invitation(item.id, "decline")}>
                        <X size={15} />
                        Từ chối
                      </button>
                    </div>
                  )}
                  {canStartLive(user.role, item) && (
                    <button
                      className="primary-button"
                      onClick={() => startAndJoin(item)}
                      disabled={busyMeetingId === item.id}
                    >
                      <Video size={16} />
                      {busyMeetingId === item.id ? "Đang mở..." : "Bắt đầu & vào phòng"}
                    </button>
                  )}
                  {canJoinLive(user.role, item) && (
                    <Link className="primary-button" to={liveHref(user.role, item.id)}>
                      <Video size={16} />
                      Vào phòng
                    </Link>
                  )}
                  <Link className="secondary-button" to={detailHref(user.role, item.id)}>
                    <Eye size={16} />
                    Chi tiết
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
