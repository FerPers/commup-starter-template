-- B-17 (rehecho): la BD exige que subsistema, sistema, tag e ITR referenciados sean del MISMO proyecto que la fila.
-- Las FK compuestas de 20261116120000 se revirtieron (una segunda FK entre las mismas tablas rompe los embeds de
-- PostgREST, PGRST201); aquí es un trigger de validación: no cambia relaciones ni los select de la app.
-- En prod no había filas cruzadas (verificado 2026-10-20). Cubre también la API v1 y las importaciones (service role).

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

REVOKE EXECUTE ON FUNCTION public.guard_same_project() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER subsystems_same_project BEFORE INSERT OR UPDATE OF system_id, project_id ON public.subsystems
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();
CREATE TRIGGER tags_same_project BEFORE INSERT OR UPDATE OF subsystem_id, project_id ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();
CREATE TRIGGER itrs_same_project BEFORE INSERT OR UPDATE OF subsystem_id, tag_id, project_id ON public.itrs
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();
CREATE TRIGGER punches_same_project BEFORE INSERT OR UPDATE OF subsystem_id, tag_id, itr_id, project_id ON public.punches
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();
CREATE TRIGGER certificates_same_project BEFORE INSERT OR UPDATE OF subsystem_id, system_id, project_id ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();
