-- fn: public.ownership_checklist(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.ownership_checklist(p_system_id uuid, p_to_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_proj uuid; v_items jsonb := '[]'::jsonb; v_pre jsonb; v_st jsonb; v_n integer; v_list jsonb;
BEGIN
  SELECT project_id INTO v_proj FROM systems WHERE id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_proj) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_to_stage = 'shadowing' THEN
    SELECT jsonb_agg(jsonb_build_object('number', p.number, 'rev', r.rev, 'field_verified', r.field_verified_at IS NOT NULL)) INTO v_list
    FROM procedures p JOIN procedure_revisions r ON r.id = p.current_revision_id AND r.status = 'approved'
    WHERE p.system_id = p_system_id AND p.kind = 'startup';
    v_items := v_items || jsonb_build_object('key', 'startup_procedure',
      'ok', EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_list, '[]'::jsonb)) x WHERE (x ->> 'field_verified')::boolean),
      'detail', jsonb_build_object('procedures', COALESCE(v_list, '[]'::jsonb)));
    v_st := public.system_staffing(p_system_id, 1);
    v_items := v_items || jsonb_build_object('key', 'staff_level_1', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);

  ELSIF p_to_stage = 'joint_operation' THEN
    v_pre := public.startup_prerequisites(p_system_id);
    v_items := v_items || jsonb_build_object('key', 'startup_gate', 'ok', (v_pre ->> 'gate_ok')::boolean,
      'detail', jsonb_build_object('gate', v_pre ->> 'gate_code', 'status', v_pre ->> 'gate_status'));
    SELECT jsonb_build_object('number', number, 'stale', public.lineup_is_stale(id)) INTO v_list
    FROM lineup_sheets WHERE system_id = p_system_id AND status = 'verified' AND purpose = 'startup' ORDER BY public.lineup_is_stale(id), verified_at DESC LIMIT 1;
    v_items := v_items || jsonb_build_object('key', 'lineup_verified',
      'ok', v_list IS NOT NULL AND NOT (v_list ->> 'stale')::boolean, 'detail', COALESCE(v_list, '{}'::jsonb));
    SELECT jsonb_build_object('number', number, 'witnessed_at', witness_at) INTO v_list
    FROM startup_events WHERE system_id = p_system_id AND milestone = 'first_startup' AND status = 'witnessed' LIMIT 1;
    v_items := v_items || jsonb_build_object('key', 'first_startup_witnessed', 'ok', v_list IS NOT NULL, 'detail', COALESCE(v_list, '{}'::jsonb));
    v_st := public.system_staffing(p_system_id, 2);
    v_items := v_items || jsonb_build_object('key', 'staff_level_2', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);

  ELSIF p_to_stage = 'operations' THEN
    v_st := public.system_staffing(p_system_id, 3);
    v_items := v_items || jsonb_build_object('key', 'staff_level_3', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);
    SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object('item', item, 'status', status, 'available', qty_available, 'required', qty_required, 'eta', eta)), '[]'::jsonb)
      INTO v_n, v_list
    FROM critical_spares WHERE system_id = p_system_id AND is_critical AND NOT (status = 'available' AND qty_available >= qty_required);
    v_items := v_items || jsonb_build_object('key', 'critical_spares', 'ok', v_n = 0, 'detail', jsonb_build_object('missing', v_list));
    SELECT COUNT(*) INTO v_n FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
     WHERE ss.system_id = p_system_id AND p.category = 'A' AND p.status IN ('open', 'in_progress');
    v_items := v_items || jsonb_build_object('key', 'no_open_cat_a', 'ok', v_n = 0, 'detail', jsonb_build_object('open', v_n));
  END IF;
  RETURN v_items;
END;
$function$;
