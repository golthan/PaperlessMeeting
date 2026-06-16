import { Edit, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";

const emptyForm = {
  name: "",
  location: "",
  capacity: 20,
  status: "AVAILABLE",
  description: ""
};

export function RoomsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const res = await api.get("/rooms");
    setItems(res.data.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || "Không tải được phòng họp"));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editing) await api.put(`/rooms/${editing}`, form);
      else await api.post("/rooms", form);
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không lưu được phòng họp");
    }
  }

  async function remove(id) {
    if (!confirm("Xóa phòng họp này?")) return;
    try {
      await api.delete(`/rooms/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Không xóa được phòng họp");
    }
  }

  return (
    <div className="split-page">
      <section className="panel">
        <div className="section-heading">
          <h2>{editing ? "Cập nhật phòng họp" : "Thêm phòng họp"}</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Tên phòng
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Vị trí
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label>
            Sức chứa
            <input
              type="number"
              min="0"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              required
            />
          </label>
          <label>
            Trạng thái
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="UNAVAILABLE">UNAVAILABLE</option>
            </select>
          </label>
          <label className="wide">
            Mô tả
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button">
            <Plus size={16} />
            {editing ? "Lưu thay đổi" : "Thêm phòng họp"}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Danh sách phòng họp</h2>
        </div>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Vị trí</th>
                  <th>Sức chứa</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.location}</td>
                    <td>{item.capacity}</td>
                    <td>
                      <StatusPill value={item.status} />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        title="Sửa"
                        onClick={() => {
                          setEditing(item.id);
                          setForm({
                            name: item.name,
                            location: item.location || "",
                            capacity: item.capacity,
                            status: item.status,
                            description: item.description || ""
                          });
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
  );
}

