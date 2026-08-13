import { Edit, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useToast } from "../../components/ToastProvider.jsx";

const emptyForm = { name: "", description: "" };

export function DepartmentsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const res = await api.get("/departments");
    setItems(res.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được phòng ban"));
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editing) await api.put(`/departments/${editing}`, form);
      else await api.post("/departments", form);
      const name = form.name;
      setForm(emptyForm);
      setEditing(null);
      await load();
      toast.success(editing ? "Đã cập nhật phòng ban" : "Đã thêm phòng ban", name);
    } catch (err) {
      setError(err.response?.data?.message || "Không lưu được phòng ban");
    }
  }

  async function remove(id) {
    if (!confirm("Xóa phòng ban này?")) return;
    try {
      await api.delete(`/departments/${id}`);
      await load();
      toast.success("Đã xoá phòng ban");
    } catch (err) {
      setError(err.response?.data?.message || "Không xóa được phòng ban");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Quản lý phòng ban"
        subtitle={`${items.length} phòng ban đang hoạt động`}
        backTo="/admin/dashboard"
        backLabel="Về Dashboard"
      />

      <div className="split-page">
      <section className="panel">
        <div className="section-heading">
          <h2>{editing ? "Cập nhật phòng ban" : "Thêm phòng ban"}</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Tên phòng ban
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Mô tả
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button">
            <Plus size={16} />
            {editing ? "Lưu thay đổi" : "Thêm phòng ban"}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Danh sách phòng ban</h2>
        </div>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Thành viên</th>
                  <th>Mô tả</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.member_count}</td>
                    <td>{item.description}</td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        title="Sửa"
                        onClick={() => {
                          setEditing(item.id);
                          setForm({ name: item.name, description: item.description || "" });
                        }}
                      >
                        <Edit size={16} />
                      </button>
                      <button className="icon-button danger" title="Xóa" onClick={() => remove(item.id)}>
                        <Trash2 size={16} />
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
    </div>
  );
}

