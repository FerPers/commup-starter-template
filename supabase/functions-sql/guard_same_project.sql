-- fn: public.guard_same_project()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_same_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_project uuid := (v_row ->> 'project_id')::uuid;
  v_ref record;
  v_other uuid;
BEGIN
  -- (columna, tabla referenciada) que aplica a esta tabla; to_jsonb porque no todas tienen las mismas columnas.
  FOR v_ref IN SELECT * FROM (VALUES
    ('system_id', 'systems'), ('subsystem_id', 'subsystems'), ('tag_id', 'tags'), ('itr_id', 'itrs')
  ) r(col, tbl) WHERE v_row ? r.col AND v_row ->> r.col IS NOT NULL LOOP
    EXECUTE format('SELECT project_id FROM public.%I WHERE id = $1', v_ref.tbl)
      INTO v_other USING (v_row ->> v_ref.col)::uuid;
    -- Si no existe, la FK simple da su propio error.
    IF v_other IS NOT NULL AND v_other IS DISTINCT FROM v_project THEN
      RAISE EXCEPTION '%.%: % es de otro proyecto', TG_TABLE_NAME, v_ref.col, v_row ->> v_ref.col
        USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
