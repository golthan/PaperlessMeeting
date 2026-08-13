import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Info,
  MonitorUp,
  Mic,
  Plus,
  Search,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatDateTime, toDateTimeLocal } from "../../utils/format.js";

const STEPS = [
  { key: "info", label: "Thông tin chung", icon: Info },
  { key: "schedule", label: "Thời gian & địa điểm", icon: CalendarClock },
  { key: "people", label: "Thành phần tham dự", icon: Users },
  { key: "agenda", label: "Chương trình nghị sự", icon: ClipboardList },
  { key: "review", label: "Xem lại & xác nhận", icon: Check }
];

const MEETING_TYPES = [
  {
    value: "ONLINE",
    title: "Trực tuyến",
    desc: "Họp qua phòng video LiveKit, không cần phòng vật lý"
  },
  {
    value: "HYBRID",
    title: "Kết hợp",
    desc: "Phòng họp vật lý kèm cầu truyền hình cho người ở xa"
  },
  {
    value: "OFFLINE",
    title: "Tập trung",
    desc: "Họp trực tiếp tại phòng, không mở phòng online"
  }
];

const ROLE_LABELS = {
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên"
};

function emptyAgendaRow() {
  return { title: "", description: "", presenterId: "", durationMinutes: 15 };
}

function defaultPermissions() {
  return {
    roleInMeeting: "MEMBER",
    canSpeak: true,
    canShareScreen: false,
    canUploadDocument: true
  };
}

export function buildInitialWizardForm() {
  return {
    title: "",
    description: "",
    notes: "",
    meetingType: "HYBRID",
    startTime: toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    endTime: toDateTimeLocal(new Date(Date.now() + 26 * 60 * 60 * 1000)),
    roomId: ""
  };
}

function minutesBetween(start, end) {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to - from) / 60000);
}

