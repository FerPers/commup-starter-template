-- fn: public.guard_assigned_itr_template()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
