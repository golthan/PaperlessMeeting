CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
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
  CONSTRAINT rooms_status_check CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
  CONSTRAINT rooms_capacity_check CHECK (capacity >= 0)
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  room_id UUID NOT NULL REFERENCES rooms(id),
  organizer_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'UPCOMING',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
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
  duration_minutes INTEGER DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(40) NOT NULL DEFAULT 'YES_NO_ABSTAIN',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT votes_type_check CHECK (type IN ('YES_NO_ABSTAIN', 'MULTIPLE_CHOICE')),
  CONSTRAINT votes_status_check CHECK (status IN ('OPEN', 'CLOSED'))
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
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
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

