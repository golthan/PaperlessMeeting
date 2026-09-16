import { pool } from "../../config/db.js";
import { formatMeetingTime } from "../../utils/datetime.js";

/**
 * Tự sinh biên bản cuộc họp từ dữ liệu đã có trong hệ thống.
 *
 * Ý tưởng: mọi thông tin cần cho biên bản đều đã nằm trong database rồi —
 * thành phần dự và điểm danh, chương trình nghị sự, tài liệu đã duyệt, kết quả
 * biểu quyết, ghi chú chung, nhiệm vụ được giao. Thay vì bắt thư ký gõ lại,
 * hệ thống ghép sẵn thành một bản nháp hoàn chỉnh, người dùng chỉ việc rà và
 * bổ sung phần kết luận.
 */

const TYPE_LABELS = {
  OFFLINE: "Họp tập trung",
  ONLINE: "Họp trực tuyến",
  HYBRID: "Họp tập trung kết hợp trực tuyến"
};

const ATTENDANCE_LABELS = {
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  ABSENT: "Vắng mặt"
};

const VOTE_ANSWER_LABELS = {
  YES: "Tán thành",
  NO: "Không tán thành",
  ABSTAIN: "Không ý kiến"
};

function percent(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/** Lấy toàn bộ dữ liệu cần cho biên bản trong một lần. */
async function loadMeetingData(meetingId) {
  const [meeting, participants, agenda, documents, votes, notes, tasks] =
    await Promise.all([
      pool.query(
        `SELECT m.*, r.name AS room_name, r.location AS room_location,
                u.full_name AS organizer_name
         FROM meetings m
         LEFT JOIN rooms r ON r.id = m.room_id
         JOIN users u ON u.id = m.organizer_id
         WHERE m.id = $1`,
        [meetingId]
      ),
      pool.query(
        `SELECT mp.*, u.full_name, u.email, d.name AS department_name
         FROM meeting_participants mp
         JOIN users u ON u.id = mp.user_id
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE mp.meeting_id = $1
         ORDER BY u.full_name ASC`,
        [meetingId]
      ),
      pool.query(
        `SELECT a.*, u.full_name AS presenter_name
         FROM agenda_items a
         LEFT JOIN users u ON u.id = a.presenter_id
         WHERE a.meeting_id = $1
         ORDER BY a.sort_order ASC, a.created_at ASC`,
        [meetingId]
      ),
      pool.query(
        `SELECT doc.*, u.full_name AS uploaded_by_name
         FROM documents doc
         JOIN users u ON u.id = doc.uploaded_by
         WHERE doc.meeting_id = $1 AND doc.deleted_at IS NULL AND doc.status = 'APPROVED'
         ORDER BY doc.created_at ASC`,
        [meetingId]
      ),
      pool.query(
        `SELECT v.*,
                COALESCE(
                  json_agg(json_build_object('answer', vr.answer))
                  FILTER (WHERE vr.id IS NOT NULL),
                  '[]'
                ) AS responses
         FROM votes v
         LEFT JOIN vote_responses vr ON vr.vote_id = v.id
         WHERE v.meeting_id = $1
         GROUP BY v.id
         ORDER BY v.created_at ASC`,
        [meetingId]
      ),
      pool.query("SELECT * FROM meeting_notes WHERE meeting_id = $1", [meetingId]),
      pool.query(
        `SELECT t.*, u.full_name AS assigned_to_name
         FROM meeting_tasks t
         JOIN users u ON u.id = t.assigned_to
         WHERE t.meeting_id = $1 AND t.deleted_at IS NULL
         ORDER BY t.created_at ASC`,
        [meetingId]
      )
    ]);

  return {
    meeting: meeting.rows[0],
    participants: participants.rows,
    agenda: agenda.rows,
    documents: documents.rows,
    votes: votes.rows,
    notes: notes.rows[0] || null,
    tasks: tasks.rows
  };
}

/** Đếm phiếu và rút ra kết luận thông qua hay không thông qua. */
export function summarizeVote(vote) {
  const responses = Array.isArray(vote.responses) ? vote.responses : [];
  const options = Array.isArray(vote.options) ? vote.options : JSON.parse(vote.options || "[]");
  const counts = new Map(options.map((option) => [option, 0]));
  for (const item of responses) {
    counts.set(item.answer, (counts.get(item.answer) || 0) + 1);
  }

  const total = responses.length;
  const yes = counts.get("YES") || 0;
  const isYesNo = vote.type === "YES_NO_ABSTAIN";
  // Quy ước: quá bán số phiếu đã bỏ thì coi như thông qua.
  const approved = isYesNo && total > 0 && yes * 2 > total;

  return {
    total,
    counts: [...counts.entries()].map(([answer, count]) => ({
      answer,
      label: VOTE_ANSWER_LABELS[answer] || answer,
      count,
      percent: percent(count, total)
    })),
    approved,
    conclusion: !isYesNo
      ? null
      : total === 0
        ? "Chưa có phiếu biểu quyết"
        : approved
          ? "Thông qua"
          : "Không thông qua"
  };
}

/**
 * Dựng nội dung biên bản dạng văn bản có đánh mục.
 * Dùng ký hiệu "## " ở đầu dòng để đánh dấu tiêu đề mục — trình xuất PDF dựa
 * vào đó để in đậm, còn trên web hiển thị nguyên văn cho dễ sửa.
 */
export async function generateMinutesContent(meetingId) {
  const data = await loadMeetingData(meetingId);
  const { meeting, participants, agenda, documents, votes, notes, tasks } = data;
  if (!meeting) return null;

  const present = participants.filter((p) => p.attendance_status === "PRESENT");
  const late = participants.filter((p) => p.attendance_status === "LATE");
  const absent = participants.filter(
    (p) => !p.attendance_status || p.attendance_status === "ABSENT"
  );
  const secretary = participants.find((p) => p.role_in_meeting === "SECRETARY");

  const lines = [];
  const push = (text = "") => lines.push(text);

  push("## I. THÔNG TIN CHUNG");
  push(`Tên cuộc họp: ${meeting.title}`);
  push(`Hình thức: ${TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}`);
  push(`Thời gian bắt đầu: ${formatMeetingTime(meeting.start_time)}`);
  push(`Thời gian kết thúc: ${formatMeetingTime(meeting.end_time)}`);
  push(
    `Địa điểm: ${
      meeting.meeting_type === "ONLINE"
        ? "Phòng họp trực tuyến"
        : [meeting.room_name, meeting.room_location].filter(Boolean).join(" - ") ||
          "Chưa xác định"
    }${meeting.meeting_type === "HYBRID" ? " (có kết nối trực tuyến)" : ""}`
  );
  push(`Chủ trì: ${meeting.organizer_name}`);
  push(`Thư ký: ${secretary?.full_name || "Chưa chỉ định"}`);
  if (meeting.description) push(`Nội dung chính: ${meeting.description}`);
  push();

  push("## II. THÀNH PHẦN THAM DỰ");
  push(
    `Tổng số được triệu tập: ${participants.length} người. ` +
      `Có mặt: ${present.length}. Đi muộn: ${late.length}. Vắng mặt: ${absent.length}. ` +
      `Tỷ lệ tham dự: ${percent(present.length + late.length, participants.length)}%.`
  );
  participants.forEach((person, index) => {
    const role = person.role_in_meeting === "SECRETARY" ? "Thư ký" : "Thành viên";
    const status = ATTENDANCE_LABELS[person.attendance_status] || "Vắng mặt";
    push(
      `${index + 1}. ${person.full_name}` +
        `${person.department_name ? ` - ${person.department_name}` : ""}` +
        ` - ${role} - ${status}`
    );
  });
  push();

  push("## III. NỘI DUNG CHƯƠNG TRÌNH");
  if (agenda.length === 0) {
    push("Cuộc họp không đăng ký chương trình nghị sự chi tiết.");
  } else {
    agenda.forEach((item, index) => {
      push(
        `${index + 1}. ${item.title}` +
          ` (Trình bày: ${item.presenter_name || "chưa chỉ định"}` +
          `, dự kiến ${item.duration_minutes || 0} phút` +
          `, trạng thái: ${item.status === "DONE" ? "đã hoàn thành" : item.status === "CURRENT" ? "đang trình bày" : "chưa trình bày"})`
      );
      if (item.description) push(`   Nội dung: ${item.description}`);
    });
  }
  push();

  push("## IV. TÀI LIỆU SỬ DỤNG");
  if (documents.length === 0) {
    push("Cuộc họp không sử dụng tài liệu đính kèm.");
  } else {
    documents.forEach((doc, index) => {
      push(`${index + 1}. ${doc.display_name} (người gửi: ${doc.uploaded_by_name})`);
    });
  }
  push();

  push("## V. KẾT QUẢ BIỂU QUYẾT");
  const closedVotes = votes.filter((vote) => vote.status === "CLOSED");
  if (closedVotes.length === 0) {
    push("Cuộc họp không tiến hành biểu quyết hoặc chưa chốt kết quả.");
  } else {
    closedVotes.forEach((vote, index) => {
      const summary = summarizeVote(vote);
      push(`${index + 1}. ${vote.title}`);
      if (vote.description) push(`   Nội dung: ${vote.description}`);
      push(
        `   Hình thức: ${vote.is_anonymous ? "biểu quyết kín" : "biểu quyết công khai"}` +
          ` - Tổng số phiếu: ${summary.total}/${participants.length}`
      );
      summary.counts.forEach((row) => {
        push(`   - ${row.label}: ${row.count} phiếu (${row.percent}%)`);
      });
      if (summary.conclusion) push(`   Kết luận: ${summary.conclusion}`);
    });
  }
  push();

  push("## VI. DIỄN BIẾN VÀ Ý KIẾN THẢO LUẬN");
  push(notes?.content?.trim() || "(Thư ký bổ sung diễn biến thảo luận tại đây)");
  push();

  // Kết luận của chủ trì nhập ở ô riêng (trường `conclusion`, cũng nằm trong phần được ký số)
  // và in thành mục cuối biên bản, nên không chèn dòng giữ chỗ ở đây — trước đây dòng này
  // không bao giờ được thay thế và kết luận bị in lặp ở hai nơi.
  push("## VII. NHIỆM VỤ ĐƯỢC GIAO");
  if (tasks.length === 0) {
    push("Cuộc họp không giao nhiệm vụ cụ thể.");
  } else {
    tasks.forEach((task, index) => {
      push(
        `${index + 1}. ${task.title} - Người thực hiện: ${task.assigned_to_name}` +
          `${task.deadline ? ` - Hạn: ${new Date(task.deadline).toLocaleDateString("vi-VN")}` : ""}`
      );
      if (task.description) push(`   Chi tiết: ${task.description}`);
    });
  }

  // Phần "nghị quyết" rút gọn, lưu riêng để tra cứu nhanh.
  const decisions = closedVotes
    .map((vote) => {
      const summary = summarizeVote(vote);
      return summary.conclusion
        ? `${vote.title}: ${summary.conclusion} (${summary.counts
            .map((row) => `${row.label} ${row.count}`)
            .join(", ")})`
        : null;
    })
    .filter(Boolean)
    .join("\n");

  return {
    content: lines.join("\n").trim(),
    decisions: decisions || null,
    stats: {
      participants: participants.length,
      present: present.length,
      late: late.length,
      absent: absent.length,
      agenda: agenda.length,
      documents: documents.length,
      votes: closedVotes.length,
      tasks: tasks.length
    }
  };
}
