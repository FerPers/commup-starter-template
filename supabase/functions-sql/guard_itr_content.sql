-- fn: public.guard_itr_content()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
