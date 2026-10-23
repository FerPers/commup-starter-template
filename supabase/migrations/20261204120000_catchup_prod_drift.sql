-- Catch-up de deriva (2026-10-22): lo que prod tiene y las migraciones no producían, medido comparando
-- scripts/loadtest/schema-ddl.sql de prod contra baseline + migraciones aplicadas en una BD vacía.
-- Idempotente: en prod no cambia nada (todo ya existe así).

-- RLS en las particiones de signal_samples (en prod se encendió a mano en las 7 que existían). Solo las que no lo
-- tienen: en prod no toma ningún bloqueo.
DO $$
DECLARE p regclass;
BEGIN
  FOR p IN SELECT i.inhrelid::regclass FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
           WHERE i.inhparent = 'public.signal_samples'::regclass AND NOT c.relrowsecurity LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p);
  END LOOP;
END $$;

-- La campana (NotificationsBell) escucha INSERT en notifications por Realtime.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Limpieza diaria del historial de pg_cron (cron.schedule con el mismo nombre reemplaza el job).
SELECT cron.schedule('purge_cron_history', '15 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- Mismo texto que corre en prod: 20261026120000 traía estos dos cuerpos con otro formato (mismo código).
CREATE OR REPLACE FUNCTION public."reopen_itr_atomic"(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; uid uuid:=auth.uid(); org uuid; signatures jsonb; n integer;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid AND role::text IN ('owner','admin','architect')) THEN RAISE EXCEPTION 'Privileged role required'; END IF;
IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Reopening reason required'; END IF;
SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb),count(*) INTO signatures,n FROM public.itr_signatures s WHERE itr_id=p_itr_id;
IF n=0 AND v.status<>'approved' THEN RAISE EXCEPTION 'No signatures to revoke'; END IF;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'revoked',jsonb_build_object('reason',trim(p_reason),'previousStatus',v.status,'previousSignatures',signatures,'template_id',v.template_id,'responses',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.itr_responses r WHERE r.itr_id=p_itr_id),'[]'::jsonb),'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.itr_attachments a WHERE a.itr_id=p_itr_id),'[]'::jsonb)));
DELETE FROM public.itr_signatures WHERE itr_id=p_itr_id;
UPDATE public.itrs SET status=CASE WHEN v.status='approved' THEN 'completed'::public.itr_status ELSE v.status END WHERE id=p_itr_id;
RETURN jsonb_build_object('revoked_count',n,'previous_signatures',signatures,'project_id',v.project_id,'tag_id',v.tag_id,'itr_number',v.itr_number);
END $function$;
CREATE OR REPLACE FUNCTION public.evaluate_itr_continuity(p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
 d jsonb; row_data jsonb; shield jsonb; expected text[] := '{}'; seen text[] := '{}';
 n integer; j integer; row_id text; complete boolean := true; failed boolean := false;
 invalid CONSTANT jsonb := '{"is_complete":false,"has_fail":false}'::jsonb;
BEGIN
 BEGIN d := p_value::jsonb; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR untranslatable_character THEN RETURN invalid; END;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object'
 OR d->'version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(d->'grouping') IS DISTINCT FROM 'string'
 OR d->>'grouping' NOT IN ('pairs','conductors')
 OR jsonb_typeof(d->'count') IS DISTINCT FROM 'number'
 OR jsonb_typeof(d->'shields') IS DISTINCT FROM 'array'
 OR jsonb_typeof(d->'measurementRequired') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(d->'rows') IS DISTINCT FROM 'array' THEN RETURN invalid; END IF;
 IF (d->>'count')::numeric < 1 OR (d->>'count')::numeric > 500
 OR trunc((d->>'count')::numeric) <> (d->>'count')::numeric THEN RETURN invalid; END IF;
 n := (d->>'count')::numeric::integer;
 FOR j IN 1..n LOOP
   IF d->>'grouping'='pairs' THEN expected := expected || ARRAY['P'||j||'-A','P'||j||'-B'];
   ELSE expected := array_append(expected,'C'||j); END IF;
 END LOOP;
 FOR shield IN SELECT value FROM jsonb_array_elements(d->'shields') LOOP
   IF jsonb_typeof(shield) IS DISTINCT FROM 'string' OR NOT ((shield#>>'{}') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]') THEN RETURN invalid; END IF;
   row_id := 'S:'||(shield#>>'{}');
   IF row_id=ANY(expected) THEN RETURN invalid; END IF;
   expected := array_append(expected,row_id);
 END LOOP;
 FOR row_data IN SELECT value FROM jsonb_array_elements(d->'rows') LOOP
   IF jsonb_typeof(row_data) IS DISTINCT FROM 'object' OR jsonb_typeof(row_data->'id') IS DISTINCT FROM 'string' THEN RETURN invalid; END IF;
   row_id := row_data->>'id';
   IF NOT row_id=ANY(expected) OR row_id=ANY(seen) THEN RETURN invalid; END IF;
   seen := array_append(seen,row_id);
   IF jsonb_typeof(row_data->'from') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'from' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false)
   OR jsonb_typeof(row_data->'to') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'to' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false)
   OR jsonb_typeof(row_data->'result') IS DISTINCT FROM 'string'
   OR COALESCE(row_data->>'result','') NOT IN ('pass','fail','not_applicable') THEN complete := false; END IF;
   IF row_data->>'result'='fail' THEN failed := true; END IF;
   IF row_data->>'result'='not_applicable' THEN
     IF jsonb_typeof(row_data->'remarks') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'remarks' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false) THEN complete := false; END IF;
   ELSIF d->'measurementRequired'='true'::jsonb THEN
     IF jsonb_typeof(row_data->'reading') IS DISTINCT FROM 'number'
     OR jsonb_typeof(row_data->'unit') IS DISTINCT FROM 'string' OR NOT COALESCE(row_data->>'unit' ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',false) THEN complete := false;
     ELSE
       IF abs((row_data->>'reading')::numeric) < 1e-307 THEN NULL;
       ELSIF NOT pg_catalog.pg_input_is_valid(row_data->>'reading','double precision') THEN complete := false;
       ELSIF (row_data->>'reading')::double precision IN ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) THEN complete := false; END IF;
     END IF;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('is_complete',complete AND cardinality(seen)=cardinality(expected),'has_fail',failed);
END;
$function$;
