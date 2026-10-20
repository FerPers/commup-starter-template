-- fn: public.signal_series(uuid[],timestamp with time zone,timestamp with time zone,integer,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.signal_series(p_signal_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_bucket_s integer DEFAULT 60, p_max_points integer DEFAULT 2000)
 RETURNS TABLE(signal_id uuid, bucket timestamp with time zone, avg_val double precision, min_val double precision, max_val double precision, sample_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_bucket integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RAISE EXCEPTION 'Rango no válido' USING ERRCODE = '22023'; END IF;
  IF p_to - p_from > interval '35 days' THEN RAISE EXCEPTION 'El rango máximo es de 35 días' USING ERRCODE = '22023'; END IF;
  IF cardinality(p_signal_ids) > 50 THEN RAISE EXCEPTION 'Máximo 50 señales por consulta' USING ERRCODE = '22023'; END IF;
  -- Membresía comprobada una vez (no por fila): todas las señales deben ser de proyectos del usuario.
  IF auth.uid() IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_signal_ids) sid
       WHERE NOT EXISTS (SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id WHERE s.id = sid AND public.is_project_member(t.project_id))) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  -- Bucket mínimo para no pasar de p_max_points por señal; mín/máx por bucket conserva los picos.
  v_bucket := GREATEST(COALESCE(p_bucket_s, 60), 1,
                       ceil(extract(epoch FROM p_to - p_from) / GREATEST(LEAST(COALESCE(p_max_points, 2000), 10000), 1))::integer);
  RETURN QUERY
    SELECT ss.signal_id, date_bin(make_interval(secs => v_bucket), ss.sampled_at, p_from) AS b,
           avg(ss.value), min(ss.value), max(ss.value), count(*)
    FROM signal_samples ss
    WHERE ss.signal_id = ANY (p_signal_ids) AND ss.sampled_at >= p_from AND ss.sampled_at < p_to AND ss.quality = 0
    GROUP BY 1, 2 ORDER BY 1, 2;
END;
$function$;
