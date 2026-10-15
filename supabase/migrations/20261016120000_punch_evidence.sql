-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 · bloque A (plan readiness, decisiones §10): calidad de evidencia en el punch.
--
-- 1. «Resuelto» es un SUB-ESTADO de in_progress (resolved_at/by), no un valor nuevo del enum:
--    todo lo que hoy cuenta un punch como abierto (gates, certificados, KPIs, API, export) lo
--    sigue contando sin cambios.
-- 2. Cerrar = verificar en campo: solo un punch resuelto, y por una persona distinta de quien
--    lo resolvió (9.21). Lo garantiza un trigger, así que vale para la app, la API y el bulk.
--    Excepciones: escrituras confiables (RPC SECURITY DEFINER / service role, p. ej. el cierre
--    post-handover `closed_final`) y punches ya cerrados (no se tocan).
-- 3. Impacto funcional, disposición para el arranque (PSSR, 16.37) y revisión de categoría por
--    el supervisor (marca + cola; Cat C sigue sin bloquear, §6.1).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
ALTER TABLE public.punches
  ADD COLUMN resolved_at          timestamptz,
  ADD COLUMN resolved_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN verified_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN impact               text,
  ADD COLUMN startup_disposition  text,
  ADD COLUMN category_reviewed_at timestamptz,
  ADD COLUMN category_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT punches_impact_check CHECK (impact IS NULL OR impact IN ('safety', 'process', 'equipment', 'operability', 'environment')),
  ADD CONSTRAINT punches_startup_disposition_check CHECK (startup_disposition IS NULL OR startup_disposition IN ('close_before_startup', 'controls', 'long_term'));

COMMENT ON COLUMN public.punches.resolved_at IS 'Sub-estado «resuelto» de in_progress: quien lo arregló lo marca con evidencia; cierra (verifica) otra persona.';
COMMENT ON COLUMN public.punches.verified_by IS 'Quien verificó en campo y cerró (≠ resolved_by).';
COMMENT ON COLUMN public.punches.impact IS 'Impacto funcional: safety | process | equipment | operability | environment (criterio de categoría, 9.20).';
COMMENT ON COLUMN public.punches.startup_disposition IS 'Disposición para el arranque (PSSR 16.37): close_before_startup | controls | long_term.';

-- Cola del supervisor: punches abiertos sin revisar.
CREATE INDEX punches_unreviewed_idx ON public.punches (project_id) WHERE category_reviewed_at IS NULL AND status IN ('open', 'in_progress');
CREATE INDEX punches_resolved_idx ON public.punches (project_id) WHERE resolved_at IS NOT NULL AND status = 'in_progress';

-- ── 2. Guarda ────────────────────────────────────────────────────────────────
-- Confiable = la escritura corre como dueño de la tabla (RPC SECURITY DEFINER) o sin usuario
-- (service role / cron). Las escrituras directas de la app (rol authenticated) no pueden:
--   · marcar/desmarcar resuelto, verificador ni revisión (solo vía RPC);
--   · cerrar un punch (solo `verify_punch`).
-- Cambiar la categoría por fuera de la revisión la deja «sin revisar» otra vez.
CREATE OR REPLACE FUNCTION public.guard_punch_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  trusted boolean := auth.uid() IS NULL
    OR current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.punches'::regclass));
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT trusted THEN
      NEW.resolved_at := NULL; NEW.resolved_by := NULL; NEW.verified_by := NULL;
      NEW.category_reviewed_at := NULL; NEW.category_reviewed_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT trusted THEN
    IF (NEW.resolved_at, NEW.resolved_by, NEW.verified_by, NEW.category_reviewed_at, NEW.category_reviewed_by)
       IS DISTINCT FROM (OLD.resolved_at, OLD.resolved_by, OLD.verified_by, OLD.category_reviewed_at, OLD.category_reviewed_by) THEN
      RAISE EXCEPTION 'La resolución, la verificación y la revisión de categoría se registran con su acción' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      RAISE EXCEPTION 'Para cerrar un punch hay que verificarlo en campo (otra persona, sobre un punch resuelto)' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Volver a abrir (o reabrir un cerrado) borra la resolución y la verificación anteriores.
  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    NEW.resolved_at := NULL; NEW.resolved_by := NULL; NEW.verified_by := NULL;
  END IF;
  -- Recategorizar fuera de la revisión: vuelve a la cola del supervisor.
  IF NEW.category IS DISTINCT FROM OLD.category AND NEW.category_reviewed_at IS NOT DISTINCT FROM OLD.category_reviewed_at THEN
    NEW.category_reviewed_at := NULL; NEW.category_reviewed_by := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER punches_guard BEFORE INSERT OR UPDATE ON public.punches
  FOR EACH ROW EXECUTE FUNCTION public.guard_punch_row();

