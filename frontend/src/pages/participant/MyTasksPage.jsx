import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { formatDate, formatDateTime } from "../../utils/format.js";

export function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await api.get("/tasks/my");
    setTasks(res.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được nhiệm vụ"));
  }, []);

  async function updateStatus(taskId, status) {
    setError("");
    try {
      await api.put(`/tasks/${taskId}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật được nhiệm vụ");
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Nhiệm vụ được giao</h2>
      </div>
      {error && <div className="alert error">{error}</div>}
      {tasks.length === 0 ? (
        <EmptyState title="Bạn chưa có nhiệm vụ nào" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhiệm vụ</th>
                <th>Cuộc họp</th>
                <th>Deadline</th>
                <th>Ưu tiên</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    <span className="table-subtext">{task.description}</span>
                  </td>
                  <td>
                    <Link to={`/participant/meetings/${task.meeting_id}`}>{task.meeting_title}</Link>
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
                      <button className="secondary-button" onClick={() => updateStatus(task.id, "IN_PROGRESS")}>
                        Đang làm
                      </button>
                    )}
                    {task.status !== "DONE" && (
                      <button className="secondary-button" onClick={() => updateStatus(task.id, "DONE")}>
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
  );
}

