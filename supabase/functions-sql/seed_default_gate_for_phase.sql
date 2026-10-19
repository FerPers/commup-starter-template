-- fn: public.seed_default_gate_for_phase(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.seed_default_gate_for_phase(p_phase_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phase   project_phases%ROWTYPE;
  v_code    text;
  v_gate_id uuid;
  v_first   boolean;
BEGIN
  SELECT * INTO v_phase FROM project_phases WHERE id = p_phase_id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM readiness_gates WHERE phase_id = p_phase_id) THEN
    RETURN NULL;
  END IF;

  v_code  := upper(btrim(COALESCE(NULLIF(btrim(v_phase.certificate_name), ''), v_phase.code)));
  v_first := NOT EXISTS (SELECT 1 FROM readiness_gates WHERE org_id = v_phase.org_id);

  INSERT INTO readiness_gates (org_id, code, name, order_index, phase_id, requires_previous, requires_lineup)
  VALUES (v_phase.org_id, v_code, v_phase.name, v_phase.order_index * 10, v_phase.id, NOT v_first,
          v_code = 'RFSU' OR upper(btrim(v_phase.code)) = 'SU')
  ON CONFLICT (org_id, code) DO NOTHING
  RETURNING id INTO v_gate_id;

  IF v_gate_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO gate_criteria (gate_id, org_id, kind, params, order_index) VALUES
    (v_gate_id, v_phase.org_id, 'itr_phase_approved', '{}'::jsonb, 10),
    (v_gate_id, v_phase.org_id, 'critical_tags_ready', '{"levels":["safety","process"]}'::jsonb, 20);

  IF v_code = 'RFSU' THEN
    INSERT INTO gate_criteria (gate_id, org_id, kind, params, order_index)
    VALUES (v_gate_id, v_phase.org_id, 'pssr_approved', '{}'::jsonb, 30);
  END IF;

  RETURN v_gate_id;
END;
$function$;
