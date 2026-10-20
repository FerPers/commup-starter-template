-- fn: public.is_org_editor(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.is_org_editor(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND status = 'active' AND (access_expires_at IS NULL OR access_expires_at > now())
      AND org_id = p_org_id
      AND role IN ('owner','admin','architect','leader')
  )
$function$;
