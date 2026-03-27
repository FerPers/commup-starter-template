-- ============================================================
-- CommUp — Complete Database Schema for Supabase (PostgreSQL)
-- Version 1.0
-- ============================================================
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE org_member_role AS ENUM ('owner', 'admin', 'architect', 'leader', 'inspector', 'client');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE tag_status AS ENUM ('not_started', 'in_progress', 'completed', 'on_hold');
CREATE TYPE itr_status AS ENUM ('not_started', 'in_progress', 'completed', 'approved', 'rejected');
CREATE TYPE itr_item_type AS ENUM ('checkbox', 'text', 'number', 'measurement', 'select', 'photo', 'signature', 'date', 'yes_no');
CREATE TYPE signature_role AS ENUM ('executor', 'supervisor', 'client');
CREATE TYPE punch_category AS ENUM ('A', 'B', 'C');
CREATE TYPE punch_status AS ENUM ('open', 'in_progress', 'closed', 'cancelled');
CREATE TYPE punch_priority AS ENUM ('critical', 'major', 'minor');
CREATE TYPE certificate_status AS ENUM ('pending', 'in_review', 'issued', 'rejected');
CREATE TYPE preservation_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly');
CREATE TYPE preservation_plan_status AS ENUM ('active', 'suspended', 'completed');
CREATE TYPE preservation_result AS ENUM ('ok', 'nok', 'na');
CREATE TYPE signal_type AS ENUM ('AI', 'AO', 'DI', 'DO', 'PI', 'PO');
CREATE TYPE work_plan_status AS ENUM ('draft', 'published', 'in_progress', 'completed');

-- ══════════════════════════════════════════════════════════════
-- MODULE 1 — MULTI-TENANCY & USERS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extends Supabase auth.users
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          org_member_role NOT NULL DEFAULT 'inspector',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 2 — CONFIGURATION (100% FLEXIBLE)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE project_phases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,                 -- 'A', 'B', 'C', or custom
  name              TEXT NOT NULL,                 -- 'Mechanical Completion', etc.
  order_index       INTEGER NOT NULL,
  color             TEXT NOT NULL DEFAULT '#3B82F6',
  certificate_name  TEXT,
  UNIQUE(org_id, code)
);

CREATE TABLE disciplines (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,                         -- 'MECH', 'ELEC', 'INST', 'PIPE'
  name      TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#6B7280',
  UNIQUE(org_id, code)
);

CREATE TABLE equipment_types (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  name      TEXT NOT NULL,
  category  TEXT,
  UNIQUE(org_id, code)
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 3 — PROJECT HIERARCHY
-- ══════════════════════════════════════════════════════════════

CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  location      TEXT,
  client        TEXT,
  start_date    DATE,
  end_date      DATE,
  status        project_status NOT NULL DEFAULT 'planning',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, code)
);

CREATE TABLE areas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  description   TEXT,
  UNIQUE(project_id, code)
);

CREATE TABLE systems (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id           UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  code              TEXT NOT NULL,
  description       TEXT,
  current_phase_id  UUID REFERENCES project_phases(id),
  UNIQUE(project_id, code)
);

CREATE TABLE subsystems (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_id         UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  code              TEXT NOT NULL,
  description       TEXT,
  current_phase_id  UUID REFERENCES project_phases(id),
  completion_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE(project_id, code)
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 4 — TAGS & ASSETS (Excel importable)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE tags (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subsystem_id        UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  discipline_id       UUID NOT NULL REFERENCES disciplines(id),
  equipment_type_id   UUID REFERENCES equipment_types(id),
  tag_number          TEXT NOT NULL,
  description         TEXT NOT NULL,
  manufacturer        TEXT,
  model               TEXT,
  serial_number       TEXT,
  status              tag_status NOT NULL DEFAULT 'not_started',
  preservation_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, tag_number)
);

CREATE TABLE cables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subsystem_id  UUID REFERENCES subsystems(id),
  cable_number  TEXT NOT NULL,
  from_tag_id   UUID REFERENCES tags(id),
  to_tag_id     UUID REFERENCES tags(id),
  cable_type    TEXT,
  size          TEXT,
  length_m      NUMERIC(10,2),
  status        tag_status NOT NULL DEFAULT 'not_started',
  UNIQUE(project_id, cable_number)
);

