-- C-16 (D9) — Mover un tag de subsistema con su flujo explícito. 2026-10-19.
--
-- D9: importar nunca mueve un tag con ITR o punch (S07). Moverlo es una acción de líder+ con motivo (≥ 10):
--   `move_tag_subsystem` mueve en una transacción el tag, sus ITR sin firmar (itrs.subsystem_id) y sus punches
--   abiertos (punches.subsystem_id), y deja en activity_log el antes/después. Un ITR firmado o aprobado bloquea
--   el movimiento (se lista; se reabre primero con reopen_itr_atomic, auditado). Los punches cerrados o cancelados
--   se quedan como historia del subsistema de origen: no cuentan para readiness ni elegibilidad.
-- `tag_subsystem_move_preview` (invoker, con RLS) devuelve lo que arrastraría: la UI la muestra antes de confirmar
--   y la RPC la usa para decidir y para el registro.
-- `guard_itr_row`: el subsistema de un ITR sigue siendo inmutable por REST; solo lo cambia el dueño de la tabla
--   (la RPC), en el mismo proyecto y nunca sobre un ITR firmado.
-- `guard_tag_subsystem`: por REST, un tag con ITR o punches abiertos no cambia de subsistema (quedarían atrás). La
--   importación (service role) ya no lo mueve (S07).
--
-- Funciones editadas en su archivo canónico (supabase/functions-sql/) y emitidas completas.

-- guard_itr_row  (supabase/functions-sql/guard_itr_row.sql)
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


-- tag_subsystem_move_preview  (supabase/functions-sql/tag_subsystem_move_preview.sql)
CREATE OR REPLACE FUNCTION public.tag_subsystem_move_preview(p_tag_id uuid, p_subsystem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tag public.tags; v_from uuid; v_to_project uuid;
BEGIN
  -- C-16 (D9): qué arrastra mover un tag de subsistema. Invoker: con RLS solo ve tags del propio proyecto.
  -- move_tag_subsystem la usa tal cual para decidir y para el registro en activity_log.
  SELECT * INTO v_tag FROM tags WHERE id = p_tag_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tag no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_from := v_tag.subsystem_id;
  SELECT sy.project_id INTO v_to_project FROM subsystems s JOIN systems sy ON sy.id = s.system_id WHERE s.id = p_subsystem_id;
  IF v_to_project IS DISTINCT FROM v_tag.project_id THEN
    RAISE EXCEPTION 'El subsistema destino no pertenece al proyecto del tag' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'tag_id', v_tag.id,
    'tag_number', v_tag.tag_number,
    'project_id', v_tag.project_id,
    'from', (SELECT jsonb_build_object('subsystem_id', s.id, 'subsystem_code', s.code, 'system_id', sy.id, 'system_code', sy.code, 'boundary_frozen', sy.boundary_frozen_at IS NOT NULL)
               FROM subsystems s JOIN systems sy ON sy.id = s.system_id WHERE s.id = v_from),
    'to', (SELECT jsonb_build_object('subsystem_id', s.id, 'subsystem_code', s.code, 'system_id', sy.id, 'system_code', sy.code, 'boundary_frozen', sy.boundary_frozen_at IS NOT NULL)
             FROM subsystems s JOIN systems sy ON sy.id = s.system_id WHERE s.id = p_subsystem_id),
    'same', v_from = p_subsystem_id,
    -- Firmado o aprobado: bloquea. Se reabre primero (reopen_itr_atomic, auditado) o se queda donde está.
    'signed_itrs', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'itr_number', i.itr_number, 'status', i.status) ORDER BY i.itr_number)
                               FROM itrs i WHERE i.tag_id = p_tag_id
                                 AND (i.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = i.id))), '[]'::jsonb),
    'itrs', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'itr_number', i.itr_number, 'status', i.status) ORDER BY i.itr_number)
                        FROM itrs i WHERE i.tag_id = p_tag_id AND i.subsystem_id IS DISTINCT FROM p_subsystem_id
                          AND i.status <> 'approved' AND NOT EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = i.id)), '[]'::jsonb),
    -- Punches abiertos del tag o de sus ITR. Cerrados y cancelados se quedan: son historia del subsistema
    -- de origen (y no cuentan para readiness ni elegibilidad).
    'punches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'punch_number', p.punch_number, 'category', p.category, 'status', p.status) ORDER BY p.punch_number)
                           FROM punches p WHERE (p.tag_id = p_tag_id OR p.itr_id IN (SELECT id FROM itrs WHERE tag_id = p_tag_id))
                             AND p.status IN ('open', 'in_progress') AND p.subsystem_id IS DISTINCT FROM p_subsystem_id), '[]'::jsonb),
    'punches_kept', (SELECT count(*) FROM punches p WHERE (p.tag_id = p_tag_id OR p.itr_id IN (SELECT id FROM itrs WHERE tag_id = p_tag_id))
                       AND p.status IN ('closed', 'cancelled')),
    -- Certificados vigentes de los dos subsistemas: no bloquean, pero cambia lo que cubren.
    'certificates', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'certificate_number', c.certificate_number, 'status', c.status,
                                                                  'side', CASE WHEN c.subsystem_id = v_from THEN 'from' ELSE 'to' END) ORDER BY c.certificate_number)
                                FROM certificates c WHERE c.subsystem_id IN (v_from, p_subsystem_id) AND c.status IN ('in_review', 'issued')), '[]'::jsonb)
  );
