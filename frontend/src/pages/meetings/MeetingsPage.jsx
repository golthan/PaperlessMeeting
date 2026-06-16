import { CalendarPlus, Eye, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { formatDateTime, toDateTimeLocal } from "../../utils/format.js";

function detailHref(role, id) {
  const base =
    role === "ADMIN" ? "/admin/meetings" : role === "ORGANIZER" ? "/organizer/meetings" : "/participant/meetings";
  return `${base}/${id}`;
}

const initialMeetingForm = {
  title: "",
  description: "",
  startTime: toDateTimeLocal(),
  endTime: toDateTimeLocal(new Date(Date.now() + 2 * 60 * 60 * 1000)),
  roomId: "",
  participantIds: [],
  notes: ""
};

export function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialMeetingForm);
  const [showForm, setShowForm] = useState(user.role === "ORGANIZER");
  const [error, setError] = useState("");

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
    setMeetings(meetingRes.data.data || meetingRes.data.data?.data || meetingRes.data.data || meetingRes.data);
    if (roomsRes) {
      setRooms(roomsRes.data.data);
      setForm((current) => ({ ...current, roomId: current.roomId || roomsRes.data.data[0]?.id || "" }));
    }
    if (usersRes) setUsers(usersRes.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được cuộc họp"));
  }, [user.role]);

  async function createMeeting(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/meetings", form);
      setForm(initialMeetingForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được cuộc họp");
    }
  }

  async function invitation(id, action) {
    setError("");
    try {
      await api.put(`/meetings/${id}/participants/invitation/${action}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật lời mời");
    }
  }

  return (
    <div className="page-stack">
      {user.role === "ORGANIZER" && (
        <section className="panel">
          <div className="section-heading row">
            <h2>Tạo cuộc họp</h2>
            <button className="secondary-button" onClick={() => setShowForm(!showForm)}>
              <CalendarPlus size={16} />
              {showForm ? "Ẩn form" : "Tạo mới"}
            </button>
          </div>
          {showForm && (
            <form className="form-grid four" onSubmit={createMeeting}>
              <label className="wide">
                Tên cuộc họp
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
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
                Phòng họp
                <select
                  value={form.roomId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  required
                >
                  <option value="">Chọn phòng</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.capacity})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Người tham dự
                <select
                  multiple
                  value={form.participantIds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      participantIds: Array.from(e.target.selectedOptions).map((option) => option.value)
                    })
                  }
                >
                  {participantUsers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name} - {item.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Mô tả
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="wide">
                Ghi chú
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              {error && <div className="alert error">{error}</div>}
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
          <h2>{user.role === "PARTICIPANT" ? "Cuộc họp được mời" : "Danh sách cuộc họp"}</h2>
        </div>
        {meetings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên cuộc họp</th>
                  <th>Thời gian</th>
                  <th>Phòng</th>
                  <th>Trạng thái</th>
                  {user.role === "PARTICIPANT" && <th>Lời mời</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <span className="table-subtext">{item.organizer_name}</span>
                    </td>
                    <td>
                      {formatDateTime(item.start_time)}
                      <span className="table-subtext">{formatDateTime(item.end_time)}</span>
                    </td>
                    <td>{item.room_name}</td>
                    <td>
                      <StatusPill value={item.status} />
                    </td>
                    {user.role === "PARTICIPANT" && (
                      <td>
                        <StatusPill value={item.invitation_status} />
                        <div className="mini-actions">
                          <button onClick={() => invitation(item.id, "accept")}>Nhận</button>
                          <button onClick={() => invitation(item.id, "decline")}>Từ chối</button>
                        </div>
                      </td>
                    )}
                    <td className="row-actions">
                      <Link className="icon-link" title="Xem chi tiết" to={detailHref(user.role, item.id)}>
                        <Eye size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

