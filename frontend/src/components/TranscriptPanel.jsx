import {
  Check,
  Download,
  Mic,
  MicOff,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { EmptyState } from "./EmptyState.jsx";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { formatDateTime } from "../utils/format.js";

/**
 * Bản ghi lời nói của cuộc họp.
 *
 * Người phát biểu bật micro, trình duyệt nhận dạng ngay trên máy họ rồi gửi
 * từng đoạn đã chốt về máy chủ. Chủ tọa và thư ký sửa được đoạn máy nghe sai —
 * bản ghi này sẽ đi vào biên bản có ký số nên không thể để nguyên chữ sai.
 *
 * Dùng chung cho phòng họp trực tuyến (có ghi) và trang chi tiết cuộc họp (chỉ
 * đọc lại). `canRecord` quyết định có hiện nút micro hay không.
 */
export function TranscriptPanel({
  meetingId,
  segments,
  canRecord = false,
  canEdit = false,
  canSummarize = false,
  aiEnabled = false,
  aiSummary = null,
  onSegment,
  onReload,
  onNotice,
  onError
}) {
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const atBottomRef = useRef(true);

  // Giữ tham chiếu tới bộ nhận dạng để callback tắt được micro khi gửi lỗi,
  // mà không phải khai báo `speech` trước `pushSegment`.
  const speechRef = useRef(null);

  /** Gửi một đoạn vừa nghe được về máy chủ. */
  const pushSegment = useCallback(
    async (segment) => {
      try {
        const res = await api.post(`/meetings/${meetingId}/transcript`, segment);
        // Socket cũng phát lại bản này, nhưng tự chèn luôn để người nói thấy ngay.
        onSegment?.(res.data.data);
      } catch (err) {
        onError?.(err.response?.data?.message || "Không gửi được đoạn ghi lời nói");
        // Gửi thất bại thì tắt micro, không để người ta nói tiếp vào chỗ trống.
        speechRef.current?.stop();
      }
    },
    [meetingId, onSegment, onError]
  );

  const speech = useSpeechRecognition({ onSegment: pushSegment });
  speechRef.current = speech;

  useEffect(() => {
    if (speech.error) onError?.(speech.error);
  }, [speech.error, onError]);

  // Chỉ tự cuộn khi người xem đang ở cuối danh sách, không giật khi họ đọc lại.
  useEffect(() => {
    const node = listRef.current;
    if (node && atBottomRef.current) node.scrollTop = node.scrollHeight;
  }, [segments, speech.interim]);

  function trackScroll(event) {
    const node = event.currentTarget;
    atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return segments;
    return segments.filter(
      (item) =>
        item.content.toLowerCase().includes(needle) ||
        (item.speaker_name || "").toLowerCase().includes(needle)
    );
  }, [segments, query]);

  const wordCount = useMemo(
    () => segments.reduce((total, item) => total + item.content.trim().split(/\s+/).length, 0),
    [segments]
  );

  const speakers = useMemo(
    () => new Set(segments.map((item) => item.speaker_name)).size,
    [segments]
  );

  async function saveEdit(id) {
    const content = editText.trim();
    if (!content) return;
    setBusy(true);
    try {
      await api.put(`/transcript/${id}`, { content });
      setEditId(null);
      onNotice?.("Đã sửa đoạn ghi lời nói");
      await onReload?.();
    } catch (err) {
      onError?.(err.response?.data?.message || "Không sửa được đoạn này");
    } finally {
      setBusy(false);
    }
  }

  async function removeSegment(id) {
    setBusy(true);
    try {
      await api.delete(`/transcript/${id}`);
      onNotice?.("Đã xoá đoạn ghi lời nói");
      await onReload?.();
    } catch (err) {
      onError?.(err.response?.data?.message || "Không xoá được đoạn này");
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    setSummarizing(true);
    try {
      await api.post(`/meetings/${meetingId}/public-notes/ai-summary`);
      onNotice?.("AI đã tổng hợp diễn biến từ lời nói và trao đổi trong phòng");
      await onReload?.();
    } catch (err) {
      onError?.(err.response?.data?.message || "Không tổng hợp được");
    } finally {
      setSummarizing(false);
    }
  }

  /** Tải bản ghi ra file chữ để lưu hồ sơ ngoài hệ thống. */
  function download() {
    const body = segments
      .map(
        (item) =>
          `[${formatDateTime(item.spoken_at)}] ${item.speaker_name}: ${item.content}` +
          (item.is_edited ? "  (đã sửa)" : "")
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ban-ghi-loi-noi.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="transcript-panel">
      <div className="transcript-head">
        <div>
          <span className="eyebrow">Bản ghi lời nói</span>
          <h2>
            {segments.length} lượt phát biểu
            {speakers ? ` · ${speakers} người nói` : ""}
            {wordCount ? ` · ~${wordCount} từ` : ""}
          </h2>
        </div>

        <div className="transcript-actions">
          {canRecord && speech.supported && (
            <button
              className={speech.listening ? "danger-button" : "primary-button"}
              onClick={speech.toggle}
            >
              {speech.listening ? <MicOff size={16} /> : <Mic size={16} />}
              {speech.listening ? "Dừng ghi lời nói" : "Ghi lời nói của tôi"}
            </button>
          )}
          {segments.length > 0 && (
            <button className="secondary-button" onClick={download}>
              <Download size={16} />
              Tải bản ghi
            </button>
          )}
          {canSummarize && aiEnabled && segments.length > 0 && (
            <button className="secondary-button" onClick={summarize} disabled={summarizing}>
              <Sparkles size={16} />
              {summarizing ? "AI đang tóm tắt..." : "AI tóm tắt"}
            </button>
          )}
        </div>
      </div>

      {canRecord && !speech.supported && (
        <p className="inline-note">
          <MicOff size={14} />
          Trình duyệt này không hỗ trợ nhận dạng giọng nói. Mở phòng họp bằng Chrome
          hoặc Edge để ghi lời nói; các việc khác vẫn dùng bình thường.
        </p>
      )}

      {speech.listening && (
        <p className="transcript-live">
          <span className="transcript-dot" />
          Đang nghe và ghi lời nói của bạn
          {speech.interim ? `: ${speech.interim}` : "..."}
        </p>
      )}

      {segments.length > 6 && (
        <label className="transcript-search">
          <Search size={15} />
          <input
            placeholder="Tìm trong bản ghi theo nội dung hoặc tên người nói"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      {segments.length === 0 ? (
        <EmptyState
          title="Chưa ghi được lời nói nào"
          description={
            canRecord
              ? "Bấm “Ghi lời nói của tôi” khi bạn phát biểu. Mỗi người tự bật trên máy mình nên bản ghi biết rõ ai nói câu nào."
              : "Bản ghi sẽ hiện ở đây khi người phát biểu bật ghi lời nói trong phòng họp."
          }
        />
      ) : (
        <ul className="transcript-list" ref={listRef} onScroll={trackScroll}>
          {filtered.map((item) => (
            <li key={item.id} className="transcript-item">
              <div className="transcript-meta">
                <strong>{item.speaker_name}</strong>
                <span className="muted small">{formatDateTime(item.spoken_at)}</span>
                {item.agenda_title && (
                  <span className="transcript-tag">{item.agenda_title}</span>
                )}
                {item.is_edited && (
                  <span className="transcript-tag edited">
                    đã sửa{item.edited_by_name ? ` · ${item.edited_by_name}` : ""}
                  </span>
                )}
                {canEdit && editId !== item.id && (
                  <span className="transcript-item-actions">
                    <button
                      className="icon-button"
                      title="Sửa đoạn máy nghe sai"
                      onClick={() => {
                        setEditId(item.id);
                        setEditText(item.content);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      title="Xoá đoạn này"
                      disabled={busy}
                      onClick={() => removeSegment(item.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>

              {editId === item.id ? (
                <div className="transcript-edit">
                  <textarea
                    rows={3}
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <div className="row-actions start">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => saveEdit(item.id)}
                    >
                      <Check size={15} />
                      Lưu
                    </button>
                    <button className="secondary-button" onClick={() => setEditId(null)}>
                      <X size={15} />
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <p>{item.content}</p>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="transcript-item">
              <p className="muted">Không có đoạn nào khớp với “{query}”.</p>
            </li>
          )}
        </ul>
      )}

      {aiSummary?.ai_summary && (
        <div className="fact-block ai-summary">
          <span className="fact-label">
            Bản tổng hợp của AI
            {aiSummary.ai_summary_speech_count
              ? ` · ${aiSummary.ai_summary_speech_count} lượt phát biểu`
              : ""}
            {aiSummary.ai_summary_message_count
              ? ` · ${aiSummary.ai_summary_message_count} tin nhắn`
              : ""}
            {aiSummary.ai_summary_updated_at
              ? ` · ${formatDateTime(aiSummary.ai_summary_updated_at)}`
              : ""}
          </span>
          <pre className="summary-text">{aiSummary.ai_summary}</pre>
          <p className="muted small">
            Đây là bản nháp máy dựng. Thư ký rà soát rồi đưa vào mục “Diễn biến và ý
            kiến thảo luận” của biên bản trước khi ký.
          </p>
        </div>
      )}
    </div>
  );
}