END;
$function$;


-- move_tag_subsystem  (supabase/functions-sql/move_tag_subsystem.sql)
CREATE OR REPLACE FUNCTION public.move_tag_subsystem(p_tag_id uuid, p_subsystem_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tag public.tags; v_org uuid; v_plan jsonb;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_itrs uuid[]; v_punches uuid[];
BEGIN
  -- C-16 (D9): mover un tag con ITR o punch de subsistema es un flujo explícito, no un efecto de importar.
  -- Se mueven juntos el tag, sus ITR sin firmar y sus punches abiertos, para que readiness y elegibilidad
  -- de los dos subsistemas no queden partidas. Un ITR firmado o aprobado bloquea: se reabre primero.
  SELECT * INTO v_tag FROM tags WHERE id = p_tag_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v_tag.project_id) THEN
    RAISE EXCEPTION 'Tag no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_project_editor(v_tag.project_id) THEN
    RAISE EXCEPTION 'Solo un líder o superior mueve un tag de subsistema' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se mueve (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  -- Bloquea los ITR del tag antes de mirar firmas: una firma concurrente espera o hace fallar el movimiento.
  PERFORM 1 FROM itrs WHERE tag_id = p_tag_id FOR UPDATE;
  v_plan := public.tag_subsystem_move_preview(p_tag_id, p_subsystem_id);
  IF (v_plan ->> 'same')::boolean THEN
    RAISE EXCEPTION 'El tag ya está en ese subsistema' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(v_plan -> 'signed_itrs') > 0 THEN
    RAISE EXCEPTION 'Tiene ITR firmados o aprobados (%): reábrelos primero o deja el tag donde está',
      (SELECT string_agg(e ->> 'itr_number', ', ') FROM jsonb_array_elements(v_plan -> 'signed_itrs') e)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg((e ->> 'id')::uuid), '{}') INTO v_itrs FROM jsonb_array_elements(v_plan -> 'itrs') e;
  SELECT COALESCE(array_agg((e ->> 'id')::uuid), '{}') INTO v_punches FROM jsonb_array_elements(v_plan -> 'punches') e;

  UPDATE tags SET subsystem_id = p_subsystem_id WHERE id = p_tag_id;
  UPDATE itrs SET subsystem_id = p_subsystem_id WHERE id = ANY (v_itrs);
  UPDATE punches SET subsystem_id = p_subsystem_id WHERE id = ANY (v_punches);

  SELECT org_id INTO v_org FROM projects WHERE id = v_tag.project_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'tag', p_tag_id, 'subsystem_moved',
          jsonb_build_object('reason', v_reason, 'project_id', v_tag.project_id, 'tag_number', v_tag.tag_number,
                             'from', v_plan -> 'from', 'to', v_plan -> 'to',
                             'itrs', v_plan -> 'itrs', 'punches', v_plan -> 'punches',
                             'punches_kept', v_plan -> 'punches_kept', 'certificates', v_plan -> 'certificates'));

  RETURN jsonb_build_object('itrs_moved', cardinality(v_itrs), 'punches_moved', cardinality(v_punches),
                            'from', v_plan -> 'from', 'to', v_plan -> 'to');
END;
$function$;


-- guard_tag_subsystem  (supabase/functions-sql/guard_tag_subsystem.sql)
CREATE OR REPLACE FUNCTION public.guard_tag_subsystem()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- C-16 (D9): un tag con ITR o punches abiertos cambia de subsistema solo con move_tag_subsystem (dueño de la
  -- tabla), que arrastra lo suyo. Por REST quedarían sus ITR y punches en el subsistema anterior.
  IF NEW.subsystem_id IS DISTINCT FROM OLD.subsystem_id
     AND auth.uid() IS NOT NULL
     AND current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.tags'::regclass))
     AND (EXISTS (SELECT 1 FROM itrs WHERE tag_id = OLD.id)
          OR EXISTS (SELECT 1 FROM punches WHERE tag_id = OLD.id AND status IN ('open', 'in_progress'))) THEN
    RAISE EXCEPTION 'El tag tiene ITR o punches abiertos: muévelo con «Mover de subsistema» (líder+, con motivo)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;


CREATE TRIGGER tags_subsystem_guard BEFORE UPDATE OF subsystem_id ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_tag_subsystem();

REVOKE ALL ON FUNCTION public.tag_subsystem_move_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_subsystem_move_preview(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.move_tag_subsystem(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_tag_subsystem(uuid, uuid, text) TO authenticated, service_role;
