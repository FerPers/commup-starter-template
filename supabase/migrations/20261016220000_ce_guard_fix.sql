-- Fase 4-D: corrige ce_guard. PL/pgSQL no garantiza cortocircuito en AND: la condición
-- `TG_TABLE_NAME = 'ce_causes' AND NEW.signal_id …` evaluaba NEW.signal_id también en ce_effects
-- (que no tiene esa columna) y toda inserción de efectos fallaba con 42703. Se anida el IF.
CREATE OR REPLACE FUNCTION public.ce_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE v_project uuid; v_matrix_c uuid; v_matrix_e uuid;
BEGIN
  IF TG_TABLE_NAME = 'ce_matrices' THEN
    SELECT org_id INTO NEW.org_id FROM projects WHERE id = NEW.project_id;
    IF NEW.org_id IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado'; END IF;
    IF NEW.system_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM systems WHERE id = NEW.system_id AND project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'El sistema no pertenece al proyecto';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN RAISE EXCEPTION 'La matriz no cambia de proyecto'; END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('ce_causes', 'ce_effects') THEN
    SELECT project_id INTO v_project FROM ce_matrices WHERE id = NEW.matrix_id;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Matriz no encontrada'; END IF;
    IF TG_OP = 'UPDATE' AND NEW.matrix_id IS DISTINCT FROM OLD.matrix_id THEN RAISE EXCEPTION 'No se mueve entre matrices'; END IF;
    NEW.project_id := v_project;
    IF NEW.tag_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = NEW.tag_id AND project_id = v_project) THEN
      RAISE EXCEPTION 'El tag no pertenece al proyecto';
    END IF;
    IF TG_TABLE_NAME = 'ce_causes' THEN
      IF NEW.signal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM signals s JOIN tags t ON t.id = s.tag_id WHERE s.id = NEW.signal_id AND t.project_id = v_project) THEN
        RAISE EXCEPTION 'La señal no pertenece al proyecto';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- ce_links
  SELECT matrix_id, project_id INTO v_matrix_c, v_project FROM ce_causes WHERE id = NEW.cause_id;
  SELECT matrix_id INTO v_matrix_e FROM ce_effects WHERE id = NEW.effect_id;
  IF v_matrix_c IS NULL OR v_matrix_e IS NULL OR v_matrix_c <> v_matrix_e THEN RAISE EXCEPTION 'Causa y efecto deben ser de la misma matriz'; END IF;
  NEW.project_id := v_project;
  RETURN NEW;
END;
$fn$;
