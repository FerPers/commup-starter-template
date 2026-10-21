-- fn: public.gate_conditions_create_actions(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_conditions_create_actions(p_approval_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a record; v_cond text; v_seq integer; v_id uuid; v_gate text; v_n integer := 0;
BEGIN
  SELECT * INTO a FROM system_gate_approvals WHERE id = p_approval_id;
  IF NOT FOUND OR a.status <> 'approved_with_conditions' OR a.revoked_at IS NOT NULL
     OR jsonb_array_length(COALESCE(a.conditions, '[]'::jsonb)) = 0
     OR EXISTS (SELECT 1 FROM actions WHERE source_kind = 'gate' AND source_id = a.id) THEN
    RETURN 0;
  END IF;
  SELECT code INTO v_gate FROM readiness_gates WHERE id = a.gate_id;
  FOR v_cond IN SELECT c #>> '{}' FROM jsonb_array_elements(a.conditions) c WHERE jsonb_typeof(c) = 'string' LOOP
    v_seq := public.mgmt_next_seq('actions', a.project_id);
    INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                         system_id, owner_id, priority, verification_method, created_by)
    VALUES (a.org_id, a.project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(v_cond, 200),
            CASE WHEN length(v_cond) > 200 THEN public.mgmt_text(v_cond) END, 'gate', a.id, v_gate,
            a.system_id, a.approved_by, 'high', 'review', a.approved_by)
    RETURNING id INTO v_id;
    PERFORM public.mgmt_log(a.org_id, a.project_id, 'action', v_id, 'created', NULL, 'open');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
