-- fn: public.guard_itr_row()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
