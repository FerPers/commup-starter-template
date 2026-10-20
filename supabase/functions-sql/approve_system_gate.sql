-- fn: public.approve_system_gate(uuid, uuid, jsonb, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
