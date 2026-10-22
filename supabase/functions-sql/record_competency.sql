-- fn: public.record_competency(uuid,uuid,integer,text,text,date,date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_competency(p_person_id uuid, p_system_id uuid, p_level integer, p_evidence_kind text DEFAULT 'ojt'::text, p_evidence text DEFAULT NULL::text, p_assessed_at date DEFAULT NULL::date, p_expires_at date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE pe ops_personnel%ROWTYPE; v_role text; v_trainer boolean; v_id uuid;
BEGIN
  SELECT * INTO pe FROM ops_personnel WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(pe.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = pe.project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF pe.user_id = auth.uid() THEN RAISE EXCEPTION 'Nadie evalúa su propia competencia' USING ERRCODE = '42501'; END IF;
  -- S25 (E-12): una ficha sin usuario con el mismo nombre que quien evalúa también es la suya.
  IF pe.user_id IS NULL AND public.person_name_key(pe.full_name) = public.person_name_key(public.profile_full_name(auth.uid())) THEN
    RAISE EXCEPTION 'Nadie evalúa su propia competencia (la ficha tiene tu nombre: vincúlala a otro usuario o pide que evalúe otra persona)' USING ERRCODE = '42501';
  END IF;
  v_trainer := EXISTS (SELECT 1 FROM ops_personnel t WHERE t.project_id = pe.project_id AND t.user_id = auth.uid() AND t.active
                        AND public.person_system_level(t.id, p_system_id) = 4);
  IF NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_trainer) THEN
    RAISE EXCEPTION 'Evalúa un líder o una persona de nivel 4 en el sistema' USING ERRCODE = '42501';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 0 AND 4 THEN RAISE EXCEPTION 'Nivel no válido (0–4)' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_assessed_at, public.project_today(pe.project_id)) > public.project_today(pe.project_id) THEN RAISE EXCEPTION 'La fecha de evaluación no puede ser futura' USING ERRCODE = '22023'; END IF;
  INSERT INTO competency_records (org_id, project_id, person_id, system_id, level, evidence_kind, evidence, assessed_by, assessed_at, expires_at)
  VALUES (pe.org_id, pe.project_id, pe.id, p_system_id, p_level, COALESCE(p_evidence_kind, 'ojt'), public.mgmt_text(p_evidence, 2000),
          auth.uid(), COALESCE(p_assessed_at, public.project_today(pe.project_id)), p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
