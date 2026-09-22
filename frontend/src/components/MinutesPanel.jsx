import {
  Download,
  ExternalLink,
  FileSignature,
  MessagesSquare,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Unlock
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { EmptyState } from "./EmptyState.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { formatDateTime } from "../utils/format.js";

/**
 * Hồ sơ biên bản của một cuộc họp.
 *
 * Quy trình: tự sinh nội dung từ dữ liệu cuộc họp → chủ tọa rà soát và bổ sung
 * kết luận → chủ tọa và thư ký ký số → ban hành. Sau khi có chữ ký, nội dung bị
 * khoá; muốn sửa phải gỡ chữ ký (thao tác này được ghi vào nhật ký truy vết).
 */
export function MinutesPanel({
  meetingId,
  isOrganizer,
  canSign,
  canDraft = false,
  onNotice,
  onError
}) {
  const [minutes, setMinutes] = useState(null);
  const [content, setContent] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [dirty, setDirty] = useState(false);
  // Mục "Diễn biến và ý kiến thảo luận" là phần duy nhất bộ tự sinh không lắp
  // ráp được từ dữ liệu có cấu trúc, nên có AI tổng hợp riêng từ chat phòng họp.
  const [notes, setNotes] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/meetings/${meetingId}/minutes`);
      const data = res.data.data;
      setMinutes(data);
      setContent(data?.content || "");
      setConclusion(data?.conclusion || "");
      setDirty(false);
    } catch (err) {
      onError?.(err.response?.data?.message || "Không tải được biên bản");
    } finally {
      setLoading(false);
    }
  }, [meetingId, onError]);

  const loadNotes = useCallback(async () => {
    try {
      const res = await api.get(`/meetings/${meetingId}/public-notes`);
      setNotes(res.data.data);
    } catch {
      setNotes(null);
    }
  }, [meetingId]);

  useEffect(() => {
    load();
    loadNotes();
  }, [load, loadNotes]);

  useEffect(() => {
    api
      .get("/documents/ai/status")
      .then((res) => setAiEnabled(Boolean(res.data.data?.configured)))
      .catch(() => setAiEnabled(false));
  }, []);

  /** AI đọc chat phòng họp, dựng bản nháp mục diễn biến thảo luận. */
  async function summarizeDiscussion() {
    setSummarizing(true);
    try {
      const res = await api.post(`/meetings/${meetingId}/public-notes/ai-summary`);
      setNotes(res.data.data);
      onNotice?.("AI đã tổng hợp xong ý kiến thảo luận");
    } catch (err) {
      onError?.(err.response?.data?.message || "Không tổng hợp được thảo luận");
    } finally {
      setSummarizing(false);
    }
  }

  /**
   * Đưa bản nháp của AI thành ghi chú chung — đây là thao tác người dùng xác
   * nhận đã đọc, sau đó bộ sinh biên bản mới lấy nội dung này vào mục VI.
   */
  async function useSummaryAsNotes() {
    try {
      const res = await api.put(`/meetings/${meetingId}/public-notes`, {
        content: notes.ai_summary
      });
      setNotes((current) => ({ ...current, content: res.data.data.content }));
      onNotice?.("Đã đưa bản tổng hợp vào ghi chú chung của cuộc họp");
    } catch (err) {
      onError?.(err.response?.data?.message || "Không lưu được ghi chú chung");
    }
  }

  async function run(action, success) {
    setBusy(true);
    try {
      await action();
      if (success) onNotice?.(success);
      await load();
      return true;
    } catch (err) {
      onError?.(err.response?.data?.message || "Thao tác thất bại");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    run(
      () => api.post(`/meetings/${meetingId}/minutes/generate`),
      "Đã dựng biên bản từ dữ liệu cuộc họp"
    );

  const save = () =>
    run(
      () => api.post(`/meetings/${meetingId}/minutes`, { content, conclusion }),
      "Đã lưu biên bản"
    );

  const sign = () =>
    run(() => api.post(`/minutes/${minutes.id}/sign`), "Đã ký số biên bản");

  const revoke = () =>
    run(
      () => api.delete(`/minutes/${minutes.id}/signatures`),
      "Đã gỡ chữ ký, biên bản mở lại để chỉnh sửa"
    );

  const publish = () =>
    run(() => api.put(`/minutes/${minutes.id}/publish`), "Đã ban hành biên bản");

  async function downloadPdf() {
    try {
      const res = await api.get(`/minutes/${minutes.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bien-ban-${minutes.verification_code || minutes.id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      onError?.("Không tải được file PDF biên bản");
    }
  }

  if (loading) return <div className="boot-screen">Đang tải biên bản...</div>;

  const integrity = minutes?.integrity;
  const signed = Boolean(integrity?.signed);
  const published = minutes?.status === "PUBLISHED";
  const editable = isOrganizer && !signed && !published;
  const mySignaturePending =
    canSign && !integrity?.signatures?.some((item) => item.valid === true && item.mine);

  if (!minutes && !isOrganizer) {
    return <EmptyState title="Biên bản chưa được ban hành" />;
  }

  return (
    <div className="minutes-panel">
      <div className="minutes-toolbar">
        <div className="row-actions">
          <StatusPill value={minutes?.status || "DRAFT"} />
          {signed && (
            <span className={`pill ${integrity.intact ? "success" : "danger"}`}>
              {integrity.intact ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
              {integrity.intact
                ? `Đã ký (${integrity.signatures.length})`
                : "Chữ ký không còn hợp lệ"}
            </span>
          )}
          {minutes?.generated_at && (
            <span className="muted small">
              Tự sinh lúc {formatDateTime(minutes.generated_at)}
            </span>
          )}
        </div>
        <div className="row-actions">
          {canDraft && aiEnabled && !signed && !published && (
            <button
              className="secondary-button"
              onClick={summarizeDiscussion}
              disabled={summarizing || busy}
              title="AI đọc toàn bộ trao đổi trong phòng họp và dựng mục diễn biến thảo luận"
            >
              <MessagesSquare size={16} />
              {summarizing ? "Đang tổng hợp..." : "AI tổng hợp thảo luận"}
            </button>
          )}
          {isOrganizer && !signed && !published && (
            <button className="secondary-button" onClick={generate} disabled={busy}>
              <Sparkles size={16} />
              {minutes ? "Dựng lại từ dữ liệu họp" : "Tự sinh biên bản"}
            </button>
          )}
          {minutes && (
            <button className="secondary-button" onClick={downloadPdf} disabled={busy}>
              <Download size={16} />
              Tải PDF
            </button>
          )}
        </div>
      </div>

      {notes?.ai_summary && (
        <div className="ai-discussion">
          <div className="ai-discussion-head">
            <strong>
              <MessagesSquare size={15} /> Bản tổng hợp thảo luận của AI
            </strong>
            <span className="muted small">
              {notes.ai_summary_message_count || 0} ý kiến ·{" "}
              {formatDateTime(notes.ai_summary_updated_at)}
            </span>
          </div>
          <p className="muted small">
            Đây là <strong>bản nháp</strong>. Biên bản có ký số nên hãy đọc lại rồi mới đưa
            vào — mục VI của biên bản lấy từ ghi chú chung.
          </p>
          <pre className="ai-discussion-body">{notes.ai_summary}</pre>
          {canDraft && (
            <button className="secondary-button" onClick={useSummaryAsNotes}>
              <Send size={15} />
              Dùng làm ghi chú chung
            </button>
          )}
        </div>
      )}

      {!minutes ? (
        <EmptyState
          title="Chưa có biên bản"
          description="Bấm Tự sinh biên bản để hệ thống dựng sẵn nội dung từ thành phần dự họp, chương trình, tài liệu, kết quả biểu quyết và nhiệm vụ đã giao."
        />
      ) : (
        <>
          {signed && !integrity.intact && (
            <div className="alert error">
              Nội dung đã thay đổi sau khi ký nên chữ ký không còn hợp lệ. Hãy gỡ chữ ký,
              sửa lại rồi ký mới.
            </div>
          )}
          {signed && !published && integrity.intact && (
            <div className="alert success">
              Biên bản đã ký và còn nguyên vẹn, có thể ban hành cho toàn bộ thành phần dự họp.
            </div>
          )}

          <label className="minutes-field">
            Nội dung biên bản
            <textarea
              className="minutes-editor"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setDirty(true);
              }}
              readOnly={!editable}
              rows={18}
            />
          </label>

          <label className="minutes-field">
            Kết luận của chủ tọa
            <textarea
              value={conclusion}
              onChange={(event) => {
                setConclusion(event.target.value);
                setDirty(true);
              }}
              readOnly={!editable}
              rows={3}
              placeholder="Ví dụ: Thông qua kế hoạch quý IV, giao phòng Kế hoạch hoàn thiện trước 30/10."
            />
          </label>

          <div className="row-actions start">
            {editable && (
              <button className="primary-button" onClick={save} disabled={busy || !dirty}>
                <Save size={16} />
                Lưu biên bản
              </button>
            )}
            {canSign && !published && (
              <button
                className="primary-button"
                onClick={sign}
                disabled={busy || dirty}
                title={dirty ? "Hãy lưu nội dung trước khi ký" : "Ký số biên bản"}
              >
                <FileSignature size={16} />
                {mySignaturePending ? "Ký số biên bản" : "Ký lại"}
              </button>
            )}
            {isOrganizer && signed && !published && (
              <button className="ghost-button" onClick={revoke} disabled={busy}>
                <Unlock size={16} />
                Gỡ chữ ký để sửa
              </button>
            )}
            {isOrganizer && !published && (
              <button className="secondary-button" onClick={publish} disabled={busy || !signed}>
                <Send size={16} />
                Ban hành
              </button>
            )}
            {isOrganizer && !signed && (
              <span className="muted small">Phải ký số trước khi ban hành.</span>
            )}
          </div>

          <div className="minutes-signatures">
            <h3>
              <FileSignature size={16} />
              Chữ ký số ({integrity?.signatures?.length || 0})
            </h3>
            {!signed ? (
              <p className="muted small">
                Chưa có chữ ký. Chủ tọa và thư ký của cuộc họp ký số ngay trên hệ thống,
                mỗi chữ ký gắn với mã băm SHA-256 của nội dung tại thời điểm ký.
              </p>
            ) : (
              integrity.signatures.map((signature) => (
                <div
                  key={signature.id}
                  className={`signature-row ${signature.valid ? "is-valid" : "is-error"}`}
                >
                  <span>
                    {signature.valid ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
                  </span>
                  <div>
                    <strong>
                      {signature.signerName} — {signature.signerTitle}
                    </strong>
                    <small>
                      Ký lúc {formatDateTime(signature.signedAt)} · {signature.algorithm}
                    </small>
                    {!signature.valid && <p className="verify-reason">{signature.reason}</p>}
                  </div>
                </div>
              ))
            )}
          </div>

          {published && minutes.verification_code && (
            <div className="minutes-verify-box">
              <div>
                <span className="eyebrow">Tra cứu công khai</span>
                <strong>{minutes.verification_code}</strong>
                <p className="muted small">
                  Mã này in kèm QR ở chân trang PDF. Người nhận bản in quét mã là kiểm tra
                  được biên bản có thật và còn nguyên vẹn hay không.
                </p>
              </div>
              <a
                className="secondary-button"
                href={minutes.verificationUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                Mở trang tra cứu
              </a>
            </div>
          )}

          <p className="muted small">
            Mã băm hiện tại: <code className="hash-inline">{integrity?.currentHash}</code>
          </p>

          <button className="ghost-button" onClick={load} disabled={busy}>
            <RefreshCw size={15} />
            Kiểm tra lại tính toàn vẹn
          </button>
        </>
      )}
    </div>
  );
}
