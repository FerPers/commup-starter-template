-- S04 — ITR: firmas requeridas e independencia (C-01 / I-05 / A-08 / C-17; decisiones D4, D5, D6). 2026-10-19.
--
-- D4: cada plantilla define `required_signatures` (por defecto ejecutor + supervisor; el ejecutor siempre) y
--     la fase puede exigir además al cliente (`project_phases.itr_client_signature`). Al crear el ITR, el
--     trigger `guard_itr_row` congela el conjunto en `itrs.required_signatures`. `sign_itr_atomic` aprueba
--     cuando están todas, en orden ejecutor → supervisor → cliente, saltando las que no se piden.
-- D6: una persona no firma dos roles del mismo ITR (`sign_itr_atomic`) ni queda asignada a dos
--     (`guard_itr_content`).
-- C-01: las asignaciones de un rol que todavía no firmó se pueden completar o cambiar con el ITR en curso.
-- D5: los ITR existentes conservan al cliente si ya lo tenían asignado o firmado; los «completado» que ya
--     cumplen sus firmas requeridas se aprueban con un evento de auditoría (hoy: 0 en prod).
-- De paso (S04-N1): las revisiones y los clones de plantilla perdían `requires_test_equipment`.
--
-- Funciones editadas en su archivo canónico (supabase/functions-sql/) y emitidas aquí completas.

-- ── Columnas ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.itr_signing_roles(p_roles text[])
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT ARRAY(SELECT r FROM unnest(ARRAY['executor', 'supervisor', 'client']) WITH ORDINALITY AS o(r, n)
               WHERE r = 'executor' OR r = ANY (COALESCE(p_roles, ARRAY['executor', 'supervisor']))
               ORDER BY n);
$function$;
REVOKE EXECUTE ON FUNCTION public.itr_signing_roles(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.itr_signing_roles(text[]) TO authenticated, service_role;

ALTER TABLE public.itr_templates
  ADD COLUMN required_signatures text[] NOT NULL DEFAULT ARRAY['executor', 'supervisor'],
  ADD CONSTRAINT itr_templates_required_signatures_check
    CHECK (required_signatures <@ ARRAY['executor', 'supervisor', 'client'] AND 'executor' = ANY (required_signatures));
COMMENT ON COLUMN public.itr_templates.required_signatures IS 'S04 (D4): firmas que pide la plantilla. El ejecutor siempre; el cliente puede sumarlo la fase.';

ALTER TABLE public.project_phases
  ADD COLUMN itr_client_signature boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.project_phases.itr_client_signature IS 'S04 (D4): los ITR de esta fase exigen además la firma del cliente.';

ALTER TABLE public.itrs
  ADD COLUMN required_signatures text[] NOT NULL DEFAULT ARRAY['executor', 'supervisor'],
  ADD CONSTRAINT itrs_required_signatures_check
    CHECK (required_signatures <@ ARRAY['executor', 'supervisor', 'client'] AND 'executor' = ANY (required_signatures));
COMMENT ON COLUMN public.itrs.required_signatures IS 'S04 (D4): firmas requeridas, congeladas al crear el ITR (plantilla + fase). Solo cambia por migración o RPC.';

-- D5: los ITR que ya tenían cliente (asignado o firmado) lo conservan. Sin eventos de dominio: no es un cambio del ITR.
ALTER TABLE public.itrs DISABLE TRIGGER trg_events_itrs;
UPDATE public.itrs i SET required_signatures = ARRAY['executor', 'supervisor', 'client']
WHERE EXISTS (SELECT 1 FROM public.itr_assignments a WHERE a.itr_id = i.id AND a.role = 'client')
   OR EXISTS (SELECT 1 FROM public.itr_signatures s WHERE s.itr_id = i.id AND s.role = 'client');
ALTER TABLE public.itrs ENABLE TRIGGER trg_events_itrs;

-- ── Funciones canónicas ───────────────────────────────────────────────────────────────────────────

-- guard_itr_row  (supabase/functions-sql/guard_itr_row.sql)
CREATE OR REPLACE FUNCTION public.guard_itr_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE trusted boolean; tpl_org uuid; project_org uuid;
BEGIN
trusted:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.itrs'::regclass));
IF TG_OP<>'INSERT' THEN
IF TG_OP='UPDATE' AND (NEW.template_id,NEW.project_id,NEW.tag_id,NEW.subsystem_id,NEW.phase_id,NEW.itr_number) IS DISTINCT FROM (OLD.template_id,OLD.project_id,OLD.tag_id,OLD.subsystem_id,OLD.phase_id,OLD.itr_number) THEN RAISE EXCEPTION 'ITR identity and assigned revision are immutable'; END IF;
IF NOT trusted AND (OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id)) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
-- S04 (D4): las firmas requeridas se congelan al crear el ITR; solo las cambia el dueño de la tabla (migraciones, RPC).
IF TG_OP='UPDATE' AND NOT trusted AND NEW.required_signatures IS DISTINCT FROM OLD.required_signatures THEN RAISE EXCEPTION 'Required signatures are fixed when the ITR is created'; END IF;
IF TG_OP='DELETE' THEN IF OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id) THEN RAISE EXCEPTION 'Cannot delete signed ITR'; END IF; RETURN OLD; END IF;
ELSE
SELECT org_id INTO tpl_org FROM public.itr_templates WHERE id=NEW.template_id FOR UPDATE;
SELECT org_id INTO project_org FROM public.projects WHERE id=NEW.project_id;
IF tpl_org IS NULL OR (tpl_org IS DISTINCT FROM project_org AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND is_global)) THEN RAISE EXCEPTION 'Template organization mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND phase_id=NEW.phase_id) THEN RAISE EXCEPTION 'Phase revision mismatch'; END IF;
IF NEW.tag_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tags WHERE id=NEW.tag_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Tag project mismatch'; END IF;
-- S04 (D4): firmas que pide la plantilla, más el cliente si la fase lo exige. Lo que mande el cliente se ignora.
NEW.required_signatures:=public.itr_signing_roles((SELECT t.required_signatures || CASE WHEN ph.itr_client_signature THEN ARRAY['client'] ELSE ARRAY[]::text[] END
  FROM public.itr_templates t LEFT JOIN public.project_phases ph ON ph.id=NEW.phase_id WHERE t.id=NEW.template_id));
