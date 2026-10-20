-- fn: public.set_gate_weights(uuid,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
