-- Fase 5 del plan readiness, sesión 1 — gestión diaria: acciones, restricciones, TQ y decisiones
-- (2026-10-16, decisiones de Luis, doc §11):
--   actions (ACC)              tracker unificado con origen polimórfico (manual / pssr / constraint / meeting /
--                              tq / vendor / performance). Ciclo open → in_progress → done → verified (+ cancelled);
--                              «done» exige nota de cierre y, salvo método «review», evidencia adjunta; verifica
--                              SIEMPRE una persona distinta de quien la cerró (rechazar = volver a in_progress).
--   project_constraints (RES)  los 8 campos del libro (7.27/7.50); escalamiento 1–4 manual con motivo; aviso al
--                              vencer (columna para el cron). En el gate asignado: «listo con condiciones»; nivel 4 bloquea.
--   technical_queries (TQ)     draft → issued → answered → closed (+ cancelled). El rol client puede responder.
--   decisions (DEC)            inmutables; solo se reemplazan (superseded_by).
--   mgmt_events                línea de tiempo común; mgmt_attachments + bucket mgmt-evidence
--                              (<project_id>/<kind>/<entity_id>/…, inmutable).
--   PSSR: un ítem que pasa a «no» crea su acción (idempotente). Verificar la acción no toca el ítem.
--   Lectura por RLS (get_my_project_ids); escritura SOLO por RPC SECURITY DEFINER. client solo lee (salvo TQ).

-- ── 1. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq                 integer NOT NULL,
  number              text NOT NULL,
  title               text NOT NULL,
  description         text,
  source_kind         text NOT NULL DEFAULT 'manual',
  source_id           uuid,
  source_ref          text,
  system_id           uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  owner_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date            date,
  priority            text NOT NULL DEFAULT 'medium',
  verification_method text NOT NULL DEFAULT 'review',
  status              text NOT NULL DEFAULT 'open',
  closure_note        text,
  done_by      uuid, done_at      timestamptz,
  verified_by  uuid, verified_at  timestamptz, verify_comment text,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason  text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actions_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT actions_source_kind_check CHECK (source_kind IN ('manual', 'pssr', 'constraint', 'meeting', 'tq', 'vendor', 'performance')),
  CONSTRAINT actions_source_id_check CHECK (source_kind NOT IN ('pssr', 'constraint', 'tq') OR source_id IS NOT NULL),
  CONSTRAINT actions_source_ref_check CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  CONSTRAINT actions_priority_check CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT actions_verification_check CHECK (verification_method IN ('field', 'document', 'test', 'review')),
  CONSTRAINT actions_status_check CHECK (status IN ('open', 'in_progress', 'done', 'verified', 'cancelled')),
  CONSTRAINT actions_number_uq UNIQUE (project_id, number)
);
CREATE INDEX actions_project_status_idx ON public.actions (project_id, status);
CREATE INDEX actions_owner_open_idx ON public.actions (owner_id) WHERE status IN ('open', 'in_progress');
CREATE INDEX actions_system_idx ON public.actions (system_id) WHERE system_id IS NOT NULL;
CREATE INDEX actions_source_idx ON public.actions (source_kind, source_id) WHERE source_id IS NOT NULL;
-- Un ítem PSSR tiene a lo sumo una acción viva (idempotencia del trigger).
CREATE UNIQUE INDEX actions_pssr_live_uq ON public.actions (source_id)
  WHERE source_kind = 'pssr' AND status IN ('open', 'in_progress', 'done');

CREATE TABLE public.project_constraints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  number           text NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL,
  system_id        uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  gate_id          uuid REFERENCES public.readiness_gates(id) ON DELETE SET NULL,
  owner_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  need_date        date NOT NULL,
  impact_kind      text NOT NULL,
  impact           text,
  escalation_level smallint NOT NULL DEFAULT 1,
  recovery_plan    text,
  status           text NOT NULL DEFAULT 'open',
  resolution_note  text,
  resolved_by  uuid, resolved_at  timestamptz,
  closed_by    uuid, closed_at    timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  last_overdue_notif_at timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_constraints_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT project_constraints_description_check CHECK (length(btrim(description)) >= 1),
  CONSTRAINT project_constraints_impact_kind_check CHECK (impact_kind IN ('safety', 'schedule', 'cost', 'quality', 'environment')),
  CONSTRAINT project_constraints_level_check CHECK (escalation_level BETWEEN 1 AND 4),
  CONSTRAINT project_constraints_status_check CHECK (status IN ('open', 'resolved', 'closed', 'cancelled')),
  CONSTRAINT project_constraints_number_uq UNIQUE (project_id, number)
);
CREATE INDEX project_constraints_project_status_idx ON public.project_constraints (project_id, status);
CREATE INDEX project_constraints_system_gate_idx ON public.project_constraints (system_id, gate_id)
  WHERE status IN ('open', 'resolved');
CREATE INDEX project_constraints_owner_idx ON public.project_constraints (owner_id) WHERE status = 'open';

CREATE TABLE public.technical_queries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq               integer NOT NULL,
  number            text NOT NULL,
  subject           text NOT NULL,
  question          text NOT NULL,
  discipline_id     uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  system_id         uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  addressed_to      text NOT NULL DEFAULT 'engineering',
  addressed_to_name text,
  required_by       date,
  status            text NOT NULL DEFAULT 'draft',
  response          text,
  responded_by_name text,
  responded_by      uuid,
  responded_at      timestamptz,
  design_change     boolean NOT NULL DEFAULT false,
  moc_ref           text,
  issued_by    uuid, issued_at    timestamptz,
  closed_by    uuid, closed_at    timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  raised_by         uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technical_queries_subject_check CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  CONSTRAINT technical_queries_question_check CHECK (length(btrim(question)) >= 1),
  CONSTRAINT technical_queries_addressed_check CHECK (addressed_to IN ('engineering', 'vendor', 'client', 'other')),
  CONSTRAINT technical_queries_status_check CHECK (status IN ('draft', 'issued', 'answered', 'closed', 'cancelled')),
  CONSTRAINT technical_queries_moc_check CHECK (moc_ref IS NULL OR length(moc_ref) <= 100),
  CONSTRAINT technical_queries_number_uq UNIQUE (project_id, number)
);
CREATE INDEX technical_queries_project_status_idx ON public.technical_queries (project_id, status);

