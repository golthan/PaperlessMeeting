import { BellOff, CheckCheck, RefreshCw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../auth/AuthContext.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  notificationLink,
  useNotifications
} from "../notifications/NotificationContext.jsx";
import {
  matchesFilter,
  NOTIFICATION_FILTERS,
  notificationMeta,
  severityClass
} from "../notifications/notificationMeta.jsx";
import { formatDateTime, timeAgo } from "../utils/format.js";

export function NotificationsPage() {
  const { user } = useAuth();
  const { items, unread, loading, refresh, markRead, markAllRead, removeOne, clearRead } =
    useNotifications();
  const [filter, setFilter] = useState("ALL");
  const navigate = useNavigate();
  const toast = useToast();

  const visible = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [items, filter]
  );

  function openNotification(notification) {
    if (!notification.is_read) markRead(notification.id);
    navigate(notificationLink(notification, user?.role));
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Trung tâm thông báo"
        title="Thông báo của tôi"
        subtitle={
          unread > 0
            ? `Bạn có ${unread} thông báo chưa đọc`
            : "Bạn đã đọc hết thông báo"
        }
        backTo={roleHome(user?.role)}
        backLabel="Về Dashboard"
        actions={
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                refresh();
                toast.info("Đã làm mới danh sách thông báo");
              }}
            >
              <RefreshCw size={15} />
              Làm mới
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={markAllRead}
              disabled={unread === 0}
            >
              <CheckCheck size={15} />
              Đánh dấu đã đọc
            </button>
            <button
              type="button"
              className="ghost-button danger"
              onClick={() => {
                clearRead();
                toast.success("Đã xoá các thông báo đã đọc");
              }}
            >
              <Trash2 size={15} />
              Xoá mục đã đọc
            </button>
          </>
        }
      />

      <section className="panel">
        <div className="filter-chips">
          {NOTIFICATION_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip${filter === item.value ? " is-active" : ""}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              {item.value === "UNREAD" && unread > 0 && <em>{unread}</em>}
            </button>
          ))}
        </div>

        {loading && items.length === 0 && <div className="alert info">Đang tải thông báo...</div>}

        {visible.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Không có thông báo trong mục này"
            description="Khi có lời mời họp, thay đổi lịch hoặc nhiệm vụ mới, hệ thống sẽ báo ngay tại đây."
          />
        ) : (
          <ul className="notif-page-list">
            {visible.map((notification) => {
              const { icon: Icon, label } = notificationMeta(notification.type);
              return (
                <li
                  key={notification.id}
                  className={`notif-page-item ${severityClass(notification.severity)}${
                    notification.is_read ? "" : " is-unread"
                  }`}
                >
                  <button
                    type="button"
                    className="notif-page-main"
                    onClick={() => openNotification(notification)}
                  >
                    <span className="notif-item-icon">
                      <Icon size={18} />
                    </span>
                    <span className="notif-page-body">
                      <span className="notif-page-top">
                        <strong>{notification.title}</strong>
                        <span className="notif-item-tag">{label}</span>
                        {!notification.is_read && <span className="notif-dot" />}
                      </span>
                      {notification.message && <p>{notification.message}</p>}
                      <span className="notif-page-meta">
                        {notification.meeting_title && (
                          <em>Cuộc họp: {notification.meeting_title}</em>
                        )}
                        {notification.actor_name && <em>Bởi {notification.actor_name}</em>}
                        <em title={formatDateTime(notification.created_at)}>
                          {timeAgo(notification.created_at)}
                        </em>
                      </span>
                    </span>
                  </button>
                  <div className="notif-page-actions">
                    {!notification.is_read && (
                      <button
                        type="button"
                        className="ghost-button subtle"
                        onClick={() => markRead(notification.id)}
                      >
                        <BellOff size={14} />
                        Đã đọc
                      </button>
                    )}
                    <button
                      type="button"
                      className="notif-item-remove"
                      onClick={() => removeOne(notification.id)}
                      aria-label="Xoá thông báo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
