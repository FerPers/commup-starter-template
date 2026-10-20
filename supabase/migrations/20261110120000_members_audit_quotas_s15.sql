-- S15 (revisión integral 2026-10-19): miembros, auditoría y cuotas.
--   A-02 / I-12  miembros solo por RPC (add/set_role/remove/set_access/respond_invitation); sin escritura directa.
--   I-21 / A-21  estado de membresía (invited · active · suspended) y acceso con vencimiento; invitar a una cuenta
--                existente deja una invitación que la persona acepta; búsqueda de email sin listar usuarios.
--   A-11 / I-16  activity_log con user_id = quien escribe; notificaciones solo por service role / funciones.
--   A-13 / I-19 / C-43  ai_usage (tokens y coste por org, usuario y función) y tope diario por org.
--   D-16 / I-27  decisiones (DEC) solo líder+; quién las registra queda aparte de a nombre de quién.
--   A-22 / E-37  push y conflictos offline en la org correcta (no la primera membresía).
-- Decisiones de Luis (2026-10-20): invitación pendiente para cuentas existentes; suspensión y vencimiento de
-- acceso; cuota de IA por org con modelo por tarea.

-- ── 1. Estado de membresía ───────────────────────────────────────────────
ALTER TABLE public.org_members
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN access_expires_at timestamptz,
  ADD COLUMN invited_by uuid,
  ADD COLUMN invited_at timestamptz,
  ADD COLUMN suspended_by uuid,
  ADD COLUMN suspended_at timestamptz,
  ADD COLUMN suspend_reason text,
  ADD CONSTRAINT org_members_status_check CHECK (status IN ('invited', 'active', 'suspended'));
CREATE INDEX org_members_user_active_idx ON public.org_members (user_id, org_id) WHERE status = 'active';

-- Cada usuario ve sus propias membresías (también invitadas o suspendidas) para aceptar o ver por qué no entra.
DROP POLICY org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members FOR SELECT
  USING (user_id = auth.uid() OR org_id IN (SELECT public.get_my_org_ids()));
-- A-02 / I-12: la escritura pasa solo por las RPC de abajo (y service role).
DROP POLICY org_members_insert ON public.org_members;
DROP POLICY org_members_update ON public.org_members;
DROP POLICY org_members_delete ON public.org_members;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.org_members FROM anon, authenticated;

-- Rol del llamador en la org, solo si su membresía está activa.
CREATE OR REPLACE FUNCTION public.member_caller_role(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT om.role::text FROM org_members om
  WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
    AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now());
$fn$;

-- ¿Quedaría la org sin un owner activo si este miembro deja de serlo?
CREATE OR REPLACE FUNCTION public.org_last_active_owner(p_member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT m.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM org_members o
    WHERE o.org_id = m.org_id AND o.id <> m.id AND o.role = 'owner'
      AND o.status = 'active' AND (o.access_expires_at IS NULL OR o.access_expires_at > now()))
  FROM org_members m WHERE m.id = p_member_id;
$fn$;

