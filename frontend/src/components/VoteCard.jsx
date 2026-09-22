import { BarChart3, CheckCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { percent, voteAnswerLabel, voteOptions } from "../utils/meeting.js";
import { StatusPill } from "./StatusPill.jsx";

/**
 * Thẻ biểu quyết dùng chung cho trang chi tiết cuộc họp và phòng họp.
 *
 * Khi phiên còn mở chỉ hiển thị tiến độ bỏ phiếu để tránh tâm lý theo số đông;
 * chốt xong mới hiện phân bố phiếu. Chủ tọa có thể xem kết quả tạm tính.
 */
export function VoteCard({
  vote,
  result,
  canManage = false,
  canVote = false,
  participantCount = 0,
  busy = false,
  onOpen,
  onClose,
  onAnswer,
  onResults,
  onDelete
}) {
  const [showLive, setShowLive] = useState(false);
  const options = voteOptions(vote);
  const total = result?.summary?.eligibleVoters || participantCount || 0;
  const voted = result?.summary?.totalResponses ?? Number(vote.response_count || 0);
  const showResults = vote.status === "CLOSED" || showLive;

  return (
    <article className={`vote-card is-${String(vote.status || "").toLowerCase()}`}>
      <header>
        <div>
          <h3>{vote.title}</h3>
          {vote.description && <p>{vote.description}</p>}
        </div>
        <div className="row-actions">
          {vote.is_anonymous && <span className="pill neutral">Biểu quyết kín</span>}
          <StatusPill value={vote.status} kind="vote" />
        </div>
      </header>

      <div className="vote-progress">
        <div className="vote-progress-bar">
          <span style={{ width: `${percent(voted, total)}%` }} />
        </div>
        <span className="muted small">
          {voted}/{total} người đã bỏ phiếu
        </span>
      </div>

      {canVote && vote.status === "OPEN" && !vote.my_answer && (
        <div className="vote-options">
          {options.map((option) => (
            <button
              key={option}
              className="secondary-button"
              disabled={busy}
              onClick={() => onAnswer?.(vote, option)}
            >
              {voteAnswerLabel(option)}
            </button>
          ))}
        </div>
      )}
      {vote.my_answer && (
        <p className="vote-my-answer">
          <CheckCheck size={15} />
          Bạn đã chọn: <strong>{voteAnswerLabel(vote.my_answer)}</strong>
        </p>
      )}
      {canVote && vote.status === "DRAFT" && (
        <p className="muted small">Biểu quyết chưa mở, hãy chờ chủ tọa.</p>
      )}

      {showResults && result?.results && (
        <div className="vote-results">
          {result.results.map((row) => (
            <div key={row.answer} className="vote-result-row">
              <span>{voteAnswerLabel(row.answer)}</span>
              <div className="vote-result-bar">
                <span style={{ width: `${percent(row.count, voted || 1)}%` }} />
              </div>
              <strong>
                {row.count} · {percent(row.count, voted || 1)}%
              </strong>
            </div>
          ))}
        </div>
      )}

      <footer className="row-actions">
        {canManage && vote.status !== "OPEN" && vote.status !== "CLOSED" && (
          <button className="primary-button" onClick={() => onOpen?.(vote)} disabled={busy}>
            Mở lấy ý kiến
          </button>
        )}
        {canManage && vote.status === "CLOSED" && (
          <button className="ghost-button" onClick={() => onOpen?.(vote)} disabled={busy}>
            Mở lại
          </button>
        )}
        {canManage && vote.status === "OPEN" && (
          <>
            <button
              className="secondary-button"
              onClick={() => onClose?.(vote)}
              disabled={busy}
            >
              Chốt kết quả
            </button>
            <button
              className="ghost-button"
              onClick={async () => {
                await onResults?.(vote.id);
                setShowLive((current) => !current);
              }}
            >
              <BarChart3 size={15} />
              {showLive ? "Ẩn kết quả tạm tính" : "Xem kết quả tạm tính"}
            </button>
          </>
        )}
        {vote.status === "CLOSED" && !result && (
          <button className="ghost-button" onClick={() => onResults?.(vote.id)}>
            <BarChart3 size={15} />
            Xem kết quả
          </button>
        )}
        {canManage && vote.status === "DRAFT" && onDelete && (
          <button className="ghost-button danger" onClick={() => onDelete(vote)}>
            <Trash2 size={15} />
            Xoá nháp
          </button>
        )}
      </footer>
    </article>
  );
}
