import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { roleHome, useAuth } from "../../auth/AuthContext.jsx";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={roleHome(user.role)} replace />;

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const created = await register(form);
      navigate(roleHome(created.role), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel compact">
        <form className="auth-form" onSubmit={submit}>
          <h2>Đăng ký tài khoản</h2>
          <label>
            Họ tên
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
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
              minLength={6}
              required
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button" disabled={loading}>
            <UserPlus size={16} />
            {loading ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
          <p className="muted">
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

