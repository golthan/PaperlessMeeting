import {
  CalendarPlus,
  Check,
  Clock,
  DoorOpen,
  Eye,
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
import { formatDateTime } from "../../utils/format.js";
import { MeetingWizard } from "./MeetingWizard.jsx";

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
    return meeting.online_room_name || "Phòng online sẽ tạo khi bắt đầu";
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

export function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(user.role === "ORGANIZER");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyMeetingId, setBusyMeetingId] = useState(null);

  const participantUsers = useMemo(
    () => users.filter((item) => item.role === "PARTICIPANT" && item.status === "ACTIVE"),
    [users]
  );

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
    if (roomsRes) setRooms(roomsRes.data.data || []);
    if (usersRes) setUsers(usersRes.data.data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được cuộc họp"));
  }, [user.role]);

  async function createMeeting(payload) {
    setError("");
    setMessage("");
    setCreating(true);
    try {
      await api.post("/meetings", payload);
      setMessage(`Đã tạo cuộc họp "${payload.title}" và gửi lời mời tới ${payload.participants.length} người`);
      setShowForm(false);
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được cuộc họp");
      return false;
    } finally {
      setCreating(false);
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
            <>
              {error && <div className="alert error">{error}</div>}
              <MeetingWizard
                rooms={rooms}
                users={participantUsers}
                onSubmit={createMeeting}
                submitting={creating}
              />
            </>
          )}
        </section>
      )}

      {message && <div className="alert success">{message}</div>}
      {error && (!showForm || user.role !== "ORGANIZER") && (
        <div className="alert error">{error}</div>
      )}

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