CREATE TABLE public.technical_query_tags (
  tq_id      uuid NOT NULL REFERENCES public.technical_queries(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (tq_id, tag_id)
);
CREATE INDEX technical_query_tags_tag_idx ON public.technical_query_tags (tag_id);

CREATE TABLE public.decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  number           text NOT NULL,
  title            text NOT NULL,
  context          text,
  decision         text NOT NULL,
  rationale        text,
  decided_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attendees        text,
  decided_at       date NOT NULL DEFAULT current_date,
  source_kind      text NOT NULL DEFAULT 'other',
  source_id        uuid,
  source_ref       text,
  system_id        uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'active',
  superseded_by    uuid REFERENCES public.decisions(id) ON DELETE SET NULL,
  superseded_at    timestamptz,
  supersede_reason text,
  recorded_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decisions_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT decisions_decision_check CHECK (length(btrim(decision)) >= 1),
  CONSTRAINT decisions_source_kind_check CHECK (source_kind IN ('meeting', 'tq', 'constraint', 'other')),
  CONSTRAINT decisions_source_id_check CHECK (source_kind NOT IN ('tq', 'constraint') OR source_id IS NOT NULL),
  CONSTRAINT decisions_source_ref_check CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  CONSTRAINT decisions_status_check CHECK (status IN ('active', 'superseded')),
  CONSTRAINT decisions_number_uq UNIQUE (project_id, number)
);
CREATE INDEX decisions_project_idx ON public.decisions (project_id, decided_at DESC);
CREATE INDEX decisions_source_idx ON public.decisions (source_kind, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE public.mgmt_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_kind text NOT NULL,
  entity_id   uuid NOT NULL,
  action      text NOT NULL,
  from_value  text,
  to_value    text,
  user_id     uuid,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mgmt_events_kind_check CHECK (entity_kind IN ('action', 'constraint', 'tq', 'decision'))
);
CREATE INDEX mgmt_events_entity_idx ON public.mgmt_events (entity_kind, entity_id, created_at);
CREATE INDEX mgmt_events_project_idx ON public.mgmt_events (project_id, created_at DESC);

CREATE TABLE public.mgmt_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_kind text NOT NULL,
  entity_id   uuid NOT NULL,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mgmt_attachments_kind_check CHECK (entity_kind IN ('action', 'constraint', 'tq', 'decision')),
  CONSTRAINT mgmt_attachments_path_uq UNIQUE (file_path)
);
CREATE INDEX mgmt_attachments_entity_idx ON public.mgmt_attachments (entity_kind, entity_id);

ALTER TABLE public.actions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_constraints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_queries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_query_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgmt_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgmt_attachments     ENABLE ROW LEVEL SECURITY;
CREATE POLICY actions_select ON public.actions FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY project_constraints_select ON public.project_constraints FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY technical_queries_select ON public.technical_queries FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY technical_query_tags_select ON public.technical_query_tags FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY decisions_select ON public.decisions FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY mgmt_events_select ON public.mgmt_events FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY mgmt_attachments_select ON public.mgmt_attachments FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 2. Bucket de evidencias (ruta <project_id>/<kind>/<entity_id>/<archivo>) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mgmt-evidence', 'mgmt-evidence', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY mgmt_evidence_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mgmt-evidence'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_project_ids()::text));
CREATE POLICY mgmt_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mgmt-evidence'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_project_ids()::text));
-- Evidencia inmutable: sin UPDATE ni DELETE para usuarios.
CREATE POLICY mgmt_evidence_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'mgmt-evidence') WITH CHECK (bucket_id <> 'mgmt-evidence');
CREATE POLICY mgmt_evidence_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'mgmt-evidence');

-- ── 3. Helpers internos ──────────────────────────────────────────────────
-- Numeración atómica por proyecto y tabla: <prefijo>-0001.
CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mgmt_log(
  p_org uuid, p_project uuid, p_kind text, p_id uuid, p_action text,
  p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  INSERT INTO mgmt_events (org_id, project_id, entity_kind, entity_id, action, from_value, to_value, user_id, comment)
  VALUES (p_org, p_project, p_kind, p_id, p_action, p_from, p_to, auth.uid(), p_comment);
$fn$;

-- Texto recortado a p_max (NULL si queda vacío).
CREATE OR REPLACE FUNCTION public.mgmt_text(p_value text, p_max integer DEFAULT 4000)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT NULLIF(left(btrim(COALESCE(p_value, '')), p_max), '');
$fn$;

-- Valida FKs suministradas por el cliente contra el proyecto/org.
CREATE OR REPLACE FUNCTION public.mgmt_check_refs(
  p_project_id uuid, p_org_id uuid, p_system_id uuid, p_owner_id uuid,
  p_gate_id uuid DEFAULT NULL, p_discipline_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF p_system_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = p_owner_id) THEN
    RAISE EXCEPTION 'El responsable no es miembro de la organización' USING ERRCODE = '22023';
  END IF;
  IF p_gate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = p_gate_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
  END IF;
  IF p_discipline_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM disciplines WHERE id = p_discipline_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'Disciplina de otra organización' USING ERRCODE = '22023';
  END IF;
END;
$fn$;

-- Origen de una acción o decisión: la entidad referida debe ser del mismo proyecto.
CREATE OR REPLACE FUNCTION public.mgmt_check_source(p_project_id uuid, p_kind text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_ok boolean := true;
BEGIN
  IF p_kind IN ('pssr', 'constraint', 'tq') AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'Falta el registro de origen' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'pssr' THEN
    v_ok := EXISTS (SELECT 1 FROM pssr_review_items i JOIN pssr_reviews r ON r.id = i.review_id
                    WHERE i.id = p_source_id AND r.project_id = p_project_id);
  ELSIF p_kind = 'constraint' THEN
    v_ok := EXISTS (SELECT 1 FROM project_constraints WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'tq' THEN
    v_ok := EXISTS (SELECT 1 FROM technical_queries WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'El origen no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
END;
$fn$;

-- ── 4. Acciones ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_action(
  p_project_id          uuid,
  p_title               text,
  p_owner_id            uuid,
  p_description         text DEFAULT NULL,
  p_source_kind         text DEFAULT 'manual',
  p_source_id           uuid DEFAULT NULL,
  p_source_ref          text DEFAULT NULL,
  p_system_id           uuid DEFAULT NULL,
  p_due_date            date DEFAULT NULL,
  p_priority            text DEFAULT 'medium',
  p_verification_method text DEFAULT 'review'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'La acción necesita un responsable' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_owner_id);
  PERFORM public.mgmt_check_source(p_project_id, COALESCE(p_source_kind, 'manual'), p_source_id);

  v_seq := public.mgmt_next_seq('actions', p_project_id);
  INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                       system_id, owner_id, due_date, priority, verification_method, created_by)
  VALUES (v_org, p_project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_description), COALESCE(p_source_kind, 'manual'), p_source_id, public.mgmt_text(p_source_ref, 200),
          p_system_id, p_owner_id, p_due_date, COALESCE(p_priority, 'medium'), COALESCE(p_verification_method, 'review'), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'action', v_id, 'created', NULL, 'open');
  RETURN v_id;
END;
$fn$;

-- Reemplaza los datos editables mientras la acción no esté cerrada (origen fijo).
CREATE OR REPLACE FUNCTION public.update_action(
  p_action_id           uuid,
  p_title               text,
  p_description         text,
  p_owner_id            uuid,
  p_system_id           uuid,
  p_due_date            date,
  p_priority            text,
  p_verification_method text,
  p_source_ref          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_a actions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_a FROM actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_a.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_a.status IN ('verified', 'cancelled') THEN
    RAISE EXCEPTION 'La acción % está cerrada y no se puede editar', v_a.number USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'La acción necesita un responsable' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(v_a.project_id, v_a.org_id, p_system_id, p_owner_id);

  UPDATE actions SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         owner_id = p_owner_id, system_id = p_system_id, due_date = p_due_date,
         priority = p_priority, verification_method = p_verification_method,
         source_ref = public.mgmt_text(p_source_ref, 200), updated_at = now()
   WHERE id = p_action_id;
  IF p_owner_id IS DISTINCT FROM v_a.owner_id THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'reassigned', v_a.owner_id::text, p_owner_id::text);
  END IF;
  IF p_due_date IS DISTINCT FROM v_a.due_date THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'due_date', v_a.due_date::text, p_due_date::text);
  END IF;
  PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'updated');
