-- fn: public.tag_subsystem_move_preview(uuid, uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
