-- A39 código (ola 1): el ITR congela al crearse si exige equipo de prueba, como ya congela sus firmas (S04).
--
-- Antes la firma (sign_itr_atomic → itr_test_equipment_blocker) leía `requires_test_equipment` de la PLANTILLA en
-- vivo: cambiar la plantilla (p. ej. los 27 códigos que dejaron de exigir equipo) cambiaba la regla de ITR ya
-- creados, en curso o por firmar. Ahora:
--   - itrs.requires_test_equipment lo fija guard_itr_row al insertar (lo que mande el cliente se ignora) y solo lo
--     cambia el dueño de la tabla;
--   - itr_test_equipment_blocker lee el valor del ITR.
-- Relleno: los ITR existentes toman el valor actual de su plantilla (lo que regía hasta hoy), con los triggers
-- apagados (no es un cambio de negocio: sin eventos, sin marcas de gates ni guards de ITR firmados).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.itrs ADD COLUMN IF NOT EXISTS requires_test_equipment boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.itrs.requires_test_equipment IS 'A39: congelado al crear el ITR desde la plantilla (guard_itr_row); la firma exige equipo de prueba si es true.';

ALTER TABLE public.itrs DISABLE TRIGGER USER;
UPDATE public.itrs i SET requires_test_equipment = true
  FROM public.itr_templates t
 WHERE t.id = i.template_id AND t.requires_test_equipment AND NOT i.requires_test_equipment;
ALTER TABLE public.itrs ENABLE TRIGGER USER;

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
END IF;
IF NOT trusted AND NEW.status='approved' THEN RAISE EXCEPTION 'Approval requires atomic signing'; END IF;
RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.itr_test_equipment_blocker(p_itr_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM itr_test_equipment u WHERE u.itr_id = p_itr_id
        AND NOT (u.used_on BETWEEN u.calibrated_on AND u.calibration_due))
      THEN 'Equipo de prueba fuera de calibración en la fecha de uso: '
        || (SELECT string_agg(u.snapshot->>'code', ', ') FROM itr_test_equipment u
            WHERE u.itr_id = p_itr_id AND NOT (u.used_on BETWEEN u.calibrated_on AND u.calibration_due))
        || '. Reemplázalo antes de firmar.'
    -- A39: el requisito congelado en el ITR, no el de la plantilla en vivo.
    WHEN (SELECT i.requires_test_equipment FROM itrs i WHERE i.id = p_itr_id)
      AND NOT EXISTS (SELECT 1 FROM itr_test_equipment u WHERE u.itr_id = p_itr_id)
      THEN 'Registra el equipo de prueba usado (con su calibración) antes de firmar.'
  END;
$fn$;
-- A-19: interna (la llama sign_itr_atomic, SECURITY DEFINER); un miembro no la ejecuta directo.
REVOKE ALL ON FUNCTION public.itr_test_equipment_blocker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.itr_test_equipment_blocker(uuid) TO service_role;