END;
$fn$;

-- open → in_progress → done → verified; done → in_progress (rechazo de la verificación); * → cancelled.
CREATE OR REPLACE FUNCTION public.transition_action(p_action_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_a actions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text;
BEGIN
  SELECT * INTO v_a FROM actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_a.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_a.status IN ('verified', 'cancelled') THEN RAISE EXCEPTION 'La acción % ya está cerrada', v_a.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar acciones', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE actions SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_action_id;

  ELSIF v_a.status = 'open' AND p_to = 'in_progress' THEN
    UPDATE actions SET status = 'in_progress', updated_at = now() WHERE id = p_action_id;

  ELSIF v_a.status IN ('open', 'in_progress') AND p_to = 'done' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Describe cómo se cerró la acción' USING ERRCODE = '22023'; END IF;
    IF v_a.verification_method <> 'review' AND NOT EXISTS (
         SELECT 1 FROM mgmt_attachments WHERE entity_kind = 'action' AND entity_id = p_action_id) THEN
      RAISE EXCEPTION 'Adjunta la evidencia de cierre de % antes de marcarla hecha', v_a.number USING ERRCODE = 'P0001';
    END IF;
    UPDATE actions SET status = 'done', closure_note = v_comment, done_by = v_uid, done_at = now(), updated_at = now()
     WHERE id = p_action_id;

  ELSIF v_a.status = 'done' AND p_to IN ('verified', 'in_progress') THEN
    IF v_uid = v_a.done_by THEN
      RAISE EXCEPTION 'La verificación debe hacerla una persona distinta de quien cerró la acción' USING ERRCODE = '42501';
    END IF;
    IF p_to = 'verified' THEN
      UPDATE actions SET status = 'verified', verified_by = v_uid, verified_at = now(), verify_comment = v_comment, updated_at = now()
       WHERE id = p_action_id;
    ELSE
      IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se rechaza el cierre' USING ERRCODE = '22023'; END IF;
      UPDATE actions SET status = 'in_progress', done_by = NULL, done_at = NULL, updated_at = now() WHERE id = p_action_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_a.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id,
                          CASE WHEN v_a.status = 'done' AND p_to = 'in_progress' THEN 'rejected' ELSE 'transition' END,
                          v_a.status, p_to, v_comment);
  RETURN p_to;
END;
$fn$;

-- ── 5. Restricciones ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_constraint(
  p_project_id    uuid,
  p_title         text,
  p_description   text,
  p_system_id     uuid,
  p_owner_id      uuid,
  p_need_date     date,
  p_impact_kind   text,
  p_impact        text    DEFAULT NULL,
  p_gate_id       uuid    DEFAULT NULL,
  p_recovery_plan text    DEFAULT NULL,
  p_level         integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL OR p_owner_id IS NULL OR p_need_date IS NULL THEN
    RAISE EXCEPTION 'Sistema, responsable y fecha requerida son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_description) IS NULL THEN
    RAISE EXCEPTION 'Título y descripción son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_owner_id, p_gate_id);

  v_seq := public.mgmt_next_seq('project_constraints', p_project_id);
  INSERT INTO project_constraints (org_id, project_id, seq, number, title, description, system_id, gate_id, owner_id,
                                   need_date, impact_kind, impact, escalation_level, recovery_plan, created_by)
  VALUES (v_org, p_project_id, v_seq, 'RES-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_description), p_system_id, p_gate_id, p_owner_id, p_need_date, p_impact_kind,
          public.mgmt_text(p_impact), COALESCE(p_level, 1), public.mgmt_text(p_recovery_plan), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'constraint', v_id, 'created', NULL, 'open');
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_constraint(
  p_constraint_id uuid,
  p_title         text,
  p_description   text,
  p_system_id     uuid,
  p_gate_id       uuid,
  p_owner_id      uuid,
  p_need_date     date,
  p_impact_kind   text,
  p_impact        text,
  p_recovery_plan text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_c project_constraints%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_c.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'La restricción % está cerrada y no se puede editar', v_c.number USING ERRCODE = 'P0001';
  END IF;
  IF p_system_id IS NULL OR p_owner_id IS NULL OR p_need_date IS NULL THEN
    RAISE EXCEPTION 'Sistema, responsable y fecha requerida son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_description) IS NULL THEN
    RAISE EXCEPTION 'Título y descripción son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(v_c.project_id, v_c.org_id, p_system_id, p_owner_id, p_gate_id);

  UPDATE project_constraints SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         system_id = p_system_id, gate_id = p_gate_id, owner_id = p_owner_id, need_date = p_need_date,
         impact_kind = p_impact_kind, impact = public.mgmt_text(p_impact), recovery_plan = public.mgmt_text(p_recovery_plan),
         -- Una nueva fecha requerida reinicia el aviso de vencimiento.
         last_overdue_notif_at = CASE WHEN p_need_date IS DISTINCT FROM v_c.need_date THEN NULL ELSE last_overdue_notif_at END,
         updated_at = now()
   WHERE id = p_constraint_id;
  IF p_need_date IS DISTINCT FROM v_c.need_date THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'need_date', v_c.need_date::text, p_need_date::text);
  END IF;
  IF p_owner_id IS DISTINCT FROM v_c.owner_id THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'reassigned', v_c.owner_id::text, p_owner_id::text);
  END IF;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'updated');
