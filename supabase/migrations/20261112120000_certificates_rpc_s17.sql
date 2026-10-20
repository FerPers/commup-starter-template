-- S17 (revisión integral 2026-10-19): certificados por RPC.
--   A-05 / C-13 / I-06  emitir, firmar, revocar y reabrir solo por RPC SECURITY DEFINER con la elegibilidad en SQL
--                       (= src/lib/certificates/eligibility.ts); firmas propias, una por rol y una persona por rol
--                       (D6), por capacidad (S14): completion = commissioning, client = client_rep (D15),
--                       authority = operations; reabrir vuelve a evaluar; exige el certificado de la fase anterior.
--   C-13                el certificado emitido queda bloqueado (is_blocked + block_reason) si cambia la base
--                       (Cat A nuevo, ITR de la fase sin aprobar, Cat B sin excepción) y se desbloquea solo.
--   B-14 / C-33         número atómico (advisory lock por base) sin LIKE ambiguo; excepciones Cat B en la misma
--                       transacción.
-- Decisiones de Luis (2026-10-20): D15 = client_rep; autoridad = Operaciones; invalidación por bloqueo con motivo;
-- se exige el certificado de la fase anterior del mismo subsistema.

-- ── 1. RLS: sin escritura directa ────────────────────────────────────────
DROP POLICY IF EXISTS certificates_update ON public.certificates;
DROP POLICY IF EXISTS certificates_insert ON public.certificates;
DROP POLICY IF EXISTS certificates_delete ON public.certificates;
CREATE POLICY certificates_delete ON public.certificates FOR DELETE
  USING (public.is_project_editor(project_id) AND status IN ('pending', 'rejected'));
REVOKE INSERT, UPDATE ON public.certificates FROM anon, authenticated;
DROP POLICY IF EXISTS cert_sig_insert_editors ON public.certificate_signatures;
DROP POLICY IF EXISTS cert_sig_delete_editors ON public.certificate_signatures;
REVOKE INSERT, UPDATE, DELETE ON public.certificate_signatures FROM anon, authenticated;
DROP POLICY IF EXISTS cert_punch_exceptions_insert ON public.certificate_punch_exceptions;
DROP POLICY IF EXISTS cert_punch_exceptions_delete ON public.certificate_punch_exceptions;
REVOKE INSERT, UPDATE, DELETE ON public.certificate_punch_exceptions FROM anon, authenticated;

-- ── 2. Elegibilidad en SQL (= evaluateEligibility / issuanceBlocker) ─────
CREATE OR REPLACE FUNCTION public.certificate_eligibility(p_subsystem_id uuid, p_phase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_org uuid; v_total int; v_approved int; v_cat_a int; v_cat_b jsonb; v_nb int; v_limit int; v_settings jsonb; v_level text;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org FROM subsystems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_subsystem_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Subsistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_project) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT count(*), count(*) FILTER (WHERE status = 'approved') INTO v_total, v_approved
  FROM itrs WHERE subsystem_id = p_subsystem_id AND phase_id = p_phase_id;
  SELECT count(*) FILTER (WHERE category = 'A'),
         COALESCE(jsonb_agg(jsonb_build_object('id', id, 'punch_number', punch_number, 'description', description) ORDER BY punch_number)
                  FILTER (WHERE category = 'B'), '[]'::jsonb)
    INTO v_cat_a, v_cat_b
  FROM punches WHERE subsystem_id = p_subsystem_id AND status IN ('open', 'in_progress');
  v_nb := jsonb_array_length(v_cat_b);
  SELECT settings INTO v_settings FROM organizations WHERE id = v_org;
  -- Límite Cat B: ausente = 3; null = sin límite (= resolveCatBLimit).
  v_limit := CASE WHEN v_settings IS NULL OR NOT (v_settings ? 'max_open_cat_b_per_subsystem') THEN 3
                  WHEN jsonb_typeof(v_settings -> 'max_open_cat_b_per_subsystem') = 'number'
                    THEN greatest(0, trunc((v_settings ->> 'max_open_cat_b_per_subsystem')::numeric)::int)
                  ELSE NULL END;
  v_level := CASE WHEN v_cat_a > 0 OR v_total = 0 OR v_approved < v_total OR (v_limit IS NOT NULL AND v_nb > v_limit) THEN 'red'
                  WHEN v_nb > 0 THEN 'yellow' ELSE 'green' END;
  RETURN jsonb_build_object('eligible', v_level, 'totalItrs', v_total, 'approvedItrs', v_approved, 'openCatA', v_cat_a,
    'openCatBPunches', v_cat_b, 'catBLimit', v_limit, 'catBOverLimit', v_limit IS NOT NULL AND v_nb > v_limit);
