-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 · bloque D, sesión 1 (plan readiness, decisiones §10.17–10.20): datos de lazos y matriz C&E.
--
-- 1. signals: la cadena del loop check (13.18) campo → JB → marshalling → canal I/O → tag DCS → HMI.
-- 2. Matriz causa-efecto (13.29): ce_matrices → ce_causes (filas) × ce_effects (columnas) → ce_links
--    (cruces, directos o con retardo). Reemplaza a `interlocks` (1 causa → 1 efecto), vacía en toda
--    la plataforma.
-- 3. itrs.loop_id / itrs.ce_cause_id: vínculo para generar el ITR de loop check y el de prueba por
--    causa (sesión 2).
-- RLS: leen los miembros del proyecto; escriben los roles de edición (get_my_editor_project_ids).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cadena del lazo en las señales ───────────────────────────────────────
ALTER TABLE public.signals
  ADD COLUMN junction_box text,
  ADD COLUMN marshalling  text,
  ADD COLUMN io_card      text,
  ADD COLUMN io_channel   text,
  ADD COLUMN dcs_tag      text,
  ADD COLUMN hmi_display  text;

-- ── 2. Matriz C&E ───────────────────────────────────────────────────────────
CREATE TABLE public.ce_matrices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id       uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  code            text NOT NULL,
  title           text NOT NULL,
  revision        text,
  source_document text,
  source          text NOT NULL DEFAULT 'manual',
  notes           text,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_matrices_code_uq UNIQUE (project_id, code),
  CONSTRAINT ce_matrices_text_check CHECK (length(btrim(code)) BETWEEN 1 AND 60 AND length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT ce_matrices_source_check CHECK (source IN ('manual', 'import', 'ai'))
);

CREATE TABLE public.ce_causes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id   uuid NOT NULL REFERENCES public.ce_matrices(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq         integer NOT NULL DEFAULT 0,
  code        text NOT NULL,
  description text NOT NULL,
  tag_id      uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  signal_id   uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  condition   text,
  setpoint    text,
  voting      text,
  notes       text,
  CONSTRAINT ce_causes_code_uq UNIQUE (matrix_id, code),
  CONSTRAINT ce_causes_text_check CHECK (length(btrim(code)) BETWEEN 1 AND 30 AND length(btrim(description)) BETWEEN 1 AND 300),
  CONSTRAINT ce_causes_voting_check CHECK (voting IS NULL OR voting IN ('1oo1', '1oo2', '2oo2', '2oo3', 'other'))
);
CREATE INDEX ce_causes_matrix_idx ON public.ce_causes (matrix_id, seq);

CREATE TABLE public.ce_effects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id   uuid NOT NULL REFERENCES public.ce_matrices(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq         integer NOT NULL DEFAULT 0,
  code        text NOT NULL,
  description text NOT NULL,
  tag_id      uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  action      text NOT NULL DEFAULT 'other',
  notes       text,
  CONSTRAINT ce_effects_code_uq UNIQUE (matrix_id, code),
  CONSTRAINT ce_effects_text_check CHECK (length(btrim(code)) BETWEEN 1 AND 30 AND length(btrim(description)) BETWEEN 1 AND 300),
  CONSTRAINT ce_effects_action_check CHECK (action IN ('close', 'open', 'trip', 'start', 'stop', 'alarm', 'other'))
);
CREATE INDEX ce_effects_matrix_idx ON public.ce_effects (matrix_id, seq);

