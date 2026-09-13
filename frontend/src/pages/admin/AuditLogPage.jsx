import { Activity, Download, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { roleHome } from "../../auth/AuthContext.jsx";
import { formatDateTime } from "../../utils/format.js";

const GROUPS = [
  { value: "", label: "Tất cả" },
  { value: "DOCUMENT", label: "Tài liệu" },
  { value: "MINUTES", label: "Biên bản" },
  { value: "MEETING", label: "Cuộc họp" },
  { value: "VOTE", label: "Biểu quyết" },
  { value: "ATTENDANCE", label: "Điểm danh" },
  { value: "ACCOUNT", label: "Tài khoản" }
];

/** Hành động nhạy cảm thì tô màu cảnh báo cho dễ soi. */
const DANGER_ACTIONS = new Set([
  "LOGIN_FAILED",
  "DOCUMENT_DOWNLOAD",
  "DOCUMENT_DELETE",
  "MEETING_DELETE",
  "USER_DELETE",
  "MINUTES_SIGN"
]);

export function AuditLogPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ group: "", action: "", q: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const [logsRes, summaryRes] = await Promise.all([
        api.get("/audit-logs", { params }),
        api.get("/audit-logs/summary")
      ]);
      setLogs(logsRes.data.data || []);
      setTotal(logsRes.data.meta?.total || 0);
      setSummary(summaryRes.data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được nhật ký");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/audit-logs/actions")
      .then((res) => setActions(res.data.data.actions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const actionLabels = useMemo(
    () => Object.fromEntries(actions.map((item) => [item.value, item.label])),
    [actions]
  );

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  /** Xuất nhật ký đang lọc ra CSV để lưu hồ sơ hoặc đưa vào báo cáo. */
  function exportCsv() {
    const header = ["Thời điểm", "Người thao tác", "Vai trò", "Hành động", "Mô tả", "Cuộc họp", "IP"];
    const rows = logs.map((log) => [
      formatDateTime(log.created_at),
      log.actor_name || "",
      log.actor_role || "",
      actionLabels[log.action] || log.action,
      (log.description || "").replace(/"/g, "'"),
      log.meeting_title || "",
      log.ip_address || ""
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nhat-ky-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateFilter(patch) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Quản trị"
        title="Nhật ký truy vết"
        subtitle={`${total} bản ghi khớp bộ lọc`}
        backTo={roleHome("ADMIN")}
        backLabel="Về Dashboard"
        actions={
          <div className="row-actions">
            <button className="secondary-button" onClick={load} disabled={loading}>
              <RefreshCw size={16} />
              Tải lại
            </button>
            <button className="secondary-button" onClick={exportCsv} disabled={logs.length === 0}>
              <Download size={16} />
              Xuất CSV
            </button>
          </div>
        }
      />

      {summary && (
        <div className="mini-stats">
          <div className="mini-stat info">
            <span>Thao tác hôm nay</span>
            <strong>{summary.todayCount}</strong>
          </div>
          {summary.byAction.slice(0, 3).map((item) => (
            <div key={item.action} className="mini-stat">
              <span>{actionLabels[item.action] || item.action} (7 ngày)</span>
              <strong>{item.count}</strong>
            </div>
          ))}
          {summary.topUsers[0] && (
            <div className="mini-stat success">
              <span>Hoạt động nhiều nhất</span>
              <strong className="mini-stat-name">{summary.topUsers[0].actor_name}</strong>
            </div>
          )}
        </div>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Bộ lọc</span>
            <h2>Tìm trong nhật ký</h2>
          </div>
        </div>

        <div className="filter-chips">
          {GROUPS.map((group) => (
            <button
              key={group.value}
              className={`chip ${filters.group === group.value ? "is-active" : ""}`}
              onClick={() => updateFilter({ group: group.value, action: "" })}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="form-grid four compact-form">
          <label>
            Hành động cụ thể
            <select
              value={filters.action}
              onChange={(event) => updateFilter({ action: event.target.value })}
            >
              <option value="">Tất cả hành động</option>
              {actions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Từ ngày
            <input
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter({ from: event.target.value })}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter({ to: event.target.value })}
            />
          </label>
          <label>
            Tìm theo tên người hoặc mô tả
            <div className="search-box">
              <Search size={14} />
              <input
                value={filters.q}
                onChange={(event) => updateFilter({ q: event.target.value })}
                placeholder="Ví dụ: tải tài liệu"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Nhật ký hệ thống</span>
            <h2>
              <Activity size={18} /> Toàn bộ thao tác
            </h2>
          </div>
        </div>

        {logs.length === 0 ? (
          <EmptyState
            title="Không có bản ghi nào"
            description="Thử bỏ bớt bộ lọc hoặc chọn khoảng thời gian rộng hơn."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Người thao tác</th>
                  <th>Hành động</th>
                  <th>Chi tiết</th>
                  <th>Cuộc họp</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className={DANGER_ACTIONS.has(log.action) ? "row-warning" : ""}>
                    <td className="nowrap">{formatDateTime(log.created_at)}</td>
                    <td>
                      <strong>{log.actor_name || "Khách"}</strong>
                      <span className="table-subtext">{log.actor_email || log.actor_role || ""}</span>
                    </td>
                    <td>
                      <span className="audit-action">
                        {DANGER_ACTIONS.has(log.action) && <ShieldAlert size={13} />}
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td>{log.description || "-"}</td>
                    <td>{log.meeting_title || "-"}</td>
                    <td className="nowrap">{log.ip_address || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="row-actions">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Trang trước
            </button>
            <span className="muted small">
              Trang {page}/{totalPages}
            </span>
            <button
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
