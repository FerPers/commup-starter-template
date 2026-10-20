-- fn: public.next_punch_number_atomic(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.next_punch_number_atomic(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing INTEGER;
  v_next     INTEGER;
BEGIN
  -- S06 (B-10): el contador manda; el MAX por regex solo se calcula la primera vez de cada proyecto.
  UPDATE punch_counters SET last_seq = last_seq + 1 WHERE project_id = p_project_id RETURNING last_seq INTO v_next;
  IF NOT FOUND THEN
    SELECT COALESCE(MAX(CASE WHEN punch_number ~ '^P-\d+$' THEN SUBSTRING(punch_number FROM 3)::int ELSE 0 END), 0)
      INTO v_existing FROM punches WHERE project_id = p_project_id;
    INSERT INTO punch_counters (project_id, last_seq) VALUES (p_project_id, v_existing + 1)
    ON CONFLICT (project_id) DO UPDATE SET last_seq = GREATEST(punch_counters.last_seq, v_existing) + 1
    RETURNING last_seq INTO v_next;
  END IF;
  -- Un número cargado a mano (API, Excel) no debe chocar: se salta (índice único por proyecto, barato).
  WHILE EXISTS (SELECT 1 FROM punches WHERE project_id = p_project_id AND punch_number = 'P-' || LPAD(v_next::text, 4, '0')) LOOP
    UPDATE punch_counters SET last_seq = last_seq + 1 WHERE project_id = p_project_id RETURNING last_seq INTO v_next;
  END LOOP;

  RETURN 'P-' || LPAD(v_next::text, 4, '0');
END;
$function$;
