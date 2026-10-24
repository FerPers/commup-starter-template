-- A44 parte (ola 1): el ITR guarda los datos del tag con los que se probó, en la primera firma.
--
-- La ficha del ITR y su PDF leían el bloque «Datos del tag» (fabricante, modelo, serie, rango, hoja de datos, P&ID,
-- caja de conexiones) EN VIVO: editar el tag después cambiaba lo que muestra un ITR ya firmado. Ahora:
--   - itrs.tag_snapshot / tag_snapshot_at: los escribe sign_itr_atomic en la primera firma, en la misma transacción
--     (una reapertura borra las firmas y la siguiente primera firma la renueva); guard_itr_row impide escribirlos
--     de otra forma y un ITR nace sin foto;
--   - itr_tag_snapshot(tag) arma la foto (solo la usan funciones internas).
-- Los ITR ya firmados quedan sin foto: no se sabe con qué datos se firmaron, y no se inventa (siguen en vivo).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.itrs
  ADD COLUMN IF NOT EXISTS tag_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS tag_snapshot_at timestamptz;
COMMENT ON COLUMN public.itrs.tag_snapshot IS 'A44: datos del tag al firmar por primera vez (sign_itr_atomic). NULL = sin firmar o firmado antes de A44.';

CREATE OR REPLACE FUNCTION public.itr_tag_snapshot(p_tag_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'tag_number', t.tag_number, 'description', t.description, 'manufacturer', t.manufacturer, 'model', t.model,
    'serial_number', t.serial_number, 'datasheet_number', t.datasheet_number, 'revision', t.revision,
    'pid_drawing', t.pid_drawing, 'range_min', t.range_min, 'range_max', t.range_max, 'eng_unit', t.eng_unit,
    'junction_box', t.junction_box)
  FROM tags t WHERE t.id = p_tag_id
$fn$;
REVOKE ALL ON FUNCTION public.itr_tag_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.itr_tag_snapshot(uuid) TO service_role;

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
END IF;
IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
RETURN NEW;
END $function$;

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
  tag_snapshot_at=CASE WHEN first_sig THEN now() ELSE tag_snapshot_at END
WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;

