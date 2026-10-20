-- fn: public.itr_test_equipment_fill()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.itr_test_equipment_fill()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; eq public.test_equipment; v_role text;
BEGIN
  SELECT i.project_id, p.org_id INTO v_project, v_org FROM itrs i JOIN projects p ON p.id = i.project_id WHERE i.id = NEW.itr_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'ITR no encontrado'; END IF;
  SELECT * INTO eq FROM test_equipment WHERE id = NEW.equipment_id;
  IF NOT FOUND OR eq.org_id <> v_org THEN RAISE EXCEPTION 'El equipo no pertenece a la organización del proyecto'; END IF;
  IF NOT eq.is_active THEN RAISE EXCEPTION 'El equipo % está dado de baja', eq.code; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_role FROM org_members WHERE org_id = v_org AND user_id = auth.uid();
    IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  END IF;
  NEW.project_id := v_project;
  NEW.used_on := public.project_today(v_project);
  NEW.calibrated_on := eq.calibrated_on;
  NEW.calibration_due := eq.calibration_due;
  NEW.certificate_number := eq.certificate_number;
  NEW.snapshot := jsonb_build_object('code', eq.code, 'kind', eq.kind, 'make', eq.make, 'model', eq.model,
    'serial_number', eq.serial_number, 'owner_company', eq.owner_company, 'certificate_path', eq.certificate_path);
  NEW.added_by := auth.uid();
  NEW.added_at := now();
  RETURN NEW;
END;
$function$;
