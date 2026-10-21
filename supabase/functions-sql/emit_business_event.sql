-- fn: public.emit_business_event()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.emit_business_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_agg  text;
  v_payload jsonb;
BEGIN
  IF TG_TABLE_NAME = 'system_gate_approvals' THEN
    v_agg := 'gate';
    -- Por ramas: OLD no existe en un INSERT.
    IF TG_OP = 'INSERT' THEN
      IF NEW.revoked_at IS NULL AND NEW.status IN ('approved', 'approved_with_conditions') THEN v_type := 'gate.approved'; END IF;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      v_type := 'gate.revoked';
    ELSIF NEW.revoked_at IS NULL AND NEW.status IN ('approved', 'approved_with_conditions')
          AND OLD.status NOT IN ('approved', 'approved_with_conditions') THEN
      v_type := 'gate.approved';
    END IF;
    IF v_type IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', NEW.id, 'project_id', NEW.project_id, 'system_id', NEW.system_id, 'system_code', s.code,
             'gate_id', NEW.gate_id, 'gate_code', g.code, 'status', NEW.status, 'approved_at', NEW.approved_at,
             'revoked_at', NEW.revoked_at))
      INTO v_payload
    FROM systems s, readiness_gates g WHERE s.id = NEW.system_id AND g.id = NEW.gate_id;
  ELSIF TG_TABLE_NAME = 'ownership_transfers' THEN
    v_agg := 'transfer';
    IF NEW.status = 'completed' THEN
      IF TG_OP = 'INSERT' THEN
        v_type := 'transfer.completed';
      ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
        v_type := 'transfer.completed';
      END IF;
    END IF;
    IF v_type IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_strip_nulls(jsonb_build_object(
             'id', NEW.id, 'project_id', NEW.project_id, 'number', NEW.number, 'system_id', NEW.system_id,
             'system_code', s.code, 'from_stage', NEW.from_stage, 'to_stage', NEW.to_stage,
             'is_reversal', NEW.is_reversal, 'completed_at', NEW.completed_at))
      INTO v_payload
    FROM systems s WHERE s.id = NEW.system_id;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
  VALUES (NEW.org_id, NEW.project_id, v_agg, NEW.id, v_type, COALESCE(v_payload, '{}'::jsonb), auth.uid());
  RETURN NULL;
END;
$function$;
