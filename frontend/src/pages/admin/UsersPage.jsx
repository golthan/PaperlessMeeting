import { Lock, Plus, Save, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { useToast } from "../../components/ToastProvider.jsx";

const emptyForm = {
  fullName: "",
  email: "",
  password: "123456",
  role: "PARTICIPANT",
  status: "ACTIVE",
  departmentId: ""
};

export function UsersPage() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const [users, deps] = await Promise.all([
      api.get("/users", { params: { q: query || undefined, limit: 100 } }),
      api.get("/departments")
    ]);
    setItems(users.data.data);
    setDepartments(deps.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được người dùng"));
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: department.id, label: department.name })),
    [departments]
  );

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/users", {
        ...form,
        departmentId: form.departmentId || null
      });
      setForm(emptyForm);
      await load();
      toast.success("Đã thêm người dùng", form.email);
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được người dùng");
    }
  }

  async function updateUser(item, patch) {
    setError("");
    try {
      await api.put(`/users/${item.id}`, {
        fullName: item.full_name,
        role: patch.role || item.role,
        status: patch.status || item.status,
        departmentId:
          patch.departmentId !== undefined ? patch.departmentId || null : item.department_id
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật được người dùng");
    }
  }

  async function lockToggle(item) {
    setError("");
    try {
      await api.put(`/users/${item.id}/${item.status === "LOCKED" ? "unlock" : "lock"}`);
      await load();
      toast.success(
        item.status === "LOCKED" ? "Đã mở khoá tài khoản" : "Đã khoá tài khoản",
        item.email
      );
    } catch (err) {
      setError(err.response?.data?.message || "Không cập nhật trạng thái");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Quản lý người dùng"
        subtitle={`${items.length} tài khoản trong hệ thống`}
        backTo="/admin/dashboard"
        backLabel="Về Dashboard"
      />

      <section className="panel">
        <div className="section-heading">
          <h2>Thêm người dùng</h2>
        </div>
        <form className="form-grid four" onSubmit={submit}>
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
              minLength={6}
              required
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="ADMIN">ADMIN</option>
              <option value="ORGANIZER">ORGANIZER</option>
              <option value="PARTICIPANT">PARTICIPANT</option>
            </select>
          </label>
          <label>
            Phòng ban
            <select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">Chưa chọn</option>
              {departmentOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button">
            <Plus size={16} />
            Thêm người dùng
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading row">
          <h2>Danh sách người dùng</h2>
          <div className="inline-search">
            <input
              placeholder="Tìm tên/email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary-button" onClick={load}>
              Tìm
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Trạng thái</th>
                  <th>Phòng ban</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.full_name}</td>
                    <td>{item.email}</td>
                    <td>
                      <select
                        defaultValue={item.role}
                        onChange={(e) => updateUser(item, { role: e.target.value })}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="ORGANIZER">ORGANIZER</option>
                        <option value="PARTICIPANT">PARTICIPANT</option>
                      </select>
                    </td>
                    <td>
                      <StatusPill value={item.status} />
                    </td>
                    <td>
                      <select
                        defaultValue={item.department_id || ""}
                        onChange={(e) => updateUser(item, { departmentId: e.target.value })}
                      >
                        <option value="">Chưa chọn</option>
                        {departmentOptions.map((dep) => (
                          <option key={dep.value} value={dep.value}>
                            {dep.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        title={item.status === "LOCKED" ? "Mở khóa" : "Khóa"}
                        onClick={() => lockToggle(item)}
                      >
                        {item.status === "LOCKED" ? <Unlock size={16} /> : <Lock size={16} />}
                      </button>
                      <button
                        className="icon-button"
                        title="Lưu nhanh"
                        onClick={() => updateUser(item, {})}
                      >
                        <Save size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

