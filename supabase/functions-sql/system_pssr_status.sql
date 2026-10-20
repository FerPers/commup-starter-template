-- fn: public.system_pssr_status(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_pssr_status(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- S11 (D-11): el PSSR que cuenta es el más reciente del sistema (uno rechazado o en curso no queda tapado por uno viejo aprobado).
  SELECT COALESCE((
    SELECT jsonb_build_object('review_id', pr.id, 'review_number', pr.review_number, 'review_status', pr.status)
    FROM pssr_reviews pr WHERE pr.system_id = p_system_id ORDER BY pr.created_at DESC LIMIT 1), '{}'::jsonb)
$function$;
