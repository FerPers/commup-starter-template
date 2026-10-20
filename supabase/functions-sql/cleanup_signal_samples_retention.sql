-- fn: public.cleanup_signal_samples_retention()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.cleanup_signal_samples_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  deleted_count integer;
  v_part record;
  v_cut date := date_trunc('month', NOW() - INTERVAL '90 days')::date;
BEGIN
  -- S12 (B-12): particiones mensuales. Se crean las próximas y se borran enteras las que quedaron fuera de
  -- la retención de 90 días; en la partición del borde se borran filas.
  PERFORM public.ensure_signal_sample_partitions(3);
  FOR v_part IN
    SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'public.signal_samples'::regclass AND c.relname ~ '^signal_samples_[0-9]{6}$'
      AND to_date(right(c.relname, 6), 'YYYYMM') < v_cut
  LOOP
    EXECUTE format('DROP TABLE public.%I', v_part.relname);
  END LOOP;
  DELETE FROM public.signal_samples
  WHERE sampled_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;
