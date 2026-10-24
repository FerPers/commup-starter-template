-- fn: public.platform_health()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.platform_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A15: la página de salud (/admin/health) es solo para operadores de la plataforma.
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM platform_operators o WHERE o.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('checked_at', now(), 'checks', platform_health_checks(),
    'state', COALESCE((SELECT jsonb_object_agg(s.key, jsonb_build_object('status', s.status, 'since', s.since)) FROM platform_health_state s), '{}'::jsonb));
END;
$function$;
