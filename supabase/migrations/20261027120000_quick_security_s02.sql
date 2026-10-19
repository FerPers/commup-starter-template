-- S02 — Seguridad rápida (revisión integral 2026-10-19). Hallazgos verificados en prod el 2026-10-19:
--   A-02   un admin podía hacerse owner, degradar o borrar owners por PostgREST (org_members_* = is_org_admin).
--          Trigger de guarda mientras S15 pasa la gestión de miembros a RPC.
--   I-11   webhook_subscriptions.secret legible por cualquier editor (incl. leader) y los headers de los
--          workflows (action_payload.headers) por cualquier miembro. La UI de ambos es solo owner/admin/architect.
--   D-32   approve_system_gate / sign_system_gate validaban el rol en la org, no la pertenencia al proyecto.
--   A-19   funciones ejecutables por anon/PUBLIC y dos DEFINER internas abiertas a authenticated.
--   S01-N1 el bucket org-assets que usa uploadOrgLogo no existía → subir el logo fallaba.
--   A-26   buckets con evidencias sin lista de tipos MIME; el logo aceptaba cualquier extensión.

-- ── 0. Helper: owner/admin/architect (= PRIVILEGED_ROLES de src/lib/auth/permissions.ts) ───────────────
CREATE OR REPLACE FUNCTION public.is_org_privileged(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner', 'admin', 'architect')
  )
$$;
REVOKE ALL ON FUNCTION public.is_org_privileged(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_privileged(uuid) TO authenticated, service_role;

-- ── 1. A-02: solo un owner toca filas owner o asigna owner; nunca 0 owners ─────────────────────────────
-- Sin auth.uid() (service role: setup, invitaciones) no aplica: esas rutas ya validan en la action.
-- En un borrado en cascada (se borra la org) tampoco: pg_trigger_depth() > 1.
CREATE OR REPLACE FUNCTION public.org_members_owner_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org        uuid := COALESCE(NEW.org_id, OLD.org_id);
  v_caller     text;
  v_touch      boolean;
  v_owner_left boolean;
BEGIN
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'No se puede mover una membresía a otra org o persona' USING ERRCODE = '42501';
  END IF;

  v_touch := (TG_OP <> 'INSERT' AND OLD.role = 'owner') OR (TG_OP <> 'DELETE' AND NEW.role = 'owner');
  IF v_touch THEN
    SELECT om.role::text INTO v_caller FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid();
    IF v_caller IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Solo un owner puede asignar, cambiar o quitar el rol owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- La org nunca queda sin owner (degradar o quitar al último).
  IF TG_OP <> 'INSERT' AND OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'owner') THEN
    SELECT EXISTS (SELECT 1 FROM org_members om
                   WHERE om.org_id = OLD.org_id AND om.role = 'owner' AND om.id <> OLD.id) INTO v_owner_left;
    IF NOT v_owner_left THEN
      RAISE EXCEPTION 'La organización no puede quedarse sin owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.org_members_owner_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_members_owner_guard() TO service_role;

DROP TRIGGER IF EXISTS org_members_owner_guard ON public.org_members;
CREATE TRIGGER org_members_owner_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_owner_guard();

-- ── 2. I-11: secreto de webhooks y headers de workflows solo para owner/admin/architect ──────────────
-- El secreto no se lee por PostgREST ni siquiera para ellos: se muestra una vez al crearlo (RPC
-- create_webhook_subscription) y lo usa solo el dispatcher (service role).
DROP POLICY IF EXISTS webhook_subs_select ON public.webhook_subscriptions;
CREATE POLICY webhook_subs_select ON public.webhook_subscriptions FOR SELECT
  USING (public.is_org_privileged(org_id));
REVOKE SELECT ON public.webhook_subscriptions FROM anon, authenticated;
GRANT SELECT (id, org_id, project_id, name, endpoint_url, event_types, enabled, created_at, created_by,
              last_success_at, last_error_at, failure_count)
  ON public.webhook_subscriptions TO authenticated;

DROP POLICY IF EXISTS workflow_rules_select ON public.workflow_rules;
DROP POLICY IF EXISTS workflow_rules_insert ON public.workflow_rules;
DROP POLICY IF EXISTS workflow_rules_update ON public.workflow_rules;
DROP POLICY IF EXISTS workflow_rules_delete ON public.workflow_rules;
CREATE POLICY workflow_rules_select ON public.workflow_rules FOR SELECT USING (public.is_org_privileged(org_id));
CREATE POLICY workflow_rules_insert ON public.workflow_rules FOR INSERT WITH CHECK (public.is_org_privileged(org_id));
CREATE POLICY workflow_rules_update ON public.workflow_rules FOR UPDATE
  USING (public.is_org_privileged(org_id)) WITH CHECK (public.is_org_privileged(org_id));
