import { CheckCircle2, ClipboardList, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { StatGrid } from "../../components/StatGrid.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatDate, formatDateTime } from "../../utils/format.js";

const TASK_FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "TODO", label: "Chưa làm" },
  { value: "IN_PROGRESS", label: "Đang làm" },
  { value: "DONE", label: "Hoàn thành" },
  { value: "OVERDUE", label: "Quá hạn" }
];

export function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  async function load() {
    const res = await api.get("/tasks/my");
    setTasks(res.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được nhiệm vụ"));
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const stats = useMemo(
    () => [
      { key: "tasks", label: "Tổng nhiệm vụ", value: tasks.length },
      {
        key: "ongoingMeetings",
        label: "Đang làm",
        value: tasks.filter((task) => task.status === "IN_PROGRESS").length
      },
      {
        key: "tasks",
        label: "Hoàn thành",
        value: tasks.filter((task) => task.status === "DONE").length
      },
      {
        key: "pendingInvites",
        label: "Quá hạn",
        value: tasks.filter((task) => task.status === "OVERDUE").length
      }
    ],
    [tasks]
  );

  const visible = useMemo(
    () => (filter === "ALL" ? tasks : tasks.filter((task) => task.status === filter)),
    [tasks, filter]
  );

  async function updateStatus(task, status) {
    setError("");
    setBusyId(task.id);
    try {
      await api.put(`/tasks/${task.id}/status`, { status });
      await load();
      toast.success(
        status === "DONE" ? "Đã hoàn thành nhiệm vụ" : "Đã cập nhật trạng thái nhiệm vụ",
        task.title
      );
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật được nhiệm vụ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Sau cuộc họp"
        title="Nhiệm vụ của tôi"
        subtitle="Các công việc được giao trong những cuộc họp bạn tham dự"
        backTo="/participant/dashboard"
        backLabel="Về Dashboard"
        actions={
          <button
            className="ghost-button"
            onClick={() => {
              load();
              toast.info("Đã làm mới danh sách nhiệm vụ");
            }}
          >
            <RefreshCw size={15} />
            Làm mới
          </button>
        }
      />

      <StatGrid stats={stats} />

      <section className="panel">
        <div className="filter-chips">
          {TASK_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip${filter === item.value ? " is-active" : ""}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Chưa có nhiệm vụ nào trong mục này"
            description="Nhiệm vụ được giao trong cuộc họp sẽ tự động xuất hiện tại đây."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nhiệm vụ</th>
                  <th>Cuộc họp</th>
                  <th>Hạn xử lý</th>
                  <th>Ưu tiên</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      <span className="table-subtext">{task.description}</span>
                    </td>
                    <td>
                      <Link to={`/participant/meetings/${task.meeting_id}`}>
                        {task.meeting_title}
                      </Link>
                      <span className="table-subtext">{formatDateTime(task.start_time)}</span>
                    </td>
                    <td>{formatDate(task.deadline)}</td>
                    <td>
                      <StatusPill value={task.priority} />
                    </td>
                    <td>
                      <StatusPill value={task.status} />
                    </td>
                    <td className="row-actions">
                      {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
                        <button
                          className="secondary-button"
                          disabled={busyId === task.id}
                          onClick={() => updateStatus(task, "IN_PROGRESS")}
                        >
                          <Play size={15} />
                          Đang làm
                        </button>
                      )}
                      {task.status !== "DONE" && (
                        <button
                          className="primary-button"
                          disabled={busyId === task.id}
                          onClick={() => updateStatus(task, "DONE")}
                        >
                          <CheckCircle2 size={16} />
                          Xong
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
    </div>
  );
}