END IF;
IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
RETURN NEW;
END $function$;


-- guard_itr_content  (supabase/functions-sql/guard_itr_content.sql)
CREATE OR REPLACE FUNCTION public.guard_itr_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; target uuid; item_template uuid;
BEGIN
IF TG_OP='UPDATE' AND NEW.itr_id IS DISTINCT FROM OLD.itr_id THEN RAISE EXCEPTION 'Cannot move ITR content between records'; END IF;
target:=CASE WHEN TG_OP='DELETE' THEN OLD.itr_id ELSE NEW.itr_id END;
SELECT * INTO v FROM public.itrs WHERE id=target FOR UPDATE;
IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'ITR unavailable'; END IF;
IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'Project membership required'; END IF;
IF TG_TABLE_NAME='itr_assignments' THEN
-- S04 (C-01): las asignaciones de un rol que aún no firmó se pueden completar o cambiar con el ITR en curso;
-- la de un rol ya firmado, o la de un ITR aprobado, solo tras la reapertura auditada.
IF v.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=target AND s.role::text IN (CASE WHEN TG_OP<>'INSERT' THEN OLD.role::text END, CASE WHEN TG_OP<>'DELETE' THEN NEW.role::text END)) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
ELSIF v.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=target) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
IF TG_OP<>'DELETE' AND TG_TABLE_NAME IN ('itr_responses','itr_attachments') THEN
IF NEW.item_id IS NOT NULL THEN SELECT template_id INTO item_template FROM public.itr_template_items WHERE id=NEW.item_id; IF item_template IS DISTINCT FROM v.template_id THEN RAISE EXCEPTION 'Item does not belong to assigned revision'; END IF; END IF;
IF TG_TABLE_NAME='itr_attachments' THEN
IF NEW.file_url NOT LIKE target::text || '/%' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='itr-attachments' AND o.name=NEW.file_url) THEN RAISE EXCEPTION 'Evidence object must exist in this ITR storage path'; END IF;
IF NEW.response_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.itr_responses r WHERE r.id=NEW.response_id AND r.itr_id=target AND r.item_id IS NOT DISTINCT FROM NEW.item_id) THEN RAISE EXCEPTION 'Attachment response mismatch'; END IF;
END IF; END IF;
IF TG_OP<>'DELETE' AND TG_TABLE_NAME='itr_assignments' THEN
IF NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.projects p ON p.org_id=m.org_id WHERE p.id=v.project_id AND m.user_id=NEW.user_id) THEN RAISE EXCEPTION 'Assigned user is not a project organization member'; END IF;
-- S04 (D4/D6): solo roles que el ITR exige, y nadie asignado a dos roles del mismo ITR.
IF NOT NEW.role::text=ANY(v.required_signatures) THEN RAISE EXCEPTION 'Signing role not required for this ITR'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=target AND a.user_id=NEW.user_id AND a.role<>NEW.role AND a.id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'Same person cannot hold two signing roles'; END IF;
END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;


