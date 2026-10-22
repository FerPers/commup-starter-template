-- fn: public.org_transfer_non_dispensable(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.org_transfer_non_dispensable(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(o.settings -> 'transfer_policy' -> 'non_dispensable') = 'array' THEN
      ARRAY(SELECT k FROM jsonb_array_elements_text(o.settings -> 'transfer_policy' -> 'non_dispensable') k
            WHERE k = ANY (public.ownership_check_keys()) ORDER BY k)
    ELSE ARRAY['no_open_cat_a', 'startup_gate'] END
  FROM organizations o WHERE o.id = p_org_id
$function$;