-- Alta: p_status 'invited' (cuenta existente: acepta ella) o 'active' (cuenta nueva creada por la invitación).
CREATE OR REPLACE FUNCTION public.add_org_member(p_org_id uuid, p_user_id uuid, p_role text, p_status text DEFAULT 'invited', p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_caller text := public.member_caller_role(p_org_id); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(v_caller, '') NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Solo owner o admin gestionan miembros' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('owner', 'admin', 'architect', 'leader', 'inspector', 'client') THEN RAISE EXCEPTION 'Rol inválido' USING ERRCODE = '22023'; END IF;
  IF p_role = 'owner' AND v_caller <> 'owner' THEN RAISE EXCEPTION 'Solo un owner puede invitar a otro owner' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('invited', 'active') THEN RAISE EXCEPTION 'Estado inválido' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'La fecha de vencimiento debe ser futura' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Esta persona ya es miembro o tiene una invitación pendiente' USING ERRCODE = '23505';
  END IF;
  INSERT INTO org_members (org_id, user_id, role, status, access_expires_at, invited_by, invited_at)
  VALUES (p_org_id, p_user_id, p_role::org_member_role, p_status, p_expires_at, auth.uid(), now())
  RETURNING id INTO v_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (p_org_id, auth.uid(), 'user', p_user_id, 'invited', jsonb_build_object('role', p_role, 'status', p_status, 'expires_at', p_expires_at));
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_member_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE m org_members%ROWTYPE; v_caller text;
BEGIN
  SELECT * INTO m FROM org_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_caller := public.member_caller_role(m.org_id);
  IF auth.uid() IS NULL OR COALESCE(v_caller, '') NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Solo owner o admin gestionan miembros' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('owner', 'admin', 'architect', 'leader', 'inspector', 'client') THEN RAISE EXCEPTION 'Rol inválido' USING ERRCODE = '22023'; END IF;
  IF (m.role = 'owner' OR p_role = 'owner') AND v_caller <> 'owner' THEN
    RAISE EXCEPTION 'Solo un owner asigna, cambia o quita el rol owner' USING ERRCODE = '42501';
  END IF;
  IF m.user_id = auth.uid() AND m.role = 'owner' AND p_role <> 'owner' THEN RAISE EXCEPTION 'No puedes cambiar tu propio rol de owner' USING ERRCODE = '42501'; END IF;
  IF p_role <> 'owner' AND public.org_last_active_owner(m.id) THEN RAISE EXCEPTION 'La organización no puede quedarse sin owner activo' USING ERRCODE = '42501'; END IF;
  UPDATE org_members SET role = p_role::org_member_role WHERE id = m.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (m.org_id, auth.uid(), 'user', m.user_id, 'role_changed', jsonb_build_object('from', m.role, 'to', p_role));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.remove_org_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE m org_members%ROWTYPE; v_caller text;
BEGIN
  SELECT * INTO m FROM org_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_caller := public.member_caller_role(m.org_id);
  IF auth.uid() IS NULL OR COALESCE(v_caller, '') NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Solo owner o admin gestionan miembros' USING ERRCODE = '42501'; END IF;
  IF m.role = 'owner' AND v_caller <> 'owner' THEN RAISE EXCEPTION 'Solo un owner quita a otro owner' USING ERRCODE = '42501'; END IF;
  IF m.user_id = auth.uid() THEN RAISE EXCEPTION 'No puedes quitarte a ti mismo' USING ERRCODE = '42501'; END IF;
  IF public.org_last_active_owner(m.id) THEN RAISE EXCEPTION 'La organización no puede quedarse sin owner activo' USING ERRCODE = '42501'; END IF;
  DELETE FROM org_members WHERE id = m.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (m.org_id, auth.uid(), 'user', m.user_id, 'removed', jsonb_build_object('role', m.role, 'status', m.status));
END;
$fn$;

-- Suspender / reactivar y fijar vencimiento del acceso (el historial de firmas se conserva).
CREATE OR REPLACE FUNCTION public.set_member_access(p_member_id uuid, p_status text, p_expires_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE m org_members%ROWTYPE; v_caller text; v_reason text := public.mgmt_text(p_reason, 500);
BEGIN
  SELECT * INTO m FROM org_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_caller := public.member_caller_role(m.org_id);
  IF auth.uid() IS NULL OR COALESCE(v_caller, '') NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Solo owner o admin gestionan miembros' USING ERRCODE = '42501'; END IF;
  IF m.status = 'invited' THEN RAISE EXCEPTION 'La invitación aún no fue aceptada' USING ERRCODE = 'P0001'; END IF;
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'Estado inválido' USING ERRCODE = '22023'; END IF;
  IF m.role = 'owner' AND v_caller <> 'owner' THEN RAISE EXCEPTION 'Solo un owner cambia el acceso de otro owner' USING ERRCODE = '42501'; END IF;
  IF m.user_id = auth.uid() THEN RAISE EXCEPTION 'No puedes cambiar tu propio acceso' USING ERRCODE = '42501'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'La fecha de vencimiento debe ser futura' USING ERRCODE = '22023'; END IF;
  IF (p_status = 'suspended' OR p_expires_at IS NOT NULL) AND public.org_last_active_owner(m.id) THEN
    RAISE EXCEPTION 'La organización no puede quedarse sin owner activo' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'suspended' AND (v_reason IS NULL OR length(v_reason) < 3) THEN RAISE EXCEPTION 'Indica el motivo de la suspensión' USING ERRCODE = '22023'; END IF;
  UPDATE org_members SET status = p_status, access_expires_at = p_expires_at,
         suspended_by = CASE WHEN p_status = 'suspended' THEN auth.uid() END,
         suspended_at = CASE WHEN p_status = 'suspended' THEN now() END,
         suspend_reason = CASE WHEN p_status = 'suspended' THEN v_reason END
   WHERE id = m.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (m.org_id, auth.uid(), 'user', m.user_id, CASE WHEN p_status = 'suspended' THEN 'suspended' ELSE 'access_updated' END,
          jsonb_build_object('status', p_status, 'expires_at', p_expires_at, 'reason', v_reason));
END;
$fn$;

-- La persona invitada acepta o rechaza (rechazar borra la invitación).
CREATE OR REPLACE FUNCTION public.respond_org_invitation(p_org_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE m org_members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid() AND status = 'invited' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitación no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF p_accept THEN
    UPDATE org_members SET status = 'active', joined_at = now() WHERE id = m.id;
  ELSE
    DELETE FROM org_members WHERE id = m.id;
  END IF;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (m.org_id, auth.uid(), 'user', auth.uid(), CASE WHEN p_accept THEN 'invitation_accepted' ELSE 'invitation_declined' END,
          jsonb_build_object('role', m.role));
END;
$fn$;

-- A-21: id de la cuenta por email (sin distinguir mayúsculas), sin paginar auth.users. Solo service role.
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
$fn$;

-- ── 2. Auditoría y notificaciones (A-11 / I-16) ──────────────────────────
DROP POLICY activity_log_insert ON public.activity_log;
CREATE POLICY activity_log_insert ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT public.get_my_org_ids()));
-- Las notificaciones las escriben el service role y las funciones SECURITY DEFINER; un usuario no inserta.
DROP POLICY notifications_insert_org_member ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon, authenticated;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_link_relative_check
  CHECK (link_url IS NULL OR link_url ~ '^/[^/\\]');

-- ── 3. Uso y cuota de IA (A-13 / I-19 / C-43) ────────────────────────────
CREATE TABLE public.ai_usage (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id            uuid,
  feature            text NOT NULL,
  model              text NOT NULL,
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd           numeric(12, 6) NOT NULL DEFAULT 0,
  stop_reason        text,
  ok                 boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_org_day_idx ON public.ai_usage (org_id, created_at DESC);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(org_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_usage FROM anon, authenticated;

-- Tope diario por org (USD, día UTC): organizations.settings.ai.daily_budget_usd; por defecto 20. = aiBudget() en TS.
CREATE OR REPLACE FUNCTION public.org_ai_budget(p_org_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(NULLIF(settings -> 'ai' ->> 'daily_budget_usd', '')::numeric, 20) FROM organizations WHERE id = p_org_id;
$fn$;

CREATE OR REPLACE FUNCTION public.ai_quota_status(p_org_id uuid)
RETURNS TABLE (used_usd numeric, budget_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE((SELECT sum(cost_usd) FROM ai_usage WHERE org_id = p_org_id AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0),
         public.org_ai_budget(p_org_id);
$fn$;

-- ── 4. Funciones canónicas (supabase/functions-sql) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- S15 (I-21): solo membresías activas y no vencidas.
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status = 'active' AND (access_expires_at IS NULL OR access_expires_at > now())
$function$;

CREATE OR REPLACE FUNCTION public.get_my_project_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
$function$;

CREATE OR REPLACE FUNCTION public.get_my_editor_project_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now()) AND om.role IN ('owner','admin','architect','leader')
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
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
      AND role IN ('owner', 'admin')
  )
$function$;

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

CREATE OR REPLACE FUNCTION public.is_org_privileged(p_org_id uuid)
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
      AND role IN ('owner', 'admin', 'architect')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_project_editor(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      AND om.role IN ('owner','admin','architect','leader')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_project_field_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      AND om.role IN ('owner', 'admin', 'architect', 'leader', 'inspector')
  )
$function$;

CREATE OR REPLACE FUNCTION public.user_in_project_org(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM projects pr
    JOIN org_members om ON om.org_id = pr.org_id
    WHERE pr.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  )
$function$;

CREATE OR REPLACE FUNCTION public.org_caller_role(p_org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT om.role::text FROM org_members om WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now());
$function$;

CREATE OR REPLACE FUNCTION public.capacity_designated(p_project_id uuid, p_capacity text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_capacities pc
    JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
    WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.revoked_at IS NULL);
$function$;

CREATE OR REPLACE FUNCTION public.has_capacity(p_project_id uuid, p_capacity text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN public.capacity_designated(p_project_id, p_capacity) THEN EXISTS (
      SELECT 1 FROM project_capacities pc
      JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.user_id = p_user_id AND pc.revoked_at IS NULL)
    ELSE COALESCE((
      SELECT om.role::text = ANY (public.capacity_fallback_roles(p_capacity))
      FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = p_user_id AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      WHERE p.id = p_project_id), false)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.record_decision(p_project_id uuid, p_title text, p_decision text, p_context text DEFAULT NULL::text, p_rationale text DEFAULT NULL::text, p_decided_by uuid DEFAULT NULL::uuid, p_attendees text DEFAULT NULL::text, p_decided_at date DEFAULT NULL::date, p_source_kind text DEFAULT 'other'::text, p_source_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text, p_system_id uuid DEFAULT NULL::uuid, p_supersedes_id uuid DEFAULT NULL::uuid, p_supersede_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_old decisions%ROWTYPE; v_reason text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S15 (D-16 / I-27): las decisiones formales (y su reemplazo) las registra un líder o superior; recorded_by
  -- guarda quién la registró, aparte de decided_by (a nombre de quién).
  IF NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores registran decisiones' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_decision, 8000) IS NULL THEN
    RAISE EXCEPTION 'Título y decisión son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_decided_at IS NOT NULL AND p_decided_at > public.project_today(p_project_id) THEN
    RAISE EXCEPTION 'La fecha de la decisión no puede ser futura' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_decided_by);
  IF COALESCE(p_source_kind, 'other') IN ('tq', 'constraint') THEN
    PERFORM public.mgmt_check_source(p_project_id, p_source_kind, p_source_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_old FROM decisions WHERE id = p_supersedes_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La decisión a reemplazar no pertenece al proyecto' USING ERRCODE = 'P0002'; END IF;
    IF v_old.status <> 'active' THEN RAISE EXCEPTION 'La decisión % ya fue reemplazada', v_old.number USING ERRCODE = 'P0001'; END IF;
    v_reason := public.mgmt_text(p_supersede_reason, 2000);
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica por qué se reemplaza la decisión' USING ERRCODE = '22023'; END IF;
  END IF;

  v_seq := public.mgmt_next_seq('decisions', p_project_id);
  INSERT INTO decisions (org_id, project_id, seq, number, title, context, decision, rationale, decided_by, attendees,
                         decided_at, source_kind, source_id, source_ref, system_id, recorded_by)
  VALUES (v_org, p_project_id, v_seq, 'DEC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_context, 8000), public.mgmt_text(p_decision, 8000), public.mgmt_text(p_rationale, 8000),
          COALESCE(p_decided_by, auth.uid()), public.mgmt_text(p_attendees, 2000), COALESCE(p_decided_at, public.project_today(p_project_id)),
          COALESCE(p_source_kind, 'other'), p_source_id, public.mgmt_text(p_source_ref, 200), p_system_id, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'decision', v_id, 'recorded', NULL, 'active');

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE decisions SET status = 'superseded', superseded_by = v_id, superseded_at = now(), supersede_reason = v_reason
     WHERE id = p_supersedes_id;
    PERFORM public.mgmt_log(v_org, p_project_id, 'decision', p_supersedes_id, 'superseded', 'active', 'superseded', v_reason);
  END IF;
  RETURN v_id;
END;
$function$;


-- ── 5. Org correcta en conflictos offline y push (A-22 / E-37) ───────────
-- Antes: la primera membresía por joined_at. Ahora: la org del proyecto (verificando pertenencia) o la indicada.
DROP FUNCTION public.log_sync_conflict(text, text, jsonb, jsonb, timestamptz, timestamptz, text, text);
CREATE OR REPLACE FUNCTION public.log_sync_conflict(
  p_entity_type text, p_entity_id text, p_local_payload jsonb, p_remote_payload jsonb,
  p_local_ts timestamptz, p_remote_ts timestamptz, p_winner text, p_notes text, p_project_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_user_id uuid := auth.uid(); v_org_id uuid; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_project_id IS NOT NULL THEN
    IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    SELECT org_id INTO v_org_id FROM projects WHERE id = p_project_id;
  ELSE
    SELECT org_id INTO v_org_id FROM public.get_my_org_ids() g(org_id) LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'User has no organization membership'; END IF;
  IF p_winner NOT IN ('local', 'remote') THEN RAISE EXCEPTION 'winner must be local or remote'; END IF;
  INSERT INTO sync_conflict_log (org_id, user_id, entity_type, entity_id, local_payload, remote_payload, local_ts, remote_ts, winner, resolution, notes)
  VALUES (v_org_id, v_user_id, p_entity_type, p_entity_id, p_local_payload, p_remote_payload, p_local_ts, p_remote_ts, p_winner, 'lww_auto', p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

DROP FUNCTION public.upsert_push_subscription(text, text, text, text[], jsonb);
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text, p_p256dh text, p_auth_secret text, p_topics text[], p_device_info jsonb, p_org_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_user_id uuid := auth.uid(); v_org_id uuid; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_org_id IS NOT NULL THEN
    IF p_org_id NOT IN (SELECT public.get_my_org_ids()) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_org_id := p_org_id;
  ELSE
    SELECT org_id INTO v_org_id FROM public.get_my_org_ids() g(org_id) LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'User has no organization membership'; END IF;
  INSERT INTO push_subscriptions (org_id, user_id, endpoint, p256dh, auth_secret, topics, device_info, enabled, failure_count)
  VALUES (v_org_id, v_user_id, p_endpoint, p_p256dh, p_auth_secret, p_topics, p_device_info, true, 0)
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET org_id = EXCLUDED.org_id, p256dh = EXCLUDED.p256dh, auth_secret = EXCLUDED.auth_secret, topics = EXCLUDED.topics,
        device_info = EXCLUDED.device_info, enabled = true, failure_count = 0, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ── 6. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.member_caller_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_last_active_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_org_member(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_access(uuid, text, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_org_invitation(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.org_ai_budget(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_quota_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sync_conflict(text, text, jsonb, jsonb, timestamptz, timestamptz, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text[], jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_caller_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_last_active_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_org_member(uuid, uuid, text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_access(uuid, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_org_invitation(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_ai_budget(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_quota_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_sync_conflict(text, text, jsonb, jsonb, timestamptz, timestamptz, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text[], jsonb, uuid) TO authenticated, service_role;
