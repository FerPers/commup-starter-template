-- fn: public.emit_domain_event()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.emit_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agg     text := CASE TG_TABLE_NAME WHEN 'tags' THEN 'tag' WHEN 'itrs' THEN 'itr' WHEN 'punches' THEN 'punch'
                      WHEN 'certificates' THEN 'certificate' WHEN 'systems' THEN 'system' WHEN 'subsystems' THEN 'subsystem'
                      WHEN 'signals' THEN 'signal' WHEN 'loops' THEN 'loop' ELSE TG_TABLE_NAME END;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_id      uuid;
  v_project uuid;
  v_org     uuid;
  v_changed text[];
  v_events  jsonb := '[]'::jsonb;
  v_prev    text;
  v_next    text;
  v_type    text;
  v_ops     text;
  v_service boolean := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  v_headers jsonb := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ctx     jsonb;
BEGIN
  -- S21 (B-03): import masivo. Solo el service role puede pedirlo (un usuario no puede ocultar sus cambios de la
  -- auditoría); la acción emite un evento de resumen.
  IF v_service AND COALESCE(v_headers ->> 'x-commup-bulk', '') <> '' THEN
    RETURN NULL;
  END IF;
  -- A04: la BD es el único productor de estos eventos. La API v1 (service role) declara su origen y su llave por
  -- cabecera y viaja en `payload.context`; un usuario no puede fingirlo.
  IF v_service AND COALESCE(v_headers ->> 'x-commup-source', '') <> '' THEN
    v_ctx := jsonb_strip_nulls(jsonb_build_object('source', v_headers ->> 'x-commup-source', 'api_key_id', NULLIF(v_headers ->> 'x-commup-key-id', '')));
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row     := COALESCE(v_new, v_old);
  v_id      := (v_row ->> 'id')::uuid;
  v_project := (v_row ->> 'project_id')::uuid;

  -- signals no tiene project_id: por su lazo o su tag.
  IF v_project IS NULL AND TG_TABLE_NAME = 'signals' THEN
    SELECT l.project_id INTO v_project FROM loops l WHERE l.id = (v_row ->> 'loop_id')::uuid;
    IF v_project IS NULL THEN
      SELECT t.project_id INTO v_project FROM tags t WHERE t.id = (v_row ->> 'tag_id')::uuid;
    END IF;
  END IF;
  IF v_project IS NULL THEN RETURN NULL; END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = v_project;
  IF v_org IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.created', 'p', jsonb_build_object('new', v_new)));
    IF v_agg = 'punch' AND v_new ->> 'assigned_to' IS NOT NULL THEN
      v_type := 'punch.assigned';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.deleted', 'p', jsonb_build_object('old', v_old)));
  ELSE
    -- I-17: el autosave del ITR solo mueve progress_pct; eso no es un evento.
    SELECT array_agg(k ORDER BY k) INTO v_changed
    FROM jsonb_object_keys(v_new) k
    WHERE v_new -> k IS DISTINCT FROM v_old -> k AND k NOT IN ('updated_at', 'progress_pct');
    IF v_changed IS NULL THEN RETURN NULL; END IF;

    v_events := jsonb_build_array(jsonb_build_object('t', v_agg || '.updated', 'p', jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'old', (SELECT jsonb_object_agg(k, v_old -> k) FROM unnest(v_changed) k),
      'new', v_new)));

    v_prev := v_old ->> 'status';
    v_next := v_new ->> 'status';
    IF v_prev IS DISTINCT FROM v_next THEN
      v_type := CASE v_agg
        WHEN 'itr' THEN CASE v_next WHEN 'completed' THEN 'itr.completed' WHEN 'approved' THEN 'itr.approved'
                                    WHEN 'rejected' THEN 'itr.rejected'
                                    ELSE CASE v_prev WHEN 'approved' THEN 'itr.reopened' WHEN 'completed' THEN 'itr.returned' END END
        WHEN 'punch' THEN CASE v_next WHEN 'closed' THEN 'punch.closed' WHEN 'cancelled' THEN 'punch.cancelled'
                                      ELSE CASE WHEN v_prev IN ('closed', 'cancelled') THEN 'punch.reopened' END END
        WHEN 'certificate' THEN CASE v_next WHEN 'issued' THEN 'certificate.issued' WHEN 'rejected' THEN 'certificate.rejected'
                                            ELSE CASE WHEN v_prev = 'issued' THEN 'certificate.revoked' END END
      END;
    END IF;
    IF v_type IS NULL AND v_agg = 'punch' AND v_new ->> 'assigned_to' IS NOT NULL
       AND v_new -> 'assigned_to' IS DISTINCT FROM v_old -> 'assigned_to' THEN
      v_type := 'punch.assigned';
    END IF;
    -- A04: seguimiento en Operaciones (transfer_punch_to_ops / update_punch_ops_status), venga de la app o de la API.
    IF v_agg = 'punch' AND v_new -> 'post_handover_status' IS DISTINCT FROM v_old -> 'post_handover_status' THEN
      v_ops := CASE v_new ->> 'post_handover_status' WHEN 'transferred_to_ops' THEN 'punch.transferred_to_ops'
                                                     WHEN 'closed_final' THEN 'punch.ops_closed' ELSE 'punch.ops_updated' END;
      v_events := v_events || jsonb_build_array(jsonb_build_object('t', v_ops, 'p', jsonb_strip_nulls(jsonb_build_object(
        'id', v_id, 'project_id', v_project, 'number', v_new ->> 'punch_number', 'tag_id', v_new ->> 'tag_id',
        'status', v_new ->> 'post_handover_status', 'previous_status', COALESCE(v_old ->> 'post_handover_status', 'active'),
        'transferred_to', v_new ->> 'transferred_to_user_id', 'ops_target_date', v_new ->> 'ops_target_date',
        'notes', v_new ->> 'ops_notes'))));
    END IF;
  END IF;

  IF v_type IS NOT NULL THEN
    v_events := v_events || jsonb_build_array(jsonb_build_object('t', v_type, 'p', jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'project_id', v_project,
      'number', COALESCE(v_new ->> 'itr_number', v_new ->> 'punch_number', v_new ->> 'certificate_number'),
      'status', v_next, 'previous_status', v_prev,
      'subsystem_id', v_new ->> 'subsystem_id', 'tag_id', v_new ->> 'tag_id', 'phase_id', v_new ->> 'phase_id',
      'category', v_new ->> 'category', 'assigned_to', v_new ->> 'assigned_to'))));
  END IF;

  INSERT INTO domain_events (org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id)
  SELECT v_org, v_project, v_agg, v_id, e ->> 't',
         CASE WHEN v_ctx IS NULL THEN e -> 'p' ELSE (e -> 'p') || jsonb_build_object('context', v_ctx) END, auth.uid()
  FROM jsonb_array_elements(v_events) e;
  RETURN NULL;
END;
$function$;