CREATE TABLE signals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  loop_id       UUID,                              -- FK added after loops table
  signal_tag    TEXT NOT NULL,
  description   TEXT,
  signal_type   signal_type NOT NULL,
  eng_unit      TEXT,
  range_min     NUMERIC,
  range_max     NUMERIC
);

CREATE TABLE loops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subsystem_id  UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  loop_number   TEXT NOT NULL,
  description   TEXT,
  discipline_id UUID NOT NULL REFERENCES disciplines(id),
  status        tag_status NOT NULL DEFAULT 'not_started',
  UNIQUE(project_id, loop_number)
);

CREATE TABLE loop_tags (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loop_id       UUID NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  role_in_loop  TEXT,
  UNIQUE(loop_id, tag_id)
);

-- Add FK for signal → loop now that loops table exists
ALTER TABLE signals ADD CONSTRAINT signals_loop_id_fkey
  FOREIGN KEY (loop_id) REFERENCES loops(id) ON DELETE SET NULL;

CREATE TABLE interlocks (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subsystem_id        UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  interlock_number    TEXT NOT NULL,
  description         TEXT NOT NULL,
  cause_tag_id        UUID REFERENCES tags(id),
  effect_tag_id       UUID REFERENCES tags(id),
  set_point           TEXT,
  action              TEXT,
  UNIQUE(project_id, interlock_number)
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 5 — PRESERVATION (Critical milestone tracking)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE preservation_procedures (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_type_id   UUID REFERENCES equipment_types(id),
  code                TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  frequency           preservation_frequency NOT NULL,
  interval_days       INTEGER NOT NULL,
  requires_photo      BOOLEAN NOT NULL DEFAULT FALSE,
  requires_signature  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(org_id, code)
);

CREATE TABLE preservation_plans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag_id                UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  procedure_id          UUID NOT NULL REFERENCES preservation_procedures(id),
  responsible_user_id   UUID REFERENCES profiles(id),
  start_date            DATE NOT NULL,
  end_date              DATE,
  last_performed_date   DATE,
  next_due_date         DATE NOT NULL,
  status                preservation_plan_status NOT NULL DEFAULT 'active'
);

CREATE TABLE preservation_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id       UUID NOT NULL REFERENCES preservation_plans(id) ON DELETE CASCADE,
  tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  performed_by  UUID NOT NULL REFERENCES profiles(id),
  performed_at  TIMESTAMPTZ NOT NULL,
  result        preservation_result NOT NULL,
  remarks       TEXT,
  punch_raised  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE preservation_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id     UUID NOT NULL REFERENCES preservation_records(id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 6 — ITR TEMPLATES (engine of the system)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE itr_templates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  discipline_id       UUID NOT NULL REFERENCES disciplines(id),
  equipment_type_id   UUID REFERENCES equipment_types(id),
  phase_id            UUID NOT NULL REFERENCES project_phases(id),
  code                TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  version             INTEGER NOT NULL DEFAULT 1,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_global           BOOLEAN NOT NULL DEFAULT FALSE,  -- available to all orgs
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, code, version)
);

CREATE TABLE itr_template_sections (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id   UUID NOT NULL REFERENCES itr_templates(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  order_index   INTEGER NOT NULL
);

CREATE TABLE itr_template_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id            UUID NOT NULL REFERENCES itr_template_sections(id) ON DELETE CASCADE,
  template_id           UUID NOT NULL REFERENCES itr_templates(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  item_type             itr_item_type NOT NULL DEFAULT 'checkbox',
  is_required           BOOLEAN NOT NULL DEFAULT TRUE,
  is_critical           BOOLEAN NOT NULL DEFAULT FALSE,  -- failure blocks ITR sign-off
  requires_photo        BOOLEAN NOT NULL DEFAULT FALSE,
  requires_measurement  BOOLEAN NOT NULL DEFAULT FALSE,
  options               JSONB,                           -- for 'select' type
  unit                  TEXT,
  acceptance_min        NUMERIC,
  acceptance_max        NUMERIC,
  acceptance_text       TEXT,
  order_index           INTEGER NOT NULL
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 7 — ITR INSTANCES (field execution)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE itrs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id     UUID NOT NULL REFERENCES itr_templates(id),
  tag_id          UUID REFERENCES tags(id),
  subsystem_id    UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id        UUID NOT NULL REFERENCES project_phases(id),
  itr_number      TEXT NOT NULL,
  status          itr_status NOT NULL DEFAULT 'not_started',
  scheduled_date  DATE,
  completed_date  DATE,
  progress_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, itr_number)
);