-- sign_itr_atomic  (supabase/functions-sql/sign_itr_atomic.sql)
CREATE OR REPLACE FUNCTION public.sign_itr_atomic(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
-- S04 (C-01/I-05, D4): firmas requeridas congeladas en el ITR, en orden ejecutor → supervisor → cliente.
roles:=public.itr_signing_roles(v.required_signatures);
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
-- S04 (A-08, D6): una persona no firma dos roles del mismo ITR.
IF EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND user_id=uid) THEN RAISE EXCEPTION 'Signer already signed this ITR in another role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
-- Fase 8: no se firma contra una revisión de documento superada.
eq_block:=public.document_references_blocker('itr',p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM unnest(roles) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=CURRENT_DATE WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;


-- my_work_counts  (supabase/functions-sql/my_work_counts.sql)
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
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
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
        -- S04 (C-17, D4/D6): solo un rol que el ITR exige, con las firmas requeridas anteriores ya puestas,
        -- y si no firmé ya otro rol del mismo ITR. Espejo de isMyTurnToSign (src/lib/my-work/queues.ts).
        and a.role::text = any (i.required_signatures)
        and not exists (
          select 1 from unnest(i.required_signatures) r
          where array_position(array['executor', 'supervisor', 'client'], r) < array_position(array['executor', 'supervisor', 'client'], a.role::text)
            and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role::text = r)
        )
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.user_id = auth.uid())
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
    ),
    'actions_mine', (
      select count(*)
      from actions a
      where a.owner_id = auth.uid()
        and a.status in ('open', 'in_progress')
        and a.project_id in (select id from proj)
    ),
    'actions_verify', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from actions a
        where a.status = 'done'
          and a.done_by is distinct from auth.uid()
          and a.project_id in (select id from proj)
      ) else 0 end
    ),
    'constraints_mine', (
      select count(*)
      from project_constraints c
      where c.owner_id = auth.uid()
        and c.status = 'open'
        and c.project_id in (select id from proj)
    ),
    'handovers_to_receive', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from shift_handovers h
        where h.status = 'handed_over'
          and h.handed_by is distinct from auth.uid()
          and h.project_id in (select id from proj)
      ) else 0 end
    ),
    'holds_to_release', (
      select count(*)
      from procedure_run_steps rs
      join procedure_steps st on st.id = rs.step_id
      join procedure_runs r on r.id = rs.run_id
      where rs.status = 'at_hold'
        and r.status in ('at_hold', 'stopped')
        and rs.done_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(st.hold_capacity))
        and rs.project_id in (select id from proj)
    ),
    'lineup_to_verify', (
      select count(*)
      from lineup_items li
      join lineup_sheets s on s.id = li.sheet_id
      where li.is_critical and li.set_at is not null and li.verified_at is null
        and li.found_position = li.required_position
        and li.set_by is distinct from auth.uid()
        and s.status in ('issued', 'in_progress')
        and li.project_id in (select id from proj)
    ),
    'milestones_to_witness', (
      select count(*)
      from startup_events ev
      where ev.status = 'pending_witness'
        and ev.recorded_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(ev.witness_capacity))
        and ev.project_id in (select id from proj)
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and (select role from me) in ('owner', 'admin', 'architect', 'leader'))
          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations'))))
    ),
    'performance_to_decide', (
      select count(*)
      from performance_runs pr
      where pr.status = 'closed'
        and (select role from me) in ('owner', 'admin', 'architect', 'leader')
        and pr.project_id in (select id from proj)
    ),
    'performance_to_sign', (
      select count(*)
      from performance_certificates pc
      where pc.status = 'pending_signatures'
        and pc.project_id in (select id from proj)
        and auth.uid() is distinct from pc.commissioning_signed_by
        and auth.uid() is distinct from pc.operations_signed_by
        and auth.uid() is distinct from pc.client_signed_by
        and ((pc.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations')))
          or (pc.client_signed_by is null and (select role from me) = 'client'))
    )
  );
