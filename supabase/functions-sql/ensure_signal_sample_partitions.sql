-- fn: public.ensure_signal_sample_partitions(integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.ensure_signal_sample_partitions(p_months_ahead integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m date; v_name text; v_created integer := 0;
BEGIN
  FOR m IN SELECT generate_series(date_trunc('month', now() - interval '90 days'), date_trunc('month', now()) + make_interval(months => p_months_ahead), interval '1 month')::date LOOP
    v_name := 'signal_samples_' || to_char(m, 'YYYYMM');
    IF to_regclass('public.' || v_name) IS NULL THEN
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.signal_samples FOR VALUES FROM (%L) TO (%L)',
                     v_name, m::timestamptz, (m + interval '1 month')::timestamptz);
      v_created := v_created + 1;
    END IF;
  END LOOP;
  RETURN v_created;
END;
$function$;