END;
$fn$;

-- Motivo por el que el certificado no procede con esas excepciones (= issuanceBlocker), o NULL.
CREATE OR REPLACE FUNCTION public.certificate_blocker(p_subsystem_id uuid, p_phase_id uuid, p_justified uuid[])
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE e jsonb := public.certificate_eligibility(p_subsystem_id, p_phase_id); v_missing int;
BEGIN
  IF (e ->> 'openCatA')::int > 0 THEN RETURN 'Hay ' || (e ->> 'openCatA') || ' punch(es) Cat A abiertos — deben cerrarse antes de emitir'; END IF;
  IF (e ->> 'totalItrs')::int = 0 THEN RETURN 'No hay ITRs asignados en esta fase para el subsistema'; END IF;
  IF (e ->> 'approvedItrs')::int < (e ->> 'totalItrs')::int THEN
    RETURN 'Faltan ' || ((e ->> 'totalItrs')::int - (e ->> 'approvedItrs')::int) || ' ITR(s) por aprobar';
  END IF;
  IF (e ->> 'catBOverLimit')::boolean THEN
    RETURN 'Hay ' || jsonb_array_length(e -> 'openCatBPunches') || ' punch(es) Cat B abiertos; el máximo por subsistema es ' || (e ->> 'catBLimit');
  END IF;
  SELECT count(*) INTO v_missing FROM jsonb_array_elements(e -> 'openCatBPunches') b
   WHERE NOT ((b ->> 'id')::uuid = ANY (COALESCE(p_justified, '{}'::uuid[])));
  IF v_missing > 0 THEN RETURN 'Deben justificarse todos los punches Cat B abiertos (' || v_missing || ' sin justificación)'; END IF;
  RETURN NULL;
END;
$fn$;

