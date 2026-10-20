-- S14 (revisión integral 2026-10-19, D14): firmantes designados por persona y proyecto.
--   D-03 / E-02 / I-25 / F-14  project_capacities (commissioning · operations · hse · client_rep) y has_capacity(),
--         usada por co-firmas y aprobación de gates, hold points, testigos de hitos, traspasos, PTC, firma Cliente del
--         ITR, seguimiento Ops del punch y las colas de Mi trabajo.
--   I-15  una sola definición de los roles de respaldo (capacity_fallback_roles = CAPACITY_FALLBACK_ROLES en TS) y
--         set_gate_weights alineado con la acción (solo owner/admin).
--   E-30  quien editó un borrador de procedimiento o de prueba de desempeño no lo aprueba (editors[]).
-- Decisiones de Luis (2026-10-20):
--   · Por proyecto y capacidad: si hay designados, firman solo ellos; si no hay ninguno rige la regla de rol de antes
--     (hold_release_roles / cosign_roles / rol client) y la pantalla avisa «sin designado».
--   · Asignan solo owner/admin (cada alta y baja queda en la tabla, con quién, cuándo y por qué).
--   · client_rep = miembro de una empresa tipo «owner» (operadora) o con rol client. commissioning ≠ rol client.

-- ── 1. Designaciones ─────────────────────────────────────────────────────
CREATE TABLE public.project_capacities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  capacity      text NOT NULL,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  note          text,
  assigned_by   uuid NOT NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  revoked_by    uuid,
  revoked_at    timestamptz,
  revoke_reason text,
  CONSTRAINT project_capacities_capacity_check CHECK (capacity IN ('commissioning', 'operations', 'hse', 'client_rep')),
  CONSTRAINT project_capacities_revoke_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL OR revoke_reason IS NOT NULL))
);
CREATE UNIQUE INDEX project_capacities_active_uq ON public.project_capacities (project_id, user_id, capacity) WHERE revoked_at IS NULL;
CREATE INDEX project_capacities_project_idx ON public.project_capacities (project_id, capacity) WHERE revoked_at IS NULL;
CREATE INDEX project_capacities_user_idx ON public.project_capacities (user_id) WHERE revoked_at IS NULL;
ALTER TABLE public.project_capacities ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_capacities_select ON public.project_capacities FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
-- Sin políticas de escritura: solo por assign_project_capacity / revoke_project_capacity.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_capacities FROM anon, authenticated;