CREATE POLICY workflow_rules_delete ON public.workflow_rules FOR DELETE USING (public.is_org_privileged(org_id));

-- ── 3. D-32: aprobar y co-firmar un gate exige ser miembro del proyecto ───────────────────────────────
-- Parche por ancla (verificada: aparece exactamente una vez en cada función en prod). S03 llevará estas
-- funciones a su archivo canónico.
DO $patch$
DECLARE
  v_def text;
  v_anchor text;
BEGIN
  v_def := pg_get_functiondef('public.approve_system_gate(uuid, uuid, jsonb, text)'::regprocedure);
  v_anchor := 'FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid();';
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'approve_system_gate: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor,
    'FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid()' || E'\n'
    || '    AND public.is_project_member(v_project);');

  v_def := pg_get_functiondef('public.sign_system_gate(uuid, text, text)'::regprocedure);
  v_anchor := 'FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid();';
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'sign_system_gate: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor,
    'FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid()' || E'\n'
    || '    AND public.is_project_member(v_appr.project_id);');
END;
$patch$;

-- ── 4. A-19: nada de public ejecutable por anon/PUBLIC; DEFINER internas solo service role ────────────
-- Las 23 funciones que S01 encontró con EXECUTE para anon o PUBLIC. Todas siguen para authenticated y
-- service_role (las invoker corren con RLS del llamante; las de trigger no se pueden llamar directo).
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END;
$revoke$;

-- bump_push_subscription_failure: tras 5 llamadas desactiva CUALQUIER suscripción; solo la usan los
-- route handlers de push con el cliente service role.
REVOKE EXECUTE ON FUNCTION public.bump_push_subscription_failure(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bump_push_subscription_failure(uuid) TO service_role;
-- itr_test_equipment_blocker: devolvía los códigos de equipo de prueba de cualquier ITR; solo la llama
-- sign_itr_atomic (DEFINER).
REVOKE EXECUTE ON FUNCTION public.itr_test_equipment_blocker(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.itr_test_equipment_blocker(uuid) TO service_role;

-- ── 5. S01-N1 + A-26: bucket del logo y tipos MIME de las evidencias ─────────────────────────────────
-- org-assets es público (el logo se muestra en la app y en PDFs): solo imágenes rasterizadas, nunca SVG
-- ni HTML. Ruta <org_id>/logo.<ext>; escriben owner/admin de esa org (= ADMIN_ROLES de uploadOrgLogo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('org-assets', 'org-assets', true, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS org_assets_select ON storage.objects;
DROP POLICY IF EXISTS org_assets_insert ON storage.objects;
DROP POLICY IF EXISTS org_assets_update ON storage.objects;
DROP POLICY IF EXISTS org_assets_delete ON storage.objects;
CREATE POLICY org_assets_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-assets' AND (storage.foldername(name))[1] IN (
    SELECT om.org_id::text FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));
CREATE POLICY org_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-assets' AND (storage.foldername(name))[1] IN (
    SELECT om.org_id::text FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));
CREATE POLICY org_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-assets' AND (storage.foldername(name))[1] IN (
    SELECT om.org_id::text FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')))
  WITH CHECK (bucket_id = 'org-assets' AND (storage.foldername(name))[1] IN (
    SELECT om.org_id::text FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));
CREATE POLICY org_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-assets' AND (storage.foldername(name))[1] IN (
    SELECT om.org_id::text FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')));

-- Evidencias (privadas, URL firmada): documentos, imágenes, planos y vídeo; nada que el navegador
-- ejecute (text/html, image/svg+xml, JS, XML). El cliente sube con application/octet-stream si el
-- navegador no conoce el tipo (p. ej. .dwg).
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/pdf',
     'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
     'text/plain', 'text/csv',
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/zip', 'application/x-zip-compressed',
     'video/mp4', 'video/quicktime',
     'image/vnd.dwg', 'image/vnd.dxf', 'application/acad', 'application/dxf', 'application/x-dwg',
     'application/octet-stream'
   ]
 WHERE id IN ('gate-evidence', 'mgmt-evidence', 'project-documents');
