import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { io } from "socket.io-client";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/ToastProvider.jsx";

const NotificationContext = createContext(null);

const PAGE_SIZE = 30;

function socketOrigin() {
  const base = api.defaults.baseURL || "http://localhost:4000/api";
  return base.replace(/\/api\/?$/, "");
}

const severityTone = {
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "error",
  INFO: "info"
};

/** Đường dẫn mở khi bấm vào một thông báo, khác nhau theo vai trò đăng nhập. */
export function notificationLink(notification, role) {
  const prefix =
    role === "ADMIN" ? "/admin" : role === "ORGANIZER" ? "/organizer" : "/participant";

  if (notification?.metadata?.target === "TASKS") {
    return role === "PARTICIPANT" ? "/participant/tasks" : `${prefix}/meetings`;
  }
  if (notification?.type === "PARTICIPANT_REMOVED") return `${prefix}/meetings`;
  if (notification?.meeting_id) return `${prefix}/meetings/${notification.meeting_id}`;
  return `${prefix}/notifications`;
}

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get("/notifications", { params: { limit: PAGE_SIZE } });
      setItems(res.data.data || []);
      setUnread(res.data.meta?.unread || 0);
    } catch {
      // Thông báo không phải luồng chính, lỗi mạng chỉ bỏ qua và thử lại lần sau.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user) {
      setItems([]);
      setUnread(0);
      return undefined;
    }

    refresh();

    const socket = io(`${socketOrigin()}/meeting`, {
      auth: { token },
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("notification:new", (notification) => {
      setItems((list) => [notification, ...list].slice(0, 60));
      setUnread((value) => value + 1);
      toastRef.current.push({
        tone: severityTone[notification.severity] || "notification",
        title: notification.title,
        message: notification.message
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, user, refresh]);

  const markRead = useCallback(async (id) => {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, is_read: true } : item))
    );
    setUnread((value) => Math.max(0, value - 1));
    try {
      const res = await api.put(`/notifications/${id}/read`);
      if (typeof res.data?.meta?.unread === "number") setUnread(res.data.meta.unread);
    } catch {
      // Giữ trạng thái lạc quan, lần refresh sau sẽ đồng bộ lại.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((item) => ({ ...item, is_read: true })));
    setUnread(0);
    try {
      await api.put("/notifications/read-all");
    } catch {
      /* đồng bộ lại ở lần refresh sau */
    }
  }, []);

  const removeOne = useCallback(async (id) => {
    const target = items.find((item) => item.id === id);
    setItems((list) => list.filter((item) => item.id !== id));
    if (target && !target.is_read) setUnread((value) => Math.max(0, value - 1));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      /* đồng bộ lại ở lần refresh sau */
    }
  }, [items]);

  const clearRead = useCallback(async () => {
    setItems((list) => list.filter((item) => !item.is_read));
    try {
      await api.delete("/notifications/read");
    } catch {
      /* đồng bộ lại ở lần refresh sau */
    }
  }, []);

  const value = useMemo(
    () => ({
      items,
      unread,
      loading,
      connected,
      refresh,
      markRead,
      markAllRead,
      removeOne,
      clearRead
    }),
    [items, unread, loading, connected, refresh, markRead, markAllRead, removeOne, clearRead]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications phải được dùng bên trong NotificationProvider");
  }
  return context;
}
