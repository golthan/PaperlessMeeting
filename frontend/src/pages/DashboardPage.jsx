import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { StatGrid } from "../components/StatGrid.jsx";

const labels = {
  totalUsers: "Người dùng",
  totalMeetings: "Cuộc họp",
  ongoingMeetings: "Đang diễn ra",
  upcomingMeetings: "Sắp diễn ra",
  totalRooms: "Phòng họp",
  totalVotes: "Biểu quyết",
  invitedMeetings: "Lời mời họp",
  pendingInvites: "Chờ phản hồi",
  openVotes: "Vote đang mở"
};

export function DashboardPage() {
  const { user } = useAuth();
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

  return (
    <div className="page-stack">
      {error && <div className="alert error">{error}</div>}
      <StatGrid stats={stats} />
      {data?.tasksByStatus && (
        <section className="panel">
          <div className="section-heading">
            <h2>Nhiệm vụ theo trạng thái</h2>
          </div>
          <div className="status-summary">
            {data.tasksByStatus.length === 0 && <span className="muted">Chưa có nhiệm vụ</span>}
            {data.tasksByStatus.map((item) => (
              <div key={item.status}>
                <span>{item.status}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