END;
$fn$;

-- Escalar o desescalar (1 equipo · 2 gerente de comisionamiento · 3 gerente de proyecto · 4 cliente/sponsor).
CREATE OR REPLACE FUNCTION public.escalate_constraint(p_constraint_id uuid, p_level integer, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_c.status <> 'open' THEN RAISE EXCEPTION 'Solo se escalan restricciones abiertas' USING ERRCODE = 'P0001'; END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 4 OR p_level = v_c.escalation_level THEN
    RAISE EXCEPTION 'Nivel de escalamiento no válido' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del cambio de nivel' USING ERRCODE = '22023'; END IF;
  UPDATE project_constraints SET escalation_level = p_level, updated_at = now() WHERE id = p_constraint_id;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id,
                          CASE WHEN p_level > v_c.escalation_level THEN 'escalated' ELSE 'deescalated' END,
                          v_c.escalation_level::text, p_level::text, v_reason);
END;
$fn$;

-- open → resolved → closed; resolved → open (reabrir); open/resolved → cancelled.
-- Cerrar exige que no queden acciones vivas de la restricción.
CREATE OR REPLACE FUNCTION public.transition_constraint(p_constraint_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text; v_open integer;
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_c.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'La restricción % ya está cerrada', v_c.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar restricciones', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'open' AND p_to = 'resolved' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Describe cómo se resolvió la restricción' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'resolved', resolution_note = v_comment, resolved_by = v_uid, resolved_at = now(), updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'open' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se reabre' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'open', resolved_by = NULL, resolved_at = NULL, updated_at = now() WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'closed' THEN
    SELECT COUNT(*) INTO v_open FROM actions
     WHERE source_kind = 'constraint' AND source_id = p_constraint_id AND status IN ('open', 'in_progress', 'done');
    IF v_open > 0 THEN
      RAISE EXCEPTION 'La restricción % tiene % acción(es) sin verificar', v_c.number, v_open USING ERRCODE = 'P0001';
    END IF;
    UPDATE project_constraints SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now() WHERE id = p_constraint_id;

  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_c.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'transition', v_c.status, p_to, v_comment);
  RETURN p_to;
END;
$fn$;