-- Fase anterior con certificado (por orden) y si el subsistema la tiene emitida y sin bloqueo.
CREATE OR REPLACE FUNCTION public.certificate_previous_blocker(p_subsystem_id uuid, p_phase_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH cur AS (SELECT org_id, order_index FROM project_phases WHERE id = p_phase_id),
  prev AS (
    SELECT p.id, COALESCE(p.certificate_name, p.code) AS label FROM project_phases p, cur
    WHERE p.org_id = cur.org_id AND p.order_index < cur.order_index AND p.certificate_name IS NOT NULL
    ORDER BY p.order_index DESC LIMIT 1)
  SELECT 'Falta el ' || prev.label || ' del subsistema (emitido y sin bloqueo) antes de emitir este certificado'
  FROM prev
  WHERE NOT EXISTS (SELECT 1 FROM certificates c WHERE c.subsystem_id = p_subsystem_id AND c.phase_id = prev.id
                      AND c.status = 'issued' AND NOT c.is_blocked);
$fn$;

-- Recalcula el bloqueo de un certificado emitido de subsistema; registra el cambio en activity_log.
CREATE OR REPLACE FUNCTION public.refresh_certificate_block(p_certificate_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c certificates%ROWTYPE; v_reason text; v_org uuid;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'issued' OR c.subsystem_id IS NULL THEN RETURN; END IF;
  v_reason := public.certificate_blocker(c.subsystem_id, c.phase_id,
                ARRAY(SELECT punch_id FROM certificate_punch_exceptions WHERE certificate_id = c.id));
  IF (v_reason IS NOT NULL) IS DISTINCT FROM c.is_blocked OR v_reason IS DISTINCT FROM c.block_reason THEN
    UPDATE certificates SET is_blocked = v_reason IS NOT NULL, block_reason = v_reason WHERE id = c.id;
    -- activity_log exige usuario: los cambios por service role (cron, API) quedan solo en el certificado.
    IF (v_reason IS NOT NULL) IS DISTINCT FROM c.is_blocked AND auth.uid() IS NOT NULL THEN
      SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
      INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
      VALUES (v_org, auth.uid(), 'certificate', c.id,
              CASE WHEN v_reason IS NOT NULL THEN 'blocked' ELSE 'unblocked' END,
              jsonb_build_object('reason', v_reason, 'certNumber', c.certificate_number));
    END IF;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.refresh_certificates_for(p_subsystem_id uuid, p_phase_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_subsystem_id IS NULL THEN RETURN; END IF;
  FOR v_id IN SELECT id FROM certificates
              WHERE subsystem_id = p_subsystem_id AND status = 'issued' AND (p_phase_id IS NULL OR phase_id = p_phase_id) LOOP
    PERFORM public.refresh_certificate_block(v_id);
  END LOOP;
END;
$fn$;

-- Triggers: la base cambió (punch, ITR, excepción) → recalcular los certificados afectados.
CREATE OR REPLACE FUNCTION public.trg_certificate_base_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'punches' THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.category IS NOT DISTINCT FROM OLD.category
       AND NEW.subsystem_id IS NOT DISTINCT FROM OLD.subsystem_id THEN RETURN NULL; END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM public.refresh_certificates_for(OLD.subsystem_id); END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.subsystem_id IS DISTINCT FROM OLD.subsystem_id) THEN
      PERFORM public.refresh_certificates_for(NEW.subsystem_id);
    ELSIF TG_OP = 'UPDATE' AND OLD.subsystem_id IS NULL THEN
      PERFORM public.refresh_certificates_for(NEW.subsystem_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'itrs' THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.subsystem_id IS NOT DISTINCT FROM OLD.subsystem_id
       AND NEW.phase_id IS NOT DISTINCT FROM OLD.phase_id THEN RETURN NULL; END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM public.refresh_certificates_for(OLD.subsystem_id, OLD.phase_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.refresh_certificates_for(NEW.subsystem_id, NEW.phase_id); END IF;
  ELSE -- certificate_punch_exceptions
    PERFORM public.refresh_certificate_block(COALESCE(NEW.certificate_id, OLD.certificate_id));
  END IF;
  RETURN NULL;
END;
$fn$;
CREATE TRIGGER punches_certificate_base AFTER INSERT OR UPDATE OF status, category, subsystem_id OR DELETE ON public.punches
  FOR EACH ROW EXECUTE FUNCTION public.trg_certificate_base_changed();
CREATE TRIGGER itrs_certificate_base AFTER INSERT OR UPDATE OF status, subsystem_id, phase_id OR DELETE ON public.itrs
  FOR EACH ROW EXECUTE FUNCTION public.trg_certificate_base_changed();
CREATE TRIGGER cert_exceptions_certificate_base AFTER INSERT OR DELETE ON public.certificate_punch_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_certificate_base_changed();

-- ── 3. RPC ───────────────────────────────────────────────────────────────
-- Capacidad que firma cada rol del certificado (decisión 2026-10-20). = CERT_ROLE_CAPACITY en TS.
CREATE OR REPLACE FUNCTION public.certificate_role_capacity(p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_role WHEN 'completion' THEN 'commissioning' WHEN 'client' THEN 'client_rep' WHEN 'authority' THEN 'operations' END;
$fn$;

-- Emitir: líder+ con capacidad de Comisionamiento; elegibilidad, fase anterior, número atómico y excepciones.
CREATE OR REPLACE FUNCTION public.issue_certificate(p_subsystem_id uuid, p_phase_id uuid, p_notes text DEFAULT NULL, p_exceptions jsonb DEFAULT '[]')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s subsystems%ROWTYPE; ph project_phases%ROWTYPE; v_org uuid; v_role text; v_block text; v_base text; v_n int; v_number text;
        v_id uuid; v_just uuid[]; e jsonb; v_el jsonb;
BEGIN
  SELECT * INTO s FROM subsystems WHERE id = p_subsystem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subsistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = s.project_id;
  SELECT * INTO ph FROM project_phases WHERE id = p_phase_id AND org_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fase no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores emiten certificados' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_capacity(s.project_id, 'commissioning') THEN
    RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501';
  END IF;
  -- Excepciones válidas: Cat B abiertos del subsistema con justificación (= acceptedExceptions).
  v_el := public.certificate_eligibility(s.id, ph.id);
  SELECT array_agg((x ->> 'punch_id')::uuid) INTO v_just
  FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) x
  WHERE length(btrim(COALESCE(x ->> 'justification', ''))) > 0
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_el -> 'openCatBPunches') b WHERE b ->> 'id' = x ->> 'punch_id');
  v_block := public.certificate_blocker(s.id, ph.id, v_just);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  v_block := public.certificate_previous_blocker(s.id, ph.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM certificates WHERE subsystem_id = s.id AND phase_id = ph.id AND status = 'issued') THEN
    RAISE EXCEPTION 'El subsistema ya tiene un certificado emitido en esta fase' USING ERRCODE = '23505';
  END IF;
  -- Número: <tipo>/<subsistema>, reemisiones -R<n> (= buildCertificateNumber), serializado por base.
  v_base := COALESCE(ph.certificate_name, ph.code) || '/' || s.code;
  PERFORM pg_advisory_xact_lock(hashtext('cert:' || s.project_id::text || ':' || v_base));
  SELECT count(*) INTO v_n FROM certificates
   WHERE project_id = s.project_id
     AND (certificate_number = v_base
          OR (starts_with(certificate_number, v_base || '-R') AND substr(certificate_number, length(v_base) + 3) ~ '^[0-9]+$'));
  v_number := CASE WHEN v_n = 0 THEN v_base ELSE v_base || '-R' || (v_n + 1) END;
  INSERT INTO certificates (project_id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by, notes)
  VALUES (s.project_id, s.id, ph.id, v_number, COALESCE(ph.certificate_name, ph.code) || ' — ' || s.code || ': ' || s.name,
          'issued', public.project_today(s.project_id), auth.uid(), public.mgmt_text(p_notes, 2000))
  RETURNING id INTO v_id;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) LOOP
    IF (e ->> 'punch_id')::uuid = ANY (COALESCE(v_just, '{}'::uuid[])) THEN
      INSERT INTO certificate_punch_exceptions (certificate_id, punch_id, justification, approved_by)
      VALUES (v_id, (e ->> 'punch_id')::uuid, left(btrim(e ->> 'justification'), 2000), auth.uid());
    END IF;
  END LOOP;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', v_id, 'issued',
          jsonb_build_object('certNumber', v_number, 'subsystemId', s.id, 'phaseId', ph.id, 'catBExceptions', COALESCE(cardinality(v_just), 0)));
  RETURN v_id;
