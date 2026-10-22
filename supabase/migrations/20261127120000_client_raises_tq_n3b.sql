-- N3b (decisión de Luis 2026-10-22): el rol client (la operadora) también levanta TQ desde ＋ Crear.
-- Antes solo las respondía. Sobre los TQ que levantó puede además editarlos (borrador o emitido, con las mismas
-- reglas), emitirlos, reemitirlos si la respuesta no basta, cerrarlos y borrar el borrador. Cancelar sigue siendo
-- de líder+ y los TQ de otros siguen sin cambios para él. Cuerpos completos, copiados de la definición vigente en prod,
-- con solo el chequeo de rol cambiado.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tq(p_project_id uuid, p_subject text, p_question text, p_addressed_to text DEFAULT 'engineering'::text, p_addressed_to_name text DEFAULT NULL::text, p_discipline_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_required_by date DEFAULT NULL::date, p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  -- N3b: también el cliente (la operadora) levanta TQ.
  IF v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_subject, 200) IS NULL OR public.mgmt_text(p_question, 8000) IS NULL THEN
    RAISE EXCEPTION 'Asunto y pregunta son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL, NULL, p_discipline_id);

  v_seq := public.mgmt_next_seq('technical_queries', p_project_id);
  INSERT INTO technical_queries (org_id, project_id, seq, number, subject, question, discipline_id, system_id,
                                 addressed_to, addressed_to_name, required_by, raised_by)
  VALUES (v_org, p_project_id, v_seq, 'TQ-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_subject, 200),
          public.mgmt_text(p_question, 8000), p_discipline_id, p_system_id, COALESCE(p_addressed_to, 'engineering'),
          public.mgmt_text(p_addressed_to_name, 200), p_required_by, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.tq_set_tags(v_id, p_project_id, COALESCE(p_tag_ids, '{}'::uuid[]));
  PERFORM public.mgmt_log(v_org, p_project_id, 'tq', v_id, 'created', NULL, 'draft');
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tq(p_tq_id uuid, p_subject text, p_question text, p_addressed_to text, p_addressed_to_name text, p_discipline_id uuid, p_system_id uuid, p_required_by date, p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_t technical_queries%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_t FROM technical_queries WHERE id = p_tq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TQ no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_t.project_id);
  -- N3b: el cliente edita solo los TQ que levantó.
  IF v_role IS NULL OR (v_role = 'client' AND v_t.raised_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_t.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'El % ya fue respondido o cerrado y no se puede editar', v_t.number USING ERRCODE = 'P0001';
  END IF;
  IF v_t.status = 'issued' AND (public.mgmt_text(p_subject, 200) IS DISTINCT FROM v_t.subject
                                OR public.mgmt_text(p_question, 8000) IS DISTINCT FROM v_t.question) THEN
    RAISE EXCEPTION 'El asunto y la pregunta de un TQ emitido no se pueden cambiar' USING ERRCODE = 'P0001';
  END IF;
  IF public.mgmt_text(p_subject, 200) IS NULL OR public.mgmt_text(p_question, 8000) IS NULL THEN
    RAISE EXCEPTION 'Asunto y pregunta son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(v_t.project_id, v_t.org_id, p_system_id, NULL, NULL, p_discipline_id);

  UPDATE technical_queries SET subject = public.mgmt_text(p_subject, 200), question = public.mgmt_text(p_question, 8000),
         addressed_to = p_addressed_to, addressed_to_name = public.mgmt_text(p_addressed_to_name, 200),
         discipline_id = p_discipline_id, system_id = p_system_id, required_by = p_required_by, updated_at = now()
   WHERE id = p_tq_id;
  PERFORM public.tq_set_tags(p_tq_id, v_t.project_id, p_tag_ids);
  PERFORM public.mgmt_log(v_t.org_id, v_t.project_id, 'tq', p_tq_id, 'updated');
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_tq(p_tq_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_t technical_queries%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text;
BEGIN
  SELECT * INTO v_t FROM technical_queries WHERE id = p_tq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TQ no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_t.project_id);
  -- N3b: el cliente emite, reemite o cierra solo los TQ que levantó (cancelar sigue siendo de líder+).
  IF v_uid IS NULL OR v_role IS NULL OR (v_role = 'client' AND v_t.raised_by IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_t.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El % ya está cerrado', v_t.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar TQ', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE technical_queries SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_tq_id;
  ELSIF v_t.status = 'draft' AND p_to = 'issued' THEN
    UPDATE technical_queries SET status = 'issued', issued_by = v_uid, issued_at = now(), updated_at = now() WHERE id = p_tq_id;
  ELSIF v_t.status = 'answered' AND p_to = 'issued' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué la respuesta no es suficiente' USING ERRCODE = '22023'; END IF;
    UPDATE technical_queries SET status = 'issued', updated_at = now() WHERE id = p_tq_id;
  ELSIF v_t.status = 'answered' AND p_to = 'closed' THEN
    UPDATE technical_queries SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now() WHERE id = p_tq_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_t.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_t.org_id, v_t.project_id, 'tq', p_tq_id, 'transition', v_t.status, p_to, v_comment);
  RETURN p_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_mgmt_item(p_entity_kind text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_creator uuid; v_ok boolean; v_role text;
BEGIN
  IF p_entity_kind = 'action' THEN
    SELECT project_id, created_by, status = 'open' AND source_kind <> 'pssr'
      INTO v_project, v_creator, v_ok FROM actions WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_kind = 'constraint' THEN
    SELECT c.project_id, c.created_by,
           c.status = 'open' AND c.escalation_level = 1
           AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.source_kind = 'constraint' AND a.source_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.source_kind = 'constraint' AND d.source_id = c.id)
      INTO v_project, v_creator, v_ok FROM project_constraints c WHERE c.id = p_entity_id FOR UPDATE;
  ELSIF p_entity_kind = 'tq' THEN
    SELECT project_id, raised_by, status = 'draft'
      INTO v_project, v_creator, v_ok FROM technical_queries WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Este tipo no se puede borrar' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_project);
  -- N3b: el cliente borra solo sus borradores de TQ.
  IF v_role IS NULL OR (v_role = 'client' AND p_entity_kind <> 'tq') OR NOT (v_creator = auth.uid() OR v_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT v_ok OR EXISTS (SELECT 1 FROM mgmt_attachments WHERE entity_kind = p_entity_kind AND entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Solo se borran borradores sin historia; cancela el registro en su lugar' USING ERRCODE = 'P0001';
  END IF;

  IF p_entity_kind = 'action' THEN DELETE FROM actions WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'constraint' THEN DELETE FROM project_constraints WHERE id = p_entity_id;
  ELSE DELETE FROM technical_queries WHERE id = p_entity_id;
  END IF;
  DELETE FROM mgmt_events WHERE entity_kind = p_entity_kind AND entity_id = p_entity_id;
END;
$function$;

COMMIT;
