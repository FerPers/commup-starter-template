-- A03 (ola 1, revisión 2026-10-23 hallazgo 3): crear un ITR y sus firmantes en UNA transacción idempotente.
--
-- Antes la acción insertaba el ITR y después, en otra petición, sus asignaciones: si un firmante no era miembro
-- (o el trigger rechazaba un rol), el ITR quedaba creado sin firmantes, y el reintento sacaba otra revisión (Rn).
-- Ahora todo pasa por create_itr:
--   - `p_id` lo genera quien llama y es la clave idempotente: repetir la solicitud devuelve el ITR original
--     (`created = false`), también si dos llegan a la vez (ON CONFLICT espera a la primera);
--   - cada firmante debe ser miembro ACTIVO y no vencido de la org del proyecto (el trigger solo mira que exista),
--     el ejecutor no puede ser rol client y cada firma que el ITR congela (required_signatures) debe tener persona;
--   - cualquier fallo revierte el ITR, las asignaciones y sus eventos (los triggers corren en la misma transacción).
-- SECURITY INVOKER: la RLS de itrs / itr_assignments (editores del proyecto) y los guards siguen mandando.

CREATE OR REPLACE FUNCTION public.create_itr(
  p_id uuid,
  p_project_id uuid,
  p_tag_id uuid,
  p_subsystem_id uuid,
  p_template_id uuid,
  p_itr_number text,
  p_assignments jsonb,
  p_scheduled_date date DEFAULT NULL,
  p_loop_id uuid DEFAULT NULL,
  p_ce_cause_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_row public.itrs;
  v_org uuid;
  v_role text;
  v_user uuid;
BEGIN
  IF p_id IS NULL OR nullif(trim(p_itr_number), '') IS NULL THEN RAISE EXCEPTION 'ITR id and number are required'; END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'object' THEN RAISE EXCEPTION 'Assignments must be an object of role → user'; END IF;

  -- Solicitud repetida: el ITR ya existe con ese id.
  SELECT * INTO v_row FROM public.itrs WHERE id = p_id;
  IF FOUND THEN
    IF v_row.project_id <> p_project_id OR v_row.tag_id <> p_tag_id OR v_row.template_id <> p_template_id THEN
      RAISE EXCEPTION 'ITR id already used for another record';
    END IF;
    RETURN jsonb_build_object('id', v_row.id, 'itr_number', v_row.itr_number, 'created', false);
  END IF;

  SELECT org_id INTO v_org FROM public.projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Project membership required'; END IF;

  FOR v_role, v_user IN SELECT key, value::uuid FROM jsonb_each_text(p_assignments) LOOP
    IF v_role NOT IN ('executor', 'supervisor', 'client') THEN RAISE EXCEPTION 'Signing role not required for this ITR'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = v_org AND m.user_id = v_user AND m.status = 'active'
        AND (m.access_expires_at IS NULL OR m.access_expires_at > now())
    ) THEN
      RAISE EXCEPTION 'Assigned user is not a project organization member (inactive or expired)';
    END IF;
    IF v_role = 'executor' AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = v_org AND m.user_id = v_user AND m.role = 'client') THEN
      RAISE EXCEPTION 'A client cannot be the ITR executor';
    END IF;
  END LOOP;

  -- assign_itr_number agrega « Rn» si la base ya existe; guard_itr_row congela required_signatures.
  INSERT INTO public.itrs (id, template_id, tag_id, subsystem_id, project_id, phase_id, itr_number, status, scheduled_date, progress_pct, loop_id, ce_cause_id)
  SELECT p_id, t.id, p_tag_id, p_subsystem_id, p_project_id, t.phase_id, trim(p_itr_number), 'not_started', p_scheduled_date, 0, p_loop_id, p_ce_cause_id
  FROM public.itr_templates t WHERE t.id = p_template_id
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Plantilla invisible, o la misma solicitud entró a la vez y ganó la otra.
    SELECT * INTO v_row FROM public.itrs WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITR template not found'; END IF;
    IF v_row.project_id <> p_project_id OR v_row.tag_id <> p_tag_id OR v_row.template_id <> p_template_id THEN
      RAISE EXCEPTION 'ITR id already used for another record';
    END IF;
    RETURN jsonb_build_object('id', v_row.id, 'itr_number', v_row.itr_number, 'created', false);
  END IF;

  FOREACH v_role IN ARRAY COALESCE(v_row.required_signatures, ARRAY[]::text[]) LOOP
    IF nullif(p_assignments ->> v_role, '') IS NULL THEN RAISE EXCEPTION 'Missing signer for required role %', v_role; END IF;
  END LOOP;

  -- guard_itr_content rechaza un rol que el ITR no exige y a una persona en dos roles.
  INSERT INTO public.itr_assignments (itr_id, user_id, role)
  SELECT v_row.id, value::uuid, key::public.signature_role FROM jsonb_each_text(p_assignments);

  RETURN jsonb_build_object('id', v_row.id, 'itr_number', v_row.itr_number, 'created', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_itr(uuid, uuid, uuid, uuid, uuid, text, jsonb, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_itr(uuid, uuid, uuid, uuid, uuid, text, jsonb, date, uuid, uuid) TO authenticated, service_role;