END;
$fn$;

-- Firmar un rol: certificado emitido y sin bloqueo; persona con la capacidad del rol; una persona por rol (D6).
CREATE OR REPLACE FUNCTION public.sign_certificate(p_certificate_id uuid, p_role text, p_comments text DEFAULT NULL, p_signature_image text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c certificates%ROWTYPE; v_cap text := public.certificate_role_capacity(p_role); v_org uuid; v_n int;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_member(c.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Rol de firma no válido' USING ERRCODE = '22023'; END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'Solo se firma un certificado emitido' USING ERRCODE = 'P0001'; END IF;
  IF c.is_blocked THEN RAISE EXCEPTION 'El certificado está bloqueado: %', COALESCE(c.block_reason, 'la base cambió') USING ERRCODE = 'P0001'; END IF;
  IF NOT public.has_capacity(c.project_id, v_cap) THEN
    RAISE EXCEPTION 'No estás designado para firmar como % en este proyecto', v_cap USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM certificate_signatures WHERE certificate_id = c.id AND role::text = p_role) THEN
    RAISE EXCEPTION 'Ya existe una firma para el rol %', p_role USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM certificate_signatures WHERE certificate_id = c.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este certificado: cada rol lo firma una persona distinta' USING ERRCODE = '23505';
  END IF;
  IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/%' OR length(p_signature_image) > 262144) THEN
    RAISE EXCEPTION 'Firma no válida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO certificate_signatures (certificate_id, user_id, role, comments, signature_image)
  VALUES (c.id, auth.uid(), p_role::cert_signature_role, public.mgmt_text(p_comments, 2000), p_signature_image);
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  SELECT count(*) INTO v_n FROM certificate_signatures WHERE certificate_id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'signed', jsonb_build_object('role', p_role, 'projectId', c.project_id));
  IF v_n >= 3 THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_org, auth.uid(), 'certificate', c.id, 'fully_signed', jsonb_build_object('projectId', c.project_id, 'certNumber', c.certificate_number));
  END IF;
  RETURN jsonb_build_object('signatures', v_n, 'fully_signed', v_n >= 3);
