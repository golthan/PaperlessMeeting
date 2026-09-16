import { KeyRound, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client.js";
import { PageHeader } from "../components/PageHeader.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { roleHome, useAuth } from "../auth/AuthContext.jsx";
import { formatDateTime } from "../utils/format.js";

/**
 * Hồ sơ cá nhân: ai đăng nhập cũng tự sửa được thông tin của mình.
 * Vai trò, trạng thái và phòng ban cố tình để chế độ chỉ đọc — đó là
 * thẩm quyền của quản trị viên, không phải của người dùng.
 */
export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    fullName: user?.full_name || "",
    phone: user?.phone || "",
    jobTitle: user?.job_title || "",
    avatarUrl: user?.avatar_url || ""
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    if (!form.fullName.trim()) {
      setError("Vui lòng nhập họ tên");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.put("/auth/profile", form);
      updateUser(res.data.user);
      toast.success("Đã lưu hồ sơ", "Thông tin cá nhân được cập nhật");
    } catch (err) {
      const message = err.response?.data?.message || "Không lưu được hồ sơ";
      setError(message);
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordError("");

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Mật khẩu mới cần tối thiểu 6 ký tự");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Xác nhận mật khẩu chưa khớp");
      return;
    }

    setSavingPassword(true);
    try {
      await api.put("/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Đã đổi mật khẩu", "Lần đăng nhập sau hãy dùng mật khẩu mới");
    } catch (err) {
      const message = err.response?.data?.message || "Không đổi được mật khẩu";
      setPasswordError(message);
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tài khoản của tôi"
        title="Hồ sơ cá nhân"
        subtitle="Cập nhật thông tin hiển thị của bạn trong các cuộc họp, biên bản và nhật ký"
        backTo={roleHome(user?.role)}
        backLabel="Về Dashboard"
      />

      <section className="panel">
        <div className="section-heading">
          <h2>Thông tin tài khoản</h2>
        </div>
        <div className="form-grid four">
          <div className="stat-tile">
            <span>Email đăng nhập</span>
            <strong>{user?.email}</strong>
          </div>
          <div className="stat-tile">
            <span>Vai trò được cấp</span>
            <strong>
              <StatusPill value={user?.role} />
            </strong>
          </div>
          <div className="stat-tile">
            <span>Trạng thái</span>
            <strong>
              <StatusPill value={user?.status} kind="account" />
            </strong>
          </div>
          <div className="stat-tile">
            <span>Ngày tạo tài khoản</span>
            <strong>{user?.created_at ? formatDateTime(user.created_at) : "-"}</strong>
          </div>
        </div>
        <p className="muted">
          Email, vai trò và phòng ban do quản trị viên quản lý. Nếu cần đổi, hãy liên hệ
          quản trị viên hệ thống.
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Thông tin cá nhân</h2>
        </div>
        <form className="form-grid four" onSubmit={saveProfile}>
          <label>
            Họ và tên *
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label>
            Số điện thoại
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Ví dụ: 0912345678"
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
          <label>
            Ảnh đại diện (đường dẫn)
            <input
              value={form.avatarUrl}
              onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
              placeholder="https://..."
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button" disabled={savingProfile}>
            <Save size={16} />
            {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Đổi mật khẩu</h2>
        </div>
        <form className="form-grid four" onSubmit={changePassword}>
          <label>
            Mật khẩu hiện tại *
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
              }
              required
            />
          </label>
          <label>
            Mật khẩu mới *
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, newPassword: e.target.value })
              }
              minLength={6}
              required
            />
          </label>
          <label>
            Nhập lại mật khẩu mới *
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
              minLength={6}
              required
            />
          </label>
          <div className="stat-tile">
            <span>Gợi ý</span>
            <strong>Tối thiểu 6 ký tự</strong>
          </div>
          {passwordError && <div className="alert error">{passwordError}</div>}
          <button className="secondary-button" disabled={savingPassword}>
            <KeyRound size={16} />
            {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
          </button>
        </form>
        <p className="muted">
          <ShieldCheck size={14} /> Mọi lần đổi mật khẩu và cập nhật hồ sơ đều được ghi vào
          nhật ký truy vết của hệ thống.
        </p>
      </section>
    </div>
  );
}