-- ── 6. TQ ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tq_set_tags(p_tq_id uuid, p_project_id uuid, p_tag_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF p_tag_ids IS NULL THEN RETURN; END IF;
  IF cardinality(p_tag_ids) > 500 THEN RAISE EXCEPTION 'Demasiados tags' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_tag_ids) x WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = x AND t.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Hay tags que no pertenecen al proyecto' USING ERRCODE = '22023';
  END IF;
  DELETE FROM technical_query_tags WHERE tq_id = p_tq_id;
  INSERT INTO technical_query_tags (tq_id, tag_id, project_id)
  SELECT DISTINCT p_tq_id, x, p_project_id FROM unnest(p_tag_ids) x;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_tq(
  p_project_id        uuid,
  p_subject           text,
  p_question          text,
  p_addressed_to      text   DEFAULT 'engineering',
  p_addressed_to_name text   DEFAULT NULL,
  p_discipline_id     uuid   DEFAULT NULL,
  p_system_id         uuid   DEFAULT NULL,
  p_required_by       date   DEFAULT NULL,
  p_tag_ids           uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_subject, 200) IS NULL OR public.mgmt_text(p_question, 8000) IS NULL THEN
    RAISE EXCEPTION 'Asunto y pregunta son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL, NULL, p_discipline_id);

  v_seq := public.mgmt_next_seq('technical_queries', p_project_id);
  INSERT INTO technical_queries (org_id, project_id, seq, number, subject, question, discipline_id, system_id,
                                 addressed_to, addressed_to_name, required_by, raised_by)
  VALUES (v_org, p_project_id, v_seq, 'TQ-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_subject, 200),
          public.mgmt_text(p_question, 8000), p_discipline_id, p_system_id, COALESCE(p_addressed_to, 'engineering'),
          public.mgmt_text(p_addressed_to_name, 200), p_required_by, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.tq_set_tags(v_id, p_project_id, COALESCE(p_tag_ids, '{}'::uuid[]));
  PERFORM public.mgmt_log(v_org, p_project_id, 'tq', v_id, 'created', NULL, 'draft');
  RETURN v_id;
END;
$fn$;

-- Editable en borrador o emitido (la pregunta emitida ya no cambia: solo destinatario, fecha y vínculos).
CREATE OR REPLACE FUNCTION public.update_tq(
  p_tq_id             uuid,
  p_subject           text,
  p_question          text,
  p_addressed_to      text,
  p_addressed_to_name text,
  p_discipline_id     uuid,
  p_system_id         uuid,
  p_required_by       date,
  p_tag_ids           uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_t technical_queries%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_t FROM technical_queries WHERE id = p_tq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TQ no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_t.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_t.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'El % ya fue respondido o cerrado y no se puede editar', v_t.number USING ERRCODE = 'P0001';
  END IF;
  IF v_t.status = 'issued' AND (public.mgmt_text(p_subject, 200) IS DISTINCT FROM v_t.subject
                                OR public.mgmt_text(p_question, 8000) IS DISTINCT FROM v_t.question) THEN
    RAISE EXCEPTION 'El asunto y la pregunta de un TQ emitido no se pueden cambiar' USING ERRCODE = 'P0001';
  END IF;
  IF public.mgmt_text(p_subject, 200) IS NULL OR public.mgmt_text(p_question, 8000) IS NULL THEN
    RAISE EXCEPTION 'Asunto y pregunta son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(v_t.project_id, v_t.org_id, p_system_id, NULL, NULL, p_discipline_id);

  UPDATE technical_queries SET subject = public.mgmt_text(p_subject, 200), question = public.mgmt_text(p_question, 8000),
         addressed_to = p_addressed_to, addressed_to_name = public.mgmt_text(p_addressed_to_name, 200),
         discipline_id = p_discipline_id, system_id = p_system_id, required_by = p_required_by, updated_at = now()
   WHERE id = p_tq_id;
  PERFORM public.tq_set_tags(p_tq_id, v_t.project_id, p_tag_ids);
  PERFORM public.mgmt_log(v_t.org_id, v_t.project_id, 'tq', p_tq_id, 'updated');
END;
$fn$;

-- Respuesta: la puede registrar cualquier miembro del proyecto, incluido el rol client (la operadora).
CREATE OR REPLACE FUNCTION public.answer_tq(
  p_tq_id             uuid,
  p_response          text,
  p_responded_by_name text    DEFAULT NULL,
  p_design_change     boolean DEFAULT false,
  p_moc_ref           text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_t technical_queries%ROWTYPE; v_role text; v_name text;
BEGIN
  SELECT * INTO v_t FROM technical_queries WHERE id = p_tq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TQ no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_t.status <> 'issued' THEN RAISE EXCEPTION 'Solo se responde un TQ emitido' USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(p_response, 8000) IS NULL THEN RAISE EXCEPTION 'La respuesta es obligatoria' USING ERRCODE = '22023'; END IF;
  v_name := COALESCE(public.mgmt_text(p_responded_by_name, 200), (SELECT full_name FROM profiles WHERE id = auth.uid()));

  UPDATE technical_queries SET status = 'answered', response = public.mgmt_text(p_response, 8000), responded_by_name = v_name,
         responded_by = auth.uid(), responded_at = now(), design_change = COALESCE(p_design_change, false),
         moc_ref = public.mgmt_text(p_moc_ref, 100), updated_at = now()
   WHERE id = p_tq_id;
  PERFORM public.mgmt_log(v_t.org_id, v_t.project_id, 'tq', p_tq_id, 'answered', 'issued', 'answered', v_name);
END;
$fn$;

-- draft → issued; answered → issued (respuesta insuficiente) | closed; draft/issued/answered → cancelled.
CREATE OR REPLACE FUNCTION public.transition_tq(p_tq_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_t technical_queries%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text;
BEGIN
  SELECT * INTO v_t FROM technical_queries WHERE id = p_tq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TQ no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_t.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_t.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El % ya está cerrado', v_t.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar TQ', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE technical_queries SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_tq_id;
  ELSIF v_t.status = 'draft' AND p_to = 'issued' THEN
    UPDATE technical_queries SET status = 'issued', issued_by = v_uid, issued_at = now(), updated_at = now() WHERE id = p_tq_id;
  ELSIF v_t.status = 'answered' AND p_to = 'issued' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué la respuesta no es suficiente' USING ERRCODE = '22023'; END IF;
    UPDATE technical_queries SET status = 'issued', updated_at = now() WHERE id = p_tq_id;
  ELSIF v_t.status = 'answered' AND p_to = 'closed' THEN
    UPDATE technical_queries SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now() WHERE id = p_tq_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_t.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_t.org_id, v_t.project_id, 'tq', p_tq_id, 'transition', v_t.status, p_to, v_comment);
  RETURN p_to;
END;
$fn$;

-- ── 7. Decisiones (inmutables; p_supersedes_id reemplaza una vigente) ─────
CREATE OR REPLACE FUNCTION public.record_decision(
  p_project_id       uuid,
  p_title            text,
  p_decision         text,
  p_context          text DEFAULT NULL,
  p_rationale        text DEFAULT NULL,
  p_decided_by       uuid DEFAULT NULL,
  p_attendees        text DEFAULT NULL,
  p_decided_at       date DEFAULT NULL,
  p_source_kind      text DEFAULT 'other',
  p_source_id        uuid DEFAULT NULL,
  p_source_ref       text DEFAULT NULL,
  p_system_id        uuid DEFAULT NULL,
  p_supersedes_id    uuid DEFAULT NULL,
  p_supersede_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_old decisions%ROWTYPE; v_reason text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_decision, 8000) IS NULL THEN
    RAISE EXCEPTION 'Título y decisión son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_decided_at IS NOT NULL AND p_decided_at > current_date THEN
    RAISE EXCEPTION 'La fecha de la decisión no puede ser futura' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_decided_by);
  IF COALESCE(p_source_kind, 'other') IN ('tq', 'constraint') THEN
    PERFORM public.mgmt_check_source(p_project_id, p_source_kind, p_source_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_old FROM decisions WHERE id = p_supersedes_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La decisión a reemplazar no pertenece al proyecto' USING ERRCODE = 'P0002'; END IF;
    IF v_old.status <> 'active' THEN RAISE EXCEPTION 'La decisión % ya fue reemplazada', v_old.number USING ERRCODE = 'P0001'; END IF;
    v_reason := public.mgmt_text(p_supersede_reason, 2000);
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica por qué se reemplaza la decisión' USING ERRCODE = '22023'; END IF;
  END IF;

  v_seq := public.mgmt_next_seq('decisions', p_project_id);
  INSERT INTO decisions (org_id, project_id, seq, number, title, context, decision, rationale, decided_by, attendees,
                         decided_at, source_kind, source_id, source_ref, system_id, recorded_by)
  VALUES (v_org, p_project_id, v_seq, 'DEC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_context, 8000), public.mgmt_text(p_decision, 8000), public.mgmt_text(p_rationale, 8000),
          COALESCE(p_decided_by, auth.uid()), public.mgmt_text(p_attendees, 2000), COALESCE(p_decided_at, current_date),
          COALESCE(p_source_kind, 'other'), p_source_id, public.mgmt_text(p_source_ref, 200), p_system_id, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'decision', v_id, 'recorded', NULL, 'active');

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE decisions SET status = 'superseded', superseded_by = v_id, superseded_at = now(), supersede_reason = v_reason
     WHERE id = p_supersedes_id;
    PERFORM public.mgmt_log(v_org, p_project_id, 'decision', p_supersedes_id, 'superseded', 'active', 'superseded', v_reason);
  END IF;
  RETURN v_id;
END;
$fn$;

-- ── 8. Evidencia y borrado de borradores ─────────────────────────────────
-- Registra un archivo ya subido a mgmt-evidence en <project_id>/<kind>/<entity_id>/…
CREATE OR REPLACE FUNCTION public.add_mgmt_attachment(
  p_entity_kind text,
  p_entity_id   uuid,
  p_file_path   text,
  p_file_name   text,
  p_mime_type   text   DEFAULT NULL,
  p_size_bytes  bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_org uuid; v_status text; v_role text; v_id uuid;
BEGIN
  IF p_entity_kind = 'action' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM actions WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'constraint' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM project_constraints WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'tq' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM technical_queries WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'decision' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM decisions WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_project);
  -- client solo adjunta en TQ (soporte de su respuesta).
  IF auth.uid() IS NULL OR v_role IS NULL OR (v_role = 'client' AND p_entity_kind <> 'tq') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_status IN ('verified', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'El registro está cerrado: no admite más evidencia' USING ERRCODE = 'P0001';
  END IF;
  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_project::text || '/' || p_entity_kind || '/' || p_entity_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'mgmt-evidence' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Adjunto de evidencia no válido' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_file_name, 255) IS NULL THEN RAISE EXCEPTION 'Nombre de archivo obligatorio' USING ERRCODE = '22023'; END IF;

  INSERT INTO mgmt_attachments (org_id, project_id, entity_kind, entity_id, file_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_org, v_project, p_entity_kind, p_entity_id, p_file_path, public.mgmt_text(p_file_name, 255),
          left(p_mime_type, 100), p_size_bytes, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, v_project, p_entity_kind, p_entity_id, 'attachment', NULL, NULL, public.mgmt_text(p_file_name, 255));
  RETURN v_id;
END;
$fn$;

-- Solo borradores nunca trabajados: acción abierta sin evidencia, restricción abierta nunca escalada
-- y sin acciones, TQ en borrador. Quien la creó u owner/admin. Las decisiones no se borran.
CREATE OR REPLACE FUNCTION public.delete_mgmt_item(p_entity_kind text, p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_creator uuid; v_ok boolean; v_role text;
BEGIN
  IF p_entity_kind = 'action' THEN
    SELECT project_id, created_by, status = 'open' AND source_kind <> 'pssr'
      INTO v_project, v_creator, v_ok FROM actions WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_kind = 'constraint' THEN
    SELECT c.project_id, c.created_by,
           c.status = 'open' AND c.escalation_level = 1
           AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.source_kind = 'constraint' AND a.source_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.source_kind = 'constraint' AND d.source_id = c.id)
      INTO v_project, v_creator, v_ok FROM project_constraints c WHERE c.id = p_entity_id FOR UPDATE;
  ELSIF p_entity_kind = 'tq' THEN
    SELECT project_id, raised_by, status = 'draft'
      INTO v_project, v_creator, v_ok FROM technical_queries WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Este tipo no se puede borrar' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_project);
  IF v_role IS NULL OR v_role = 'client' OR NOT (v_creator = auth.uid() OR v_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT v_ok OR EXISTS (SELECT 1 FROM mgmt_attachments WHERE entity_kind = p_entity_kind AND entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Solo se borran borradores sin historia; cancela el registro en su lugar' USING ERRCODE = 'P0001';
  END IF;

  IF p_entity_kind = 'action' THEN DELETE FROM actions WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'constraint' THEN DELETE FROM project_constraints WHERE id = p_entity_id;
  ELSE DELETE FROM technical_queries WHERE id = p_entity_id;
  END IF;
  DELETE FROM mgmt_events WHERE entity_kind = p_entity_kind AND entity_id = p_entity_id;
END;
$fn$;

-- ── 9. PSSR: un ítem en «no» crea su acción ──────────────────────────────
CREATE OR REPLACE FUNCTION public.pssr_item_create_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_r pssr_reviews%ROWTYPE; v_seq integer; v_id uuid; v_owner uuid;
BEGIN
  IF NEW.status <> 'no' OR (TG_OP = 'UPDATE' AND OLD.status = 'no') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM actions WHERE source_kind = 'pssr' AND source_id = NEW.id
               AND status IN ('open', 'in_progress', 'done')) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_r FROM pssr_reviews WHERE id = NEW.review_id;
  v_owner := COALESCE(NEW.updated_by, auth.uid(), v_r.created_by);

  v_seq := public.mgmt_next_seq('actions', v_r.project_id);
  INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                       system_id, owner_id, due_date, priority, verification_method, created_by)
  VALUES (v_r.org_id, v_r.project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'),
          left(btrim(NEW.element), 200),
          concat_ws(E'\n', NEW.requirement, public.mgmt_text(NEW.actions)),
          'pssr', NEW.id, v_r.review_number, v_r.system_id, v_owner, NEW.completion_date, 'high', 'field', v_owner)
  RETURNING id INTO v_id;
  INSERT INTO mgmt_events (org_id, project_id, entity_kind, entity_id, action, to_value, user_id, comment)
  VALUES (v_r.org_id, v_r.project_id, 'action', v_id, 'created', 'open', auth.uid(),
          'Automática: ítem del ' || v_r.review_number || ' marcado NO');
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER pssr_item_create_action
  AFTER INSERT OR UPDATE OF status ON public.pssr_review_items
  FOR EACH ROW EXECUTE FUNCTION public.pssr_item_create_action();

-- ── 10. Permisos de ejecución ────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.mgmt_next_seq(text, uuid)                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mgmt_log(uuid, uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mgmt_check_refs(uuid, uuid, uuid, uuid, uuid, uuid)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mgmt_check_source(uuid, text, uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tq_set_tags(uuid, uuid, uuid[])                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pssr_item_create_action()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_action(uuid, text, uuid, text, text, uuid, text, uuid, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_action(uuid, text, text, uuid, uuid, date, text, text, text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_action(uuid, text, text)                                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_constraint(uuid, text, text, uuid, uuid, date, text, text, uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_constraint(uuid, text, text, uuid, uuid, uuid, date, text, text, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.escalate_constraint(uuid, integer, text)                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_constraint(uuid, text, text)                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_tq(uuid, text, text, text, text, uuid, uuid, date, uuid[])              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_tq(uuid, text, text, text, text, uuid, uuid, date, uuid[])              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.answer_tq(uuid, text, text, boolean, text)                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_tq(uuid, text, text)                                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_decision(uuid, text, text, text, text, uuid, text, date, text, uuid, text, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_mgmt_attachment(text, uuid, text, text, text, bigint)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_mgmt_item(text, uuid)                                                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_action(uuid, text, uuid, text, text, uuid, text, uuid, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_action(uuid, text, text, uuid, uuid, date, text, text, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_action(uuid, text, text)                                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_constraint(uuid, text, text, uuid, uuid, date, text, text, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_constraint(uuid, text, text, uuid, uuid, uuid, date, text, text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_constraint(uuid, integer, text)                                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_constraint(uuid, text, text)                                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tq(uuid, text, text, text, text, uuid, uuid, date, uuid[])              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tq(uuid, text, text, text, text, uuid, uuid, date, uuid[])              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.answer_tq(uuid, text, text, boolean, text)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_tq(uuid, text, text)                                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_decision(uuid, text, text, text, text, uuid, text, date, text, uuid, text, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_mgmt_attachment(text, uuid, text, text, text, bigint)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_mgmt_item(text, uuid)                                                  TO authenticated, service_role;


-- ── 11. Motor de gates: criterio implícito constraints_clear ─────────────
-- (copia de 20261015200000_field_registers.sql §7 + bloque de restricciones)
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
RETURNS TABLE(
  gate_id             uuid,
  gate_code           text,
  gate_name           text,
  gate_order          integer,
  gate_phase_id       uuid,
  requires_previous   boolean,
  approval_roles      text[],
  required_signatures text[],
  cosign_roles        text[],
  computed_level      text,
  status              text,
  criteria            jsonb,
  approval            jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org     uuid;
  v_limit   integer;
  v_prev_ok boolean := true;
  v_first   boolean := true;
  g         record;
  c         record;
  v_phase   uuid;
  v_crit    jsonb;
  v_res     jsonb;
  v_result  text;
  v_level   text;
  v_appr    jsonb;
  v_levels  text[];
  v_total   integer;
  v_fail    jsonb;
  v_failn   integer;
BEGIN
  SELECT p.org_id INTO v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  v_limit := public.org_cat_b_limit(v_org);

  FOR g IN
    SELECT rg.* FROM readiness_gates rg
    WHERE rg.org_id = v_org AND rg.is_active
    ORDER BY rg.order_index, rg.code
  LOOP
    v_crit  := '[]'::jsonb;
    v_level := 'green';

    IF g.requires_previous AND NOT v_first THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'previous_gate', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_prev_ok THEN 'pass' ELSE 'fail' END, 'detail', '{}'::jsonb));
      IF NOT v_prev_ok THEN v_level := 'red'; END IF;
    END IF;

    -- Dependencias entre sistemas (F2): criterio implícito y siempre bloqueante. El proveedor
    -- cumple si su gate requerido tiene una aprobación vigente con todas las firmas.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE NOT x.ok)::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'dependency_id', x.dep_id, 'kind', x.kind,
             'system_id', x.sys_id, 'system_code', x.sys_code, 'system_name', x.sys_name,
             'gate_id', x.gate_id, 'gate_code', x.gate_code,
             'provider_status', x.appr_status, 'ok', x.ok) ORDER BY x.ok, x.sys_code), '[]'::jsonb)
      INTO v_total, v_failn, v_fail
    FROM (
      SELECT d.id AS dep_id, d.kind, ps.id AS sys_id, ps.code AS sys_code, ps.name AS sys_name,
             rg.id AS gate_id, rg.code AS gate_code, sa.status AS appr_status,
             COALESCE(sa.status IN ('approved', 'approved_with_conditions'), false) AS ok
      FROM system_dependencies d
      JOIN systems ps         ON ps.id = d.depends_on_system_id
      JOIN readiness_gates rg ON rg.id = d.required_gate_id AND rg.is_active
      LEFT JOIN system_gate_approvals sa
             ON sa.system_id = ps.id AND sa.gate_id = rg.id AND sa.revoked_at IS NULL
      WHERE d.system_id = p_system_id AND d.blocked_gate_id = g.id
    ) x;
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'dependencies_ready', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('total', v_total, 'missing_count', v_failn, 'dependencies', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    -- Registros controlados (F3): criterio implícito si algún tipo activo bloquea este gate.
    -- Bloquea todo ítem no verificado ni cancelado del sistema (por system_id o por sus tags).
    IF EXISTS (SELECT 1 FROM register_types rt WHERE rt.org_id = v_org AND rt.is_active AND rt.blocks_gate_id = g.id) THEN
      SELECT COUNT(*)::int,
             COALESCE(jsonb_agg(jsonb_build_object(
               'id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title
             ) ORDER BY ri.number), '[]'::jsonb)
        INTO v_failn, v_fail
      FROM register_items ri
      JOIN register_types rt ON rt.id = ri.type_id AND rt.is_active AND rt.blocks_gate_id = g.id
      WHERE ri.status IN ('proposed', 'authorized', 'active', 'removed')
        AND (ri.system_id = p_system_id OR EXISTS (
              SELECT 1 FROM register_item_tags rit
              JOIN tags t ON t.id = rit.tag_id
              JOIN subsystems ss ON ss.id = t.subsystem_id
              WHERE rit.item_id = ri.id AND ss.system_id = p_system_id));
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'registers_clear', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('open_count', v_failn, 'open', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    -- Restricciones (F5): criterio implícito si el sistema tiene restricciones no cerradas asignadas a
    -- este gate. Deja el gate «con condiciones» (warn); una restricción ABIERTA de nivel 4 lo bloquea.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE pc.status = 'open' AND pc.escalation_level = 4)::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'id', pc.id, 'number', pc.number, 'title', pc.title, 'status', pc.status,
             'level', pc.escalation_level, 'need_date', pc.need_date
           ) ORDER BY pc.escalation_level DESC, pc.number), '[]'::jsonb)
      INTO v_total, v_failn, v_fail
    FROM project_constraints pc
    WHERE pc.system_id = p_system_id AND pc.gate_id = g.id AND pc.status IN ('open', 'resolved');
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'constraints_clear', 'label', NULL, 'blocking', v_failn > 0,
        'result', CASE WHEN v_failn > 0 THEN 'fail' ELSE 'warn' END,
        'detail', jsonb_build_object('open_count', v_total, 'blocking_count', v_failn, 'open', v_fail)));
      IF v_failn > 0 THEN
        v_level := 'red';
      ELSIF v_level = 'green' THEN
        v_level := 'yellow';
      END IF;
    END IF;

    FOR c IN
      SELECT gc.* FROM gate_criteria gc WHERE gc.gate_id = g.id ORDER BY gc.order_index, gc.created_at
    LOOP
      v_phase := COALESCE(NULLIF(c.params ->> 'phase_id', '')::uuid, g.phase_id);
      v_res   := '{}'::jsonb;
      v_result := 'fail';

      IF c.kind = 'itr_phase_approved' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          v_res := public.system_phase_level(p_system_id, v_phase, v_limit);
          v_result := CASE v_res ->> 'level' WHEN 'green' THEN 'pass' WHEN 'yellow' THEN 'warn' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'certificates_issued' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          SELECT COUNT(*)::int,
                 COUNT(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM certificates ce
                   WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued'))::int,
                 COALESCE(jsonb_agg(jsonb_build_object('id', ss.id, 'code', ss.code) ORDER BY ss.code)
                   FILTER (WHERE NOT EXISTS (
                     SELECT 1 FROM certificates ce
                     WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued')), '[]'::jsonb)
            INTO v_total, v_failn, v_fail
          FROM subsystems ss WHERE ss.system_id = p_system_id;
          v_res := jsonb_build_object('subsystems_total', v_total, 'missing_count', v_failn, 'missing', v_fail);
          v_result := CASE WHEN v_total > 0 AND v_failn = 0 THEN 'pass' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'pssr_approved' THEN
        SELECT jsonb_build_object('review_id', pr.id, 'review_number', pr.review_number, 'review_status', pr.status)
          INTO v_res
        FROM pssr_reviews pr
        WHERE pr.system_id = p_system_id
        ORDER BY (pr.status = 'approved') DESC, pr.created_at DESC
        LIMIT 1;
        v_res := COALESCE(v_res, '{}'::jsonb);
        v_result := CASE WHEN v_res ->> 'review_status' = 'approved' THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'critical_tags_ready' THEN
        SELECT COALESCE(array_agg(x), ARRAY['safety', 'process'])
          INTO v_levels
        FROM jsonb_array_elements_text(COALESCE(c.params -> 'levels', '[]'::jsonb)) x;

        WITH crit AS (
          SELECT t.id, t.tag_number, t.criticality
          FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
          WHERE ss.system_id = p_system_id AND t.criticality = ANY (v_levels)
        ),
        chk AS (
          SELECT crit.*,
                 (SELECT COUNT(*) FROM itrs i
                   WHERE i.tag_id = crit.id AND i.status <> 'approved'
                     AND (v_phase IS NULL OR i.phase_id = v_phase)) AS itrs_pending,
                 (SELECT COUNT(*) FROM punches p
                   WHERE p.tag_id = crit.id AND p.category IN ('A', 'B')
                     AND p.status IN ('open', 'in_progress')) AS punches_open
          FROM crit
        )
        SELECT COUNT(*)::int,
               COUNT(*) FILTER (WHERE itrs_pending > 0 OR punches_open > 0)::int,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'id', id, 'tag_number', tag_number, 'criticality', criticality,
                 'itrs_pending', itrs_pending, 'punches_open', punches_open) ORDER BY tag_number)
                 FILTER (WHERE itrs_pending > 0 OR punches_open > 0), '[]'::jsonb)
          INTO v_total, v_failn, v_fail
        FROM chk;
        v_res := jsonb_build_object('critical_total', v_total, 'failing_count', v_failn,
                                    'failing', v_fail, 'levels', to_jsonb(v_levels));
        v_result := CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'manual_attestation' THEN
        SELECT jsonb_build_object('attestation_id', a.id, 'comment', a.comment, 'file_path', a.file_path,
                                  'attested_by', a.attested_by, 'attested_at', a.attested_at)
          INTO v_res
        FROM system_gate_attestations a
        WHERE a.system_id = p_system_id AND a.criterion_id = c.id AND a.revoked_at IS NULL;
        v_result := CASE WHEN v_res IS NULL THEN 'fail' ELSE 'pass' END;
        v_res := COALESCE(v_res, '{}'::jsonb);
      END IF;

      IF v_result = 'fail' AND NOT c.is_blocking THEN
        v_result := 'warn';
      END IF;

      IF v_result = 'fail' THEN
        v_level := 'red';
      ELSIF v_result = 'warn' AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;

      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', c.id, 'kind', c.kind, 'label', c.params ->> 'label',
        'blocking', c.is_blocking, 'result', v_result, 'detail', v_res));
    END LOOP;

    SELECT jsonb_build_object(
             'id', a.id, 'status', a.status, 'target_status', a.target_status,
             'conditions', a.conditions, 'notes', a.notes,
             'approved_by', a.approved_by, 'approved_role', a.approved_role, 'approved_at', a.approved_at,
             'signatures', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'capacity', s.capacity, 'user_id', s.user_id, 'user_role', s.user_role,
                        'comments', s.comments, 'signed_at', s.signed_at) ORDER BY s.signed_at)
               FROM system_gate_signatures s WHERE s.approval_id = a.id), '[]'::jsonb))
      INTO v_appr
    FROM system_gate_approvals a
    WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL;

    gate_id             := g.id;
    gate_code           := g.code;
    gate_name           := g.name;
    gate_order          := g.order_index;
    gate_phase_id       := g.phase_id;
    requires_previous   := g.requires_previous;
    approval_roles      := g.approval_roles;
    required_signatures := g.required_signatures;
    cosign_roles        := g.cosign_roles;
    computed_level      := v_level;
    criteria            := v_crit;
    approval            := v_appr;
    status := CASE
      WHEN v_appr IS NOT NULL AND v_level = 'red' THEN 'regressed'
      WHEN v_appr IS NOT NULL THEN v_appr ->> 'status'
      WHEN v_level = 'green'  THEN 'ready'
      WHEN v_level = 'yellow' THEN 'ready_with_conditions'
      ELSE 'not_ready'
    END;
    RETURN NEXT;

    -- Solo un gate con todas sus firmas habilita al siguiente.
    v_prev_ok := v_appr IS NOT NULL AND v_appr ->> 'status' <> 'pending_signatures';
    v_first   := false;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_system_gates(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_system_gates(uuid) TO authenticated, service_role;

-- ── 12. Mi trabajo: colas de acciones y restricciones ───────────────────
CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    select id from projects where org_id = p_org_id
  ),
  me as (
    select role::text as role from org_members where org_id = p_org_id and user_id = auth.uid()
  )
  select jsonb_build_object(
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status in ('not_started', 'in_progress')
        and i.project_id in (select id from proj)
    ),
    'itrs_review', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role in ('supervisor', 'client')
        and i.status = 'completed'
        and i.project_id in (select id from proj)
        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
    ),
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.resolved_at is null
        and p.project_id in (select id from proj)
    ),
    'punches_verify', (
      select count(*)
      from punches p
      where p.status = 'in_progress'
        and p.resolved_at is not null
        and p.resolved_by is distinct from auth.uid()
        and p.project_id in (select id from proj)
    ),
    'punches_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from punches p
        where p.status in ('open', 'in_progress')
          and p.category_reviewed_at is null
          and p.raised_by is distinct from auth.uid()
          and p.project_id in (select id from proj)
      ) else 0 end
    ),
    'plan_items', (
      select count(*)
      from work_plan_items wi
      join work_plans wp on wp.id = wi.work_plan_id
      where wi.assigned_to = auth.uid()
        and wi.status in ('not_started', 'in_progress')
        and wp.status in ('published', 'in_progress')
        and wp.plan_date <= current_date
        and wp.project_id in (select id from proj)
    ),
    'signatures', (
      select count(*)
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      where pp.status = 'active'
        and pp.next_due_date < current_date
        and pp.project_id in (select id from proj)
    ),
    'actions_mine', (
      select count(*)
      from actions a
      where a.owner_id = auth.uid()
        and a.status in ('open', 'in_progress')
        and a.project_id in (select id from proj)
    ),
    'actions_verify', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from actions a
        where a.status = 'done'
          and a.done_by is distinct from auth.uid()
          and a.project_id in (select id from proj)
      ) else 0 end
    ),
    'constraints_mine', (
      select count(*)
      from project_constraints c
      where c.owner_id = auth.uid()
        and c.status = 'open'
        and c.project_id in (select id from proj)
    )
  );
$function$;
