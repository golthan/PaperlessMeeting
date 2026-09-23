import {
  Check,
  Download,
  FileText,
  MessageSquare,
  NotebookPen,
  Paperclip,
  Presentation,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { EmptyState } from "./EmptyState.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { formatDateTime } from "../utils/format.js";

/** Định dạng xem thẳng được trong trình duyệt. */
function previewKind(document) {
  const mime = String(document?.mime_type || "").toLowerCase();
  const name = String(document?.original_name || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "download";
}

/** Dựng lại file từ chuỗi base64 do máy chủ trả về. */
function base64ToBlob(base64, type) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Tải file kèm token rồi lưu về máy (không lộ link tĩnh, không cần header ở thẻ a). */
async function downloadDocument(item) {
  try {
    const res = await api.get("/documents/" + item.id + "/download", {
      responseType: "blob"
    });
    const url = URL.createObjectURL(res.data);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = item.original_name;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    // Lỗi tải file đã hiện qua trạng thái xem trước, không cần báo thêm.
  }
}

function fileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Hộp làm việc tài liệu của phòng họp: một chỗ duy nhất để đăng tài liệu,
 * xem nội dung, thảo luận và ghi chú theo từng tài liệu.
 *
 * Khối "Tóm tắt AI" nằm ngay dưới khung xem, đọc từ trường `ai_summary` của
 * tài liệu — khi bổ sung tính năng AI summarize chỉ cần ghi vào trường đó.
 */
export function DocumentWorkspace({
  documents = [],
  currentDocument,
  messages = [],
  notes = {},
  canManage = false,
  canUpload = false,
  canEditNotes = false,
  canSummarize = false,
  aiEnabled = false,
  questions = {},
  meetingClosed = false,
  currentUserId,
  onUpload,
  onPresent,
  onPage,
  onApprove,
  onReject,
  onDelete,
  onSend,
  onLoadNotes,
  onSaveNotes,
  onLoadQuestions,
  onAsk,
  onSummarize
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [sideTab, setSideTab] = useState("chat");
  const [messageInput, setMessageInput] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [uploadForm, setUploadForm] = useState({ file: null, displayName: "", description: "" });
  const [uploading, setUploading] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Mặc định mở tài liệu đang trình chiếu, nếu không thì tài liệu mới nhất.
  const selected = useMemo(() => {
    const found = documents.find((item) => item.id === selectedId);
    if (found) return found;
    return currentDocument || documents[0] || null;
  }, [documents, selectedId, currentDocument]);

  const selectedNote = selected ? notes[selected.id] : null;

  useEffect(() => {
    if (selected?.id) onLoadNotes?.(selected.id);
  }, [selected?.id, onLoadNotes]);

  useEffect(() => {
    if (selected?.id) onLoadQuestions?.(selected.id);
  }, [selected?.id, onLoadQuestions]);

  useEffect(() => {
    setNoteDraft(selectedNote?.content || "");
    setNoteDirty(false);
  }, [selected?.id, selectedNote?.updated_at]);

  // Lấy nội dung tài liệu dạng JSON rồi dựng lại file và hiển thị bằng blob URL.
  // Không tải file PDF trực tiếp: trình quản lý tải xuống (IDM...) sẽ chặn phản hồi đó
  // và bật hộp thoại tải về thay vì cho xem ngay trên trang.
  useEffect(() => {
    let revoked = false;
    let objectUrl = "";
    setPreviewUrl("");
    setPreviewError("");

    if (!selected || previewKind(selected) === "download") return undefined;

    api
      .get(`/documents/${selected.id}/content`)
      .then((res) => {
        if (revoked) return;
        const { base64, mimeType } = res.data.data;
        objectUrl = URL.createObjectURL(
          base64ToBlob(base64, mimeType || selected.mime_type || "application/octet-stream")
        );
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setPreviewError("Không tải được nội dung tài liệu để xem trước");
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.id, selected?.mime_type]);

  const documentMessages = useMemo(
    () => messages.filter((item) => item.document_id === selected?.id),
    [messages, selected?.id]
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [documentMessages.length, sideTab]);

  async function submitUpload(event) {
    event.preventDefault();
    if (!uploadForm.file) return;
    const payload = new FormData();
    payload.append("file", uploadForm.file);
    payload.append("displayName", uploadForm.displayName || uploadForm.file.name);
    payload.append("description", uploadForm.description);
    setUploading(true);
    try {
      const created = await onUpload?.(payload);
      setUploadForm({ file: null, displayName: "", description: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (created?.id) setSelectedId(created.id);
    } finally {
      setUploading(false);
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    const content = messageInput.trim();
    if (!content || !selected) return;
    onSend?.(selected.id, content);
    setMessageInput("");
  }

  async function saveNote() {
    if (!selected) return;
    await onSaveNotes?.(selected.id, noteDraft);
    setNoteDirty(false);
  }

  const documentQuestions = selected ? questions[selected.id] || [] : [];

  /** Gọi AI tóm tắt tài liệu đang mở. */
  async function runSummarize() {
    if (!selected) return;
    setAiBusy(true);
    try {
      await onSummarize?.(selected);
    } finally {
      setAiBusy(false);
    }
  }

  /** Hỏi AI về tài liệu, câu trả lời kèm trích dẫn trang. */
  async function submitQuestion(event) {
    event.preventDefault();
    const question = questionInput.trim();
    if (!question || !selected) return;
    setAiBusy(true);
    try {
      const ok = await onAsk?.(selected, question);
      if (ok !== false) setQuestionInput("");
    } finally {
      setAiBusy(false);
    }
  }

  const kind = selected ? previewKind(selected) : null;

  return (
    <div className="doc-workspace">
      <section className="doc-list-pane">
        <div className="doc-pane-head">
          <h3>
            <Paperclip size={15} />
            Tài liệu ({documents.length})
          </h3>
        </div>

        {canUpload && !meetingClosed && (
          <form className="doc-upload" onSubmit={submitUpload}>
            <label className="doc-file-picker">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(event) =>
                  setUploadForm((current) => ({
                    ...current,
                    file: event.target.files[0] || null,
                    displayName: current.displayName || event.target.files[0]?.name || ""
                  }))
                }
              />
              <Upload size={15} />
              <span>{uploadForm.file ? uploadForm.file.name : "Chọn file (PDF, DOCX, PPTX, XLSX)"}</span>
            </label>
            {uploadForm.file && (
              <>
                <input
                  value={uploadForm.displayName}
                  onChange={(event) =>
                    setUploadForm({ ...uploadForm, displayName: event.target.value })
                  }
                  placeholder="Tên hiển thị"
                />
                <input
                  value={uploadForm.description}
                  onChange={(event) =>
                    setUploadForm({ ...uploadForm, description: event.target.value })
                  }
                  placeholder="Mô tả ngắn (tuỳ chọn)"
                />
                <div className="row-actions start">
                  <button className="primary-button" disabled={uploading}>
                    <Upload size={15} />
                    {uploading ? "Đang gửi..." : "Đăng tài liệu"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setUploadForm({ file: null, displayName: "", description: "" });
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X size={15} />
                    Bỏ
                  </button>
                </div>
              </>
            )}
            <p className="muted small">
              {canManage
                ? "Tài liệu bạn đăng được duyệt ngay và hiện cho cả phòng họp."
                : "Tài liệu bạn gửi sẽ chờ chủ tọa duyệt trước khi mọi người xem được."}
            </p>
          </form>
        )}

        <div className="doc-list">
          {documents.length === 0 ? (
            <p className="muted small">Chưa có tài liệu nào trong cuộc họp.</p>
          ) : (
            documents.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`doc-item ${selected?.id === item.id ? "active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="doc-item-icon">
                  <FileText size={15} />
                </span>
                <span className="doc-item-body">
                  <strong>{item.display_name}</strong>
                  <small>
                    {item.uploaded_by_name || "?"} · {fileSize(item.size)}
                  </small>
                </span>
                <span className="doc-item-tags">
                  {item.is_presenting && <span className="pill info">Đang chiếu</span>}
                  <StatusPill value={item.status} kind="document" />
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="doc-view-pane">
        {!selected ? (
          <EmptyState
            title="Chưa có tài liệu để xem"
            description="Đăng tài liệu ở cột bên trái để cả phòng họp cùng xem và thảo luận."
          />
        ) : (
          <>
            <div className="doc-view-head">
              <div>
                <h3>{selected.display_name}</h3>
                <p className="muted small">
                  {selected.original_name} · {fileSize(selected.size)} ·{" "}
                  {selected.uploaded_by_name || "?"} · {formatDateTime(selected.created_at)}
                </p>
                {selected.description && <p className="muted small">{selected.description}</p>}
              </div>
              <div className="row-actions">
                <StatusPill value={selected.status} kind="document" />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => downloadDocument(selected)}
                >
                  <Download size={15} />
                  Tải về
                </button>
              </div>
            </div>

            {canManage && (
              <div className="doc-actions">
                {selected.status === "APPROVED" && (
                  <button className="secondary-button" onClick={() => onPresent?.(selected)}>
                    <Presentation size={15} />
                    {selected.is_presenting ? "Đang trình chiếu" : "Trình chiếu cho cả phòng"}
                  </button>
                )}
                {selected.is_presenting && (
                  <>
                    <button className="ghost-button" onClick={() => onPage?.(selected, -1)}>
                      Trang trước
                    </button>
                    <span className="muted small">Trang {selected.current_page || 1}</span>
                    <button className="ghost-button" onClick={() => onPage?.(selected, 1)}>
                      Trang sau
                    </button>
                  </>
                )}
                {selected.status === "PENDING" && (
                  <>
                    <button className="primary-button" onClick={() => onApprove?.(selected)}>
                      <Check size={15} />
                      Duyệt
                    </button>
                    <button className="ghost-button danger" onClick={() => onReject?.(selected)}>
                      <X size={15} />
                      Từ chối
                    </button>
                  </>
                )}
                <button className="ghost-button danger" onClick={() => onDelete?.(selected)}>
                  <Trash2 size={15} />
                  Xoá
                </button>
              </div>
            )}

            <div className="doc-preview">
              {previewError && <div className="alert error">{previewError}</div>}
              {kind === "pdf" && previewUrl && (
                <iframe title={selected.display_name} src={previewUrl} />
              )}
              {kind === "image" && previewUrl && (
                <img src={previewUrl} alt={selected.display_name} />
              )}
              {kind === "text" && previewUrl && (
                <iframe title={selected.display_name} src={previewUrl} />
              )}
              {kind === "download" && (
                <div className="doc-preview-fallback">
                  <FileText size={26} />
                  <strong>Không xem trực tiếp được định dạng này</strong>
                  <p className="muted small">
                    File Word, PowerPoint, Excel cần tải về máy để mở. Nội dung thảo luận và
                    ghi chú bên cạnh vẫn dùng bình thường.
                  </p>
                </div>
              )}
              {kind !== "download" && !previewUrl && !previewError && (
                <p className="muted small">Đang tải nội dung tài liệu...</p>
              )}
            </div>

            <div className="doc-ai-box">
              <div className="doc-ai-head">
                <h4>
                  <Sparkles size={15} />
                  Trợ lý AI cho tài liệu
                </h4>
                <div className="row-actions">
                  {selected.ai_summary_updated_at && (
                    <span className="muted small">
                      Tóm tắt {formatDateTime(selected.ai_summary_updated_at)}
                      {selected.ai_summary_model ? ` · ${selected.ai_summary_model}` : ""}
                    </span>
                  )}
                  {canSummarize && aiEnabled && (
                    <button
                      className="secondary-button"
                      onClick={runSummarize}
                      disabled={aiBusy}
                    >
                      <Sparkles size={15} />
                      {aiBusy
                        ? "Đang xử lý..."
                        : selected.ai_summary
                          ? "Tóm tắt lại"
                          : "Tóm tắt tài liệu"}
                    </button>
                  )}
                </div>
              </div>

              {!aiEnabled ? (
                <p className="muted small">
                  Chưa cấu hình khoá API nên tính năng AI đang tắt. Thêm ANTHROPIC_API_KEY
                  vào backend/.env để bật tóm tắt và hỏi đáp tài liệu.
                </p>
              ) : (
                <>
                  {selected.ai_summary ? (
                    <p className="doc-ai-content">{selected.ai_summary}</p>
                  ) : (
                    <p className="muted small">
                      Chưa có tóm tắt cho tài liệu này.
                      {canSummarize
                        ? " Bấm Tóm tắt tài liệu để AI đọc và rút gọn nội dung chính."
                        : " Chủ tọa hoặc thư ký sẽ tạo tóm tắt."}
                    </p>
                  )}

                  <div className="doc-ai-qa">
                    <form className="doc-ai-ask" onSubmit={submitQuestion}>
                      <input
                        value={questionInput}
                        onChange={(event) => setQuestionInput(event.target.value)}
                        placeholder="Hỏi về nội dung tài liệu, ví dụ: chỉ tiêu quý III là bao nhiêu?"
                        disabled={aiBusy}
                      />
                      <button className="primary-button" disabled={aiBusy || !questionInput.trim()}>
                        <MessageSquare size={15} />
                        Hỏi AI
                      </button>
                    </form>

                    {documentQuestions.length > 0 && (
                      <div className="doc-ai-thread">
                        {documentQuestions.map((item) => (
                          <div key={item.id} className="doc-ai-turn">
                            <p className="doc-ai-question">
                              <strong>{item.asked_by_name || "Người dự"}:</strong> {item.question}
                            </p>
                            <p className="doc-ai-answer">{item.answer}</p>
                            {Array.isArray(item.citations) && item.citations.length > 0 && (
                              <ul className="doc-ai-citations">
                                {item.citations.slice(0, 3).map((citation, index) => (
                                  <li key={index}>
                                    {citation.startPage
                                      ? `Trang ${citation.startPage}${
                                          citation.endPage && citation.endPage !== citation.startPage
                                            ? `-${citation.endPage}`
                                            : ""
                                        }: `
                                      : ""}
                                    <em>{String(citation.citedText || "").slice(0, 160)}</em>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="doc-side-pane">
        <nav className="side-tabs">
          <button
            className={sideTab === "chat" ? "active" : ""}
            onClick={() => setSideTab("chat")}
          >
            <MessageSquare size={15} />
            Thảo luận
            <em>{documentMessages.length}</em>
          </button>
          <button
            className={sideTab === "notes" ? "active" : ""}
            onClick={() => setSideTab("notes")}
          >
            <NotebookPen size={15} />
            Ghi chú
          </button>
        </nav>

        {sideTab === "chat" ? (
          <div className="doc-chat">
            <div className="chat-list">
              {!selected ? (
                <p className="muted small">Chọn một tài liệu để thảo luận.</p>
              ) : documentMessages.length === 0 ? (
                <p className="muted small">
                  Chưa có trao đổi nào về tài liệu này. Ý kiến ở đây được lưu riêng cho tài
                  liệu, tách khỏi chat chung của phòng họp.
                </p>
              ) : (
                documentMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message ${
                      message.sender_id === currentUserId ? "is-mine" : ""
                    }`}
                  >
                    <strong>{message.sender_name || message.sender_email}</strong>
                    <p>{message.content}</p>
                    <small className="muted">{formatDateTime(message.created_at)}</small>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              <input
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder={selected ? "Góp ý về tài liệu này..." : "Chọn tài liệu trước"}
                disabled={!selected}
              />
              <button className="primary-button" disabled={!selected} aria-label="Gửi">
                <Send size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div className="doc-notes">
            <textarea
              value={noteDraft}
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteDirty(true);
              }}
              readOnly={!canEditNotes || !selected}
              placeholder={
                canEditNotes
                  ? "Ghi chú chung về tài liệu: kết luận, điểm cần sửa, phân công..."
                  : "Chỉ chủ tọa và thư ký được ghi vào đây."
              }
            />
            <div className="doc-notes-foot">
              <span className="muted small">
                {selectedNote?.updated_by_name
                  ? `${selectedNote.updated_by_name} sửa lúc ${formatDateTime(selectedNote.updated_at)}`
                  : "Chưa có ghi chú"}
              </span>
              {canEditNotes && (
                <button
                  className="primary-button"
                  onClick={saveNote}
                  disabled={!selected || !noteDirty}
                >
                  Lưu ghi chú
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
