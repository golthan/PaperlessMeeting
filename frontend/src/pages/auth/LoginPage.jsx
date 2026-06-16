import { LogIn } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { roleHome, useAuth } from "../../auth/AuthContext.jsx";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "admin@example.com", password: "123456" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={roleHome(user.role)} replace />;

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const loggedIn = await login(form.email, form.password);
      navigate(location.state?.from?.pathname || roleHome(loggedIn.role), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  function fill(email) {
    setForm({ email, password: "123456" });
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-copy">
          <div className="brand-mark large">PM</div>
          <h1>Paperless Meeting</h1>
          <p>Quản lý phòng họp, tài liệu, điểm danh, biểu quyết, biên bản và nhiệm vụ sau họp.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h2>Đăng nhập</h2>
          <label>
            Email
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              type="password"
              required
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button" disabled={loading}>
            <LogIn size={16} />
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
          <div className="demo-logins">
            <button type="button" onClick={() => fill("admin@example.com")}>
              Admin
            </button>
            <button type="button" onClick={() => fill("organizer@example.com")}>
              Organizer
            </button>
            <button type="button" onClick={() => fill("participant1@example.com")}>
              Participant
            </button>
          </div>
          <p className="muted">
            Chưa có tài khoản? <Link to="/register">Đăng ký participant</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

