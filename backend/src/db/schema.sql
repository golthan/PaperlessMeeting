CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'PARTICIPANT',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'ORGANIZER', 'PARTICIPANT')),
  CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'LOCKED'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  location VARCHAR(180),
  capacity INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT rooms_status_check CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
  CONSTRAINT rooms_capacity_check CHECK (capacity >= 0)
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  meeting_type VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  room_id UUID REFERENCES rooms(id),
  organizer_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'UPCOMING',
  online_provider VARCHAR(50) NOT NULL DEFAULT 'LIVEKIT',
  online_room_name VARCHAR(255),
  online_room_url TEXT,
  online_enabled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT meetings_type_check CHECK (meeting_type IN ('ONLINE', 'OFFLINE', 'HYBRID')),
  CONSTRAINT meetings_provider_check CHECK (online_provider IN ('LIVEKIT', 'CUSTOM')),
  CONSTRAINT meetings_status_check CHECK (status IN ('DRAFT', 'UPCOMING', 'ONGOING', 'FINISHED', 'CANCELLED')),
  CONSTRAINT meetings_time_check CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_meetings_room_time ON meetings(room_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_meetings_organizer ON meetings(organizer_id);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_meeting VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
  invitation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  can_share_screen BOOLEAN NOT NULL DEFAULT FALSE,
  can_upload_document BOOLEAN NOT NULL DEFAULT FALSE,
  can_speak BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  is_hand_raised BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_status VARCHAR(30),
  attendance_method VARCHAR(30),
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (meeting_id, user_id),
  CONSTRAINT meeting_participants_role_check CHECK (role_in_meeting IN ('CHAIRMAN', 'SECRETARY', 'MEMBER')),
  CONSTRAINT meeting_participants_invitation_check CHECK (invitation_status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  CONSTRAINT meeting_participants_attendance_check CHECK (attendance_status IS NULL OR attendance_status IN ('PRESENT', 'ABSENT', 'LATE')),
  CONSTRAINT meeting_participants_method_check CHECK (attendance_method IS NULL OR attendance_method IN ('MANUAL', 'JOIN_ROOM'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  original_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  mime_type VARCHAR(120),
  size BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  is_presenting BOOLEAN NOT NULL DEFAULT FALSE,
  current_page INTEGER NOT NULL DEFAULT 1,
  ai_summary TEXT,
  ai_summary_model VARCHAR(80),
  ai_summary_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT documents_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_documents_meeting ON documents(meeting_id);

CREATE TABLE IF NOT EXISTS agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  presenter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  related_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  duration_minutes INTEGER DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT agenda_status_check CHECK (status IN ('PENDING', 'CURRENT', 'DONE')),
  CONSTRAINT agenda_duration_check CHECK (duration_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agenda_meeting_order ON agenda_items(meeting_id, sort_order);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_time TIMESTAMPTZ,
  method VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  status VARCHAR(30) NOT NULL DEFAULT 'ABSENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (meeting_id, user_id),
  CONSTRAINT attendance_method_check CHECK (method IN ('MANUAL', 'JOIN_ROOM')),
  CONSTRAINT attendance_status_check CHECK (status IN ('PRESENT', 'ABSENT', 'LATE'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_meeting ON attendance(meeting_id);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(40) NOT NULL DEFAULT 'YES_NO_ABSTAIN',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT votes_type_check CHECK (type IN ('YES_NO_ABSTAIN', 'MULTIPLE_CHOICE')),
  CONSTRAINT votes_status_check CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_votes_meeting ON votes(meeting_id);

CREATE TABLE IF NOT EXISTS vote_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (vote_id, user_id)
);

CREATE TABLE IF NOT EXISTS minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  conclusion TEXT,
  decisions TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  pdf_path TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT minutes_status_check CHECK (status IN ('DRAFT', 'PUBLISHED'))
);

CREATE TABLE IF NOT EXISTS meeting_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  deadline DATE,
  priority VARCHAR(30) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(30) NOT NULL DEFAULT 'TODO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT meeting_tasks_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT meeting_tasks_status_check CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'OVERDUE'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_tasks_assigned_to ON meeting_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_meeting ON meeting_tasks(meeting_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type VARCHAR(30) NOT NULL DEFAULT 'TEXT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_type_check CHECK (message_type IN ('TEXT', 'SYSTEM'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_meeting ON chat_messages(meeting_id, created_at);
-- Ghi chú chung gắn với từng tài liệu, hiển thị trong hộp làm việc tài liệu của phòng họp.
CREATE TABLE IF NOT EXISTS document_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_document_notes_meeting ON document_notes(meeting_id);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS personal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  socket_id VARCHAR(255),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_meeting_sessions_meeting ON meeting_sessions(meeting_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_severity_check CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'DANGER'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;

-- ============================================================
-- Nhật ký truy vết: ai làm gì, lúc nào, trên đối tượng nào.
-- Ghi kèm tên người thao tác tại thời điểm đó để log vẫn đọc
-- được sau khi tài khoản bị xoá.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(150),
  actor_role VARCHAR(30),
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40),
  entity_id UUID,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(60),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_meeting ON audit_logs(meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- ============================================================
-- Ký số biên bản.
-- Mỗi người có một cặp khoá RSA sinh sẵn khi ký lần đầu.
-- Khoá riêng lưu trong database (giới hạn của đồ án: hệ thống
-- thật đặt khoá trong USB token hoặc HSM).
-- ============================================================
CREATE TABLE IF NOT EXISTS user_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  algorithm VARCHAR(40) NOT NULL DEFAULT 'RSA-SHA256',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS minutes_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id UUID NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signer_name VARCHAR(150) NOT NULL,
  signer_title VARCHAR(100) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  signature TEXT NOT NULL,
  algorithm VARCHAR(40) NOT NULL DEFAULT 'RSA-SHA256',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (minutes_id, signer_id)
);

CREATE INDEX IF NOT EXISTS idx_minutes_signatures_minutes ON minutes_signatures(minutes_id);

-- ============================================================
-- Hỏi đáp tài liệu bằng AI, lưu lại để cả phòng họp cùng xem.
-- ============================================================
CREATE TABLE IF NOT EXISTS document_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  asked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  asked_by_name VARCHAR(150),
  question TEXT NOT NULL,
  answer TEXT,
  model VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_questions_document
  ON document_questions(document_id, created_at);

-- Biên bản: mốc tự sinh, mã tra cứu công khai và hash toàn vẹn.
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS verification_code VARCHAR(24);
CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_verification_code
  ON minutes(verification_code) WHERE verification_code IS NOT NULL;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(30) NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_provider VARCHAR(50) NOT NULL DEFAULT 'LIVEKIT';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_room_name VARCHAR(255);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_room_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_enabled_at TIMESTAMPTZ;
ALTER TABLE meetings ALTER COLUMN room_id DROP NOT NULL;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_share_screen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_upload_document BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_speak BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_hand_raised BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_presenting BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary_model VARCHAR(80);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chat_messages_document ON chat_messages(document_id, created_at);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_page INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS related_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PENDING';
ALTER TABLE votes ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS conclusion TEXT;
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS decisions TEXT;
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS pdf_path TEXT;

DO $$
BEGIN
  ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_type_check;
  ALTER TABLE meetings ADD CONSTRAINT meetings_type_check CHECK (meeting_type IN ('ONLINE', 'OFFLINE', 'HYBRID'));
  -- Phải gỡ ràng buộc cũ trước khi đổi dữ liệu JITSI -> LIVEKIT, nếu không bản ghi mới vi phạm ràng buộc đang tồn tại.
  ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_provider_check;
  UPDATE meetings SET online_provider = 'LIVEKIT' WHERE online_provider NOT IN ('LIVEKIT', 'CUSTOM');
  UPDATE meetings SET online_room_url = NULL WHERE online_room_url LIKE '%jit.si%';
  ALTER TABLE meetings ADD CONSTRAINT meetings_provider_check CHECK (online_provider IN ('LIVEKIT', 'CUSTOM'));
  ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_status_check;
  ALTER TABLE votes ADD CONSTRAINT votes_status_check CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'));
  -- Bo diem danh bang ma QR: du lieu cu ghi nhan 'QR' chuyen ve 'MANUAL'
  -- (van la nguoi tham du tu diem danh), roi moi siet lai rang buoc.
  ALTER TABLE meeting_participants DROP CONSTRAINT IF EXISTS meeting_participants_method_check;
  UPDATE meeting_participants SET attendance_method = 'MANUAL' WHERE attendance_method = 'QR';
  ALTER TABLE meeting_participants ADD CONSTRAINT meeting_participants_method_check CHECK (attendance_method IS NULL OR attendance_method IN ('MANUAL', 'JOIN_ROOM'));
  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_method_check;
  UPDATE attendance SET method = 'MANUAL' WHERE method = 'QR';
  ALTER TABLE attendance ADD CONSTRAINT attendance_method_check CHECK (method IN ('MANUAL', 'JOIN_ROOM'));
  DROP TABLE IF EXISTS attendance_tokens;
  UPDATE meetings SET online_enabled_at = COALESCE(online_enabled_at, updated_at, created_at) WHERE meeting_type IN ('ONLINE', 'HYBRID') AND online_room_name IS NOT NULL;
  ALTER TABLE agenda_items DROP CONSTRAINT IF EXISTS agenda_status_check;
  ALTER TABLE agenda_items ADD CONSTRAINT agenda_status_check CHECK (status IN ('PENDING', 'CURRENT', 'DONE'));
END $$;

-- ============================================================
-- Đăng ký tài khoản: người ngoài tự đăng ký, tài khoản nằm ở
-- trạng thái PENDING cho tới khi quản trị viên duyệt và cấp
-- quyền. Bị từ chối thì chuyển REJECTED (giữ lại để truy vết,
-- không xoá hẳn).
--
-- Hồ sơ cá nhân: thêm số điện thoại và chức vụ để người dùng
-- tự cập nhật trong trang Hồ sơ.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
  ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('ACTIVE', 'LOCKED', 'PENDING', 'REJECTED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================================
-- Tách vai trò trong cuộc họp: CHỦ TỌA và THƯ KÝ
--
-- Trước đây mọi quyền điều hành gắn vào `meetings.organizer_id`
-- nên một người ôm tất cả. Nay quyền gắn vào
-- `meeting_participants.role_in_meeting`:
--   - CHAIRMAN  điều hành nội dung: chương trình, tài liệu,
--               biểu quyết, quyền phát biểu, ban hành biên bản.
--   - SECRETARY lo hành chính: mời người, điểm danh, nhiệm vụ,
--               soạn biên bản.
-- Nhờ vậy một tài khoản Participant cũng có thể được cử làm
-- chủ tọa hoặc thư ký của một cuộc họp cụ thể.
-- ============================================================

-- Chế độ phát biểu trong phòng trực tuyến:
--   FREE      ai cũng tự bật mic (như trước).
--   MODERATED mặc định tắt mic, phải được chủ tọa mời mới nói được.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS speaker_mode VARCHAR(20) NOT NULL DEFAULT 'FREE';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS current_speaker_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Giơ tay xếp theo thứ tự để chủ tọa mời đúng người đã chờ lâu nhất.
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS hand_raised_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_speaker_mode_check;
  ALTER TABLE meetings ADD CONSTRAINT meetings_speaker_mode_check
    CHECK (speaker_mode IN ('FREE', 'MODERATED'));

  -- Cuộc họp tạo trước thay đổi này chưa có hàng chủ tọa: cấp cho người tạo,
  -- kèm đủ quyền điều hành. Không đụng tới cuộc họp đã có chủ tọa.
  INSERT INTO meeting_participants
    (meeting_id, user_id, role_in_meeting, invitation_status,
     can_share_screen, can_upload_document, can_speak)
  SELECT m.id, m.organizer_id, 'CHAIRMAN', 'ACCEPTED', TRUE, TRUE, TRUE
  FROM meetings m
  WHERE m.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM meeting_participants mp
      WHERE mp.meeting_id = m.id AND mp.role_in_meeting = 'CHAIRMAN'
    )
  ON CONFLICT (meeting_id, user_id) DO UPDATE
    SET role_in_meeting = 'CHAIRMAN',
        can_share_screen = TRUE,
        can_upload_document = TRUE,
        can_speak = TRUE;

  -- Giữ dòng điểm danh song song cho chủ tọa vừa được cấp.
  INSERT INTO attendance (meeting_id, user_id)
  SELECT mp.meeting_id, mp.user_id
  FROM meeting_participants mp
  WHERE mp.role_in_meeting = 'CHAIRMAN'
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  -- Giơ tay đang bật nhưng chưa có mốc thời gian thì lấy tạm lúc cập nhật gần nhất.
  UPDATE meeting_participants
  SET hand_raised_at = COALESCE(updated_at, created_at)
  WHERE is_hand_raised = TRUE AND hand_raised_at IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_role
  ON meeting_participants(meeting_id, role_in_meeting);

-- ============================================================
-- AI tổng hợp thảo luận thành mục "Diễn biến và ý kiến" của biên bản.
--
-- Bộ tự sinh biên bản lắp ráp được mọi mục từ dữ liệu có cấu trúc, trừ
-- mục diễn biến thảo luận: ý kiến nằm trong chat dạng văn xuôi. Bản
-- tóm tắt của AI lưu TÁCH RIÊNG khỏi `content` (ghi chú chung do thư ký
-- viết) để luôn phân biệt được đâu là bản nháp máy dựng, đâu là nội dung
-- người đã rà soát và chịu trách nhiệm.
-- ============================================================
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS ai_summary_model VARCHAR(80);
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS ai_summary_message_count INTEGER;
