import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "../api/client.js";

const AuthContext = createContext(null);

export function roleHome(role) {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "ORGANIZER") return "/organizer/dashboard";
  return "/participant/dashboard";
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem("token");
    // Gắn header ngay khi khởi tạo: effect của component con (NotificationProvider)
    // chạy trước effect bên dưới nên sẽ gọi API khi chưa có token.
    setAuthToken(saved);
    return saved;
  });
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [booting, setBooting] = useState(Boolean(token));

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setBooting(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem("user", JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [token]);

  async function login(email, password) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    setAuthToken(res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  /**
   * Đăng ký KHÔNG đăng nhập ngay: tài khoản mới nằm ở trạng thái chờ duyệt,
   * quản trị viên là người phê duyệt và cấp quyền.
   */
  async function register(payload) {
    const res = await api.post("/auth/register", payload);
    return res.data;
  }

  /** Cập nhật lại thông tin người đang đăng nhập sau khi sửa hồ sơ cá nhân. */
  function updateUser(nextUser) {
    localStorage.setItem("user", JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({ token, user, booting, login, register, logout, updateUser }),
    [token, user, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