CREATE TABLE public.ce_links (
  cause_id   uuid NOT NULL REFERENCES public.ce_causes(id) ON DELETE CASCADE,
  effect_id  uuid NOT NULL REFERENCES public.ce_effects(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  link_type  text NOT NULL DEFAULT 'direct',
  delay_s    numeric,
  note       text,
  PRIMARY KEY (cause_id, effect_id),
  CONSTRAINT ce_links_type_check CHECK (link_type IN ('direct', 'delayed')),
  CONSTRAINT ce_links_delay_check CHECK ((link_type = 'delayed') = (delay_s IS NOT NULL) AND (delay_s IS NULL OR delay_s >= 0))
);
CREATE INDEX ce_links_effect_idx ON public.ce_links (effect_id);

-- Integridad: org/proyecto derivados del padre; tags, señales y sistemas del mismo proyecto;
-- un cruce solo entre causa y efecto de la misma matriz.
CREATE OR REPLACE FUNCTION public.ce_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE v_project uuid; v_matrix_c uuid; v_matrix_e uuid;
BEGIN
  IF TG_TABLE_NAME = 'ce_matrices' THEN
    SELECT org_id INTO NEW.org_id FROM projects WHERE id = NEW.project_id;
    IF NEW.org_id IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado'; END IF;
    IF NEW.system_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM systems WHERE id = NEW.system_id AND project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'El sistema no pertenece al proyecto';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN RAISE EXCEPTION 'La matriz no cambia de proyecto'; END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('ce_causes', 'ce_effects') THEN
    SELECT project_id INTO v_project FROM ce_matrices WHERE id = NEW.matrix_id;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Matriz no encontrada'; END IF;
    IF TG_OP = 'UPDATE' AND NEW.matrix_id IS DISTINCT FROM OLD.matrix_id THEN RAISE EXCEPTION 'No se mueve entre matrices'; END IF;
    NEW.project_id := v_project;
    IF NEW.tag_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = NEW.tag_id AND project_id = v_project) THEN
      RAISE EXCEPTION 'El tag no pertenece al proyecto';
    END IF;
    IF TG_TABLE_NAME = 'ce_causes' AND NEW.signal_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id WHERE s.id = NEW.signal_id AND t.project_id = v_project) THEN
      RAISE EXCEPTION 'La señal no pertenece al proyecto';
    END IF;
    RETURN NEW;
  END IF;
  -- ce_links
  SELECT matrix_id, project_id INTO v_matrix_c, v_project FROM ce_causes WHERE id = NEW.cause_id;
  SELECT matrix_id INTO v_matrix_e FROM ce_effects WHERE id = NEW.effect_id;
  IF v_matrix_c IS NULL OR v_matrix_e IS NULL OR v_matrix_c <> v_matrix_e THEN RAISE EXCEPTION 'Causa y efecto deben ser de la misma matriz'; END IF;
  NEW.project_id := v_project;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER ce_matrices_guard BEFORE INSERT OR UPDATE ON public.ce_matrices FOR EACH ROW EXECUTE FUNCTION public.ce_guard();
CREATE TRIGGER ce_causes_guard   BEFORE INSERT OR UPDATE ON public.ce_causes   FOR EACH ROW EXECUTE FUNCTION public.ce_guard();
CREATE TRIGGER ce_effects_guard  BEFORE INSERT OR UPDATE ON public.ce_effects  FOR EACH ROW EXECUTE FUNCTION public.ce_guard();
CREATE TRIGGER ce_links_guard    BEFORE INSERT OR UPDATE ON public.ce_links    FOR EACH ROW EXECUTE FUNCTION public.ce_guard();

ALTER TABLE public.ce_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_causes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_effects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_links    ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ce_matrices', 'ce_causes', 'ce_effects', 'ce_links'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (project_id IN (SELECT public.get_my_editor_project_ids())) WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (project_id IN (SELECT public.get_my_editor_project_ids()))', t || '_delete', t);
  END LOOP;
END $$;

-- ── 3. Vínculo del ITR con el lazo o la causa que lo originó (sesión 2) ─────────
ALTER TABLE public.itrs
  ADD COLUMN loop_id     uuid REFERENCES public.loops(id) ON DELETE SET NULL,
  ADD COLUMN ce_cause_id uuid REFERENCES public.ce_causes(id) ON DELETE SET NULL;
CREATE INDEX itrs_loop_idx ON public.itrs (loop_id) WHERE loop_id IS NOT NULL;
CREATE INDEX itrs_ce_cause_idx ON public.itrs (ce_cause_id) WHERE ce_cause_id IS NOT NULL;

-- ── 4. interlocks (1 causa → 1 efecto, sin filas) queda reemplazada por la matriz C&E ──
DROP TABLE public.interlocks;