-- ── 3. RPCs ──────────────────────────────────────────────────────────────────
-- Rol del usuario en la org del punch (NULL si no es miembro del proyecto).
CREATE OR REPLACE FUNCTION public.punch_caller_role(p_punch public.punches)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT om.role::text
  FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = auth.uid()
  WHERE p.id = p_punch.project_id AND public.is_project_member(p_punch.project_id);
$fn$;

CREATE OR REPLACE FUNCTION public.punch_log(p_punch public.punches, p_action text, p_payload jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  SELECT p.org_id, auth.uid(), 'punch', p_punch.id, p_action, p_payload
  FROM projects p WHERE p.id = p_punch.project_id AND auth.uid() IS NOT NULL;
$fn$;

-- Quien arregló el pendiente lo marca resuelto, describiendo qué se hizo (evidencia).
CREATE OR REPLACE FUNCTION public.resolve_punch(p_punch_id uuid, p_comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v public.punches; v_role text; v_comment text := btrim(COALESCE(p_comment, ''));
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v.status NOT IN ('open', 'in_progress') THEN RAISE EXCEPTION 'Solo se resuelve un punch abierto o en curso' USING ERRCODE = 'P0001'; END IF;
  IF v.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'El punch ya está resuelto y espera verificación' USING ERRCODE = 'P0001'; END IF;
  IF length(v_comment) < 5 THEN RAISE EXCEPTION 'Describe qué se hizo para resolverlo' USING ERRCODE = '22023'; END IF;

  UPDATE punches SET status = 'in_progress', resolved_at = now(), resolved_by = auth.uid() WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Resuelto: ' || v_comment);
  PERFORM public.punch_log(v, 'resolved', jsonb_build_object('comment', v_comment));
END;
$fn$;

-- Verificación en campo: acepta (cierra) o rechaza (vuelve a en curso, sin resolver).
-- La hace una persona distinta de quien lo resolvió; el cliente puede verificar.
CREATE OR REPLACE FUNCTION public.verify_punch(p_punch_id uuid, p_accept boolean, p_comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v public.punches; v_role text; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'in_progress' OR v.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Solo se verifica un punch resuelto' USING ERRCODE = 'P0001';
  END IF;
  IF v.resolved_by = auth.uid() THEN
    RAISE EXCEPTION 'La verificación la hace una persona distinta de quien lo resolvió' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    UPDATE punches SET status = 'closed', closed_date = CURRENT_DATE, verified_by = auth.uid() WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment)
    VALUES (p_punch_id, auth.uid(), 'Verificado en campo y cerrado' || COALESCE(': ' || v_comment, '.'));
    PERFORM public.punch_log(v, 'verified', jsonb_build_object('comment', v_comment));
  ELSE
    IF v_comment IS NULL THEN RAISE EXCEPTION 'Indica por qué no se acepta la resolución' USING ERRCODE = '22023'; END IF;
    UPDATE punches SET resolved_at = NULL, resolved_by = NULL WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Verificación rechazada: ' || v_comment);
    PERFORM public.punch_log(v, 'verification_rejected', jsonb_build_object('comment', v_comment));
  END IF;
END;
$fn$;

-- Revisión de categoría por el supervisor (otra persona que quien lo levantó). Puede confirmar
-- o recategorizar; queda auditado (categoría anterior → nueva) en comentarios y activity_log.
CREATE OR REPLACE FUNCTION public.review_punch_category(p_punch_id uuid, p_category public.punch_category, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v public.punches; v_role text; v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un supervisor revisa la categoría' USING ERRCODE = '42501';
  END IF;
  IF v.raised_by = auth.uid() THEN
    RAISE EXCEPTION 'La categoría la revisa una persona distinta de quien levantó el punch' USING ERRCODE = 'P0001';
  END IF;
  IF v.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El punch está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_category IS DISTINCT FROM v.category AND v_note IS NULL THEN
    RAISE EXCEPTION 'Explica el cambio de categoría' USING ERRCODE = '22023';
  END IF;

  UPDATE punches SET category = p_category, category_reviewed_at = now(), category_reviewed_by = auth.uid() WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment)
  VALUES (p_punch_id, auth.uid(),
    CASE WHEN p_category = v.category THEN 'Categoría ' || p_category || ' confirmada'
         ELSE 'Recategorizado ' || v.category || ' → ' || p_category END
    || COALESCE(': ' || v_note, '.'));
  PERFORM public.punch_log(v, 'category_reviewed', jsonb_build_object('from', v.category, 'to', p_category, 'note', v_note));
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.guard_punch_row()                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.punch_caller_role(public.punches)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.punch_log(public.punches, text, jsonb)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_punch(uuid, text)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_punch(uuid, boolean, text)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_punch_category(uuid, public.punch_category, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_punch(uuid, text)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_punch(uuid, boolean, text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_punch_category(uuid, public.punch_category, text) TO authenticated, service_role;

-- ── 4. Mi trabajo: colas de verificación y de revisión de categoría ──────────────
-- punches_verify: resueltos por otros en mis proyectos (cualquiera puede verificar, ≠ quien resolvió).
-- punches_review: abiertos sin revisar, levantados por otros; solo para supervisores.
CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    select id from projects where org_id = p_org_id
  ),
  me as (
    select role::text as role from org_members where org_id = p_org_id and user_id = auth.uid()
  )
  select jsonb_build_object(
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status in ('not_started', 'in_progress')
        and i.project_id in (select id from proj)
    ),
    'itrs_review', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role in ('supervisor', 'client')
        and i.status = 'completed'
        and i.project_id in (select id from proj)
        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
    ),
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.resolved_at is null
        and p.project_id in (select id from proj)
    ),
    'punches_verify', (
      select count(*)
      from punches p
      where p.status = 'in_progress'
        and p.resolved_at is not null
        and p.resolved_by is distinct from auth.uid()
        and p.project_id in (select id from proj)
    ),
    'punches_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from punches p
        where p.status in ('open', 'in_progress')
          and p.category_reviewed_at is null
          and p.raised_by is distinct from auth.uid()
          and p.project_id in (select id from proj)
      ) else 0 end
    ),
    'plan_items', (
      select count(*)
      from work_plan_items wi
      join work_plans wp on wp.id = wi.work_plan_id
      where wi.assigned_to = auth.uid()
        and wi.status in ('not_started', 'in_progress')
        and wp.status in ('published', 'in_progress')
        and wp.plan_date <= current_date
        and wp.project_id in (select id from proj)
    ),
    'signatures', (
      select count(*)
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      where pp.status = 'active'
        and pp.next_due_date < current_date
        and pp.project_id in (select id from proj)
    )
  );