CREATE TABLE itr_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itr_id        UUID NOT NULL REFERENCES itrs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id),
  role          signature_role NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(itr_id, role)
);

CREATE TABLE itr_responses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itr_id          UUID NOT NULL REFERENCES itrs(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES itr_template_items(id),
  value_text      TEXT,
  value_numeric   NUMERIC,
  value_bool      BOOLEAN,
  value_option    TEXT,
  remarks         TEXT,
  is_passed       BOOLEAN,
  responded_at    TIMESTAMPTZ,
  responded_by    UUID REFERENCES profiles(id),
  UNIQUE(itr_id, item_id)
);

CREATE TABLE itr_signatures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itr_id          UUID NOT NULL REFERENCES itrs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  role            signature_role NOT NULL,
  signature_url   TEXT,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(itr_id, role)
);

CREATE TABLE itr_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itr_id        UUID NOT NULL REFERENCES itrs(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES itr_template_items(id),
  response_id   UUID REFERENCES itr_responses(id),
  file_url      TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by   UUID NOT NULL REFERENCES profiles(id)
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 8 — PUNCH LIST
-- ══════════════════════════════════════════════════════════════

CREATE TABLE punches (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subsystem_id            UUID NOT NULL REFERENCES subsystems(id),
  tag_id                  UUID REFERENCES tags(id),
  itr_id                  UUID REFERENCES itrs(id),
  preservation_record_id  UUID REFERENCES preservation_records(id),
  punch_number            TEXT NOT NULL,
  category                punch_category NOT NULL,   -- A=blocker, B=transferable, C=minor
  description             TEXT NOT NULL,
  discipline_id           UUID NOT NULL REFERENCES disciplines(id),
  raised_by               UUID NOT NULL REFERENCES profiles(id),
  assigned_to             UUID REFERENCES profiles(id),
  status                  punch_status NOT NULL DEFAULT 'open',
  priority                punch_priority NOT NULL DEFAULT 'major',
  target_date             DATE,
  closed_date             DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, punch_number)
);

CREATE TABLE punch_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  punch_id    UUID NOT NULL REFERENCES punches(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  comment     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE punch_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  punch_id      UUID NOT NULL REFERENCES punches(id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 9 — CERTIFICATES & HANDOVER
-- ══════════════════════════════════════════════════════════════

CREATE TABLE certificates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  system_id           UUID REFERENCES systems(id),
  subsystem_id        UUID REFERENCES subsystems(id),
  phase_id            UUID NOT NULL REFERENCES project_phases(id),
  certificate_number  TEXT NOT NULL,
  title               TEXT NOT NULL,
  status              certificate_status NOT NULL DEFAULT 'pending',
  issued_date         DATE,
  issued_by           UUID REFERENCES profiles(id),
  approved_by         UUID REFERENCES profiles(id),
  document_url        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, certificate_number)
);

CREATE TABLE certificate_punch_exceptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  certificate_id  UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  punch_id        UUID NOT NULL REFERENCES punches(id),
  justification   TEXT NOT NULL,
  approved_by     UUID NOT NULL REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- MODULE 10 — WORK PLANS & KPI SNAPSHOTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE work_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  discipline_id   UUID NOT NULL REFERENCES disciplines(id),
  leader_id       UUID NOT NULL REFERENCES profiles(id),
  plan_date       DATE NOT NULL,
  status          work_plan_status NOT NULL DEFAULT 'draft',
  notes           TEXT
);

CREATE TABLE work_plan_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_plan_id    UUID NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
  itr_id          UUID NOT NULL REFERENCES itrs(id),
  assigned_to     UUID NOT NULL REFERENCES profiles(id),
  status          tag_status NOT NULL DEFAULT 'not_started',
  remarks         TEXT
);

