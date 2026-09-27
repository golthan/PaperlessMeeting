import { Activity, Bell, CalendarDays, CheckSquare, DoorOpen, Network, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { StatGrid } from "../components/StatGrid.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { useNotifications } from "../notifications/NotificationContext.jsx";
import { formatDateTime } from "../utils/format.js";

const labels = {
  totalUsers: "Người dùng",
  pendingUsers: "Đăng ký chờ duyệt",
  totalMeetings: "Cuộc họp",
  ongoingMeetings: "Đang diễn ra",
  upcomingMeetings: "Sắp diễn ra",
  totalRooms: "Phòng họp",
  totalVotes: "Biểu quyết",
  invitedMeetings: "Lời mời họp",
  pendingInvites: "Chờ phản hồi",
  openVotes: "Vote đang mở"
};

const quickLinksByRole = {
  ADMIN: [
    ["Người dùng", "/admin/users", Users],
    ["Phòng ban", "/admin/departments", Network],
    ["Phòng họp", "/admin/rooms", DoorOpen],
    ["Cuộc họp", "/admin/meetings", CalendarDays],
    ["Thông báo", "/admin/notifications", Bell]
  ],
  ORGANIZER: [
    ["Cuộc họp của tôi", "/organizer/meetings", CalendarDays],
    ["Thông báo", "/organizer/notifications", Bell]
  ],
  PARTICIPANT: [
    ["Cuộc họp được mời", "/participant/meetings", CalendarDays],
    ["Nhiệm vụ của tôi", "/participant/tasks", CheckSquare],
    ["Thông báo", "/participant/notifications", Bell]
  ]
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export function DashboardPage() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const key = user.role.toLowerCase();
    api
      .get(`/dashboard/${key}`)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || "Không tải được dashboard"));
  }, [user.role]);

  const stats = useMemo(() => {
    if (!data) return [];
    return Object.entries(labels)
      .filter(([key]) => data[key] !== undefined)
      .map(([key, label]) => ({ key, label, value: data[key] }));
  }, [data]);

  const quickLinks = quickLinksByRole[user.role] || [];

  return (
    <div className="page-stack">
      {error && <div className="alert error">{error}</div>}

      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Phòng họp không giấy tờ</span>
          <h2>
            {greeting()}, {user.full_name || user.email}
          </h2>
          <p>
            {unread > 0
              ? `Bạn có ${unread} thông báo chưa đọc cần xem.`
              : "Bạn đã cập nhật đầy đủ thông báo mới nhất."}
          </p>
        </div>
        <div className="quick-links">
          {quickLinks.map(([label, href, Icon]) => (
            <Link key={href} className="quick-link" to={href}>
              <Icon size={17} />
              <span>{label}</span>
              {href.endsWith("/notifications") && unread > 0 && <em>{unread}</em>}
            </Link>
          ))}
        </div>
      </section>

      <StatGrid stats={stats} />

      {data?.recentActivity && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Nhật ký truy vết</span>
              <h2>Hoạt động gần đây trên hệ thống</h2>
            </div>
            <Link className="secondary-button" to="/admin/audit-logs">
              Xem toàn bộ nhật ký
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Chưa có hoạt động nào"
              description="Mọi thao tác trên tài liệu, biên bản, biểu quyết và tài khoản sẽ được ghi lại ở đây."
            />
          ) : (
            <ul className="activity-list">
              {data.recentActivity.map((item) => (
                <li key={item.id}>
                  <time>{formatDateTime(item.created_at)}</time>
                  <div>
                    <strong>{item.actor_name || "Hệ thống"}</strong>
                    <span className="activity-action">{item.actionLabel}</span>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data?.tasksByStatus && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Sau cuộc họp</span>
              <h2>Nhiệm vụ theo trạng thái</h2>
            </div>
          </div>
          {data.tasksByStatus.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Chưa có nhiệm vụ nào"
              description="Nhiệm vụ được giao trong cuộc họp sẽ được tổng hợp ở đây."
            />
          ) : (
            <div className="status-summary">
              {data.tasksByStatus.map((item) => (
                <div key={item.status}>
                  <StatusPill value={item.status} />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
