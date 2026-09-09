-- Corrige guard_assigned_itr_template para el borrado en cascada.
--
-- Al borrar una plantilla, PostgreSQL elimina primero la fila de itr_templates
-- y después dispara los BEFORE DELETE de secciones/ítems por la FK ON DELETE
-- CASCADE. En ese punto la plantilla ya no existe y la comprobación de
-- membresía (JOIN itr_templates) fallaba con «Template editor membership
-- required», haciendo imposible borrar cualquier plantilla con contenido
-- (borradores de revisión incluidos). La autorización del borrado ya se
-- verificó en el trigger de itr_templates; en cascada solo hay que dejar pasar.

CREATE OR REPLACE FUNCTION public.guard_assigned_itr_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid;
BEGIN
  IF TG_TABLE_NAME='itr_templates' THEN tid:=OLD.id;
  ELSE
    tid:=CASE WHEN TG_OP='DELETE' THEN OLD.template_id ELSE NEW.template_id END;
    IF TG_OP='UPDATE' AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN RAISE EXCEPTION 'Cannot move template content'; END IF;
    -- Cascade from a template delete already authorised by the itr_templates trigger.
    IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=tid) THEN RETURN OLD; END IF;
  END IF;
  PERFORM 1 FROM public.itr_templates WHERE id=tid FOR UPDATE;
  IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.itr_templates t JOIN public.org_members m ON m.org_id=t.org_id WHERE t.id=tid AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','architect','leader')) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;
  IF EXISTS(SELECT 1 FROM public.itrs WHERE template_id=tid) THEN
    IF TG_TABLE_NAME='itr_templates' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'is_active')=(to_jsonb(OLD)-'is_active') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Assigned revision is immutable; publish a new revision';
  END IF;
  IF TG_TABLE_NAME='itr_template_items' AND TG_OP<>'DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM public.itr_template_sections WHERE id=NEW.section_id AND template_id=NEW.template_id) THEN RAISE EXCEPTION 'Section revision mismatch'; END IF;
    IF NEW.condition_item_id IS NOT NULL AND (NEW.condition_item_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.itr_template_items WHERE id=NEW.condition_item_id AND template_id=NEW.template_id)) THEN RAISE EXCEPTION 'Condition revision mismatch'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
