-- TeamTrack : schéma initial (PostgreSQL)
-- Modèle de données conforme à la section 6 du cahier des charges.

CREATE TYPE user_role AS ENUM ('admin', 'tutor', 'employee', 'intern');
CREATE TYPE internship_status AS ENUM ('upcoming', 'active', 'suspended', 'completed', 'evaluated');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'review', 'done');
CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'closed');
CREATE TYPE issue_type AS ENUM ('technical', 'organizational', 'skill', 'resource', 'personal');
CREATE TYPE issue_severity AS ENUM ('low', 'medium', 'critical');
CREATE TYPE issue_status AS ENUM ('open', 'analysis', 'in_progress', 'resolved', 'escalated');

CREATE TABLE departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  email           VARCHAR(180) NOT NULL UNIQUE,
  password_hash   VARCHAR(100) NOT NULL,
  role            user_role    NOT NULL,
  job_title       VARCHAR(120),
  phone           VARCHAR(40),
  avatar_url      VARCHAR(255),
  skills          TEXT[]       NOT NULL DEFAULT '{}',
  department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  wip_limit       INT          NOT NULL DEFAULT 3 CHECK (wip_limit BETWEEN 1 AND 20),
  failed_attempts INT          NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL UNIQUE,
  description   TEXT,
  lead_id       INT REFERENCES users(id),
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  wip_in_progress INT CHECK (wip_in_progress IS NULL OR wip_in_progress > 0),
  wip_review      INT CHECK (wip_review IS NULL OR wip_review > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id   INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE TABLE internships (
  id          SERIAL PRIMARY KEY,
  intern_id   INT NOT NULL REFERENCES users(id),
  tutor_id    INT NOT NULL REFERENCES users(id),
  delegate_id INT REFERENCES users(id),
  delegate_until DATE,
  school      VARCHAR(180) NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  objectives  TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      internship_status NOT NULL DEFAULT 'upcoming',
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE INDEX idx_internships_intern ON internships(intern_id);
CREATE INDEX idx_internships_tutor ON internships(tutor_id);

CREATE TABLE internship_status_history (
  id            SERIAL PRIMARY KEY,
  internship_id INT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  from_status   internship_status,
  to_status     internship_status NOT NULL,
  note          TEXT,
  changed_by    INT REFERENCES users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE internship_documents (
  id            SERIAL PRIMARY KEY,
  internship_id INT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  kind          VARCHAR(30) NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime          VARCHAR(120),
  size          INT,
  uploaded_by   INT REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sprints (
  id          SERIAL PRIMARY KEY,
  team_id     INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  goal        TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      sprint_status NOT NULL DEFAULT 'planned',
  retro_positive TEXT,
  retro_improve  TEXT,
  retro_actions  TEXT,
  burndown_snapshot JSONB,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX uq_one_active_sprint_per_team ON sprints(team_id) WHERE status = 'active';

CREATE TABLE tasks (
  id             SERIAL PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  priority       task_priority NOT NULL DEFAULT 'normal',
  status         task_status   NOT NULL DEFAULT 'todo',
  progress       INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_date       DATE,
  estimate_hours NUMERIC(6,1),
  story_points   INT CHECK (story_points IS NULL OR story_points >= 0),
  labels         TEXT[] NOT NULL DEFAULT '{}',
  team_id        INT NOT NULL REFERENCES teams(id),
  sprint_id      INT REFERENCES sprints(id) ON DELETE SET NULL,
  creator_id     INT NOT NULL REFERENCES users(id),
  validated_by   INT REFERENCES users(id),
  position       INT NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);

CREATE TABLE subtasks (
  id       SERIAL PRIMARY KEY,
  task_id  INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title    VARCHAR(200) NOT NULL,
  weight   INT NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  done     BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE task_assignments (
  id            SERIAL PRIMARY KEY,
  task_id       INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id),
  delegated_by  INT REFERENCES users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX uq_active_assignment ON task_assignments(task_id, user_id) WHERE active;
CREATE INDEX idx_assign_user ON task_assignments(user_id) WHERE active;

CREATE TABLE task_comments (
  id         SERIAL PRIMARY KEY,
  task_id    INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INT NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_attachments (
  id          SERIAL PRIMARY KEY,
  task_id     INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name   VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime        VARCHAR(120),
  size        INT,
  uploaded_by INT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE progress_updates (
  id         SERIAL PRIMARY KEY,
  task_id    INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id),
  progress   INT NOT NULL CHECK (progress BETWEEN 0 AND 100),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE issues (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  type          issue_type NOT NULL,
  severity      issue_severity NOT NULL,
  status        issue_status NOT NULL DEFAULT 'open',
  reporter_id   INT NOT NULL REFERENCES users(id),
  task_id       INT REFERENCES tasks(id) ON DELETE SET NULL,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  escalated_at  TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX idx_issues_reporter ON issues(reporter_id);
CREATE INDEX idx_issues_status ON issues(status);

CREATE TABLE issue_responses (
  id          SERIAL PRIMARY KEY,
  issue_id    INT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id   INT NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  action_decided TEXT,
  from_status issue_status,
  to_status   issue_status,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evaluations (
  id            SERIAL PRIMARY KEY,
  internship_id INT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  evaluator_id  INT NOT NULL REFERENCES users(id),
  eval_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  attendance    SMALLINT NOT NULL CHECK (attendance BETWEEN 1 AND 5),
  quality       SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  autonomy      SMALLINT NOT NULL CHECK (autonomy BETWEEN 1 AND 5),
  communication SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  deadlines     SMALLINT NOT NULL CHECK (deadlines BETWEEN 1 AND 5),
  comment       TEXT,
  is_final      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id           SERIAL PRIMARY KEY,
  recipient_id INT NOT NULL REFERENCES users(id),
  type         VARCHAR(40) NOT NULL,
  message      TEXT NOT NULL,
  link         VARCHAR(255),
  dedupe_key   VARCHAR(120),
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_recipient ON notifications(recipient_id, is_read);
CREATE UNIQUE INDEX uq_notif_dedupe ON notifications(recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40) NOT NULL,
  entity_id  INT,
  summary    TEXT,
  details    JSONB,
  is_audit   BOOLEAN NOT NULL DEFAULT FALSE,
  ip         VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_entity ON activity_log(entity, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);
