-- Fase 8, sesión 2 (decisiones de Luis, 2026-10-19; doc §15.5–15.7 y §15.10–15.13): paquetes de vendor.
--
--   vendor_packages            VND-0001 por proyecto: empresa, alcance, límites, sistemas y equipos (tags) del
--                              paquete; planned → mobilized → demobilized | cancelled.
--   vendor_interfaces          matriz de interfaces (contraparte, descripción, responsable; open/agreed/closed).
--   vendor_checklist           checklist fijo de movilización y de desmovilización (vendor_checklist_keys()).
--   movilización               gate de un sistema aprobado (con todas sus firmas) + checklist completo + ninguna
--                              interfaz abierta; autoriza un líder+ (§15.6).
--   vendor_activities          FAT / SAT con resultado; vendor_findings: con tag → punch (origen paquete vendor),
--                              sin tag → acción ACC con origen 'vendor' (§15.7).
--   vendor_reports             diarios y final (único), estructurados e inmutables al registrarse (§15.11).
--   vendor_recommendations     propuesta → aprobada | rechazada (líder+, rechazo con motivo) → implementada; si
--                              requiere MOC no se implementa sin el número de MOC de la operadora (§15.10).
--   desmovilización            reporte final emitido + checklist completo + ningún punch Cat A abierto del
--                              paquete (§15.12). El paquete no afecta los gates (§15.13).
--
-- Lectura por RLS; escritura SOLO por RPC SECURITY DEFINER. client solo lee.

-- ── 1. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.vendor_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq             integer NOT NULL,
  number          text NOT NULL,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  title           text NOT NULL,
  scope           text,
  boundaries      text,
  status          text NOT NULL DEFAULT 'planned',
  mob_system_id   uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  mob_gate_id     uuid REFERENCES public.readiness_gates(id) ON DELETE SET NULL,
  planned_mobilization date,
  mobilized_by    uuid, mobilized_at timestamptz, mobilization_note text,
  demobilized_by  uuid, demobilized_at timestamptz, demobilization_note text,
  cancelled_by    uuid, cancelled_at timestamptz, cancel_reason text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_packages_status_check CHECK (status IN ('planned', 'mobilized', 'demobilized', 'cancelled')),
  CONSTRAINT vendor_packages_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT vendor_packages_mob_check CHECK ((mob_system_id IS NULL) = (mob_gate_id IS NULL)),
  CONSTRAINT vendor_packages_number_uq UNIQUE (project_id, number)
);
CREATE INDEX vendor_packages_company_idx ON public.vendor_packages (company_id);

CREATE TABLE public.vendor_package_systems (
  package_id uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  system_id  uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, system_id)
);
CREATE INDEX vendor_package_systems_system_idx ON public.vendor_package_systems (system_id);

CREATE TABLE public.vendor_package_tags (
  package_id uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, tag_id)
);

CREATE TABLE public.vendor_interfaces (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id             uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  counterpart_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  counterpart            text,
  description            text NOT NULL,
  responsible            text,
  status                 text NOT NULL DEFAULT 'open',
  updated_by             uuid,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_interfaces_status_check CHECK (status IN ('open', 'agreed', 'closed')),
  CONSTRAINT vendor_interfaces_desc_check CHECK (length(btrim(description)) BETWEEN 1 AND 2000)
);
CREATE INDEX vendor_interfaces_package_idx ON public.vendor_interfaces (package_id);

CREATE TABLE public.vendor_checklist (
  package_id uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase      text NOT NULL,
  item_key   text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  note       text,
  checked_by uuid,
  checked_at timestamptz,
  PRIMARY KEY (package_id, phase, item_key),
  CONSTRAINT vendor_checklist_phase_check CHECK (phase IN ('mobilization', 'demobilization'))
);