END;
$fn$;

-- Quitar una firma: la propia, o un owner/admin; solo con el certificado emitido.
CREATE OR REPLACE FUNCTION public.unsign_certificate(p_signature_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s certificate_signatures%ROWTYPE; c certificates%ROWTYPE; v_org uuid;
BEGIN
  SELECT * INTO s FROM certificate_signatures WHERE id = p_signature_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Firma no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO c FROM certificates WHERE id = s.certificate_id;
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  IF auth.uid() IS NULL OR NOT (s.user_id = auth.uid() OR public.is_org_admin(v_org)) THEN
    RAISE EXCEPTION 'Solo el firmante o un admin puede quitar la firma' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'El certificado no está emitido' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM certificate_signatures WHERE id = s.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'unsigned', jsonb_build_object('role', s.role, 'signer', s.user_id, 'projectId', c.project_id));
END;
$fn$;

-- Revocar (owner/admin/architect, motivo): pasa a rechazado y sus firmas se anulan (quedan en activity_log).
CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c certificates%ROWTYPE; v_org uuid; v_reason text := public.mgmt_text(p_reason, 2000); v_sigs jsonb;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  IF auth.uid() IS NULL OR NOT public.is_org_privileged(v_org) THEN RAISE EXCEPTION 'Solo owner, admin o arquitecto revocan certificados' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'Solo se pueden revocar certificados emitidos' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Debes indicar un motivo (al menos 3 caracteres)' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', user_id, 'role', role, 'signedAt', signed_at)), '[]') INTO v_sigs
  FROM certificate_signatures WHERE certificate_id = c.id;
  DELETE FROM certificate_signatures WHERE certificate_id = c.id;
  UPDATE certificates SET status = 'rejected', is_blocked = false, block_reason = NULL WHERE id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'revoked', jsonb_build_object('projectId', c.project_id, 'reason', v_reason, 'previousSignatures', v_sigs));
  RETURN v_sigs;
END;
$fn$;

