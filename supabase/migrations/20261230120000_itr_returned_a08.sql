-- A08 · E2 (plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md; contrato de estados aprobado por Luis el 2026-10-25).
--
-- Hasta ahora «Devolver al ejecutor» borraba las firmas y avisaba, pero no dejaba estado: el ITR devuelto se veía
-- «Completado» como uno terminado. Ahora:
--   - itrs.returned_at / returned_by / return_reason: los escribe solo return_itr_to_executor; los limpian la
--     siguiente firma (sign_itr_atomic) y la reapertura auditada (reopen_itr_atomic). La historia sigue en
--     activity_log ('returned'). Nadie más los escribe (guard_itr_derived) y un ITR nace sin devolución (guard_itr_row).
--   - itr_list_v suma returned_at, return_reason, signatures_done y signatures_required para que la lista diga
--     «Devuelto» con su motivo y «Diligenciado · por firmar n/m» (src/lib/states/itr.ts).
-- Los códigos de status del ITR no cambian (la API v1 sigue igual).
-- Funciones canónicas: guard_itr_derived, guard_itr_row, return_itr_to_executor, sign_itr_atomic, reopen_itr_atomic.

ALTER TABLE public.itrs
  ADD COLUMN returned_at   timestamptz,
  ADD COLUMN returned_by   uuid,
  ADD COLUMN return_reason text;

COMMENT ON COLUMN public.itrs.returned_at IS 'A08: devuelto al ejecutor (return_itr_to_executor); se limpia al firmar de nuevo o al reabrir.';
COMMENT ON COLUMN public.itrs.return_reason IS 'A08: motivo de la devolución (mínimo 10 caracteres).';

CREATE OR REPLACE FUNCTION public.guard_itr_derived()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- S05 (C-34/C-10, D7): estado, avance y fecha de completado solo los escriben las funciones confiables
  -- (refresh_itr_status, sign_itr_atomic, reopen…). Antes cualquier miembro, incluso el cliente, los cambiaba
  -- por REST, y el cambio masivo de estado dejaba ITR «completados» sin contenido.
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass))
     AND (NEW.status, NEW.progress_pct, NEW.completed_date) IS DISTINCT FROM (OLD.status, OLD.progress_pct, OLD.completed_date) THEN
    RAISE EXCEPTION 'El estado y el avance del ITR se calculan de su contenido y sus firmas' USING ERRCODE = '42501';
  END IF;
  -- A08 (E2): la devolución la registra solo return_itr_to_executor; la limpian la firma y la reapertura auditada.
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass))
     AND (NEW.returned_at, NEW.returned_by, NEW.return_reason) IS DISTINCT FROM (OLD.returned_at, OLD.returned_by, OLD.return_reason) THEN
    RAISE EXCEPTION 'La devolución del ITR solo la registra «Devolver al ejecutor»' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.guard_itr_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE trusted boolean; tpl_org uuid; project_org uuid;
BEGIN
trusted:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.itrs'::regclass));
IF TG_OP<>'INSERT' THEN
IF TG_OP='UPDATE' AND (NEW.template_id,NEW.project_id,NEW.tag_id,NEW.phase_id,NEW.itr_number) IS DISTINCT FROM (OLD.template_id,OLD.project_id,OLD.tag_id,OLD.phase_id,OLD.itr_number) THEN RAISE EXCEPTION 'ITR identity and assigned revision are immutable'; END IF;
-- C-16 (D9): el subsistema solo cambia con su tag, por move_tag_subsystem (dueño de la tabla), en el mismo proyecto y nunca firmado.
IF TG_OP='UPDATE' AND NEW.subsystem_id IS DISTINCT FROM OLD.subsystem_id THEN
IF NOT trusted THEN RAISE EXCEPTION 'ITR identity and assigned revision are immutable'; END IF;
IF OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
END IF;
IF NOT trusted AND (OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id)) THEN RAISE EXCEPTION 'Signed ITR requires audited reopening'; END IF;
-- S04 (D4): las firmas requeridas se congelan al crear el ITR; solo las cambia el dueño de la tabla (migraciones, RPC).
IF TG_OP='UPDATE' AND NOT trusted AND NEW.required_signatures IS DISTINCT FROM OLD.required_signatures THEN RAISE EXCEPTION 'Required signatures are fixed when the ITR is created'; END IF;
-- A39: también el requisito de equipo de prueba (cambiar la plantilla después no cambia un ITR ya creado).
IF TG_OP='UPDATE' AND NOT trusted AND NEW.requires_test_equipment IS DISTINCT FROM OLD.requires_test_equipment THEN RAISE EXCEPTION 'Test equipment requirement is fixed when the ITR is created'; END IF;
-- A44: la foto de los datos del tag la escribe solo la firma (sign_itr_atomic).
IF TG_OP='UPDATE' AND NOT trusted AND (NEW.tag_snapshot,NEW.tag_snapshot_at) IS DISTINCT FROM (OLD.tag_snapshot,OLD.tag_snapshot_at) THEN RAISE EXCEPTION 'Tag snapshot is written only by signing'; END IF;
IF TG_OP='DELETE' THEN IF OLD.status='approved' OR EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=OLD.id) THEN RAISE EXCEPTION 'Cannot delete signed ITR'; END IF; RETURN OLD; END IF;
ELSE
SELECT org_id INTO tpl_org FROM public.itr_templates WHERE id=NEW.template_id FOR KEY SHARE;
SELECT org_id INTO project_org FROM public.projects WHERE id=NEW.project_id;
IF tpl_org IS NULL OR (tpl_org IS DISTINCT FROM project_org AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND is_global)) THEN RAISE EXCEPTION 'Template organization mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subsystems s JOIN public.systems sy ON sy.id=s.system_id WHERE s.id=NEW.subsystem_id AND sy.project_id=NEW.project_id) THEN RAISE EXCEPTION 'Subsystem project mismatch'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=NEW.template_id AND phase_id=NEW.phase_id) THEN RAISE EXCEPTION 'Phase revision mismatch'; END IF;
IF NEW.tag_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tags WHERE id=NEW.tag_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Tag project mismatch'; END IF;
-- S04 (D4): firmas que pide la plantilla, más el cliente si la fase lo exige. Lo que mande el cliente se ignora.
NEW.required_signatures:=public.itr_signing_roles((SELECT t.required_signatures || CASE WHEN ph.itr_client_signature THEN ARRAY['client'] ELSE ARRAY[]::text[] END
  FROM public.itr_templates t LEFT JOIN public.project_phases ph ON ph.id=NEW.phase_id WHERE t.id=NEW.template_id));