CREATE TABLE public.vendor_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  planned_date date,
  performed_on date,
  location     text,
  result       text NOT NULL DEFAULT 'pending',
  notes        text,
  recorded_by  uuid,
  result_by    uuid,
  result_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_activities_kind_check CHECK (kind IN ('fat', 'sat')),
  CONSTRAINT vendor_activities_result_check CHECK (result IN ('pending', 'passed', 'passed_with_findings', 'failed')),
  CONSTRAINT vendor_activities_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200)
);
CREATE INDEX vendor_activities_package_idx ON public.vendor_activities (package_id);

CREATE TABLE public.vendor_findings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.vendor_activities(id) ON DELETE CASCADE,
  package_id  uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  tag_id      uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  category    text,
  punch_id    uuid REFERENCES public.punches(id) ON DELETE SET NULL,
  action_id   uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_findings_category_check CHECK (category IS NULL OR category IN ('A', 'B', 'C'))
);
CREATE INDEX vendor_findings_package_idx ON public.vendor_findings (package_id);

CREATE TABLE public.vendor_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  report_date date NOT NULL,
  headcount   integer,
  hours       numeric(8,1),
  activities  text NOT NULL,
  issues      text,
  issued_by   uuid,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_reports_kind_check CHECK (kind IN ('daily', 'final')),
  CONSTRAINT vendor_reports_headcount_check CHECK (headcount IS NULL OR headcount BETWEEN 0 AND 10000),
  CONSTRAINT vendor_reports_hours_check CHECK (hours IS NULL OR hours BETWEEN 0 AND 100000)
);
CREATE INDEX vendor_reports_package_idx ON public.vendor_reports (package_id, report_date DESC);
CREATE UNIQUE INDEX vendor_reports_final_uq ON public.vendor_reports (package_id) WHERE kind = 'final';

CREATE TABLE public.vendor_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES public.vendor_packages(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq             integer NOT NULL,
  description     text NOT NULL,
  rationale       text,
  requires_moc    boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'proposed',
  proposed_by     uuid,
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid, decided_at timestamptz, decision_reason text,
  moc_reference   text,
  implemented_by  uuid, implemented_at timestamptz, implementation_note text,
  CONSTRAINT vendor_recommendations_status_check CHECK (status IN ('proposed', 'approved', 'rejected', 'implemented')),
  CONSTRAINT vendor_recommendations_moc_check CHECK (status <> 'implemented' OR NOT requires_moc OR moc_reference IS NOT NULL),
  CONSTRAINT vendor_recommendations_seq_uq UNIQUE (package_id, seq)
);

ALTER TABLE public.vendor_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_package_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_package_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_interfaces      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_checklist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_findings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_packages_select ON public.vendor_packages FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_package_systems_select ON public.vendor_package_systems FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_package_tags_select ON public.vendor_package_tags FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_interfaces_select ON public.vendor_interfaces FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_checklist_select ON public.vendor_checklist FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_activities_select ON public.vendor_activities FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_findings_select ON public.vendor_findings FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_reports_select ON public.vendor_reports FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY vendor_recommendations_select ON public.vendor_recommendations FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 2. Helpers ───────────────────────────────────────────────────────────
-- Catálogo fijo = VENDOR_CHECKLIST en src/lib/vendors/catalog.ts.
CREATE OR REPLACE FUNCTION public.vendor_checklist_keys(p_phase text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_phase
    WHEN 'mobilization'   THEN ARRAY['scope_interfaces', 'hse_induction', 'permits', 'calibrated_equipment', 'documents_current']
    WHEN 'demobilization' THEN ARRAY['as_built_delivered', 'tools_removed', 'permits_closed', 'area_clean']
    ELSE ARRAY[]::text[] END;
$fn$;

CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets',
                     'startup_events', 'ownership_transfers', 'performance_tests', 'performance_certificates', 'vendor_packages') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

-- Origen 'vendor' de una acción: opcionalmente vinculado a un paquete del proyecto.
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
  ELSIF p_kind = 'performance' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM performance_runs WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'vendor' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM vendor_packages WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'El origen no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
END;
$fn$;