-- ── 2. Funciones de capacidad ────────────────────────────────────────────
-- Regla de antes (respaldo mientras no haya designados). = CAPACITY_FALLBACK_ROLES en src/lib/constants/capacities.ts.
CREATE OR REPLACE FUNCTION public.capacity_fallback_roles(p_capacity text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_capacity
    WHEN 'commissioning' THEN ARRAY['owner', 'admin', 'architect', 'leader']
    WHEN 'operations'    THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    WHEN 'hse'           THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    WHEN 'client_rep'    THEN ARRAY['client']
    ELSE ARRAY[]::text[] END;
$fn$;

-- ¿El proyecto tiene alguien designado (vigente y aún miembro) para la capacidad?
CREATE OR REPLACE FUNCTION public.capacity_designated(p_project_id uuid, p_capacity text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM project_capacities pc
    JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id
    WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.revoked_at IS NULL);
$fn$;

-- ¿La persona puede firmar en esa capacidad en el proyecto? Con designados: solo ellos. Sin designados: rol de respaldo.
CREATE OR REPLACE FUNCTION public.has_capacity(p_project_id uuid, p_capacity text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN public.capacity_designated(p_project_id, p_capacity) THEN EXISTS (
      SELECT 1 FROM project_capacities pc
      JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id
      WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.user_id = p_user_id AND pc.revoked_at IS NULL)
    ELSE COALESCE((
      SELECT om.role::text = ANY (public.capacity_fallback_roles(p_capacity))
      FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = p_user_id
      WHERE p.id = p_project_id), false)
  END;
$fn$;
COMMENT ON FUNCTION public.has_capacity(uuid, text, uuid) IS
  'S14 (D14): con designados en project_capacities firman solo ellos; sin designados, el rol de capacity_fallback_roles().';

-- Capacidades efectivas del llamador en un proyecto, con el modo (designado | respaldo) para la UI.
CREATE OR REPLACE FUNCTION public.my_capacities(p_project_id uuid)
RETURNS TABLE (capacity text, allowed boolean, designated boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT c, public.has_capacity(p_project_id, c), public.capacity_designated(p_project_id, c)
  FROM unnest(ARRAY['commissioning', 'operations', 'hse', 'client_rep']) c
  WHERE public.is_project_member(p_project_id);
$fn$;

-- Quién puede tener la capacidad (piso): client_rep = empresa operadora (kind owner) o rol client; commissioning ≠ client.
CREATE OR REPLACE FUNCTION public.capacity_eligible(p_org_id uuid, p_user_id uuid, p_capacity text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE
    WHEN om.user_id IS NULL THEN 'La persona no es miembro de la organización'
    WHEN p_capacity = 'commissioning' AND om.role::text = 'client' THEN 'Un usuario con rol cliente no firma por Comisionamiento'
    WHEN p_capacity = 'client_rep' AND om.role::text <> 'client' AND COALESCE(c.kind, '') <> 'owner'
      THEN 'Representante del cliente: la persona debe tener rol cliente o pertenecer a la empresa operadora'
    ELSE NULL END
  FROM (SELECT 1) one
  LEFT JOIN org_members om ON om.org_id = p_org_id AND om.user_id = p_user_id
  LEFT JOIN companies c ON c.id = om.company_id;
$fn$;

CREATE OR REPLACE FUNCTION public.assign_project_capacity(p_project_id uuid, p_user_id uuid, p_capacity text, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_org uuid; v_err text; v_id uuid;
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'Solo owner o admin designan firmantes' USING ERRCODE = '42501';
  END IF;
  IF p_capacity NOT IN ('commissioning', 'operations', 'hse', 'client_rep') THEN RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023'; END IF;
  v_err := public.capacity_eligible(v_org, p_user_id, p_capacity);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM project_capacities WHERE project_id = p_project_id AND user_id = p_user_id AND capacity = p_capacity AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'La persona ya está designada para esa capacidad' USING ERRCODE = '23505';
  END IF;
  INSERT INTO project_capacities (org_id, project_id, user_id, capacity, company_id, note, assigned_by)
  VALUES (v_org, p_project_id, p_user_id, p_capacity,
          (SELECT company_id FROM org_members WHERE org_id = v_org AND user_id = p_user_id), public.mgmt_text(p_note, 500), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'project', p_project_id, 'capacity.assigned', jsonb_build_object('user_id', p_user_id, 'capacity', p_capacity));
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_project_capacity(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r project_capacities%ROWTYPE; v_reason text := public.mgmt_text(p_reason, 500);
BEGIN
  SELECT * INTO r FROM project_capacities WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Designación no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_org_admin(r.org_id) THEN
    RAISE EXCEPTION 'Solo owner o admin designan firmantes' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  UPDATE project_capacities SET revoked_by = auth.uid(), revoked_at = now(), revoke_reason = v_reason WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'project', r.project_id, 'capacity.revoked', jsonb_build_object('user_id', r.user_id, 'capacity', r.capacity, 'reason', v_reason));
END;
$fn$;

-- Firma Cliente del ITR (I-25): con representantes designados, la asignación «client» solo va a uno de ellos.
CREATE OR REPLACE FUNCTION public.guard_itr_client_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid;
BEGIN
  IF NEW.role::text <> 'client' THEN RETURN NEW; END IF;
  SELECT project_id INTO v_project FROM itrs WHERE id = NEW.itr_id;
  IF public.capacity_designated(v_project, 'client_rep') AND NOT public.has_capacity(v_project, 'client_rep', NEW.user_id) THEN
    RAISE EXCEPTION 'La firma Cliente del ITR va a un representante del cliente designado en el proyecto' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER itr_assignments_client_guard BEFORE INSERT OR UPDATE OF user_id, role ON public.itr_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_itr_client_assignment();

-- ── 3. E-30: quién editó el borrador ─────────────────────────────────────
ALTER TABLE public.procedure_revisions ADD COLUMN editors uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.performance_test_revisions ADD COLUMN editors uuid[] NOT NULL DEFAULT '{}';

-- ── 4. Funciones canónicas (supabase/functions-sql) ──────────────────────
CREATE OR REPLACE FUNCTION public.hold_release_roles(p_capacity text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- S14 (D14): alias de la regla de respaldo; la decisión real es has_capacity(proyecto, capacidad).
  SELECT public.capacity_fallback_roles(p_capacity);
$function$;

CREATE OR REPLACE FUNCTION public.release_hold_point(p_run_id uuid, p_step_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND OR rs.status <> 'at_hold' THEN RAISE EXCEPTION 'El paso no está esperando liberación' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  -- S14 (D14): firmante designado del proyecto (o, sin designados, el rol de respaldo).
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT public.has_capacity(r.project_id, st.hold_capacity) THEN
    RAISE EXCEPTION 'No estás designado para liberar un hold point de %', st.hold_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = rs.done_by THEN RAISE EXCEPTION 'Libera el hold point una persona distinta de quien ejecutó el paso' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('at_hold', 'stopped') THEN RAISE EXCEPTION 'La ejecución no está detenida en un hold point' USING ERRCODE = 'P0001'; END IF;
  UPDATE procedure_run_steps SET status = 'released', released_by = auth.uid(), released_at = now(), release_role = st.hold_capacity,
         comment = COALESCE(public.mgmt_text(p_comment, 2000), comment)
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN status = 'at_hold' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.witness_startup_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ev startup_events%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF ev.status <> 'pending_witness' THEN RAISE EXCEPTION 'El evento no espera testigo' USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  -- S14 (D14): testigo = firmante designado de esa capacidad (o, sin designados, el rol de respaldo).
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT public.has_capacity(ev.project_id, ev.witness_capacity) THEN
    RAISE EXCEPTION 'No estás designado para atestiguar como %', ev.witness_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = ev.recorded_by THEN RAISE EXCEPTION 'El testigo debe ser una persona distinta de quien registró el hito' USING ERRCODE = '42501'; END IF;
  UPDATE startup_events SET status = 'witnessed', witness_by = auth.uid(), witness_at = now() WHERE id = ev.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_ownership_transfer(p_transfer_id uuid, p_capacity text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE tr ownership_transfers%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_item jsonb; v_new text;
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF tr.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El traspaso % no espera firmas', tr.number USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(tr.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_capacity = 'commissioning' THEN
    -- S14 (D14): firmantes designados del proyecto (o, sin designados, el rol de respaldo).
    IF NOT public.has_capacity(tr.project_id, 'commissioning') THEN RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento' USING ERRCODE = '42501'; END IF;
    IF tr.commissioning_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Comisionamiento ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.operations_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET commissioning_signed_by = v_uid, commissioning_signed_at = now() WHERE id = tr.id RETURNING * INTO tr;
  ELSIF p_capacity = 'operations' THEN
    IF NOT public.has_capacity(tr.project_id, 'operations') THEN RAISE EXCEPTION 'No estás designado para firmar como Operaciones' USING ERRCODE = '42501'; END IF;
    IF tr.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.commissioning_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET operations_signed_by = v_uid, operations_signed_at = now() WHERE id = tr.id RETURNING * INTO tr;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;

  IF tr.commissioning_signed_by IS NULL OR tr.operations_signed_by IS NULL THEN RETURN 'pending_signatures'; END IF;

  -- Segunda firma: el checklist no puede haber empeorado sin justificación.
  IF NOT tr.is_reversal THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(public.ownership_checklist(tr.system_id, tr.to_stage)) WHERE NOT (value ->> 'ok')::boolean LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tr.exceptions) x WHERE x ->> 'key' = v_item ->> 'key') THEN
        v_new := v_item ->> 'key';
        RAISE EXCEPTION 'El checklist cambió desde la solicitud: ahora falta «%». Cancela y vuelve a pedir el traspaso', v_new USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  UPDATE ownership_transfers SET status = 'completed', completed_at = now(),
         content_hash = encode(sha256(convert_to(jsonb_build_object('number', tr.number, 'system', tr.system_id, 'from', tr.from_stage, 'to', tr.to_stage,
           'checklist', tr.checklist, 'exceptions', tr.exceptions, 'reason', tr.reason, 'c', tr.commissioning_signed_by, 'c_at', tr.commissioning_signed_at,
           'o', tr.operations_signed_by, 'o_at', tr.operations_signed_at)::text, 'UTF8')), 'hex')
   WHERE id = tr.id;
  UPDATE system_ownership SET stage = tr.to_stage, since = now(), last_transfer_id = tr.id WHERE system_id = tr.system_id;
  -- Reversión desde Operaciones: el paquete de handover emitido por el traspaso anterior queda reemplazado (§12.26).
  IF tr.is_reversal AND tr.from_stage = 'operations' THEN
    UPDATE handover_packages SET status = 'SUPERSEDED'
     WHERE status = 'ISSUED' AND id IN (SELECT handover_package_id FROM ownership_transfers
                                        WHERE system_id = tr.system_id AND to_stage = 'operations' AND handover_package_id IS NOT NULL);
  END IF;
  RETURN 'completed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_performance_certificate(p_certificate_id uuid, p_capacity text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c performance_certificates%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_status text := 'pending_signatures';
BEGIN
  SELECT * INTO c FROM performance_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El certificado no espera firmas' USING ERRCODE = 'P0001'; END IF;
  IF v_uid IN (c.commissioning_signed_by, c.operations_signed_by, c.client_signed_by) THEN
    RAISE EXCEPTION 'Cada firma del certificado es de una persona distinta' USING ERRCODE = '42501';
  END IF;
  IF p_capacity = 'operations' THEN
    IF c.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    -- S14 (D14): firmantes designados (o, sin designados, el rol de respaldo).
    IF NOT public.has_capacity(c.project_id, 'operations') THEN RAISE EXCEPTION 'No estás designado para firmar por Operaciones' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET operations_signed_by = v_uid, operations_signed_at = now() WHERE id = c.id;
  ELSIF p_capacity = 'client' THEN
    IF c.client_signed_by IS NOT NULL THEN RAISE EXCEPTION 'El cliente ya firmó' USING ERRCODE = 'P0001'; END IF;
    -- S14 (I-25): representante del cliente designado (empresa operadora); sin designados, rol cliente.
    IF NOT public.has_capacity(c.project_id, 'client_rep') THEN RAISE EXCEPTION 'Firma por el Cliente un representante del cliente designado (o, sin designados, un usuario con rol cliente)' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET client_signed_by = v_uid, client_signed_at = now() WHERE id = c.id;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM performance_certificates WHERE id = c.id;
  IF c.operations_signed_by IS NOT NULL AND c.client_signed_by IS NOT NULL THEN
    SELECT * INTO r FROM performance_runs WHERE id = c.run_id;
    UPDATE performance_certificates SET status = 'accepted', content_hash = encode(sha256(convert_to(jsonb_build_object(
      'certificate', c.number, 'run', r.number, 'evaluation_hash', r.evaluation_hash, 'result', r.result,
      'revision_hash', (SELECT content_hash FROM performance_test_revisions WHERE id = r.revision_id),
      'commissioning', jsonb_build_array(c.commissioning_signed_by, c.commissioning_signed_at),
      'operations', jsonb_build_array(c.operations_signed_by, c.operations_signed_at),
      'client', jsonb_build_array(c.client_signed_by, c.client_signed_at))::text, 'UTF8')), 'hex')
     WHERE id = c.id;
    v_status := 'accepted';
  END IF;
  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_performance_certificate(p_run_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE; t performance_tests%ROWTYPE; v_role text; v_live performance_certificates%ROWTYPE; v_seq integer; v_id uuid;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores emiten el certificado' USING ERRCODE = '42501'; END IF;
  -- S14 (D14): quien emite firma como Comisionamiento; con designados, debe ser uno de ellos.
  IF NOT public.has_capacity(r.project_id, 'commissioning') THEN RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'evaluated' OR r.result NOT IN ('accepted', 'accepted_with_deviation') THEN
    RAISE EXCEPTION 'Solo se certifica un intento con resultado aceptado' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM performance_tests WHERE id = r.test_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM performance_certificates WHERE run_id = r.id) THEN RAISE EXCEPTION 'Este intento ya tiene certificado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_live FROM performance_certificates WHERE test_id = t.id AND status IN ('pending_signatures', 'accepted');
  IF v_live.id IS NOT NULL THEN
    IF (SELECT attempt FROM performance_runs WHERE id = v_live.run_id) > r.attempt THEN
      RAISE EXCEPTION 'La prueba ya tiene un certificado de un intento posterior' USING ERRCODE = 'P0001';
    END IF;
    UPDATE performance_certificates SET status = 'superseded', superseded_at = now() WHERE id = v_live.id;
  END IF;
  v_seq := public.mgmt_next_seq('performance_certificates', r.project_id);
  INSERT INTO performance_certificates (org_id, project_id, seq, number, test_id, run_id, system_id, commissioning_signed_by, commissioning_signed_at)
  VALUES (r.org_id, r.project_id, v_seq, 'PTC-' || lpad(v_seq::text, 4, '0'), t.id, r.id, t.primary_system_id, auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_system_gate(p_approval_id uuid, p_capacity text, p_comments text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appr   system_gate_approvals%ROWTYPE;
  v_gate   readiness_gates%ROWTYPE;
  v_role   text;
  v_level  text;
  v_signed integer;
BEGIN
  SELECT * INTO v_appr FROM system_gate_approvals
  WHERE id = p_approval_id AND revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobación no encontrada o revocada' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid()
    AND public.is_project_member(v_appr.project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gate FROM readiness_gates WHERE id = v_appr.gate_id;

  IF v_appr.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'La aprobación del gate % ya tiene todas sus firmas', v_gate.code USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_capacity = ANY (v_gate.required_signatures)) THEN
    RAISE EXCEPTION 'El gate % no requiere la firma %', v_gate.code, p_capacity USING ERRCODE = '22023';
  END IF;
  -- S14 (D14): con firmantes designados de esa capacidad en el proyecto, firma solo uno de ellos (cualquier rol);
  -- sin designados rige la configuración del gate (cosign_roles).
  IF public.capacity_designated(v_appr.project_id, p_capacity) THEN
    IF NOT public.has_capacity(v_appr.project_id, p_capacity) THEN
      RAISE EXCEPTION 'No estás designado para firmar como % en este proyecto', p_capacity USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_role = ANY (v_gate.cosign_roles)) THEN
    RAISE EXCEPTION 'Tu rol (%) no puede co-firmar el gate %', v_role, v_gate.code USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND capacity = p_capacity) THEN
    RAISE EXCEPTION 'La firma % ya fue registrada', p_capacity USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este gate: cada firma debe ser de una persona distinta' USING ERRCODE = '23505';
  END IF;

  SELECT r.computed_level INTO v_level
  FROM public.compute_system_gates(v_appr.system_id) r WHERE r.gate_id = v_appr.gate_id;
  IF v_level IS NULL OR v_level = 'red' THEN
    RAISE EXCEPTION 'El gate % ya no cumple sus criterios: revisa los bloqueos antes de firmar', v_gate.code USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (p_approval_id, v_appr.org_id, v_appr.project_id, p_capacity, auth.uid(), v_role,
          NULLIF(left(btrim(COALESCE(p_comments, '')), 2000), ''));

  SELECT COUNT(DISTINCT s.capacity)::int INTO v_signed
  FROM system_gate_signatures s
  WHERE s.approval_id = p_approval_id AND s.capacity = ANY (v_gate.required_signatures);

  IF v_signed >= cardinality(v_gate.required_signatures) THEN
    UPDATE system_gate_approvals
       SET status = COALESCE(target_status, 'approved'), completed_at = now()  -- S11 (D-17)
     WHERE id = p_approval_id;
    RETURN COALESCE(v_appr.target_status, 'approved');
  END IF;

  RETURN 'pending_signatures';
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_system_gate(p_system_id uuid, p_gate_id uuid, p_conditions jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org        uuid;
  v_project    uuid;
  v_role       text;
  v_gate       readiness_gates%ROWTYPE;
  v_row        record;
  v_conditions jsonb := '[]'::jsonb;
  v_item       jsonb;
  v_text       text;
  v_target     text;
  v_notes      text;
  v_id         uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid()
    AND public.is_project_member(v_project);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gate FROM readiness_gates
  WHERE id = p_gate_id AND org_id = v_org AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gate no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_role = ANY (v_gate.approval_roles)) THEN
    RAISE EXCEPTION 'Tu rol (%) no puede aprobar el gate %', v_role, v_gate.code USING ERRCODE = '42501';
  END IF;
  -- S14 (D14): la aprobación es la firma de Comisionamiento; con designados, además debe ser uno de ellos.
  IF public.capacity_designated(v_project, 'commissioning') AND NOT public.has_capacity(v_project, 'commissioning') THEN
    RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM system_gate_approvals
             WHERE system_id = p_system_id AND gate_id = p_gate_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'El gate % ya está aprobado para este sistema', v_gate.code USING ERRCODE = '23505';
  END IF;

  IF p_conditions IS NOT NULL AND jsonb_typeof(p_conditions) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
      IF jsonb_typeof(v_item) = 'string' THEN
        v_text := left(btrim(v_item #>> '{}'), 500);
        IF v_text <> '' THEN
          v_conditions := v_conditions || to_jsonb(v_text);
        END IF;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_array_length(v_conditions) > 20 THEN
    RAISE EXCEPTION 'Máximo 20 condiciones' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.compute_system_gates(p_system_id) r WHERE r.gate_id = p_gate_id;
  IF NOT FOUND OR v_row.computed_level = 'red' THEN
    RAISE EXCEPTION 'El gate % no cumple sus criterios: no se puede aprobar', v_gate.code USING ERRCODE = 'P0001';
  END IF;
  IF v_row.computed_level = 'yellow' AND jsonb_array_length(v_conditions) = 0 THEN
    RAISE EXCEPTION 'El gate está listo con condiciones: describe al menos una condición' USING ERRCODE = '22023';
  END IF;

  v_target := CASE WHEN v_row.computed_level = 'yellow' OR jsonb_array_length(v_conditions) > 0
                   THEN 'approved_with_conditions' ELSE 'approved' END;
  v_notes  := NULLIF(left(btrim(COALESCE(p_notes, '')), 2000), '');

  INSERT INTO system_gate_approvals (org_id, project_id, system_id, gate_id, status, target_status,
                                     conditions, evidence, notes, approved_by, approved_role, completed_at)
  VALUES (v_org, v_project, p_system_id, p_gate_id,
          CASE WHEN cardinality(v_gate.required_signatures) > 0 THEN 'pending_signatures' ELSE v_target END,
          v_target, v_conditions,
          jsonb_build_object('computed_level', v_row.computed_level, 'criteria', v_row.criteria,
                             'evaluated_at', now()),
          v_notes, auth.uid(), v_role,
          -- S11 (D-17): momento en que el gate quedó con todas sus firmas (KPI de compromisos).
          CASE WHEN cardinality(v_gate.required_signatures) > 0 THEN NULL ELSE now() END)
  RETURNING id INTO v_id;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (v_id, v_org, v_project, 'commissioning', auth.uid(), v_role, v_notes);

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v          punches;
  v_cur      text;
  v_role     text;
  v_service  boolean := COALESCE(auth.role() = 'service_role', false);  -- sin claims auth.role() es NULL
  v_previous uuid;
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch not found'; END IF;

  -- S06 (C-04/A-03): sin sesión solo el service role explícito (API v1, que ya validó la org).
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_role := public.punch_caller_role(v);
    -- S14 (D14): líder+ o firmante designado de Operaciones del proyecto.
    IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR public.has_capacity(v.project_id, 'operations')) THEN
      RAISE EXCEPTION 'Sin permiso para el seguimiento de Operaciones' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_cur := COALESCE(v.post_handover_status, 'active');
  IF v_cur = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops') THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;
  -- Máquina de estados: cerrar solo desde verificado; verificar solo desde resuelto.
  IF NOT (
       (v_cur IN ('transferred_to_ops', 'in_progress_ops', 'deferred') AND p_new_status IN ('in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops') AND p_new_status <> v_cur)
    OR (v_cur = 'resolved_ops' AND p_new_status IN ('verified_ops', 'in_progress_ops'))
    OR (v_cur = 'verified_ops' AND p_new_status = 'closed_final')
  ) THEN
    RAISE EXCEPTION 'Transición no permitida en Operaciones: % → %', v_cur, p_new_status USING ERRCODE = 'P0001';
  END IF;
  -- Verificar y cerrar los hace una persona, distinta de quien resolvió (o verificó).
  IF p_new_status IN ('verified_ops', 'closed_final') THEN
    IF v_service THEN
      RAISE EXCEPTION 'La verificación y el cierre en Operaciones los hace una persona en la app' USING ERRCODE = '42501';
    END IF;
    SELECT e.performed_by INTO v_previous FROM punch_post_handover_events e
    WHERE e.punch_id = p_punch_id AND e.to_status = v_cur ORDER BY e.performed_at DESC LIMIT 1;
    IF v_previous = auth.uid() THEN
      RAISE EXCEPTION 'Lo % una persona distinta de quien lo %', CASE WHEN p_new_status = 'verified_ops' THEN 'verifica' ELSE 'cierra' END,
        CASE WHEN p_new_status = 'verified_ops' THEN 'resolvió' ELSE 'verificó' END USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN public.project_today(v.project_id) ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    -- S10 (G-13/D-05): «hoy» de cada proyecto según projects.timezone
    select id, public.tz_today(timezone) as today from projects where org_id = p_org_id
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
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
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
        -- S04 (C-17, D4/D6): solo un rol que el ITR exige, con las firmas requeridas anteriores ya puestas,
        -- y si no firmé ya otro rol del mismo ITR. Espejo de isMyTurnToSign (src/lib/my-work/queues.ts).
        and a.role::text = any (i.required_signatures)
        and not exists (
          select 1 from unnest(i.required_signatures) r
          where array_position(array['executor', 'supervisor', 'client'], r) < array_position(array['executor', 'supervisor', 'client'], a.role::text)
            and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role::text = r)
        )
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.user_id = auth.uid())
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
        -- S06 (C-44): quien lo levantó, o un supervisor; antes contaba todos los de la org para todos.
        and (p.raised_by = auth.uid() or (select role from me) in ('owner', 'admin', 'architect', 'leader'))
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
        and wp.plan_date <= (select today from proj where proj.id = wp.project_id)
    ),
    'signatures', (
      -- S06 (C-44): solo para quien firma certificados (canSignCertificates en src/lib/my-work/queues.ts).
      select case when (select role from me) in ('owner', 'admin', 'architect') then count(*) else 0 end
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
      join proj on proj.id = pp.project_id
      where public.preservation_is_overdue(pp.status, pp.next_due_date, proj.today)
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
    ),
    'handovers_to_receive', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from shift_handovers h
        where h.status = 'handed_over'
          and h.handed_by is distinct from auth.uid()
          and h.project_id in (select id from proj)
      ) else 0 end
    ),
    'holds_to_release', (
      select count(*)
      from procedure_run_steps rs
      join procedure_steps st on st.id = rs.step_id
      join procedure_runs r on r.id = rs.run_id
      where rs.status = 'at_hold'
        and r.status in ('at_hold', 'stopped')
        and rs.done_by is distinct from auth.uid()
        and public.has_capacity(r.project_id, st.hold_capacity)
        and rs.project_id in (select id from proj)
    ),
    'lineup_to_verify', (
      select count(*)
      from lineup_items li
      join lineup_sheets s on s.id = li.sheet_id
      where li.is_critical and li.set_at is not null and li.verified_at is null
        and li.found_position = li.required_position
        and li.set_by is distinct from auth.uid()
        and s.status in ('issued', 'in_progress')
        and li.project_id in (select id from proj)
    ),
    'milestones_to_witness', (
      select count(*)
      from startup_events ev
      where ev.status = 'pending_witness'
        and ev.recorded_by is distinct from auth.uid()
        and public.has_capacity(ev.project_id, ev.witness_capacity)
        and ev.project_id in (select id from proj)
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and public.has_capacity(tr.project_id, 'commissioning'))
          or (tr.operations_signed_by is null and public.has_capacity(tr.project_id, 'operations')))
    ),
    'performance_to_decide', (
      select count(*)
      from performance_runs pr
      where pr.status = 'closed'
        and (select role from me) in ('owner', 'admin', 'architect', 'leader')
        and pr.project_id in (select id from proj)
    ),
    'performance_to_sign', (
      select count(*)
      from performance_certificates pc
      where pc.status = 'pending_signatures'
        and pc.project_id in (select id from proj)
        and auth.uid() is distinct from pc.commissioning_signed_by
        and auth.uid() is distinct from pc.operations_signed_by
        and auth.uid() is distinct from pc.client_signed_by
        and ((pc.operations_signed_by is null and public.has_capacity(pc.project_id, 'operations'))
          or (pc.client_signed_by is null and public.has_capacity(pc.project_id, 'client_rep')))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.sign_itr_atomic(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
-- S04 (C-01/I-05, D4): firmas requeridas congeladas en el ITR, en orden ejecutor → supervisor → cliente.
roles:=public.itr_signing_roles(v.required_signatures);
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
-- S05 (C-26): el trazo es un PNG en base64 de hasta ~256 KB (igual que el certificado).
IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 350000) THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
-- S14 (I-25): con representantes del cliente designados, la firma Cliente es de uno de ellos (aunque la asignación sea anterior).
IF p_role='client' AND public.capacity_designated(v.project_id,'client_rep') AND NOT public.has_capacity(v.project_id,'client_rep') THEN RAISE EXCEPTION 'La firma Cliente del ITR es de un representante del cliente designado' USING ERRCODE='42501'; END IF;
-- S04 (A-08, D6): una persona no firma dos roles del mismo ITR.
IF EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND user_id=uid) THEN RAISE EXCEPTION 'Signer already signed this ITR in another role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
-- Fase 8: no se firma contra una revisión de documento superada.
eq_block:=public.document_references_blocker('itr',p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM unnest(roles) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=public.project_today(v.project_id) WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;

CREATE OR REPLACE FUNCTION public.save_procedure_revision(p_revision_id uuid, p_sections jsonb, p_steps jsonb, p_change_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.procedure_write_content(r, p_sections, p_steps);
  -- S14 (E-30): quien edita el borrador queda registrado y no podrá aprobarlo.
  UPDATE procedure_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now(),
         editors = CASE WHEN auth.uid() = ANY (editors) THEN editors ELSE editors || auth.uid() END
   WHERE id = p_revision_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_performance_revision(p_revision_id uuid, p_content jsonb, p_change_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_test_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.performance_write_content(r, p_content);
  -- S14 (E-30): quien edita el borrador queda registrado y no podrá aprobarlo.
  UPDATE performance_test_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now(),
         editors = CASE WHEN auth.uid() = ANY (editors) THEN editors ELSE editors || auth.uid() END
   WHERE id = p_revision_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_procedure_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid; v_doc text;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM procedure_steps WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'El procedimiento necesita al menos un paso en la secuencia' USING ERRCODE = 'P0001';
    END IF;
    -- Fase 8: no se envía ni aprueba contra una revisión de documento superada.
    v_doc := public.document_references_blocker('procedure_revision', r.id);
    IF v_doc IS NOT NULL THEN RAISE EXCEPTION '%', v_doc USING ERRCODE = 'P0001'; END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores aprueban procedimientos' USING ERRCODE = '42501'; END IF;
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó el procedimiento' USING ERRCODE = '42501'; END IF;
    -- S14 (E-30): tampoco quien editó el borrador.
    IF v_uid = ANY (r.editors) THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien editó el borrador' USING ERRCODE = '42501'; END IF;
    -- Fase 8: no se envía ni aprueba contra una revisión de documento superada.
    v_doc := public.document_references_blocker('procedure_revision', r.id);
    IF v_doc IS NOT NULL THEN RAISE EXCEPTION '%', v_doc USING ERRCODE = 'P0001'; END IF;
    SELECT id INTO v_prev FROM procedure_revisions WHERE procedure_id = r.procedure_id AND status = 'approved' AND id <> r.id;
    UPDATE procedure_revisions SET status = 'superseded', updated_at = now() WHERE id = v_prev;
    UPDATE procedure_revisions SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = r.id;
    UPDATE procedure_revisions SET content_hash = public.procedure_revision_hash(r.id) WHERE id = r.id;
    UPDATE procedures SET current_revision_id = r.id, updated_at = now() WHERE id = r.procedure_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_performance_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_test_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'La prueba necesita al menos un criterio de aceptación' USING ERRCODE = 'P0001';
    END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó la prueba' USING ERRCODE = '42501'; END IF;
    -- S14 (E-30): tampoco quien editó el borrador.
    IF v_uid = ANY (r.editors) THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien editó el borrador' USING ERRCODE = '42501'; END IF;
    SELECT id INTO v_prev FROM performance_test_revisions WHERE test_id = r.test_id AND status = 'approved' AND id <> r.id;
    UPDATE performance_test_revisions SET status = 'superseded', updated_at = now() WHERE id = v_prev;
    UPDATE performance_test_revisions SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = r.id;
    UPDATE performance_test_revisions SET content_hash = public.performance_revision_hash(r.id) WHERE id = r.id;
    UPDATE performance_tests SET current_revision_id = r.id, updated_at = now() WHERE id = r.test_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_gate_weights(p_org_id uuid, p_weights jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE e jsonb; v_w numeric;
BEGIN
  -- S14 (I-15): igual que la acción y el resto de /admin/gates: solo owner/admin.
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_weights IS NULL OR jsonb_typeof(p_weights) <> 'array' OR jsonb_array_length(p_weights) > 100 THEN
    RAISE EXCEPTION 'Lista de pesos no válida' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_weights) LOOP
    IF NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = NULLIF(e ->> 'gate_id', '')::uuid AND org_id = p_org_id) THEN
      RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
    END IF;
    v_w := NULLIF(e ->> 'weight', '')::numeric;
    IF v_w IS NOT NULL AND (v_w < 0 OR v_w > 1000) THEN RAISE EXCEPTION 'Peso fuera de rango (0–1000)' USING ERRCODE = '22023'; END IF;
    UPDATE readiness_gates SET weight = v_w WHERE id = (e ->> 'gate_id')::uuid;
  END LOOP;
END;
$function$;


-- ── 5. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.capacity_fallback_roles(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.capacity_designated(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_capacity(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_capacities(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.capacity_eligible(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_project_capacity(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_project_capacity(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_itr_client_assignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capacity_fallback_roles(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capacity_designated(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_capacity(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_capacities(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capacity_eligible(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_project_capacity(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_project_capacity(uuid, text) TO authenticated, service_role;
