-- fn: public.guard_punch_row()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_punch_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- S06 (A-06/C-11/I-04, D8): cancelar, cambiar la categoría y el seguimiento de Operaciones solo por su RPC.
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Para cancelar un punch usa «Cancelar»: lo hace un supervisor distinto de quien lo levantó, con motivo' USING ERRCODE = '42501';
    END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN
      RAISE EXCEPTION 'La categoría se cambia en la revisión de categoría (supervisor, con motivo)' USING ERRCODE = '42501';
    END IF;
    IF (NEW.post_handover_status, NEW.transferred_at, NEW.transferred_to_user_id, NEW.ops_target_date, NEW.ops_notes)
       IS DISTINCT FROM (OLD.post_handover_status, OLD.transferred_at, OLD.transferred_to_user_id, OLD.ops_target_date, OLD.ops_notes) THEN
      RAISE EXCEPTION 'El seguimiento de Operaciones se registra con su acción' USING ERRCODE = '42501';
    END IF;
    -- En campo (inspector) solo se clasifica: impacto y disposición para el arranque. Lo demás, un supervisor.
    IF NOT public.is_project_editor(OLD.project_id)
       AND (to_jsonb(NEW) - 'impact' - 'startup_disposition') IS DISTINCT FROM (to_jsonb(OLD) - 'impact' - 'startup_disposition') THEN
      RAISE EXCEPTION 'Solo un supervisor edita el punch; en campo puedes comentar, adjuntar fotos y resolverlo' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    NEW.resolved_at := NULL; NEW.resolved_by := NULL; NEW.verified_by := NULL;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category AND NEW.category_reviewed_at IS NOT DISTINCT FROM OLD.category_reviewed_at THEN
    NEW.category_reviewed_at := NULL; NEW.category_reviewed_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
