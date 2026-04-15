-- ══════════════════════════════════════════════════════════════
-- Stage 11.1 — workflow_rules (DSL configurable por organización)
-- ══════════════════════════════════════════════════════════════
-- Reemplaza lógica hardcoded (block_certificate si hay punches
-- Cat A, etc.) por reglas declarativas evaluadas contra
-- domain_events. Condiciones en JsonLogic (safe, sin eval).
--
-- Evaluador: edge function `evaluate-workflow` (Stage 11.2)
-- invocada por pg_net desde trigger on domain_events.
-- ══════════════════════════════════════════════════════════════

-- 1. Enum de acciones soportadas ──────────────────────────────
DO $$ BEGIN
  CREATE TYPE workflow_action_type AS ENUM (
    'block_certificate',
    'notify_user',
    'create_punch',
    'change_system_state',
    'webhook_call'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  trigger_event       TEXT NOT NULL,        -- ej: 'punch.created', 'itr.completed'
  condition_jsonlogic JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type         workflow_action_type NOT NULL,
  action_payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority            SMALLINT NOT NULL DEFAULT 100,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workflow_rules_lookup
  ON workflow_rules(org_id, trigger_event, enabled, priority);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_org
  ON workflow_rules(org_id);

-- 4. updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION tg_workflow_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS workflow_rules_updated_at ON workflow_rules;
CREATE TRIGGER workflow_rules_updated_at
  BEFORE UPDATE ON workflow_rules
  FOR EACH ROW EXECUTE FUNCTION tg_workflow_rules_updated_at();

-- 5. RLS ──────────────────────────────────────────────────────
ALTER TABLE workflow_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_rules_select" ON workflow_rules;
CREATE POLICY "workflow_rules_select" ON workflow_rules
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

DROP POLICY IF EXISTS "workflow_rules_insert" ON workflow_rules;
CREATE POLICY "workflow_rules_insert" ON workflow_rules
  FOR INSERT WITH CHECK (is_org_editor(org_id));

DROP POLICY IF EXISTS "workflow_rules_update" ON workflow_rules;
CREATE POLICY "workflow_rules_update" ON workflow_rules
  FOR UPDATE USING (is_org_editor(org_id)) WITH CHECK (is_org_editor(org_id));

DROP POLICY IF EXISTS "workflow_rules_delete" ON workflow_rules;
CREATE POLICY "workflow_rules_delete" ON workflow_rules
  FOR DELETE USING (is_org_editor(org_id));

-- 6. Log de ejecuciones (auditoría + debug del evaluador) ─────
CREATE TABLE IF NOT EXISTS workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES workflow_rules(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matched         BOOLEAN NOT NULL,
  action_result   JSONB,
  error_message   TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_rule
  ON workflow_executions(rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_event
  ON workflow_executions(event_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_org_time
  ON workflow_executions(org_id, executed_at DESC);

ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_executions_select" ON workflow_executions;
CREATE POLICY "workflow_executions_select" ON workflow_executions
  FOR SELECT USING (org_id IN (SELECT get_my_org_ids()));

-- Nota: writes solo vía edge function con service-role (bypass RLS).

-- ══════════════════════════════════════════════════════════════
-- Fin Stage 11.1
-- ══════════════════════════════════════════════════════════════
