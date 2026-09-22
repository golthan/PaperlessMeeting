import { BadgeCheck, FileWarning, Search, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { formatDateTime } from "../utils/format.js";

/**
 * Trang tra cứu biên bản — công khai, không cần đăng nhập.
 *
 * Người cầm bản in quét mã QR ở chân trang biên bản là vào đây. Hệ thống băm
 * lại nội dung đang lưu và kiểm tra từng chữ ký số để trả lời hai câu hỏi:
 * biên bản này có thật không, và nội dung có bị sửa sau khi ký không.
 */
export function VerifyMinutesPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(target) {
    const value = String(target || "").trim().toUpperCase();
    if (!value) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.get(`/public/minutes/${encodeURIComponent(value)}`);
      setResult(res.data.data);
    } catch (err) {
      setError(
        err.response?.data?.message || "Không tra cứu được biên bản với mã này"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (code) lookup(code);
  }, [code]);

  function submit(event) {
    event.preventDefault();
    const value = input.trim().toUpperCase();
    if (!value) return;
    if (value !== code) navigate(`/verify/${encodeURIComponent(value)}`);
    else lookup(value);
  }

  return (
    <div className="verify-page">
      <div className="verify-card">
        <header className="verify-head">
          <span className="verify-logo">
            <BadgeCheck size={26} />
          </span>
          <div>
            <h1>Tra cứu biên bản điện tử</h1>
            <p>
              Nhập mã tra cứu in ở chân biên bản (hoặc quét mã QR) để kiểm tra biên bản
              có thật và còn nguyên vẹn hay không.
            </p>
          </div>
        </header>

        <form className="verify-form" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ví dụ: BB-3F7A9C2D"
            autoFocus
          />
          <button className="primary-button" disabled={loading}>
            <Search size={16} />
            {loading ? "Đang kiểm tra..." : "Tra cứu"}
          </button>
        </form>

        {error && (
          <div className="verify-result is-error">
            <FileWarning size={22} />
            <div>
              <strong>Không tìm thấy biên bản</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className={`verify-result ${result.intact ? "is-valid" : "is-error"}`}>
              {result.intact ? <ShieldCheck size={22} /> : <ShieldX size={22} />}
              <div>
                <strong>
                  {result.intact
                    ? "Biên bản hợp lệ, nội dung còn nguyên vẹn"
                    : "Cảnh báo: nội dung biên bản đã bị thay đổi sau khi ký"}
                </strong>
                <p>
                  {result.intact
                    ? "Chữ ký số khớp với nội dung đang lưu trên hệ thống."
                    : "Mã băm của nội dung hiện tại không khớp với mã băm lúc ký. Không sử dụng bản này làm căn cứ."}
                </p>
              </div>
            </div>

            <dl className="verify-meta">
              <div>
                <dt>Mã tra cứu</dt>
                <dd>{result.verificationCode}</dd>
              </div>
              <div>
                <dt>Cuộc họp</dt>
                <dd>{result.meetingTitle}</dd>
              </div>
              <div>
                <dt>Thời gian họp</dt>
                <dd>{formatDateTime(result.meetingStartTime)}</dd>
              </div>
              <div>
                <dt>Chủ tọa</dt>
                <dd>{result.organizerName}</dd>
              </div>
              <div>
                <dt>Ngày ban hành</dt>
                <dd>{formatDateTime(result.publishedAt)}</dd>
              </div>
              <div className="wide">
                <dt>Mã băm SHA-256</dt>
                <dd className="verify-hash">{result.contentHash}</dd>
              </div>
            </dl>

            <h2 className="verify-subtitle">Chữ ký số ({result.signatures.length})</h2>
            <div className="verify-signatures">
              {result.signatures.map((signature, index) => (
                <div
                  key={index}
                  className={`verify-signature ${signature.valid ? "is-valid" : "is-error"}`}
                >
                  <span>
                    {signature.valid ? <ShieldCheck size={18} /> : <ShieldX size={18} />}
                  </span>
                  <div>
                    <strong>{signature.signerName}</strong>
                    <small>
                      {signature.signerTitle} · ký lúc {formatDateTime(signature.signedAt)} ·{" "}
                      {signature.algorithm}
                    </small>
                    {!signature.valid && <p className="verify-reason">{signature.reason}</p>}
                  </div>
                </div>
              ))}
            </div>

            <p className="verify-note">
              Trang này chỉ hiển thị thông tin xác thực, không hiển thị nội dung biên bản.
              Muốn đọc nội dung, hãy đăng nhập hệ thống bằng tài khoản được cấp.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