CREATE TABLE kpi_snapshots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area_id               UUID REFERENCES areas(id),
  system_id             UUID REFERENCES systems(id),
  subsystem_id          UUID REFERENCES subsystems(id),
  phase_id              UUID REFERENCES project_phases(id),
  total_itrs            INTEGER NOT NULL DEFAULT 0,
  completed_itrs        INTEGER NOT NULL DEFAULT 0,
  total_punches_a       INTEGER NOT NULL DEFAULT 0,
  open_punches_a        INTEGER NOT NULL DEFAULT 0,
  total_punches_b       INTEGER NOT NULL DEFAULT 0,
  open_punches_b        INTEGER NOT NULL DEFAULT 0,
  total_tags            INTEGER NOT NULL DEFAULT 0,
  total_preservation    INTEGER NOT NULL DEFAULT 0,
  overdue_preservation  INTEGER NOT NULL DEFAULT 0,
  completion_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  snapshot_date         DATE NOT NULL
);

-- ══════════════════════════════════════════════════════════════
-- INDEXES (performance)
-- ══════════════════════════════════════════════════════════════

CREATE INDEX idx_tags_project ON tags(project_id);
CREATE INDEX idx_tags_subsystem ON tags(subsystem_id);
CREATE INDEX idx_tags_discipline ON tags(discipline_id);
CREATE INDEX idx_itrs_project ON itrs(project_id);
CREATE INDEX idx_itrs_subsystem ON itrs(subsystem_id);
CREATE INDEX idx_itrs_tag ON itrs(tag_id);
CREATE INDEX idx_itrs_status ON itrs(status);
CREATE INDEX idx_punches_project ON punches(project_id);
CREATE INDEX idx_punches_subsystem ON punches(subsystem_id);
CREATE INDEX idx_punches_status ON punches(status);
CREATE INDEX idx_punches_category ON punches(category);
CREATE INDEX idx_preservation_plans_tag ON preservation_plans(tag_id);
CREATE INDEX idx_preservation_plans_next_due ON preservation_plans(next_due_date);
CREATE INDEX idx_kpi_snapshots_project ON kpi_snapshots(project_id);
CREATE INDEX idx_kpi_snapshots_date ON kpi_snapshots(snapshot_date);

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (multi-tenant isolation)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE itrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE punches ENABLE ROW LEVEL SECURITY;

-- Users can only see orgs they belong to
CREATE POLICY "org_members_see_own_orgs" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Users can only see projects in their org
CREATE POLICY "members_see_org_projects" ON projects
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Users see their own profile
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- TRIGGERS — Auto-update preservation next_due_date
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_preservation_next_due()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE preservation_plans
  SET
    last_performed_date = NEW.performed_at::DATE,
    next_due_date = NEW.performed_at::DATE + (
      SELECT interval_days FROM preservation_procedures
      WHERE id = preservation_plans.procedure_id
    )
  WHERE id = NEW.plan_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_preservation_next_due
  AFTER INSERT ON preservation_records
  FOR EACH ROW EXECUTE FUNCTION update_preservation_next_due();

-- ══════════════════════════════════════════════════════════════
-- SEED DATA — Default phases and disciplines for new orgs
-- ══════════════════════════════════════════════════════════════

-- (Run after creating your first organization via the app)
-- INSERT INTO project_phases (org_id, code, name, order_index, color, certificate_name) VALUES
--   ('<org_id>', 'A', 'Mechanical Completion', 1, '#3B82F6', 'MC Certificate'),
--   ('<org_id>', 'B', 'Pre-Commissioning', 2, '#F59E0B', 'RFPC Certificate'),
--   ('<org_id>', 'C', 'Commissioning', 3, '#10B981', 'RFC Certificate'),
--   ('<org_id>', 'D', 'Start-Up', 4, '#8B5CF6', 'RFSU Certificate');
--
-- INSERT INTO disciplines (org_id, code, name, color) VALUES
--   ('<org_id>', 'MECH', 'Mechanical', '#EF4444'),
--   ('<org_id>', 'ELEC', 'Electrical', '#F59E0B'),
--   ('<org_id>', 'INST', 'Instrumentation', '#3B82F6'),
--   ('<org_id>', 'PIPE', 'Piping', '#10B981'),
--   ('<org_id>', 'HVAC', 'HVAC', '#8B5CF6'),
--   ('<org_id>', 'CIVIL', 'Civil', '#6B7280');
