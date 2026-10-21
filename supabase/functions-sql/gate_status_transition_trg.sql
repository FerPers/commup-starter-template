-- fn: public.gate_status_transition_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_transition_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record; v_code text; v_users uuid[]; v_type text;
BEGIN
  -- El primer cálculo (OLD.gates nulo) no es una transición.
  IF OLD.gates IS NULL OR NEW.gates IS NULL OR OLD.gates = NEW.gates THEN RETURN NULL; END IF;
  SELECT s.code INTO v_code FROM systems s WHERE s.id = NEW.system_id;
  FOR r IN
    SELECT n ->> 'gate_id' AS gate_id, n ->> 'code' AS gate_code, n ->> 'status' AS status, o ->> 'status' AS prev,
           n -> 'approval' ->> 'approved_by' AS approved_by
    FROM jsonb_array_elements(NEW.gates) n
    LEFT JOIN jsonb_array_elements(OLD.gates) o ON o ->> 'gate_id' = n ->> 'gate_id'
    WHERE (n ->> 'status') IS DISTINCT FROM (o ->> 'status')
  LOOP
    v_type := NULL;
    IF r.status IN ('ready', 'ready_with_conditions') AND COALESCE(r.prev, '') NOT IN ('ready', 'ready_with_conditions') THEN
      v_type := 'gate.ready';
      SELECT array_agg(u) INTO v_users FROM public.gate_approvers(NEW.project_id, r.gate_id::uuid) u;
      PERFORM public.notify_users(NEW.org_id, v_users, 'gate_ready', 'Gate listo para aprobar: ' || v_code || ' · ' || r.gate_code,
        CASE WHEN r.status = 'ready' THEN 'Cumple todos sus criterios' ELSE 'Cumple sus criterios con condiciones' END,
        '/control-tower/' || NEW.system_id,
        jsonb_build_object('systemId', NEW.system_id, 'gateId', r.gate_id, 'projectId', NEW.project_id),
        NEW.system_id || ':' || r.gate_id || ':ready');
    ELSIF r.status IN ('regressed', 'approved_needs_review') AND COALESCE(r.prev, '') NOT IN ('regressed', 'approved_needs_review') THEN
      v_type := 'gate.regressed';
      SELECT array_agg(u) INTO v_users FROM public.gate_approvers(NEW.project_id, r.gate_id::uuid) u;
      v_users := v_users || (r.approved_by)::uuid;
      PERFORM public.notify_users(NEW.org_id, v_users, 'gate_regressed',
        CASE WHEN r.status = 'regressed' THEN 'Gate en regresión: ' ELSE 'Gate aprobado por revisar: ' END || v_code || ' · ' || r.gate_code,
        CASE WHEN r.status = 'regressed' THEN 'Un gate aprobado dejó de cumplir un criterio bloqueante'
             ELSE 'Un gate aprobado tiene una condición nueva' END,
        '/control-tower/' || NEW.system_id,
        jsonb_build_object('systemId', NEW.system_id, 'gateId', r.gate_id, 'projectId', NEW.project_id, 'status', r.status),
        NEW.system_id || ':' || r.gate_id || ':regressed');
    END IF;
    IF v_type IS NOT NULL THEN
      INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
      VALUES (NEW.org_id, NEW.project_id, 'gate', NEW.system_id, v_type, jsonb_strip_nulls(jsonb_build_object(
        'system_id', NEW.system_id, 'system_code', v_code, 'gate_id', r.gate_id, 'gate_code', r.gate_code,
        'status', r.status, 'previous_status', r.prev)), auth.uid());
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;
