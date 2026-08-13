import { pool } from "../../config/db.js";
import { emitMeetingEvent } from "../../config/socket.js";
import { formatMeetingTime } from "../../utils/datetime.js";
import { NOTIFICATION_TYPES, notifyMeetingAudience, notifyUsers } from "./notifications.service.js";

const TICK_MS = 60_000;
const REMINDER_WINDOW_MINUTES = 15;

/** Nhắc lịch các cuộc họp sắp diễn ra trong 15 phút tới (mỗi cuộc chỉ nhắc một lần). */
async function sendMeetingReminders() {
  const { rows } = await pool.query(
    `UPDATE meetings
     SET reminder_sent_at = now()
     WHERE id IN (
       SELECT id FROM meetings
       WHERE deleted_at IS NULL
         AND status IN ('UPCOMING', 'DRAFT')
         AND reminder_sent_at IS NULL
         AND start_time > now()
         AND start_time <= now() + make_interval(mins => $1::int)
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, title, start_time, meeting_type`,
    [REMINDER_WINDOW_MINUTES]
  );

  for (const meeting of rows) {
    await notifyMeetingAudience(meeting.id, {
      type: NOTIFICATION_TYPES.MEETING_REMINDER,
      severity: "WARNING",
      title: `Sắp tới giờ họp: ${meeting.title}`,
      message: `Cuộc họp bắt đầu lúc ${formatMeetingTime(meeting.start_time)}. Hãy chuẩn bị tài liệu và vào phòng đúng giờ.`,
      metadata: { startTime: meeting.start_time }
    });
  }
}

/** Tự chuyển nhiệm vụ quá hạn sang OVERDUE và báo cho người được giao. */
async function markOverdueTasks() {
  const { rows } = await pool.query(
    `UPDATE meeting_tasks
     SET status = 'OVERDUE', updated_at = now()
     WHERE deleted_at IS NULL
       AND status IN ('TODO', 'IN_PROGRESS')
       AND deadline IS NOT NULL
       AND deadline < CURRENT_DATE
     RETURNING id, meeting_id, assigned_to, title`
  );

  for (const task of rows) {
    await notifyUsers([task.assigned_to], {
      type: NOTIFICATION_TYPES.TASK_UPDATED,
      severity: "DANGER",
      meetingId: task.meeting_id,
      title: "Nhiệm vụ đã quá hạn",
      message: `"${task.title}" đã quá hạn xử lý.`,
      metadata: { taskId: task.id, target: "TASKS" }
    });
  }
}

/** Đóng các cuộc họp đã quá giờ kết thúc nhưng tổ chức viên quên bấm kết thúc. */
async function autoFinishExpiredMeetings() {
  const { rows } = await pool.query(
    `UPDATE meetings
     SET status = 'FINISHED', updated_at = now()
     WHERE deleted_at IS NULL
       AND status = 'ONGOING'
       AND end_time < now() - interval '30 minutes'
     RETURNING id, title`
  );

  for (const meeting of rows) {
    emitMeetingEvent(meeting.id, "meeting_status_updated", { id: meeting.id, status: "FINISHED" });
    await notifyMeetingAudience(meeting.id, {
      type: NOTIFICATION_TYPES.MEETING_FINISHED,
      severity: "INFO",
      title: `Cuộc họp đã kết thúc: ${meeting.title}`,
      message: "Hệ thống tự động kết thúc cuộc họp do đã quá giờ. Biên bản và tài liệu vẫn được lưu trữ."
    });
  }
}

async function tick() {
  try {
    await sendMeetingReminders();
    await markOverdueTasks();
    await autoFinishExpiredMeetings();
  } catch (error) {
    console.error("[scheduler] Lỗi khi chạy tác vụ định kỳ:", error.message);
  }
}

/** Khởi động bộ hẹn giờ nền, trả về hàm dừng để dùng khi tắt server. */
export function startScheduler() {
  const timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