-- A39: el equipo de prueba se congela igual que las firmas.
NEW.requires_test_equipment:=COALESCE((SELECT t.requires_test_equipment FROM public.itr_templates t WHERE t.id=NEW.template_id),false);
-- A44: un ITR nace sin foto del tag (la toma la primera firma).
NEW.tag_snapshot:=NULL; NEW.tag_snapshot_at:=NULL;
-- A08 (E2): un ITR nace sin devolución.
NEW.returned_at:=NULL; NEW.returned_by:=NULL; NEW.return_reason:=NULL;
END IF;
IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
RETURN NEW;
END $function$;


CREATE OR REPLACE FUNCTION public.return_itr_to_executor(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; v_org uuid; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_sigs jsonb; v_exec uuid; v_role text;
BEGIN
  -- S05 (C-23): quien debe firmar después del ejecutor (supervisor o cliente asignado) devuelve el ITR con
  -- observaciones: se retiran las firmas puestas, el ejecutor corrige y vuelve a firmar. Auditado y notificado.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
  IF v.status = 'approved' THEN RAISE EXCEPTION 'Un ITR aprobado se reabre con la reapertura auditada' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id AND role = 'executor') THEN
    RAISE EXCEPTION 'El ejecutor todavía no firmó: no hay nada que devolver' USING ERRCODE = 'P0001';
  END IF;
  SELECT a.role::text INTO v_role FROM itr_assignments a
   WHERE a.itr_id = p_itr_id AND a.user_id = auth.uid() AND a.role::text <> 'executor' AND a.role::text = ANY (v.required_signatures)
   LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Solo el supervisor o el cliente asignado devuelve el ITR' USING ERRCODE = '42501'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Explica qué hay que corregir (mínimo 10 caracteres)' USING ERRCODE = '22023'; END IF;

  SELECT org_id INTO v_org FROM projects WHERE id = v.project_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('role', role, 'user_id', user_id, 'signed_at', signed_at)), '[]') INTO v_sigs FROM itr_signatures WHERE itr_id = p_itr_id;
  DELETE FROM itr_signatures WHERE itr_id = p_itr_id;
  -- A08 (E2): el ITR queda «Devuelto», con quién y por qué, hasta la siguiente firma o una reapertura.
  UPDATE itrs SET returned_at = now(), returned_by = auth.uid(), return_reason = v_reason WHERE id = p_itr_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'itr', p_itr_id, 'returned', jsonb_build_object('reason', v_reason, 'byRole', v_role, 'previousSignatures', v_sigs));
  SELECT user_id INTO v_exec FROM itr_assignments WHERE itr_id = p_itr_id AND role = 'executor';
  IF v_exec IS NOT NULL AND v_exec <> auth.uid() THEN
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    VALUES (v_org, v_exec, 'itr_returned', 'ITR devuelto: ' || v.itr_number, left(v_reason, 280),
            '/projects/' || v.project_id || COALESCE('/tags/' || v.tag_id || '/itrs/' || p_itr_id, '/itrs'),
            jsonb_build_object('itrId', p_itr_id, 'projectId', v.project_id, 'reason', v_reason));
  END IF;
  RETURN jsonb_build_object('project_id', v.project_id, 'tag_id', v.tag_id, 'itr_number', v.itr_number);
