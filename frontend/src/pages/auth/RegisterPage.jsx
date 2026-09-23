import { LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { roleHome, useAuth } from "../../auth/AuthContext.jsx";

export function RegisterPage() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    jobTitle: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Đăng ký xong KHÔNG vào thẳng hệ thống: phải chờ quản trị viên duyệt,
  // nên màn hình chuyển sang trạng thái báo đã gửi hồ sơ.
  const [submitted, setSubmitted] = useState(null);

  if (user) return <Navigate to={roleHome(user.role)} replace />;

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await register(form);
      setSubmitted(result);
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="auth-screen">
        <section className="auth-panel compact">
          <div className="auth-form">
            <h2>Đã gửi hồ sơ đăng ký</h2>
            <div className="alert success">
              <ShieldCheck size={16} />
              <span>
                {submitted.message ||
                  "Tài khoản đang chờ quản trị viên phê duyệt và cấp quyền."}
              </span>
            </div>
            <p className="muted">
              Hồ sơ của <strong>{submitted.data?.full_name}</strong> (
              {submitted.data?.email}) đã được gửi tới quản trị viên. Khi được duyệt, bạn
              đăng nhập bằng đúng email và mật khẩu vừa đăng ký.
            </p>
            <Link className="primary-button" to="/login">
              <LogIn size={16} />
              Về trang đăng nhập
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel compact">
        <form className="auth-form" onSubmit={submit}>
          <h2>Đăng ký tài khoản</h2>
          <p className="muted">
            Điền thông tin bên dưới. Quản trị viên sẽ xét duyệt hồ sơ và cấp quyền sử dụng
            trước khi bạn đăng nhập được.
          </p>
          <label>
            Họ và tên *
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label>
            Email *
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              required
            />
          </label>
          <label>
            Mật khẩu *
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              type="password"
              minLength={6}
              required
            />
          </label>
          <label>
            Số điện thoại
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Để quản trị viên liên hệ khi cần xác minh"
            />
          </label>
          <label>
            Chức vụ / đơn vị công tác
            <input
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              placeholder="Ví dụ: Chuyên viên Phòng Đào tạo"
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button" disabled={loading}>
            <UserPlus size={16} />
            {loading ? "Đang gửi hồ sơ..." : "Gửi hồ sơ đăng ký"}
          </button>
          <p className="muted">
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

