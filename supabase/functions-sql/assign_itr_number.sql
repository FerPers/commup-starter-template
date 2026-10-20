-- fn: public.assign_itr_number()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.assign_itr_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_base text := btrim(NEW.itr_number); v_last int; v_existing int; v_next int;
BEGIN
  -- S05 (C-15): numeración atómica. El cliente manda la base («E01A/PT-101»); si ya existe en el proyecto, se le
  -- agrega « Rn» con un contador por (proyecto, base) bajo candado: sin choques por revisión de plantilla, por
  -- carrera entre dos asignaciones, ni números repetidos después de borrar un R2.
  IF v_base IS NULL OR v_base = '' THEN RAISE EXCEPTION 'ITR number required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text || '|' || v_base, 0));
  SELECT last_seq INTO v_last FROM itr_number_counters WHERE project_id = NEW.project_id AND base = v_base;
  -- Sin regex armada con el texto: prefijo exacto «base R» y el resto solo dígitos.
  SELECT COALESCE(MAX(CASE WHEN itr_number = v_base THEN 1 ELSE substr(itr_number, length(v_base) + 3)::int END), 0)
    INTO v_existing FROM itrs
   WHERE project_id = NEW.project_id
     AND (itr_number = v_base OR (left(itr_number, length(v_base) + 2) = v_base || ' R' AND substr(itr_number, length(v_base) + 3) ~ '^[0-9]{1,6}$'));
  IF COALESCE(v_last, 0) = 0 AND v_existing = 0 THEN
    NEW.itr_number := v_base; v_next := 1;
  ELSE
    v_next := GREATEST(COALESCE(v_last, 0), v_existing) + 1;
    NEW.itr_number := v_base || ' R' || v_next;
  END IF;
  INSERT INTO itr_number_counters (project_id, base, last_seq) VALUES (NEW.project_id, v_base, v_next)
  ON CONFLICT (project_id, base) DO UPDATE SET last_seq = EXCLUDED.last_seq;
  RETURN NEW;
END;
$function$;