$function$;


-- guard_assigned_itr_template  (supabase/functions-sql/guard_assigned_itr_template.sql)
CREATE OR REPLACE FUNCTION public.guard_assigned_itr_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE tid uuid;
BEGIN
  IF TG_TABLE_NAME='itr_templates' THEN tid:=OLD.id;
  ELSE
    tid:=CASE WHEN TG_OP='DELETE' THEN OLD.template_id ELSE NEW.template_id END;
    IF TG_OP='UPDATE' AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN RAISE EXCEPTION 'Cannot move template content'; END IF;
    IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=tid) THEN RETURN OLD; END IF;
  END IF;
  PERFORM 1 FROM public.itr_templates WHERE id=tid FOR UPDATE;
  IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.itr_templates t JOIN public.org_members m ON m.org_id=t.org_id WHERE t.id=tid AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','architect','leader')) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;
  IF EXISTS(SELECT 1 FROM public.itrs WHERE template_id=tid) THEN
    IF TG_TABLE_NAME='itr_templates' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'is_active'-'requires_test_equipment'-'required_signatures')=(to_jsonb(OLD)-'is_active'-'requires_test_equipment'-'required_signatures') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Assigned revision is immutable; publish a new revision';
  END IF;
  IF TG_TABLE_NAME='itr_template_items' AND TG_OP<>'DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM public.itr_template_sections WHERE id=NEW.section_id AND template_id=NEW.template_id) THEN RAISE EXCEPTION 'Section revision mismatch'; END IF;
    IF NEW.condition_item_id IS NOT NULL AND (NEW.condition_item_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.itr_template_items WHERE id=NEW.condition_item_id AND template_id=NEW.template_id)) THEN RAISE EXCEPTION 'Condition revision mismatch'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;


-- create_itr_template_revision  (supabase/functions-sql/create_itr_template_revision.sql)
CREATE OR REPLACE FUNCTION public.create_itr_template_revision(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  src public.itr_templates;
  uid uuid := auth.uid();
  new_id uuid;
  next_version integer;
  sec record;
  new_sec_id uuid;
  it record;
  new_item_id uuid;
  id_map jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO src FROM public.itr_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = src.org_id AND m.user_id = uid
      AND m.role::text IN ('owner','admin','architect','leader')
  ) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.itr_templates WHERE org_id = src.org_id AND code = src.code;

  INSERT INTO public.itr_templates (
    org_id, discipline_id, equipment_type_id, phase_id, code, title, title_es,
    description, version, is_active, is_global,
    requires_test_equipment, required_signatures -- S04: la revisión conserva equipos de prueba y firmas
  ) VALUES (
    src.org_id, src.discipline_id, src.equipment_type_id, src.phase_id, src.code, src.title, src.title_es,
    src.description, next_version, false, src.is_global,
    src.requires_test_equipment, src.required_signatures
  ) RETURNING id INTO new_id;

  FOR sec IN
    SELECT * FROM public.itr_template_sections WHERE template_id = src.id ORDER BY order_index, id
  LOOP
    INSERT INTO public.itr_template_sections (template_id, title, order_index)
    VALUES (new_id, sec.title, sec.order_index) RETURNING id INTO new_sec_id;

    FOR it IN
      SELECT * FROM public.itr_template_items WHERE section_id = sec.id ORDER BY order_index, id
    LOOP
      INSERT INTO public.itr_template_items (
        section_id, template_id, description, description_es, description_es_source,
        item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement,
        options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text,
        order_index, item_number, condition_value
      ) VALUES (
        new_sec_id, new_id, it.description, it.description_es, it.description_es_source,
        it.item_type, it.is_required, it.is_critical, it.requires_photo, it.requires_document, it.requires_measurement,
        it.options, it.option_outcomes, it.unit, it.acceptance_min, it.acceptance_max, it.acceptance_text,
        it.order_index, it.item_number, it.condition_value
      ) RETURNING id INTO new_item_id;
      id_map := id_map || jsonb_build_object(it.id::text, new_item_id::text);
    END LOOP;
  END LOOP;

  UPDATE public.itr_template_items n
  SET condition_item_id = (id_map ->> o.condition_item_id::text)::uuid,
      condition_value = CASE WHEN id_map ? o.condition_item_id::text THEN o.condition_value ELSE NULL END
  FROM public.itr_template_items o
  WHERE o.template_id = src.id AND o.condition_item_id IS NOT NULL
    AND n.id = (id_map ->> o.id::text)::uuid;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (src.org_id, uid, 'itr_template', new_id, 'revision_created',
    jsonb_build_object('code', src.code, 'version', next_version, 'source_template_id', src.id, 'source_version', src.version));

  RETURN new_id;
