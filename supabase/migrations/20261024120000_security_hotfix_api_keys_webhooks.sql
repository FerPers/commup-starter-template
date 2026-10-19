-- Hotfix de seguridad (revisión integral 2026-10-19, hallazgos A-01, A-07 y A-10; verificados en prod):
--   A-01  api_keys tenía una política ALL para cualquier miembro: un inspector o client podía insertar su propia
--         key con scope '*' (la API v1 corre con service role sobre toda la org). Las keys se crean y revocan solo
--         por las RPC create_api_key / revoke_api_key (SECURITY DEFINER con is_org_editor), así que se elimina.
--   A-07  get_org_member_emails devolvía los emails de cualquier org; ahora exige ser miembro de esa org.
--         ingest_signal_samples era ejecutable por cualquier usuario autenticado sobre cualquier org; solo la usa
--         /api/v1/signals/samples con el cliente service role → se revoca EXECUTE a authenticated.
--   A-10  webhook_subscriptions (incluye el secreto HMAC) era legible por cualquier miembro; queda para editores.

DROP POLICY IF EXISTS "org members can manage api_keys" ON public.api_keys;

CREATE OR REPLACE FUNCTION public.get_org_member_emails(p_org_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT m.user_id, u.email::text
  FROM org_members m JOIN auth.users u ON u.id = m.user_id
  WHERE m.org_id = p_org_id
    AND EXISTS (SELECT 1 FROM org_members me WHERE me.org_id = p_org_id AND me.user_id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.ingest_signal_samples(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_signal_samples(uuid, text, text, text, uuid, jsonb) TO service_role;

DROP POLICY IF EXISTS webhook_subs_select ON public.webhook_subscriptions;
CREATE POLICY webhook_subs_select ON public.webhook_subscriptions FOR SELECT
  USING (public.is_org_editor(org_id));

-- A-03 / C-04: update_punch_ops_status('closed_final') cerraba cualquier punch (incluido un Cat A nunca transferido)
-- para cualquier miembro del proyecto. Solo aplica a punches ya transferidos a Operaciones (que solo pueden ser Cat B).
DO $patch$
DECLARE v_def text; v_anchor text := 'IF p_new_status NOT IN (';
BEGIN
  v_def := pg_get_functiondef('public.update_punch_ops_status(uuid, text, text, date)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'update_punch_ops_status: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor,
       E'IF v_cur_status IS NULL OR v_cur_status = ''active'' THEN\n'
    || E'    RAISE EXCEPTION ''El punch no está transferido a Operaciones'' USING ERRCODE = ''P0001'';\n'
    || E'  END IF;\n  ' || v_anchor);
END;
$patch$;
