-- fn: public.gate_status_dirty_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_dirty_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM new_rows n;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_rows FROM old_rows o;
  ELSIF TG_NARGS = 0 THEN
    SELECT jsonb_agg(z.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS x FROM old_rows o UNION ALL SELECT to_jsonb(n) FROM new_rows n) z;
  ELSE
    SELECT jsonb_agg(v.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS o, to_jsonb(n) AS n FROM old_rows o JOIN new_rows n ON n.id = o.id) c
    CROSS JOIN LATERAL (VALUES (c.o), (c.n)) v(x)
    WHERE EXISTS (SELECT 1 FROM unnest(TG_ARGV) k WHERE c.o -> k IS DISTINCT FROM c.n -> k);
  END IF;
  IF v_rows IS NOT NULL THEN
    PERFORM public.gate_status_mark(public.gate_status_systems(TG_TABLE_NAME, v_rows));
  END IF;
  RETURN NULL;
END;
$function$;
