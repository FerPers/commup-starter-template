-- ══════════════════════════════════════════════════════════════
-- Stage 10.2 — domain_events (append-only event log)
-- ══════════════════════════════════════════════════════════════
-- Event sourcing ligero. Triggers PG emiten eventos en
-- INSERT/UPDATE/DELETE de entidades core. Base para workflow
-- engine, auditoría, webhooks e integraciones.
-- ══════════════════════════════════════════════════════════════

-- 1. Tabla
CREATE TABLE IF NOT EXISTS domain_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    UUID NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_domain_events_project_time
  ON domain_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_org_time
  ON domain_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_type_time
  ON domain_events(event_type, occurred_at DESC);

-- 3. RLS — append-only (lectura por miembros del proyecto; writes solo vía trigger SECURITY DEFINER)
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_events_select" ON domain_events;
CREATE POLICY "domain_events_select" ON domain_events
  FOR SELECT USING (is_project_member(project_id));

-- Nota: NO creamos policies de INSERT/UPDATE/DELETE. El trigger
-- `emit_domain_event()` es SECURITY DEFINER y bypass RLS. Ningún
-- cliente puede escribir directamente en la tabla.

-- ══════════════════════════════════════════════════════════════
-- 4. Función genérica de emisión de eventos
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION emit_domain_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aggregate_type TEXT := TG_TABLE_NAME;
  v_aggregate_id   UUID;
  v_project_id     UUID;
  v_org_id         UUID;
  v_event_type     TEXT;
  v_payload        JSONB;
  v_old_jsonb      JSONB;
  v_new_jsonb      JSONB;
  v_changed_keys   TEXT[];
BEGIN
  -- ── Resolver aggregate_id y project_id según TG_OP ──────────
  IF TG_OP = 'DELETE' THEN
    v_old_jsonb    := to_jsonb(OLD);
    v_aggregate_id := (v_old_jsonb->>'id')::uuid;
    v_project_id   := (v_old_jsonb->>'project_id')::uuid;
  ELSE
    v_new_jsonb    := to_jsonb(NEW);
    v_aggregate_id := (v_new_jsonb->>'id')::uuid;
    v_project_id   := (v_new_jsonb->>'project_id')::uuid;
  END IF;

  -- ── Caso especial: signals (no tiene project_id directo) ────
  IF v_project_id IS NULL AND TG_TABLE_NAME = 'signals' THEN
    -- Primero intenta via loop_id → loops.project_id
    IF TG_OP = 'DELETE' THEN
      SELECT l.project_id INTO v_project_id
      FROM loops l WHERE l.id = (v_old_jsonb->>'loop_id')::uuid;
    ELSE
      SELECT l.project_id INTO v_project_id
      FROM loops l WHERE l.id = (v_new_jsonb->>'loop_id')::uuid;
    END IF;

    -- Fallback via tag_id → tags.project_id
    IF v_project_id IS NULL THEN
      IF TG_OP = 'DELETE' THEN
        SELECT t.project_id INTO v_project_id
        FROM tags t WHERE t.id = (v_old_jsonb->>'tag_id')::uuid;
      ELSE
        SELECT t.project_id INTO v_project_id
        FROM tags t WHERE t.id = (v_new_jsonb->>'tag_id')::uuid;
      END IF;
    END IF;
  END IF;

  -- Si no podemos resolver project_id, no emitimos (silencioso)
  IF v_project_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Derivar org_id del project ──────────────────────────────
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = v_project_id;
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Construir event_type y payload según TG_OP ──────────────
  IF TG_OP = 'INSERT' THEN
    v_event_type := v_aggregate_type || '.created';
    v_payload    := jsonb_build_object('new', v_new_jsonb);

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_jsonb := to_jsonb(OLD);
    -- Calcular campos cambiados
    SELECT ARRAY_AGG(key) INTO v_changed_keys
    FROM jsonb_each(v_new_jsonb) AS new_kv(key, value)
    WHERE new_kv.value IS DISTINCT FROM (v_old_jsonb->new_kv.key);

    -- Si no cambió nada, no emitir
    IF v_changed_keys IS NULL OR array_length(v_changed_keys, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_event_type := v_aggregate_type || '.updated';
    v_payload := jsonb_build_object(
      'old',     v_old_jsonb,
      'new',     v_new_jsonb,
      'changed', to_jsonb(v_changed_keys)
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := v_aggregate_type || '.deleted';
    v_payload    := jsonb_build_object('old', v_old_jsonb);
  END IF;

  -- ── INSERT en domain_events (bypass RLS vía SECURITY DEFINER)
  INSERT INTO domain_events(
    org_id, project_id, aggregate_type, aggregate_id,
    event_type, payload, actor_id
  ) VALUES (
    v_org_id, v_project_id, v_aggregate_type, v_aggregate_id,
    v_event_type, v_payload, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. Triggers sobre entidades core
-- ══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_events_tags ON tags;
CREATE TRIGGER trg_events_tags
  AFTER INSERT OR UPDATE OR DELETE ON tags
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_itrs ON itrs;
CREATE TRIGGER trg_events_itrs
  AFTER INSERT OR UPDATE OR DELETE ON itrs
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_punches ON punches;
CREATE TRIGGER trg_events_punches
  AFTER INSERT OR UPDATE OR DELETE ON punches
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_certificates ON certificates;
CREATE TRIGGER trg_events_certificates
  AFTER INSERT OR UPDATE OR DELETE ON certificates
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_systems ON systems;
CREATE TRIGGER trg_events_systems
  AFTER INSERT OR UPDATE OR DELETE ON systems
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_subsystems ON subsystems;
CREATE TRIGGER trg_events_subsystems
  AFTER INSERT OR UPDATE OR DELETE ON subsystems
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_loops ON loops;
CREATE TRIGGER trg_events_loops
  AFTER INSERT OR UPDATE OR DELETE ON loops
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_interlocks ON interlocks;
CREATE TRIGGER trg_events_interlocks
  AFTER INSERT OR UPDATE OR DELETE ON interlocks
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();

DROP TRIGGER IF EXISTS trg_events_signals ON signals;
CREATE TRIGGER trg_events_signals
  AFTER INSERT OR UPDATE OR DELETE ON signals
  FOR EACH ROW EXECUTE FUNCTION emit_domain_event();
