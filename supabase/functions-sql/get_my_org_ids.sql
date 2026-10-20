-- fn: public.get_my_org_ids()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- S15 (I-21): solo membresías activas y no vencidas.
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status = 'active' AND (access_expires_at IS NULL OR access_expires_at > now())
$function$;
