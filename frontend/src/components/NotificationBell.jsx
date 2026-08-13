import { Bell, CheckCheck, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  notificationLink,
  useNotifications
} from "../notifications/NotificationContext.jsx";
import { notificationMeta, severityClass } from "../notifications/notificationMeta.jsx";
import { timeAgo } from "../utils/format.js";

export function NotificationBell() {
  const { user } = useAuth();
  const { items, unread, connected, markRead, markAllRead, removeOne } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const wrapperRef = useRef(null);
  const previousUnread = useRef(unread);
  const navigate = useNavigate();

  // Rung chuông mỗi khi có thông báo mới về.
  useEffect(() => {
    if (unread > previousUnread.current) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 900);
      return () => window.clearTimeout(timer);
    }
    previousUnread.current = unread;
    return undefined;
  }, [unread]);

  useEffect(() => {
    previousUnread.current = unread;
  }, [unread]);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    function onEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function openNotification(notification) {
    if (!notification.is_read) markRead(notification.id);
    setOpen(false);
    navigate(notificationLink(notification, user?.role));
  }

  const preview = items.slice(0, 8);

  return (
    <div className="notif-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`notif-trigger${open ? " is-open" : ""}${pulse ? " is-pulsing" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ""}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Danh sách thông báo">
          <header className="notif-panel-head">
            <div>
              <strong>Thông báo</strong>
              <span className={connected ? "notif-live" : "notif-live is-off"}>
                {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                {connected ? "Đang nhận realtime" : "Mất kết nối realtime"}
              </span>
            </div>
            {unread > 0 && (
              <button type="button" className="ghost-button subtle" onClick={markAllRead}>
                <CheckCheck size={14} />
                Đọc tất cả
              </button>
            )}
          </header>

          <div className="notif-list">
            {preview.length === 0 && (
              <div className="notif-empty">
                <Bell size={22} />
                <p>Chưa có thông báo nào</p>
                <span>Lời mời họp, đổi lịch và nhiệm vụ mới sẽ hiện ở đây.</span>
              </div>
            )}

            {preview.map((notification) => {
              const { icon: Icon, label } = notificationMeta(notification.type);
              return (
                <div
                  key={notification.id}
                  className={`notif-item ${severityClass(notification.severity)}${
                    notification.is_read ? "" : " is-unread"
                  }`}
                >
                  <button
                    type="button"
                    className="notif-item-main"
                    onClick={() => openNotification(notification)}
                  >
                    <span className="notif-item-icon">
                      <Icon size={16} />
                    </span>
                    <span className="notif-item-body">
                      <span className="notif-item-top">
                        <strong>{notification.title}</strong>
                        <em>{timeAgo(notification.created_at)}</em>
                      </span>
                      {notification.message && <p>{notification.message}</p>}
                      <span className="notif-item-tag">{label}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="notif-item-remove"
                    onClick={() => removeOne(notification.id)}
                    aria-label="Xoá thông báo"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          <footer className="notif-panel-foot">
            <button
              type="button"
              className="ghost-button subtle"
              onClick={() => {
                setOpen(false);
                navigate(
                  `${
                    user?.role === "ADMIN"
                      ? "/admin"
                      : user?.role === "ORGANIZER"
                        ? "/organizer"
                        : "/participant"
                  }/notifications`
                );
              }}
            >
              Xem tất cả thông báo
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