$function$;

-- ── 5. Vista de lista: columnas nuevas al final (CREATE OR REPLACE solo admite agregar) ──
CREATE OR REPLACE VIEW public.punch_list_v WITH (security_invoker = true) AS
 SELECT pu.id,
    pu.project_id,
    p.org_id,
    p.name AS project_name,
    p.code AS project_code,
    pu.punch_number,
    pu.category,
    pu.description,
    pu.status,
    pu.priority,
    pu.target_date,
    pu.closed_date,
    pu.created_at,
    pu.itr_id,
    pu.assigned_to,
    pu.raised_by,
    rb.full_name AS raised_by_name,
    ab.full_name AS assigned_to_name,
    pu.discipline_id,
    d.code AS discipline_code,
    d.name AS discipline_name,
    d.color AS discipline_color,
    pu.tag_id,
    tg.tag_number,
    tg.description AS tag_description,
    pu.subsystem_id,
    ss.code AS subsystem_code,
    ss.name AS subsystem_name,
    ss.system_id,
    s.code AS system_code,
    s.name AS system_name,
    (((((((((pu.punch_number || ' '::text) || COALESCE(pu.description, ''::text)) || ' '::text) || COALESCE(tg.tag_number, ''::text)) || ' '::text) || COALESCE(ss.code, ''::text)) || ' '::text) || COALESCE(ab.full_name, ''::text)) || ' '::text) || COALESCE(p.name, ''::text) AS search_text,
    pu.resolved_at,
    pu.resolved_by,
    rs.full_name AS resolved_by_name,
    pu.verified_by,
    pu.impact,
    pu.startup_disposition,
    pu.category_reviewed_at
   FROM punches pu
     JOIN projects p ON p.id = pu.project_id
     LEFT JOIN profiles rb ON rb.id = pu.raised_by
     LEFT JOIN profiles ab ON ab.id = pu.assigned_to
     LEFT JOIN profiles rs ON rs.id = pu.resolved_by
     LEFT JOIN disciplines d ON d.id = pu.discipline_id
     LEFT JOIN tags tg ON tg.id = pu.tag_id
     LEFT JOIN subsystems ss ON ss.id = pu.subsystem_id
     LEFT JOIN systems s ON s.id = ss.system_id;