export function MeetingWizard({ rooms, users, onSubmit, submitting }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(buildInitialWizardForm);
  const [selected, setSelected] = useState({});
  const [agenda, setAgenda] = useState([emptyAgendaRow()]);
  const [stepError, setStepError] = useState("");
  const [personFilter, setPersonFilter] = useState("");

  const selectedIds = Object.keys(selected);
  const meetingMinutes = minutesBetween(form.startTime, form.endTime);
  const agendaMinutes = agenda.reduce(
    (total, row) => total + (row.title.trim() ? Number(row.durationMinutes || 0) : 0),
    0
  );
  const selectedRoom = rooms.find((room) => room.id === form.roomId);
  const roomOverCapacity =
    selectedRoom &&
    form.meetingType !== "ONLINE" &&
    selectedIds.length + 1 > Number(selectedRoom.capacity || 0);

  const visibleUsers = useMemo(() => {
    const query = personFilter.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (item) =>
        item.full_name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        (item.department_name || "").toLowerCase().includes(query)
    );
  }, [users, personFilter]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function togglePerson(userId) {
    setSelected((current) => {
      const next = { ...current };
      if (next[userId]) {
        delete next[userId];
      } else {
        next[userId] = defaultPermissions();
      }
      return next;
    });
  }

  function selectAll() {
    setSelected((current) => {
      const next = { ...current };
      visibleUsers.forEach((item) => {
        if (!next[item.id]) next[item.id] = defaultPermissions();
      });
      return next;
    });
  }

  function clearAll() {
    setSelected({});
  }

  function updatePerson(userId, patch) {
    setSelected((current) => {
      const next = { ...current, [userId]: { ...current[userId], ...patch } };
      // Mỗi cuộc họp chỉ có một thư ký: chọn người mới thì người cũ về thành viên
      if (patch.roleInMeeting === "SECRETARY") {
        Object.keys(next).forEach((otherId) => {
          if (otherId !== userId && next[otherId].roleInMeeting === "SECRETARY") {
            next[otherId] = { ...next[otherId], roleInMeeting: "MEMBER" };
          }
        });
      }
      return next;
    });
  }

  function updateAgendaRow(index, patch) {
    setAgenda((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  }

  function moveAgendaRow(index, delta) {
    setAgenda((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeAgendaRow(index) {
    setAgenda((current) =>
      current.length === 1 ? [emptyAgendaRow()] : current.filter((_, i) => i !== index)
    );
  }

  function validateStep(stepIndex) {
    const key = STEPS[stepIndex].key;
    if (key === "info") {
      if (!form.title.trim()) return "Vui lòng nhập tên cuộc họp";
      if (form.title.trim().length < 5) {
        return "Tên cuộc họp nên có tối thiểu 5 ký tự để rõ ràng, dễ tra cứu";
      }
    }
    if (key === "schedule") {
      if (!form.startTime || !form.endTime) return "Vui lòng chọn thời gian họp";
      if (meetingMinutes <= 0) return "Thời gian kết thúc phải sau thời gian bắt đầu";
      if (form.meetingType !== "ONLINE" && !form.roomId) {
        return "Cuộc họp tập trung / kết hợp cần chọn phòng họp vật lý";
      }
    }
    if (key === "people") {
      if (selectedIds.length === 0) return "Cuộc họp cần ít nhất một người tham dự";
    }
    if (key === "agenda") {
      const activeRows = agenda.filter(
        (row) =>
          row.title.trim() ||
          row.description.trim() ||
          row.presenterId ||
          Number(row.durationMinutes || 0) !== 15
      );
      if (activeRows.some((row) => !row.title.trim())) {
        return "Mỗi nội dung trong chương trình cần có tiêu đề";
      }
    }
    return "";
  }

  function goNext() {
    const problem = validateStep(step);
    if (problem) {
      setStepError(problem);
      return;
    }
    setStepError("");
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  function jumpTo(target) {
    if (target >= step) return;
    setStepError("");
    setStep(target);
  }

  async function submit() {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const problem = validateStep(index);
      if (problem) {
        setStep(index);
        setStepError(problem);
        return;
      }
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      notes: form.notes.trim() || undefined,
      meetingType: form.meetingType,
      startTime: form.startTime,
      endTime: form.endTime,
      roomId: form.meetingType === "ONLINE" ? null : form.roomId,
      participants: selectedIds.map((userId) => ({
        userId,
        ...selected[userId]
      })),
      agenda: agenda
        .filter((row) => row.title.trim())
        .map((row) => ({
          title: row.title.trim(),
          description: row.description.trim() || undefined,
          presenterId: row.presenterId || undefined,
          durationMinutes: Number(row.durationMinutes || 0)
        }))
    };
    const ok = await onSubmit(payload);
    if (ok) {
      setForm(buildInitialWizardForm());
      setSelected({});
      setAgenda([emptyAgendaRow()]);
      setStep(0);
      setStepError("");
    }
  }

  const secretary = selectedIds.find(
    (userId) => selected[userId].roleInMeeting === "SECRETARY"
  );
  const presenterOptions = users.filter((item) => selectedIds.includes(item.id));

  return (
    <div className="wizard">
      <ol className="wizard-steps">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const state = index === step ? "active" : index < step ? "done" : "";
          return (
            <li key={item.key}>
              <button
                type="button"
                className={`wizard-step ${state}`}
                onClick={() => jumpTo(index)}
              >
                <span className="wizard-step-index">
                  {index < step ? <Check size={14} /> : index + 1}
                </span>
                <Icon size={15} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ol>

      {stepError && <div className="alert error">{stepError}</div>}

      {STEPS[step].key === "info" && (
        <div className="wizard-body">
          <div className="form-grid">
            <label>
              Tên cuộc họp *
              <input
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Ví dụ: Họp giao ban tháng 8/2026 — Khoa CNTT"
                maxLength={255}
              />
            </label>
            <label>
              Mục tiêu / nội dung chính
              <textarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Mô tả mục tiêu, phạm vi và kết quả mong muốn của cuộc họp..."
                rows={3}
              />
            </label>
            <div>
              <span className="field-label">Hình thức họp *</span>
              <div className="type-cards">
                {MEETING_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`type-card ${form.meetingType === item.value ? "active" : ""}`}
                    onClick={() =>
                      update({
                        meetingType: item.value,
                        roomId:
                          item.value === "ONLINE"
                            ? ""
                            : form.roomId || rooms[0]?.id || ""
                      })
                    }
                  >
                    <strong>{item.title}</strong>
                    <span>{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <label>
              Ghi chú nội bộ cho ban tổ chức
              <textarea
                value={form.notes}
                onChange={(e) => update({ notes: e.target.value })}
                placeholder="Chỉ organizer nhìn thấy: chuẩn bị hậu cần, tài liệu cần in..."
                rows={2}
              />
            </label>
          </div>
        </div>
      )}

      {STEPS[step].key === "schedule" && (
        <div className="wizard-body">
          <div className="form-grid four">
            <label>
              Bắt đầu *
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => update({ startTime: e.target.value })}
              />
            </label>
            <label>
              Kết thúc *
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => update({ endTime: e.target.value })}
              />
            </label>
            <div className="stat-tile">
              <span>Thời lượng dự kiến</span>
              <strong>
                {meetingMinutes > 0
                  ? `${Math.floor(meetingMinutes / 60)}h ${meetingMinutes % 60}p`
                  : "--"}
              </strong>
            </div>
            {form.meetingType !== "ONLINE" ? (
              <label>
                Phòng họp vật lý *
                <select
                  value={form.roomId}
                  onChange={(e) => update({ roomId: e.target.value })}
                >
                  <option value="">-- Chọn phòng --</option>
                  {rooms.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                      disabled={room.status !== "AVAILABLE"}
                    >
                      {room.name} · {room.capacity} chỗ · {room.location || "N/A"}
                      {room.status !== "AVAILABLE" ? " (không khả dụng)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="stat-tile">
                <span>Địa điểm</span>
                <strong>Phòng LiveKit tự tạo</strong>
              </div>
            )}
          </div>
          {roomOverCapacity && (
            <div className="alert warning">
              Phòng {selectedRoom.name} chỉ có {selectedRoom.capacity} chỗ nhưng thành
              phần dự kiến {selectedIds.length + 1} người (gồm chủ trì). Cân nhắc đổi
              phòng hoặc chuyển hình thức kết hợp.
            </div>
          )}
          <p className="muted">
            Hệ thống sẽ tự kiểm tra trùng lịch phòng khi tạo. Nếu phòng đã có cuộc họp
            trong khung giờ này, bạn sẽ nhận được cảnh báo kèm lịch bị trùng.
          </p>
        </div>
      )}

      {STEPS[step].key === "people" && (
        <div className="wizard-body">
          <div className="participant-picker-head">
            <div>
              <span className="eyebrow">Thành phần tham dự</span>
              <strong>
                {selectedIds.length}/{users.length} người được mời
                {secretary
                  ? ` · Thư ký: ${users.find((u) => u.id === secretary)?.full_name || ""}`
                  : " · Chưa chỉ định thư ký"}
              </strong>
            </div>
            <div className="row-actions">
              <div className="search-box">
                <Search size={14} />
                <input
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                  placeholder="Tìm theo tên, email, phòng ban..."
                />
              </div>
              <button type="button" className="ghost-button" onClick={selectAll}>
                Chọn tất cả
              </button>
              <button type="button" className="ghost-button" onClick={clearAll}>
                Bỏ chọn
              </button>
            </div>
          </div>
          <div className="person-list">
            {visibleUsers.map((item) => {
              const picked = selected[item.id];
              return (
                <div key={item.id} className={`person-row ${picked ? "picked" : ""}`}>
                  <label className="person-identity">
                    <input
                      type="checkbox"
                      checked={Boolean(picked)}
                      onChange={() => togglePerson(item.id)}
                    />
                    <span>
                      <strong>{item.full_name}</strong>
                      <small>
                        {item.email}
                        {item.department_name ? ` · ${item.department_name}` : ""}
                      </small>
                    </span>
                  </label>
                  {picked && (
                    <div className="person-config">
                      <select
                        value={picked.roleInMeeting}
                        onChange={(e) =>
                          updatePerson(item.id, { roleInMeeting: e.target.value })
                        }
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="perm-toggle" title="Quyền phát biểu (mic/camera)">
                        <input
                          type="checkbox"
                          checked={picked.canSpeak}
                          onChange={(e) =>
                            updatePerson(item.id, { canSpeak: e.target.checked })
                          }
                        />
                        <Mic size={14} />
                        Phát biểu
                      </label>
                      <label className="perm-toggle" title="Quyền chia sẻ màn hình">
                        <input
                          type="checkbox"
                          checked={picked.canShareScreen}
                          onChange={(e) =>
                            updatePerson(item.id, { canShareScreen: e.target.checked })
                          }
                        />
                        <MonitorUp size={14} />
                        Chia sẻ
                      </label>
                      <label className="perm-toggle" title="Quyền tải tài liệu lên">
                        <input
                          type="checkbox"
                          checked={picked.canUploadDocument}
                          onChange={(e) =>
                            updatePerson(item.id, { canUploadDocument: e.target.checked })
                          }
                        />
                        <Upload size={14} />
                        Tài liệu
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            {visibleUsers.length === 0 && (
              <p className="muted">Không tìm thấy người dùng phù hợp bộ lọc.</p>
            )}
          </div>
        </div>
      )}

      {STEPS[step].key === "agenda" && (
        <div className="wizard-body">
          <div className="participant-picker-head">
            <div>
              <span className="eyebrow">Chương trình nghị sự</span>
              <strong>
                {agenda.filter((row) => row.title.trim()).length} nội dung ·{" "}
                {agendaMinutes} phút
                {meetingMinutes > 0 ? ` / ${meetingMinutes} phút họp` : ""}
              </strong>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setAgenda((current) => [...current, emptyAgendaRow()])}
            >
              <Plus size={15} />
              Thêm nội dung
            </button>
          </div>
          {agendaMinutes > meetingMinutes && meetingMinutes > 0 && (
            <div className="alert warning">
              Tổng thời lượng chương trình ({agendaMinutes} phút) vượt quá thời gian họp
              ({meetingMinutes} phút). Cân nhắc rút gọn hoặc kéo dài cuộc họp.
            </div>
          )}
          <div className="agenda-builder">
            {agenda.map((row, index) => (
              <div key={index} className="agenda-row">
                <span className="agenda-row-index">{index + 1}</span>
                <div className="agenda-row-fields">
                  <input
                    value={row.title}
                    onChange={(e) => updateAgendaRow(index, { title: e.target.value })}
                    placeholder="Tiêu đề nội dung (ví dụ: Báo cáo tiến độ quý III)"
                  />
                  <div className="agenda-row-sub">
                    <select
                      value={row.presenterId}
                      onChange={(e) =>
                        updateAgendaRow(index, { presenterId: e.target.value })
                      }
                    >
                      <option value="">Người trình bày (tùy chọn)</option>
                      {presenterOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.full_name}
                        </option>
                      ))}
                    </select>
                    <div className="duration-input">
                      <input
                        type="number"
                        min="0"
                        max="480"
                        value={row.durationMinutes}
                        onChange={(e) =>
                          updateAgendaRow(index, { durationMinutes: e.target.value })
                        }
                      />
                      <span>phút</span>
                    </div>
                  </div>
                  <input
                    value={row.description}
                    onChange={(e) =>
                      updateAgendaRow(index, { description: e.target.value })
                    }
                    placeholder="Mô tả ngắn / tài liệu liên quan (tùy chọn)"
                  />
                </div>
                <div className="agenda-row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="Chuyển lên"
                    onClick={() => moveAgendaRow(index, -1)}
                    disabled={index === 0}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Chuyển xuống"
                    onClick={() => moveAgendaRow(index, 1)}
                    disabled={index === agenda.length - 1}
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    title="Xóa nội dung"
                    onClick={() => removeAgendaRow(index)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {STEPS[step].key === "review" && (
        <div className="wizard-body">
          <div className="review-grid">
            <section>
              <h3>Thông tin chung</h3>
              <dl>
                <div>
                  <dt>Tên cuộc họp</dt>
                  <dd>{form.title}</dd>
                </div>
                <div>
                  <dt>Hình thức</dt>
                  <dd>
                    {MEETING_TYPES.find((t) => t.value === form.meetingType)?.title}
                  </dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>
                    {formatDateTime(form.startTime)} → {formatDateTime(form.endTime)} (
                    {meetingMinutes} phút)
                  </dd>
                </div>
                <div>
                  <dt>Địa điểm</dt>
                  <dd>
                    {form.meetingType === "ONLINE"
                      ? "Phòng họp trực tuyến LiveKit (tự tạo khi bắt đầu)"
                      : selectedRoom
                        ? `${selectedRoom.name} (${selectedRoom.capacity} chỗ)`
                        : "--"}
                    {form.meetingType === "HYBRID" ? " + phòng LiveKit" : ""}
                  </dd>
                </div>
                {form.description && (
                  <div>
                    <dt>Nội dung</dt>
                    <dd>{form.description}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section>
              <h3>Thành phần ({selectedIds.length} người)</h3>
              <ul className="review-people">
                {selectedIds.map((userId) => {
                  const person = users.find((u) => u.id === userId);
                  const config = selected[userId];
                  if (!person) return null;
                  return (
                    <li key={userId}>
                      <strong>{person.full_name}</strong>
                      <span>
                        {ROLE_LABELS[config.roleInMeeting]}
                        {config.canSpeak ? " · phát biểu" : ""}
                        {config.canShareScreen ? " · chia sẻ màn hình" : ""}
                        {config.canUploadDocument ? " · tải tài liệu" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <h3>
                Chương trình ({agenda.filter((row) => row.title.trim()).length} nội dung ·{" "}
                {agendaMinutes} phút)
              </h3>
              {agenda.filter((row) => row.title.trim()).length === 0 ? (
                <p className="muted">
                  Chưa có chương trình — bạn vẫn có thể bổ sung sau trong trang chi tiết.
                </p>
              ) : (
                <ol className="review-agenda">
                  {agenda
                    .filter((row) => row.title.trim())
                    .map((row, index) => (
                      <li key={index}>
                        <strong>{row.title}</strong>
                        <span>
                          {row.presenterId
                            ? users.find((u) => u.id === row.presenterId)?.full_name
                            : "Chưa chọn người trình bày"}{" "}
                          · {row.durationMinutes || 0} phút
                        </span>
                      </li>
                    ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}

      <div className="wizard-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={goBack}
          disabled={step === 0}
        >
          <ArrowLeft size={15} />
          Quay lại
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="primary-button" onClick={goNext}>
            Tiếp tục
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={submit}
            disabled={submitting}
          >
            <Check size={15} />
            {submitting ? "Đang tạo cuộc họp..." : "Xác nhận tạo cuộc họp"}
          </button>
        )}
      </div>
    </div>
  );
}
