import { AlertTriangle, Bell, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const DEFAULT_DURATION = 4500;
const MAX_VISIBLE = 4;

const toneIcon = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  notification: Bell
};

/** Thanh chạy thời gian còn lại của toast, dừng khi người dùng rê chuột vào. */
function ToastCard({ toast, onClose }) {
  const Icon = toneIcon[toast.tone] || Info;
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => closeRef.current(toast.id), 180);
  }, [toast.id]);

  useEffect(() => {
    if (toast.duration === 0) return undefined;
    timerRef.current = window.setTimeout(dismiss, toast.duration || DEFAULT_DURATION);
    return () => window.clearTimeout(timerRef.current);
  }, [toast.duration, dismiss]);

  return (
    <div
      className={`toast toast-${toast.tone}${leaving ? " toast-leaving" : ""}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => window.clearTimeout(timerRef.current)}
      onMouseLeave={() => {
        if (toast.duration === 0) return;
        timerRef.current = window.setTimeout(dismiss, 2000);
      }}
    >
      <span className="toast-icon">
        <Icon size={18} />
      </span>
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
        {toast.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.action.onClick();
              dismiss();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" onClick={dismiss} aria-label="Đóng thông báo">
        <X size={15} />
      </button>
      {toast.duration !== 0 && (
        <span
          className="toast-progress"
          style={{ animationDuration: `${toast.duration || DEFAULT_DURATION}ms` }}
        />
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((list) => [...list, { id, tone: "info", ...toast }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo(
    () => ({
      push,
      remove,
      success: (title, message) => push({ tone: "success", title, message }),
      error: (title, message) => push({ tone: "error", title, message }),
      warning: (title, message) => push({ tone: "warning", title, message }),
      info: (title, message) => push({ tone: "info", title, message }),
      /** Bọc một promise: hiện toast thành công hoặc lỗi tuỳ kết quả. */
      async run(promise, { success, error } = {}) {
        try {
          const result = await promise;
          if (success) push({ tone: "success", title: success });
          return result;
        } catch (err) {
          push({
            tone: "error",
            title: error || "Thao tác thất bại",
            message: err?.response?.data?.message || err?.message
          });
          throw err;
        }
      }
    }),
    [push, remove]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast phải được dùng bên trong ToastProvider");
  }
  return context;
}