-- Reabrir un rechazado (owner/admin/architect, motivo): vuelve a evaluar elegibilidad y fase anterior.
CREATE OR REPLACE FUNCTION public.reopen_certificate(p_certificate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c certificates%ROWTYPE; v_org uuid; v_reason text := public.mgmt_text(p_reason, 2000); v_block text;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  IF auth.uid() IS NULL OR NOT public.is_org_privileged(v_org) THEN RAISE EXCEPTION 'Solo owner, admin o arquitecto reabren certificados' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'rejected' THEN RAISE EXCEPTION 'Solo se pueden reabrir certificados rechazados' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Debes indicar un motivo (al menos 3 caracteres)' USING ERRCODE = '22023'; END IF;
  IF c.subsystem_id IS NOT NULL THEN
    v_block := public.certificate_blocker(c.subsystem_id, c.phase_id, ARRAY(SELECT punch_id FROM certificate_punch_exceptions WHERE certificate_id = c.id));
    IF v_block IS NOT NULL THEN RAISE EXCEPTION 'No se puede reabrir: %', v_block USING ERRCODE = 'P0001'; END IF;
    v_block := public.certificate_previous_blocker(c.subsystem_id, c.phase_id);
    IF v_block IS NOT NULL THEN RAISE EXCEPTION 'No se puede reabrir: %', v_block USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM certificates WHERE subsystem_id = c.subsystem_id AND phase_id = c.phase_id AND status = 'issued' AND id <> c.id) THEN
      RAISE EXCEPTION 'El subsistema ya tiene otro certificado emitido en esta fase' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE certificates SET status = 'issued', is_blocked = false, block_reason = NULL WHERE id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'reopened', jsonb_build_object('projectId', c.project_id, 'reason', v_reason));
END;
$fn$;

-- Excepciones Cat B sobre un certificado emitido (líder+): solo punch Cat B abiertos del subsistema.
CREATE OR REPLACE FUNCTION public.add_certificate_exception(p_certificate_id uuid, p_punch_id uuid, p_justification text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c certificates%ROWTYPE; v_role text; v_id uuid; v_just text := public.mgmt_text(p_justification, 2000);
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'issued' OR c.subsystem_id IS NULL THEN RAISE EXCEPTION 'Solo en certificados emitidos de subsistema' USING ERRCODE = 'P0001'; END IF;
  IF v_just IS NULL THEN RAISE EXCEPTION 'Indica la justificación' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM punches WHERE id = p_punch_id AND subsystem_id = c.subsystem_id AND category = 'B' AND status IN ('open', 'in_progress')) THEN
    RAISE EXCEPTION 'Solo se exceptúan punch Cat B abiertos del subsistema' USING ERRCODE = '22023';
  END IF;
  INSERT INTO certificate_punch_exceptions (certificate_id, punch_id, justification, approved_by)
  VALUES (c.id, p_punch_id, v_just, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.remove_certificate_exception(p_exception_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE x certificate_punch_exceptions%ROWTYPE; c certificates%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO x FROM certificate_punch_exceptions WHERE id = p_exception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Excepción no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO c FROM certificates WHERE id = x.certificate_id;
  v_role := public.register_caller_role(c.project_id);
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  DELETE FROM certificate_punch_exceptions WHERE id = x.id;
END;
$fn$;

-- Puesta al día: los certificados emitidos hoy se evalúan con la regla nueva (bloqueo si su base ya no es elegible).
DO $init$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM certificates WHERE status = 'issued' AND subsystem_id IS NOT NULL LOOP
    PERFORM public.refresh_certificate_block(v_id);
  END LOOP;
END;
$init$;

-- ── 4. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.certificate_eligibility(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.certificate_blocker(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.certificate_previous_blocker(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_certificate_block(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_certificates_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_certificate_base_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.certificate_role_capacity(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_certificate(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_certificate(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unsign_certificate(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reopen_certificate(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_certificate_exception(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_certificate_exception(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.certificate_eligibility(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.certificate_blocker(uuid, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.certificate_previous_blocker(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_certificate_block(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_certificates_for(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.certificate_role_capacity(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_certificate(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unsign_certificate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_certificate(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_certificate_exception(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_certificate_exception(uuid) TO authenticated, service_role;
