-- fn: public.generate_itrs(uuid,uuid[],uuid[],uuid[],uuid[],jsonb,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.generate_itrs(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[], p_assign jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; v_role text; r record; v_itr uuid; v_number text; v_required text[]; v_user uuid; v_key text;
  v_created int := 0; v_assigned jsonb := '{}'::jsonb; v_remaining int; v_entry jsonb; v_people uuid[];
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 500);
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT m.role::text INTO v_role FROM org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.status = 'active' AND (m.access_expires_at IS NULL OR m.access_expires_at > now());
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores generan ITR en masa' USING ERRCODE = '42501';
  END IF;

  -- Asignación por disciplina: personas activas de la org, distintas por rol (D6), el ejecutor no es cliente.
  FOR v_key, v_entry IN SELECT * FROM jsonb_each(COALESCE(p_assign, '{}'::jsonb)) LOOP
    v_people := ARRAY(SELECT (v_entry ->> k)::uuid FROM unnest(ARRAY['executor', 'supervisor', 'client']) k WHERE v_entry ->> k IS NOT NULL);
    IF cardinality(v_people) <> (SELECT count(DISTINCT x) FROM unnest(v_people) x) THEN
      RAISE EXCEPTION 'Cada rol de firma lo asume una persona distinta' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_people) x WHERE NOT EXISTS (
      SELECT 1 FROM org_members m WHERE m.org_id = v_org AND m.user_id = x AND m.status = 'active'
        AND (m.access_expires_at IS NULL OR m.access_expires_at > now()))) THEN
      RAISE EXCEPTION 'Alguna persona elegida no es miembro activo de la organización' USING ERRCODE = '22023';
    END IF;
    IF v_entry ->> 'executor' IS NOT NULL AND EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = v_org
         AND m.user_id = (v_entry ->> 'executor')::uuid AND m.role = 'client') THEN
      RAISE EXCEPTION 'El cliente no puede ser el ejecutor del ITR' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Dos generaciones a la vez en el mismo proyecto no compiten por los mismos tags.
  PERFORM pg_advisory_xact_lock(hashtext('itr-generation:' || p_project_id::text));

  FOR r IN
    SELECT * FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids)
    WHERE outcome = 'create' ORDER BY subsystem_id, tag_number, template_code LIMIT v_limit
  LOOP
    INSERT INTO itrs (template_id, tag_id, subsystem_id, project_id, phase_id, itr_number, status, progress_pct)
    VALUES (r.template_id, r.tag_id, r.subsystem_id, p_project_id, r.phase_id, r.template_code || '/' || r.tag_number, 'not_started', 0)
    RETURNING id, itr_number, required_signatures INTO v_itr, v_number, v_required;
    v_created := v_created + 1;
    v_entry := p_assign -> COALESCE(r.discipline_id::text, 'none');
    IF v_entry IS NOT NULL THEN
      FOREACH v_key IN ARRAY COALESCE(v_required, '{}') LOOP
        v_user := (v_entry ->> v_key)::uuid;
        IF v_user IS NOT NULL THEN
          INSERT INTO itr_assignments (itr_id, user_id, role) VALUES (v_itr, v_user, v_key::signature_role);
          v_assigned := jsonb_set(v_assigned, ARRAY[v_user::text], to_jsonb(COALESCE((v_assigned ->> v_user::text)::int, 0) + 1));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_remaining
  FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids) WHERE outcome = 'create';

  IF v_created > 0 THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_org, auth.uid(), 'project', p_project_id, 'itrs_generated',
            jsonb_build_object('created', v_created, 'phases', p_phase_ids, 'systems', p_system_ids, 'subsystems', p_subsystem_ids,
                               'tags', CASE WHEN p_tag_ids IS NULL THEN NULL ELSE cardinality(p_tag_ids) END, 'assigned', v_assigned));
  END IF;
  RETURN jsonb_build_object('created', v_created, 'remaining', v_remaining, 'assigned', v_assigned);
END;
$function$;