END;
$function$;


CREATE OR REPLACE FUNCTION public."sign_itr_atomic"(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text; first_sig boolean;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
-- S04 (C-01/I-05, D4): firmas requeridas congeladas en el ITR, en orden ejecutor → supervisor → cliente.
roles:=public.itr_signing_roles(v.required_signatures);
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
-- S05 (C-26): el trazo es un PNG en base64 de hasta ~256 KB (igual que el certificado).
IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 350000) THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
-- S14 (I-25): con representantes del cliente designados, la firma Cliente es de uno de ellos (aunque la asignación sea anterior).
IF p_role='client' AND public.capacity_designated(v.project_id,'client_rep') AND NOT public.has_capacity(v.project_id,'client_rep') THEN RAISE EXCEPTION 'La firma Cliente del ITR es de un representante del cliente designado' USING ERRCODE='42501'; END IF;
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
-- A44: la primera firma congela los datos del tag con los que se probó (una reapertura la renueva en la siguiente).
first_sig:=NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id);
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM unnest(roles) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=public.project_today(v.project_id),
  tag_snapshot=CASE WHEN first_sig THEN public.itr_tag_snapshot(v.tag_id) ELSE tag_snapshot END,
  tag_snapshot_at=CASE WHEN first_sig THEN now() ELSE tag_snapshot_at END,
  -- A08 (E2): firmar de nuevo cierra la devolución (queda en activity_log).
  returned_at=NULL,returned_by=NULL,return_reason=NULL
WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;


CREATE OR REPLACE FUNCTION public."reopen_itr_atomic"(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; uid uuid:=auth.uid(); org uuid; signatures jsonb; n integer;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid AND role::text IN ('owner','admin','architect')) THEN RAISE EXCEPTION 'Privileged role required'; END IF;
IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Reopening reason required'; END IF;
SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb),count(*) INTO signatures,n FROM public.itr_signatures s WHERE itr_id=p_itr_id;
IF n=0 AND v.status<>'approved' THEN RAISE EXCEPTION 'No signatures to revoke'; END IF;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'revoked',jsonb_build_object('reason',trim(p_reason),'previousStatus',v.status,'previousSignatures',signatures,'template_id',v.template_id,'responses',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.itr_responses r WHERE r.itr_id=p_itr_id),'[]'::jsonb),'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.itr_attachments a WHERE a.itr_id=p_itr_id),'[]'::jsonb)));
DELETE FROM public.itr_signatures WHERE itr_id=p_itr_id;
UPDATE public.itrs SET status=CASE WHEN v.status='approved' THEN 'completed'::public.itr_status ELSE v.status END,
  returned_at=NULL,returned_by=NULL,return_reason=NULL WHERE id=p_itr_id;
RETURN jsonb_build_object('revoked_count',n,'previous_signatures',signatures,'project_id',v.project_id,'tag_id',v.tag_id,'itr_number',v.itr_number);
END $function$;


CREATE OR REPLACE VIEW public.itr_list_v WITH (security_invoker = true) AS
 SELECT i.id, i.project_id, i.itr_number, i.status, i.progress_pct, i.scheduled_date, i.completed_date, i.created_at,
    i.tag_id, i.template_id, i.phase_id, i.subsystem_id,
    t.tag_number, t.description AS tag_description, tp.code AS template_code, tp.title AS template_title,
    d.code AS discipline_code, d.name AS discipline_name, d.color AS discipline_color,
    ph.code AS phase_code, ph.name AS phase_name, ph.color AS phase_color,
    p.org_id, p.name AS project_name, p.code AS project_code,
    ((((((((((i.itr_number || ' '::text) || COALESCE(t.tag_number, ''::text)) || ' '::text) || COALESCE(t.description, ''::text)) || ' '::text) || COALESCE(tp.code, ''::text)) || ' '::text) || COALESCE(tp.title, ''::text)) || ' '::text) || COALESCE(p.name, ''::text)) AS search_text,
    ss.system_id,
    sy.area_id,
    COALESCE((SELECT array_agg(a.user_id) FROM itr_assignments a WHERE a.itr_id = i.id), '{}'::uuid[]) AS assignee_ids,
    i.returned_at,
    i.return_reason,
    (SELECT count(*)::int FROM itr_signatures s WHERE s.itr_id = i.id) AS signatures_done,
    cardinality(i.required_signatures) AS signatures_required
   FROM itrs i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN tags t ON t.id = i.tag_id
     LEFT JOIN itr_templates tp ON tp.id = i.template_id
     LEFT JOIN disciplines d ON d.id = tp.discipline_id
     LEFT JOIN project_phases ph ON ph.id = i.phase_id
     LEFT JOIN subsystems ss ON ss.id = i.subsystem_id
     LEFT JOIN systems sy ON sy.id = ss.system_id;