END $function$;


-- clone_itr_template_from_catalog  (supabase/functions-sql/clone_itr_template_from_catalog.sql)
CREATE OR REPLACE FUNCTION public.clone_itr_template_from_catalog(p_source_template_id uuid, p_target_org_id uuid, p_code_suffix text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  src public.itr_templates;
  uid uuid := auth.uid();
  src_disc_code text;
  src_phase_code text;
  src_eq_code text;
  tgt_disc uuid;
  tgt_phase uuid;
  tgt_eq uuid;
  new_code text;
  next_version integer;
  already public.itr_templates;
  mode text;
  new_id uuid;
  sec record;
  new_sec_id uuid;
  it record;
  new_item_id uuid;
  id_map jsonb := '{}'::jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = p_target_org_id AND m.user_id = uid
      AND m.role::text IN ('owner','admin','architect','leader')
  ) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;

  SELECT * INTO src FROM public.itr_templates WHERE id = p_source_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source template not found'; END IF;
  IF src.org_id = p_target_org_id THEN RAISE EXCEPTION 'Source template already belongs to the target organization'; END IF;
  -- Visibility mirrors RLS: catalog orgs are public, other orgs require membership.
  IF NOT public.is_catalog_org(src.org_id) AND NOT EXISTS (
    SELECT 1 FROM public.org_members m WHERE m.org_id = src.org_id AND m.user_id = uid
  ) THEN RAISE EXCEPTION 'Source template not found'; END IF;
  IF NOT src.is_active THEN RAISE EXCEPTION 'Only the active revision can be imported'; END IF;

  SELECT code INTO src_disc_code FROM public.disciplines WHERE id = src.discipline_id;
  SELECT code INTO src_phase_code FROM public.project_phases WHERE id = src.phase_id;
  IF src_disc_code IS NULL OR src_phase_code IS NULL THEN
    RAISE EXCEPTION 'Source template without discipline or phase';
  END IF;
  SELECT id INTO tgt_disc FROM public.disciplines WHERE org_id = p_target_org_id AND code = src_disc_code ORDER BY id LIMIT 1;
  SELECT id INTO tgt_phase FROM public.project_phases WHERE org_id = p_target_org_id AND code = src_phase_code ORDER BY id LIMIT 1;
  IF tgt_disc IS NULL THEN RAISE EXCEPTION 'Missing discipline "%" in target organization', src_disc_code; END IF;
  IF tgt_phase IS NULL THEN RAISE EXCEPTION 'Missing phase "%" in target organization', src_phase_code; END IF;
  IF src.equipment_type_id IS NOT NULL THEN
    SELECT code INTO src_eq_code FROM public.equipment_types WHERE id = src.equipment_type_id;
    SELECT id INTO tgt_eq FROM public.equipment_types WHERE org_id = p_target_org_id AND code = src_eq_code ORDER BY id LIMIT 1;
  END IF;

  new_code := src.code || COALESCE(p_code_suffix, '');

  -- Serialise concurrent imports of the same code into the target.
  PERFORM 1 FROM public.itr_templates WHERE org_id = p_target_org_id AND code = new_code FOR UPDATE;

  SELECT * INTO already FROM public.itr_templates
  WHERE org_id = p_target_org_id AND code = new_code AND source_template_id = src.id
  ORDER BY is_active DESC, version DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('mode', 'skipped', 'id', already.id, 'code', new_code,
      'version', already.version, 'is_active', already.is_active,
      'equipment_type_mapped', src.equipment_type_id IS NULL OR already.equipment_type_id IS NOT NULL);
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.itr_templates WHERE org_id = p_target_org_id AND code = new_code;
  mode := CASE WHEN next_version = 1 THEN 'created' ELSE 'revision' END;

  INSERT INTO public.itr_templates (
    org_id, discipline_id, equipment_type_id, phase_id, code, title, title_es, description,
    version, is_active, is_global, source_template_id, source_org_id, source_version, imported_at,
    requires_test_equipment, required_signatures -- S04: la revisión conserva equipos de prueba y firmas
  ) VALUES (
    p_target_org_id, tgt_disc, tgt_eq, tgt_phase, new_code, src.title, src.title_es, src.description,
    next_version, next_version = 1, false, src.id, src.org_id, src.version, now(),
    src.requires_test_equipment, src.required_signatures
  ) RETURNING id INTO new_id;

  FOR sec IN
    SELECT * FROM public.itr_template_sections WHERE template_id = src.id ORDER BY order_index, id
  LOOP
    INSERT INTO public.itr_template_sections (template_id, title, order_index)
    VALUES (new_id, sec.title, sec.order_index) RETURNING id INTO new_sec_id;

    FOR it IN
      SELECT * FROM public.itr_template_items WHERE section_id = sec.id ORDER BY order_index, id
    LOOP
      INSERT INTO public.itr_template_items (
        section_id, template_id, description, description_es, description_es_source,
        item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement,
        options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text,
        order_index, item_number, condition_value
      ) VALUES (
        new_sec_id, new_id, it.description, it.description_es, it.description_es_source,
        it.item_type, it.is_required, it.is_critical, it.requires_photo, it.requires_document, it.requires_measurement,
        it.options, it.option_outcomes, it.unit, it.acceptance_min, it.acceptance_max, it.acceptance_text,
        it.order_index, it.item_number, it.condition_value
      ) RETURNING id INTO new_item_id;
      id_map := id_map || jsonb_build_object(it.id::text, new_item_id::text);
    END LOOP;
  END LOOP;

  -- Re-map conditions to the copied items; a condition pointing outside the
  -- source template is dropped together with its value.
  UPDATE public.itr_template_items n
  SET condition_item_id = (id_map ->> o.condition_item_id::text)::uuid,
      condition_value = CASE WHEN id_map ? o.condition_item_id::text THEN o.condition_value ELSE NULL END
  FROM public.itr_template_items o
  WHERE o.template_id = src.id AND o.condition_item_id IS NOT NULL
    AND n.id = (id_map ->> o.id::text)::uuid;

  INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (p_target_org_id, uid, 'itr_template', new_id, 'imported_from_catalog',
    jsonb_build_object('code', new_code, 'version', next_version, 'mode', mode,
      'source_template_id', src.id, 'source_org_id', src.org_id, 'source_version', src.version,
      'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL));

  RETURN jsonb_build_object('mode', mode, 'id', new_id, 'code', new_code,
    'version', next_version, 'is_active', next_version = 1,
    'equipment_type_mapped', src.equipment_type_id IS NULL OR tgt_eq IS NOT NULL);
END $function$;


-- ── D5: «completado» que ya cumple sus firmas requeridas → aprobado, con auditoría ──────────────────
WITH ready AS (
  SELECT i.id, i.project_id, i.tag_id, p.org_id
  FROM public.itrs i JOIN public.projects p ON p.id = i.project_id
  WHERE i.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM unnest(i.required_signatures) r
                    WHERE NOT EXISTS (SELECT 1 FROM public.itr_signatures s WHERE s.itr_id = i.id AND s.role::text = r))
), approved AS (
  UPDATE public.itrs i SET status = 'approved' FROM ready WHERE i.id = ready.id RETURNING ready.*
), plan AS (
  UPDATE public.work_plan_items w SET status = 'completed'
  FROM approved WHERE w.itr_id = approved.id AND w.status::text IN ('not_started', 'in_progress') RETURNING w.id
)
INSERT INTO public.activity_log (org_id, user_id, entity_type, entity_id, action, payload)
-- user_id NOT NULL: se atribuye a quien puso la última firma requerida.
SELECT org_id, (SELECT s.user_id FROM public.itr_signatures s WHERE s.itr_id = approved.id ORDER BY s.signed_at DESC LIMIT 1), 'itr', id, 'approved',
       jsonb_build_object('projectId', project_id, 'tagId', tag_id, 'rule', 'firmas requeridas v2 (S04, D5)', 'plan_items', (SELECT count(*) FROM plan))
FROM approved;