-- Paquete bloqueado para escritura + rol del llamador. p_lead exige líder+.
CREATE OR REPLACE FUNCTION public.vendor_package_for_write(p_package_id uuid, p_lead boolean, OUT pkg vendor_packages, OUT role text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  SELECT * INTO pkg FROM vendor_packages WHERE id = p_package_id FOR UPDATE;
  IF pkg.id IS NULL THEN RAISE EXCEPTION 'Paquete no encontrado' USING ERRCODE = 'P0002'; END IF;
  role := public.register_caller_role(pkg.project_id);
  IF auth.uid() IS NULL OR role IS NULL OR role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_lead AND NOT public.document_is_controller(role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores' USING ERRCODE = '42501';
  END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.vendor_package_for_write(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Estado de la movilización: gate del sistema aprobado con firmas, checklist e interfaces.
CREATE OR REPLACE FUNCTION public.vendor_mobilization_status(p_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p vendor_packages%ROWTYPE; v_gate_status text; v_missing text[]; v_open integer;
BEGIN
  SELECT * INTO p FROM vendor_packages WHERE id = p_package_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Paquete no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p.mob_system_id IS NOT NULL THEN
    SELECT g.status INTO v_gate_status FROM public.compute_system_gates(p.mob_system_id) g WHERE g.gate_id = p.mob_gate_id;
  END IF;
  SELECT array_agg(k ORDER BY array_position(public.vendor_checklist_keys('mobilization'), k)) INTO v_missing
  FROM unnest(public.vendor_checklist_keys('mobilization')) k
  WHERE NOT EXISTS (SELECT 1 FROM vendor_checklist c WHERE c.package_id = p.id AND c.phase = 'mobilization' AND c.item_key = k AND c.done);
  SELECT count(*) INTO v_open FROM vendor_interfaces WHERE package_id = p.id AND status = 'open';
  RETURN jsonb_build_object(
    'gate_required', p.mob_gate_id IS NOT NULL,
    'gate_status', COALESCE(v_gate_status, 'none'),
    'gate_ok', p.mob_gate_id IS NULL OR COALESCE(v_gate_status IN ('approved', 'approved_with_conditions'), false),
    'missing', COALESCE(to_jsonb(v_missing), '[]'::jsonb),
    'open_interfaces', v_open,
    'ready', (p.mob_gate_id IS NULL OR COALESCE(v_gate_status IN ('approved', 'approved_with_conditions'), false))
             AND v_missing IS NULL AND v_open = 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.vendor_demobilization_status(p_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p vendor_packages%ROWTYPE; v_missing text[]; v_final boolean; v_cat_a jsonb; v_n integer;
BEGIN
  SELECT * INTO p FROM vendor_packages WHERE id = p_package_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Paquete no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(k ORDER BY array_position(public.vendor_checklist_keys('demobilization'), k)) INTO v_missing
  FROM unnest(public.vendor_checklist_keys('demobilization')) k
  WHERE NOT EXISTS (SELECT 1 FROM vendor_checklist c WHERE c.package_id = p.id AND c.phase = 'demobilization' AND c.item_key = k AND c.done);
  v_final := EXISTS (SELECT 1 FROM vendor_reports WHERE package_id = p.id AND kind = 'final');
  SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('id', pu.id, 'number', pu.punch_number) ORDER BY pu.punch_number), '[]'::jsonb)
    INTO v_n, v_cat_a
  FROM vendor_findings f JOIN punches pu ON pu.id = f.punch_id
  WHERE f.package_id = p.id AND pu.category = 'A' AND pu.status IN ('open', 'in_progress');
  RETURN jsonb_build_object('missing', COALESCE(to_jsonb(v_missing), '[]'::jsonb), 'final_report', v_final,
    'open_cat_a', v_cat_a, 'ready', v_missing IS NULL AND v_final AND v_n = 0);
END;
$fn$;

-- ── 3. RPC: paquete ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_vendor_package(
  p_project_id uuid, p_id uuid, p_company_id uuid, p_title text, p_scope text, p_boundaries text,
  p_systems uuid[], p_tags uuid[], p_mob_system_id uuid, p_mob_gate_id uuid, p_planned_mobilization date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text := public.register_caller_role(p_project_id); v_org uuid; v_id uuid; v_seq integer; v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores gestionan paquetes de vendor' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND org_id = v_org) THEN RAISE EXCEPTION 'Empresa de otra organización' USING ERRCODE = '22023'; END IF;
  IF (p_mob_system_id IS NULL) <> (p_mob_gate_id IS NULL) THEN RAISE EXCEPTION 'Indica sistema y gate de movilización juntos' USING ERRCODE = '22023'; END IF;
  IF p_mob_system_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM systems WHERE id = p_mob_system_id AND project_id = p_project_id)
     OR NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = p_mob_gate_id AND org_id = v_org)) THEN
    RAISE EXCEPTION 'Sistema o gate de movilización no válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_systems, '{}'::uuid[])) s(id) WHERE NOT EXISTS (SELECT 1 FROM systems x WHERE x.id = s.id AND x.project_id = p_project_id))
     OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_tags, '{}'::uuid[])) t(id) WHERE NOT EXISTS (SELECT 1 FROM tags x WHERE x.id = t.id AND x.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Algún sistema o tag no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    v_seq := public.mgmt_next_seq('vendor_packages', p_project_id);
    INSERT INTO vendor_packages (org_id, project_id, seq, number, company_id, title, scope, boundaries, mob_system_id, mob_gate_id, planned_mobilization, created_by)
    VALUES (v_org, p_project_id, v_seq, 'VND-' || lpad(v_seq::text, 4, '0'), p_company_id, public.mgmt_text(p_title, 200),
            public.mgmt_text(p_scope), public.mgmt_text(p_boundaries), p_mob_system_id, p_mob_gate_id, p_planned_mobilization, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_status FROM vendor_packages WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Paquete no encontrado' USING ERRCODE = 'P0002'; END IF;
    IF v_status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
    -- La movilización ya autorizada no cambia de gate ni de empresa.
    UPDATE vendor_packages SET title = public.mgmt_text(p_title, 200), scope = public.mgmt_text(p_scope), boundaries = public.mgmt_text(p_boundaries),
           company_id = CASE WHEN v_status = 'planned' THEN p_company_id ELSE company_id END,
           mob_system_id = CASE WHEN v_status = 'planned' THEN p_mob_system_id ELSE mob_system_id END,
           mob_gate_id = CASE WHEN v_status = 'planned' THEN p_mob_gate_id ELSE mob_gate_id END,
           planned_mobilization = p_planned_mobilization, updated_at = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  DELETE FROM vendor_package_systems WHERE package_id = v_id AND NOT (system_id = ANY (COALESCE(p_systems, '{}'::uuid[])));
  INSERT INTO vendor_package_systems (package_id, system_id, project_id) SELECT v_id, s, p_project_id FROM unnest(COALESCE(p_systems, '{}'::uuid[])) s ON CONFLICT DO NOTHING;
  DELETE FROM vendor_package_tags WHERE package_id = v_id AND NOT (tag_id = ANY (COALESCE(p_tags, '{}'::uuid[])));
  INSERT INTO vendor_package_tags (package_id, tag_id, project_id) SELECT v_id, t, p_project_id FROM unnest(COALESCE(p_tags, '{}'::uuid[])) t ON CONFLICT DO NOTHING;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_vendor_interface(
  p_package_id uuid, p_id uuid, p_counterpart_company_id uuid, p_counterpart text, p_description text, p_responsible text, p_status text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_status NOT IN ('open', 'agreed', 'closed') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_description, 2000) IS NULL THEN RAISE EXCEPTION 'Describe la interfaz' USING ERRCODE = '22023'; END IF;
  IF p_counterpart_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies WHERE id = p_counterpart_company_id AND org_id = (w.pkg).org_id) THEN
    RAISE EXCEPTION 'Empresa de otra organización' USING ERRCODE = '22023';
  END IF;
  IF p_counterpart_company_id IS NULL AND public.mgmt_text(p_counterpart, 160) IS NULL THEN RAISE EXCEPTION 'Indica la contraparte' USING ERRCODE = '22023'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO vendor_interfaces (package_id, project_id, counterpart_company_id, counterpart, description, responsible, status, updated_by)
    VALUES ((w.pkg).id, (w.pkg).project_id, p_counterpart_company_id, public.mgmt_text(p_counterpart, 160), public.mgmt_text(p_description, 2000),
            public.mgmt_text(p_responsible, 160), p_status, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE vendor_interfaces SET counterpart_company_id = p_counterpart_company_id, counterpart = public.mgmt_text(p_counterpart, 160),
           description = public.mgmt_text(p_description, 2000), responsible = public.mgmt_text(p_responsible, 160), status = p_status,
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id AND package_id = (w.pkg).id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Interfaz no encontrada' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Ítem del checklist: movilización mientras el paquete está planificado; desmovilización con el paquete movilizado.
CREATE OR REPLACE FUNCTION public.set_vendor_checklist_item(p_package_id uuid, p_phase text, p_key text, p_done boolean, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF NOT (p_key = ANY (public.vendor_checklist_keys(p_phase))) THEN RAISE EXCEPTION 'Ítem no válido' USING ERRCODE = '22023'; END IF;
  IF (p_phase = 'mobilization' AND (w.pkg).status <> 'planned') OR (p_phase = 'demobilization' AND (w.pkg).status <> 'mobilized') THEN
    RAISE EXCEPTION 'Este checklist no se edita en el estado actual del paquete' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO vendor_checklist (package_id, project_id, phase, item_key, done, note, checked_by, checked_at)
  VALUES ((w.pkg).id, (w.pkg).project_id, p_phase, p_key, COALESCE(p_done, false), public.mgmt_text(p_note, 1000), auth.uid(), now())
  ON CONFLICT (package_id, phase, item_key) DO UPDATE
    SET done = EXCLUDED.done, note = EXCLUDED.note, checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mobilize_vendor_package(p_package_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; s jsonb;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, true);
  IF (w.pkg).status <> 'planned' THEN RAISE EXCEPTION 'Solo se moviliza un paquete planificado' USING ERRCODE = 'P0001'; END IF;
  s := public.vendor_mobilization_status((w.pkg).id);
  IF NOT (s ->> 'gate_ok')::boolean THEN RAISE EXCEPTION 'El gate de movilización del sistema no está aprobado con todas sus firmas' USING ERRCODE = 'P0001'; END IF;
  IF (s ->> 'open_interfaces')::int > 0 THEN RAISE EXCEPTION 'Hay interfaces sin acordar' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_array_length(s -> 'missing') > 0 THEN RAISE EXCEPTION 'Falta completar el checklist de movilización' USING ERRCODE = 'P0001'; END IF;
  UPDATE vendor_packages SET status = 'mobilized', mobilized_by = auth.uid(), mobilized_at = now(),
         mobilization_note = public.mgmt_text(p_note, 2000), updated_at = now() WHERE id = (w.pkg).id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demobilize_vendor_package(p_package_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; s jsonb;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, true);
  IF (w.pkg).status <> 'mobilized' THEN RAISE EXCEPTION 'Solo se desmoviliza un paquete movilizado' USING ERRCODE = 'P0001'; END IF;
  s := public.vendor_demobilization_status((w.pkg).id);
  IF NOT (s ->> 'final_report')::boolean THEN RAISE EXCEPTION 'Falta el reporte final del vendor' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_array_length(s -> 'open_cat_a') > 0 THEN RAISE EXCEPTION 'Hay punch Cat A abiertos del paquete' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_array_length(s -> 'missing') > 0 THEN RAISE EXCEPTION 'Falta completar el checklist de desmovilización' USING ERRCODE = 'P0001'; END IF;
  UPDATE vendor_packages SET status = 'demobilized', demobilized_by = auth.uid(), demobilized_at = now(),
         demobilization_note = public.mgmt_text(p_note, 2000), updated_at = now() WHERE id = (w.pkg).id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_vendor_package(p_package_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, true);
  IF (w.pkg).status <> 'planned' THEN RAISE EXCEPTION 'Solo se cancela un paquete planificado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  UPDATE vendor_packages SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason, updated_at = now()
   WHERE id = (w.pkg).id;
END;
$fn$;

-- ── 4. RPC: FAT / SAT y hallazgos ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_vendor_activity(
  p_package_id uuid, p_id uuid, p_kind text, p_title text, p_planned_date date, p_location text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('fat', 'sat') THEN RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO vendor_activities (package_id, project_id, kind, title, planned_date, location, notes, recorded_by)
    VALUES ((w.pkg).id, (w.pkg).project_id, p_kind, public.mgmt_text(p_title, 200), p_planned_date, public.mgmt_text(p_location, 200),
            public.mgmt_text(p_notes, 4000), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE vendor_activities SET kind = p_kind, title = public.mgmt_text(p_title, 200), planned_date = p_planned_date,
           location = public.mgmt_text(p_location, 200), notes = public.mgmt_text(p_notes, 4000)
     WHERE id = p_id AND package_id = (w.pkg).id AND result = 'pending'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'La actividad no existe o ya tiene resultado' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Resultado de la FAT/SAT (líder+). Una vez registrado no cambia.
CREATE OR REPLACE FUNCTION public.record_vendor_activity_result(p_activity_id uuid, p_result text, p_performed_on date, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE a vendor_activities%ROWTYPE; w record;
BEGIN
  SELECT * INTO a FROM vendor_activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actividad no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(a.package_id, true);
  IF a.result <> 'pending' THEN RAISE EXCEPTION 'La actividad ya tiene resultado' USING ERRCODE = 'P0001'; END IF;
  IF p_result NOT IN ('passed', 'passed_with_findings', 'failed') THEN RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023'; END IF;
  IF p_performed_on IS NULL OR p_performed_on > current_date THEN RAISE EXCEPTION 'Fecha de ejecución no válida' USING ERRCODE = '22023'; END IF;
  IF p_result <> 'passed' AND NOT EXISTS (SELECT 1 FROM vendor_findings WHERE activity_id = a.id) THEN
    RAISE EXCEPTION 'Registra los hallazgos antes del resultado' USING ERRCODE = 'P0001';
  END IF;
  UPDATE vendor_activities SET result = p_result, performed_on = p_performed_on, result_by = auth.uid(), result_at = now(),
         notes = COALESCE(public.mgmt_text(p_notes, 4000), notes)
   WHERE id = a.id;
END;
$fn$;

-- Hallazgo: con tag → punch (categoría obligatoria, disciplina y subsistema del tag); sin tag → acción ACC.
CREATE OR REPLACE FUNCTION public.add_vendor_finding(
  p_activity_id uuid, p_description text, p_tag_id uuid, p_category text, p_owner_id uuid DEFAULT NULL, p_due_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE a vendor_activities%ROWTYPE; w record; t tags%ROWTYPE; v_desc text := public.mgmt_text(p_description, 2000);
        v_punch uuid; v_action uuid; v_id uuid; v_label text;
BEGIN
  SELECT * INTO a FROM vendor_activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actividad no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(a.package_id, false);
  IF (w.pkg).status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF a.result <> 'pending' THEN RAISE EXCEPTION 'La actividad ya tiene resultado' USING ERRCODE = 'P0001'; END IF;
  IF v_desc IS NULL THEN RAISE EXCEPTION 'Describe el hallazgo' USING ERRCODE = '22023'; END IF;
  v_label := (w.pkg).number || ' ' || upper(a.kind);
  IF p_tag_id IS NOT NULL THEN
    SELECT * INTO t FROM tags WHERE id = p_tag_id AND project_id = (w.pkg).project_id;
    IF t.id IS NULL THEN RAISE EXCEPTION 'El tag no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
    IF p_category NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'Indica la categoría del punch' USING ERRCODE = '22023'; END IF;
    INSERT INTO punches (project_id, subsystem_id, tag_id, punch_number, category, description, discipline_id, raised_by, created_via)
    VALUES ((w.pkg).project_id, t.subsystem_id, t.id, '', p_category::punch_category, '[' || v_label || '] ' || v_desc, t.discipline_id, auth.uid(), 'vendor_package')
    RETURNING id INTO v_punch;
  ELSE
    v_action := public.create_action((w.pkg).project_id, left('[' || v_label || '] ' || v_desc, 200), COALESCE(p_owner_id, auth.uid()),
                                     v_desc, 'vendor', (w.pkg).id, v_label, NULL, p_due_date, 'medium', 'review');
  END IF;
  INSERT INTO vendor_findings (activity_id, package_id, project_id, description, tag_id, category, punch_id, action_id, created_by)
  VALUES (a.id, (w.pkg).id, (w.pkg).project_id, v_desc, p_tag_id, CASE WHEN p_tag_id IS NOT NULL THEN p_category END, v_punch, v_action, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ── 5. RPC: reportes y recomendaciones ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_vendor_report(
  p_package_id uuid, p_kind text, p_report_date date, p_headcount integer, p_hours numeric, p_activities text, p_issues text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status <> 'mobilized' THEN RAISE EXCEPTION 'Los reportes se registran con el vendor movilizado' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('daily', 'final') THEN RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023'; END IF;
  IF p_report_date IS NULL OR p_report_date > current_date THEN RAISE EXCEPTION 'Fecha no válida' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_activities, 8000) IS NULL THEN RAISE EXCEPTION 'Describe las actividades' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'final' AND EXISTS (SELECT 1 FROM vendor_reports WHERE package_id = (w.pkg).id AND kind = 'final') THEN
    RAISE EXCEPTION 'El paquete ya tiene reporte final' USING ERRCODE = '23505';
  END IF;
  INSERT INTO vendor_reports (package_id, project_id, kind, report_date, headcount, hours, activities, issues, issued_by)
  VALUES ((w.pkg).id, (w.pkg).project_id, p_kind, p_report_date, p_headcount, p_hours, public.mgmt_text(p_activities, 8000),
          public.mgmt_text(p_issues, 8000), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.propose_vendor_recommendation(p_package_id uuid, p_description text, p_rationale text, p_requires_moc boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE w record; v_id uuid; v_seq integer;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(p_description, 4000) IS NULL THEN RAISE EXCEPTION 'Describe la recomendación' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM vendor_recommendations WHERE package_id = (w.pkg).id;
  INSERT INTO vendor_recommendations (package_id, project_id, seq, description, rationale, requires_moc, proposed_by)
  VALUES ((w.pkg).id, (w.pkg).project_id, v_seq, public.mgmt_text(p_description, 4000), public.mgmt_text(p_rationale, 4000),
          COALESCE(p_requires_moc, false), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- approved | rejected (líder+; rechazo con motivo; puede corregir «requiere MOC» al decidir).
CREATE OR REPLACE FUNCTION public.decide_vendor_recommendation(p_id uuid, p_decision text, p_reason text, p_requires_moc boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r vendor_recommendations%ROWTYPE; w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM vendor_recommendations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recomendación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(r.package_id, true);
  IF r.status <> 'proposed' THEN RAISE EXCEPTION 'La recomendación ya fue decidida' USING ERRCODE = 'P0001'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decisión no válida' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'rejected' AND (v_reason IS NULL OR length(v_reason) < 3) THEN RAISE EXCEPTION 'Indica el motivo del rechazo' USING ERRCODE = '22023'; END IF;
  UPDATE vendor_recommendations SET status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         requires_moc = COALESCE(p_requires_moc, requires_moc)
   WHERE id = r.id;
END;
$fn$;

-- approved → implemented; si requiere MOC exige el número de MOC de la operadora (§15.10).
CREATE OR REPLACE FUNCTION public.implement_vendor_recommendation(p_id uuid, p_moc_reference text, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r vendor_recommendations%ROWTYPE; w record; v_moc text := public.mgmt_text(p_moc_reference, 80);
BEGIN
  SELECT * INTO r FROM vendor_recommendations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recomendación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(r.package_id, false);
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Solo se implementa una recomendación aprobada' USING ERRCODE = 'P0001'; END IF;
  IF r.requires_moc AND v_moc IS NULL THEN RAISE EXCEPTION 'Esta recomendación requiere el número de MOC' USING ERRCODE = '22023'; END IF;
  UPDATE vendor_recommendations SET status = 'implemented', moc_reference = v_moc, implemented_by = auth.uid(), implemented_at = now(),
         implementation_note = public.mgmt_text(p_note, 2000)
   WHERE id = r.id;
END;
$fn$;

-- ── 6. Adjuntos (bucket mgmt-evidence) para reportes y FAT/SAT ──────────
ALTER TABLE public.mgmt_attachments DROP CONSTRAINT mgmt_attachments_kind_check;
ALTER TABLE public.mgmt_attachments ADD CONSTRAINT mgmt_attachments_kind_check
  CHECK (entity_kind IN ('action', 'constraint', 'tq', 'decision', 'vendor_report', 'vendor_activity'));

DO $patch$
DECLARE v_def text;
  v_anchor text := E'  ELSIF p_entity_kind = ''decision'' THEN\n    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM decisions WHERE id = p_entity_id;';
BEGIN
  v_def := pg_get_functiondef('public.add_mgmt_attachment(text, uuid, text, text, text, bigint)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'add_mgmt_attachment: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor, v_anchor
    || E'\n  -- Fase 8: evidencia del vendor (reportes inmutables y FAT/SAT); el paquete no debe estar cancelado.\n'
    || E'  ELSIF p_entity_kind = ''vendor_report'' THEN\n'
    || E'    SELECT r.project_id, p.org_id, CASE WHEN p.status = ''cancelled'' THEN ''cancelled'' END INTO v_project, v_org, v_status\n'
    || E'    FROM vendor_reports r JOIN vendor_packages p ON p.id = r.package_id WHERE r.id = p_entity_id;\n'
    || E'  ELSIF p_entity_kind = ''vendor_activity'' THEN\n'
    || E'    SELECT a.project_id, p.org_id, CASE WHEN p.status = ''cancelled'' THEN ''cancelled'' END INTO v_project, v_org, v_status\n'
    || E'    FROM vendor_activities a JOIN vendor_packages p ON p.id = a.package_id WHERE a.id = p_entity_id;');
END;
$patch$;

-- ── 7. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.vendor_mobilization_status(uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vendor_demobilization_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_vendor_package(uuid, uuid, uuid, text, text, text, uuid[], uuid[], uuid, uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_vendor_interface(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_vendor_checklist_item(uuid, text, text, boolean, text)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mobilize_vendor_package(uuid, text)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.demobilize_vendor_package(uuid, text)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_vendor_package(uuid, text)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_vendor_activity(uuid, uuid, text, text, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_vendor_activity_result(uuid, text, date, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_vendor_finding(uuid, text, uuid, text, uuid, date)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_vendor_report(uuid, text, date, integer, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propose_vendor_recommendation(uuid, text, text, boolean)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_vendor_recommendation(uuid, text, text, boolean)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.implement_vendor_recommendation(uuid, text, text)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_mobilization_status(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_demobilization_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_vendor_package(uuid, uuid, uuid, text, text, text, uuid[], uuid[], uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_vendor_interface(uuid, uuid, uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_checklist_item(uuid, text, text, boolean, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mobilize_vendor_package(uuid, text)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demobilize_vendor_package(uuid, text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_vendor_package(uuid, text)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_vendor_activity(uuid, uuid, text, text, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_vendor_activity_result(uuid, text, date, text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_vendor_finding(uuid, text, uuid, text, uuid, date)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_vendor_report(uuid, text, date, integer, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.propose_vendor_recommendation(uuid, text, text, boolean)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_vendor_recommendation(uuid, text, text, boolean)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.implement_vendor_recommendation(uuid, text, text)             TO authenticated, service_role;
