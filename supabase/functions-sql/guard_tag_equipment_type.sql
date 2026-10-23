-- fn: public.guard_tag_equipment_type()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_tag_equipment_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.equipment_type_id IS NOT DISTINCT FROM OLD.equipment_type_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = NEW.project_id;
  IF NEW.equipment_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM equipment_types e WHERE e.id = NEW.equipment_type_id AND e.org_id = v_org) THEN
    RAISE EXCEPTION 'equipment_type_other_org' USING ERRCODE = '42501';
  END IF;
  -- R3: cambiar el tipo cambia los ITR requeridos; con usuario, solo Propietario, Administrador o Arquitecto.
  IF TG_OP = 'UPDATE' AND NEW.equipment_type_id IS DISTINCT FROM OLD.equipment_type_id
     AND auth.uid() IS NOT NULL AND NOT public.is_org_privileged(v_org) THEN
    RAISE EXCEPTION 'Solo un propietario, administrador o arquitecto cambia el tipo de equipo' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
