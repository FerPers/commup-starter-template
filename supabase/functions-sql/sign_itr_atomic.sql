-- fn: public.sign_itr_atomic(uuid, text, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
-- S05 (C-26): el trazo es un PNG en base64 de hasta ~256 KB (igual que el certificado).
IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 350000) THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
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
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=public.project_today(v.project_id) WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;
