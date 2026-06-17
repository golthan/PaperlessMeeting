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
  online_provider VARCHAR(50) NOT NULL DEFAULT 'JITSI',
  online_room_name VARCHAR(255),
  online_room_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT meetings_type_check CHECK (meeting_type IN ('ONLINE', 'OFFLINE', 'HYBRID')),
  CONSTRAINT meetings_provider_check CHECK (online_provider IN ('JITSI', 'CUSTOM')),
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
  CONSTRAINT meeting_participants_method_check CHECK (attendance_method IS NULL OR attendance_method IN ('QR', 'MANUAL'))
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

CREATE TABLE IF NOT EXISTS attendance_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  CONSTRAINT attendance_method_check CHECK (method IN ('QR', 'MANUAL', 'JOIN_ROOM')),
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
  content TEXT NOT NULL,
  message_type VARCHAR(30) NOT NULL DEFAULT 'TEXT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_type_check CHECK (message_type IN ('TEXT', 'SYSTEM'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_meeting ON chat_messages(meeting_id, created_at);

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

ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(30) NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_provider VARCHAR(50) NOT NULL DEFAULT 'JITSI';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_room_name VARCHAR(255);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_room_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE meetings ALTER COLUMN room_id DROP NOT NULL;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_share_screen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_upload_document BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS can_speak BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_hand_raised BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_presenting BOOLEAN NOT NULL DEFAULT FALSE;
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
  ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_provider_check;
  ALTER TABLE meetings ADD CONSTRAINT meetings_provider_check CHECK (online_provider IN ('JITSI', 'CUSTOM'));
  ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_status_check;
  ALTER TABLE votes ADD CONSTRAINT votes_status_check CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'));
  ALTER TABLE agenda_items DROP CONSTRAINT IF EXISTS agenda_status_check;
  ALTER TABLE agenda_items ADD CONSTRAINT agenda_status_check CHECK (status IN ('PENDING', 'CURRENT', 'DONE'));
END $$;
