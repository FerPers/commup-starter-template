-- S13 (revisión integral 2026-10-19): correcciones de F8 — documentos y vendors.
--   F-03  vigente = fecha de emisión más reciente (document_refresh_current), no la última registrada.
--   F-24  revisión anulada (status 'void', líder+, motivo ≥ 10) y fecha de emisión no futura.
--   F-20  política de la org (settings.document_policy.below_ifc = warn | block): con «block», referenciar o
--         firmar contra una revisión IFR/IFA se bloquea; con «warn» (defecto) solo se avisa en pantalla.
--   F-02  referencias automáticas al crear un ITR (documentos de campo del sistema + los que nombran el P&ID del
--         tag o los diagramas de sus señales/lazo) y acciones masivas en el documento (referenciar en ITR
--         abiertos de sus sistemas; actualizar/revalidar todas con un motivo común, auditado por fila).
--   F-12  new_procedure_revision copia las referencias a documentos (a la revisión vigente).
--   F-05  re-prueba de FAT/SAT (vendor_activities.retest_of); el KPI cuenta la última de la cadena.
--   F-34  terminación anticipada de un paquete movilizado; quien propone una recomendación no la decide.
--   F-19  no se borra una causa/efecto C&E (ni su matriz) con ITR de prueba generados.
--   F-25  subir a project-documents solo control documental, con tipos de archivo permitidos.
--   F-15/F-33/F-18  tags.tag_key (número sin mayúsculas, espacios, guiones, puntos, barras ni «_») para emparejar
--         tags de C&E y QR.
-- Decisiones de Luis (2026-10-20): referencias automáticas + masivas; IFR/IFA = aviso con bloqueo opcional por
-- org; QR completo (escáner tolerante + etiquetas QR por tag).

-- ── 1. Revisiones: anuladas (F-24) ───────────────────────────────────────
ALTER TABLE public.document_revisions DROP CONSTRAINT document_revisions_status_check;
ALTER TABLE public.document_revisions ADD CONSTRAINT document_revisions_status_check
  CHECK (status IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final', 'void'));
ALTER TABLE public.document_revisions
  ADD COLUMN voided_by uuid,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN void_reason text,
  ADD COLUMN void_from_status text,
  ADD CONSTRAINT document_revisions_void_check CHECK (status <> 'void' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND void_from_status IS NOT NULL));
-- Una revisión anulada (p. ej. «B» tipeada por «C») libera su letra.
DROP INDEX public.document_revisions_rev_uq;
CREATE UNIQUE INDEX document_revisions_rev_uq ON public.document_revisions (document_id, upper(btrim(rev))) WHERE status <> 'void';

-- ── 2. Política IFR/IFA de la org (F-20) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_status_controlled(p_status text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(p_status IN ('ifc', 'as_built', 'final'), false);
$fn$;
COMMENT ON FUNCTION public.document_status_controlled(text) IS
  'S13 (F-20): revisión emitida para construcción o posterior (IFC, As-Built, Final). = DOC_CONTROLLED_STATUSES en src/lib/documents/catalog.ts.';

CREATE OR REPLACE FUNCTION public.org_document_policy(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE WHEN (SELECT settings -> 'document_policy' ->> 'below_ifc' FROM organizations WHERE id = p_org_id) = 'block'
              THEN 'block' ELSE 'warn' END;
$fn$;
COMMENT ON FUNCTION public.org_document_policy(uuid) IS
  'S13 (F-20): organizations.settings.document_policy.below_ifc = warn (defecto) | block. = documentPolicy() en src/lib/documents/catalog.ts.';

-- ── 3. Tags: clave normalizada (F-15, F-33, F-18) ────────────────────────
-- = normalizeTag() en src/lib/ce/import.ts. «PT 101», «pt-101» y «PT_101» → «PT101».
ALTER TABLE public.tags ADD COLUMN tag_key text
  GENERATED ALWAYS AS (upper(regexp_replace(tag_number, '[[:space:]_./-]+', '', 'g'))) STORED;
CREATE INDEX tags_project_tag_key_idx ON public.tags (project_id, tag_key);

-- ── 4. Vendors: re-prueba (F-05) ─────────────────────────────────────────
ALTER TABLE public.vendor_activities ADD COLUMN retest_of uuid REFERENCES public.vendor_activities(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX vendor_activities_retest_uq ON public.vendor_activities (retest_of) WHERE retest_of IS NOT NULL;

-- ── 5. Funciones canónicas (supabase/functions-sql) ──────────────────────
CREATE OR REPLACE FUNCTION public.document_refresh_current(p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cur uuid;
BEGIN
  -- S13 (F-03): vigente = la de fecha de emisión más reciente (no la última registrada), así cargar el historial
  -- después de la vigente no la desplaza; a igual fecha, la última registrada. Las anuladas (F-24) no cuentan.
  SELECT id INTO v_cur FROM document_revisions
   WHERE document_id = p_document_id AND status NOT IN ('draft', 'void')
   ORDER BY issued_on DESC NULLS LAST, seq DESC LIMIT 1;
  UPDATE documents SET current_revision_id = v_cur, updated_at = now() WHERE id = p_document_id;
  RETURN v_cur;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_document_revision(p_document_id uuid, p_rev text, p_status text, p_issued_on date, p_file_path text, p_file_name text, p_external_url text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d documents%ROWTYPE; v_role text; v_rev text := upper(public.mgmt_text(p_rev, 20)); v_id uuid; v_seq integer;
        v_url text := public.mgmt_text(p_external_url, 1000); v_path text := public.mgmt_text(p_file_path, 500); v_today date;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores registran revisiones' USING ERRCODE = '42501';
  END IF;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Indica la revisión' USING ERRCODE = '22023'; END IF;
  IF p_status NOT IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  -- S13 (F-24): la fecha de emisión no puede ser futura (día del proyecto).
  v_today := public.project_today(d.project_id);
  IF p_status <> 'draft' AND p_issued_on > v_today THEN RAISE EXCEPTION 'La fecha de emisión no puede ser futura' USING ERRCODE = '22023'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https://' THEN RAISE EXCEPTION 'El enlace debe ser https' USING ERRCODE = '22023'; END IF;
  IF v_path IS NOT NULL AND (split_part(v_path, '/', 1) <> d.project_id::text OR split_part(v_path, '/', 2) <> d.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-documents' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'Archivo no válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND upper(btrim(rev)) = v_rev AND status <> 'void') THEN
    RAISE EXCEPTION 'La revisión % ya existe', v_rev USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND status = 'draft') THEN
    RAISE EXCEPTION 'Hay una revisión en borrador: emítela o descártala primero' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM document_revisions WHERE document_id = d.id;
  INSERT INTO document_revisions (document_id, project_id, seq, rev, status, issued_on, file_path, file_name, external_url, notes, created_by)
  VALUES (d.id, d.project_id, v_seq, v_rev, p_status, CASE WHEN p_status <> 'draft' THEN COALESCE(p_issued_on, v_today) END,
          v_path, CASE WHEN v_path IS NOT NULL THEN public.mgmt_text(p_file_name, 255) END, v_url, public.mgmt_text(p_notes, 2000), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.document_refresh_current(d.id);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_document_revision(p_revision_id uuid, p_status text, p_issued_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r document_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM document_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se emite o descarta un borrador' USING ERRCODE = 'P0001'; END IF;
  IF p_status IS NULL THEN
    DELETE FROM document_revisions WHERE id = r.id;
  ELSIF p_status IN ('ifr', 'ifa', 'ifc', 'as_built', 'final') THEN
    -- S13 (F-24): la fecha de emisión no puede ser futura.
    IF p_issued_on > public.project_today(r.project_id) THEN RAISE EXCEPTION 'La fecha de emisión no puede ser futura' USING ERRCODE = '22023'; END IF;
    UPDATE document_revisions SET status = p_status, issued_on = COALESCE(p_issued_on, public.project_today(r.project_id)) WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.document_refresh_current(r.document_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_document_reference(p_kind text, p_target_id uuid, p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t record; d documents%ROWTYPE; v_role text; v_id uuid; v_status text;
BEGIN
  SELECT * INTO t FROM public.document_reference_target(p_kind, p_target_id);
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN RAISE EXCEPTION 'El registro ya está firmado o fuera de borrador: no se cambian sus referencias' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO d FROM documents WHERE id = p_document_id AND project_id = t.project_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento de otro proyecto' USING ERRCODE = '22023'; END IF;
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'El documento % no tiene una revisión emitida', d.number USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-20): con la política «block» de la org, solo se referencia una revisión IFC o superior.
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, itr_id, procedure_revision_id, created_by)
  VALUES (t.project_id, d.id, d.current_revision_id, p_kind,
          CASE WHEN p_kind = 'itr' THEN p_target_id END, CASE WHEN p_kind = 'procedure_revision' THEN p_target_id END, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'El documento % ya está referenciado', d.number USING ERRCODE = '23505'; END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_document_reference(p_reference_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r document_references%ROWTYPE; t record; d documents%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_status text;
BEGIN
  SELECT * INTO r FROM document_references WHERE id = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referencia no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO d FROM documents WHERE id = r.document_id;
  IF d.current_revision_id IS NULL OR d.current_revision_id = r.revision_id THEN RAISE EXCEPTION 'La referencia ya está en la revisión vigente' USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-20): con la política «block» no se lleva una referencia a una revisión IFR/IFA.
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.document_reference_target(r.target_kind, COALESCE(r.itr_id, r.procedure_revision_id));
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN
    IF NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores revalidan un registro firmado' USING ERRCODE = '42501'; END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica por qué el registro sigue siendo válido con la revisión vigente (mín. 10 caracteres)' USING ERRCODE = '22023'; END IF;
    UPDATE document_references SET revalidated_from = r.revision_id, revision_id = d.current_revision_id,
           revalidated_by = auth.uid(), revalidated_at = now(), revalidation_reason = v_reason
     WHERE id = r.id;
  ELSE
    UPDATE document_references SET revision_id = d.current_revision_id WHERE id = r.id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.document_references_blocker(p_kind text, p_target_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- S13 (F-20): además de las revisiones superadas, con la política «block» de la org bloquea las referencias
  -- a una revisión vigente que no es IFC o superior (IFR/IFA).
  SELECT NULLIF(concat_ws(' ',
    'Revisión de documento superada: ' || a.list || '. Actualiza la referencia antes de continuar.',
    'Revisión no emitida para construcción: ' || b.list || '. Se requiere IFC o superior.'), '')
  FROM (
    SELECT string_agg(d.number || ' (usa ' || rv.rev || ', vigente ' || cur.rev || ')', ', ' ORDER BY d.number) AS list
    FROM document_references r
    JOIN documents d ON d.id = r.document_id
    JOIN document_revisions rv ON rv.id = r.revision_id
    JOIN document_revisions cur ON cur.id = d.current_revision_id
    WHERE r.revision_id <> d.current_revision_id
      AND ((p_kind = 'itr' AND r.itr_id = p_target_id) OR (p_kind = 'procedure_revision' AND r.procedure_revision_id = p_target_id))
  ) a, (
    SELECT string_agg(d.number || ' Rev ' || rv.rev || ' (' || upper(rv.status) || ')', ', ' ORDER BY d.number) AS list
    FROM document_references r
    JOIN documents d ON d.id = r.document_id
    JOIN document_revisions rv ON rv.id = r.revision_id
    WHERE r.revision_id = d.current_revision_id
      AND NOT public.document_status_controlled(rv.status)
      AND public.org_document_policy(d.org_id) = 'block'
      AND ((p_kind = 'itr' AND r.itr_id = p_target_id) OR (p_kind = 'procedure_revision' AND r.procedure_revision_id = p_target_id))
  ) b;
$function$;

CREATE OR REPLACE FUNCTION public.new_procedure_revision(p_procedure_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text; v_cur procedure_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_revisions WHERE procedure_id = p.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', p.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM procedure_revisions WHERE id = p.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'El procedimiento aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO procedure_revisions (procedure_id, org_id, project_id, rev, sections, change_reason, created_by)
  VALUES (p.id, p.org_id, p.project_id, (SELECT MAX(rev) + 1 FROM procedure_revisions WHERE procedure_id = p.id), v_cur.sections, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria)
  SELECT v_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria
  FROM procedure_steps WHERE revision_id = v_cur.id;
  -- S13 (F-12): la nueva revisión hereda las referencias a documentos, llevadas a la revisión vigente de cada uno
  -- (si cambió, el panel lo muestra como actualizado y el envío/aprobación lo valida igual).
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, procedure_revision_id, created_by)
  SELECT dr.project_id, dr.document_id, COALESCE(d.current_revision_id, dr.revision_id), 'procedure_revision', v_id, auth.uid()
  FROM document_references dr JOIN documents d ON d.id = dr.document_id
  WHERE dr.procedure_revision_id = v_cur.id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_vendor_package(p_package_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, true);
  -- S13 (F-34): un paquete movilizado también se puede terminar anticipadamente (contrato rescindido), con motivo ≥ 10.
  IF (w.pkg).status NOT IN ('planned', 'mobilized') THEN RAISE EXCEPTION 'Solo se cancela un paquete planificado o movilizado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  IF (w.pkg).status = 'mobilized' AND length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Indica el motivo de la terminación anticipada (mín. 10 caracteres)' USING ERRCODE = '22023';
  END IF;
  UPDATE vendor_packages SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason, updated_at = now()
   WHERE id = (w.pkg).id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decide_vendor_recommendation(p_id uuid, p_decision text, p_reason text, p_requires_moc boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r vendor_recommendations%ROWTYPE; w record; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM vendor_recommendations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recomendación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(r.package_id, true);
  IF r.status <> 'proposed' THEN RAISE EXCEPTION 'La recomendación ya fue decidida' USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-34): segregación de funciones, quien propone no decide.
  IF r.proposed_by = auth.uid() THEN RAISE EXCEPTION 'Quien propone la recomendación no puede decidirla' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decisión no válida' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'rejected' AND (v_reason IS NULL OR length(v_reason) < 3) THEN RAISE EXCEPTION 'Indica el motivo del rechazo' USING ERRCODE = '22023'; END IF;
  UPDATE vendor_recommendations SET status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         requires_moc = COALESCE(p_requires_moc, requires_moc)
   WHERE id = r.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.take_mgmt_snapshot(p_project_id uuid, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; r record; v_systems integer := 0;
  v_itr bigint := 0; v_wsum numeric := 0; v_gapp integer := 0; v_gtot integer := 0; v_kpis jsonb;
  v_tz text; v_from timestamptz; v_to timestamptz;
BEGIN
  -- S10 (D-05/D-27): el día y la ventana de 30 días se cortan en la zona del proyecto.
  v_tz := public.project_timezone(p_project_id);
  p_date := COALESCE(p_date, public.tz_today(v_tz));
  v_from := public.tz_day_start(p_date - 30, v_tz); v_to := public.tz_day_start(p_date + 1, v_tz);
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;

  FOR r IN SELECT * FROM public.compute_project_progress(p_project_id) LOOP
    INSERT INTO system_progress_snapshots (org_id, project_id, system_id, snapshot_date, weighted_pct, itr_total, itr_approved,
                                           gates_approved, gates_total, per_gate)
    VALUES (v_org, p_project_id, r.system_id, p_date, r.weighted_pct, r.itr_total, r.itr_approved, r.gates_approved, r.gates_total,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('gate_id', cp.gate_id, 'code', cp.gate_code, 'weight', cp.weight,
                        'itr_total', cp.itr_total, 'itr_approved', cp.itr_approved, 'pct', cp.pct, 'approved', cp.approved)
                        ORDER BY cp.gate_order, cp.gate_code)
                      FROM public.compute_system_progress(r.system_id) cp), '[]'::jsonb))
    ON CONFLICT (system_id, snapshot_date) DO UPDATE
      SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, itr_approved = EXCLUDED.itr_approved,
          gates_approved = EXCLUDED.gates_approved, gates_total = EXCLUDED.gates_total, per_gate = EXCLUDED.per_gate, created_at = now();
    v_systems := v_systems + 1;
    v_itr := v_itr + r.itr_total;
    v_wsum := v_wsum + r.weighted_pct * r.itr_total;
    v_gapp := v_gapp + r.gates_approved;
    v_gtot := v_gtot + r.gates_total;
  END LOOP;

  -- KPIs calculables (ventana de 30 días hasta p_date).
  SELECT jsonb_build_object(
    'tq', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('draft', 'issued')),
             'answered_pending_close', COUNT(*) FILTER (WHERE status = 'answered'),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to),
             'answered_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL AND (responded_at AT TIME ZONE v_tz)::date <= required_by),
             'with_due_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL),
             'avg_days_to_answer_30d', round(AVG(EXTRACT(EPOCH FROM (responded_at - issued_at)) / 86400)
                                       FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND issued_at IS NOT NULL)::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'issued' AND required_by < p_date))
           FROM technical_queries WHERE project_id = p_project_id AND status <> 'cancelled'),
    'actions', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')),
             'to_verify', COUNT(*) FILTER (WHERE status = 'done'),
             'overdue', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND due_date < p_date),
             'verified_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL AND (done_at AT TIME ZONE v_tz)::date <= COALESCE(original_due_date, due_date)),
             'with_due_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL))
           FROM actions WHERE project_id = p_project_id),
    'constraints', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status = 'open'),
             'by_level', jsonb_build_object(
                '1', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 1),
                '2', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 2),
                '3', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 3),
                '4', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 4)),
             'avg_age_days', round(AVG(p_date - (created_at AT TIME ZONE v_tz)::date) FILTER (WHERE status = 'open')::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'open' AND need_date < p_date),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to))
           FROM project_constraints WHERE project_id = p_project_id),
    -- Cumplimiento del compromiso: gates aprobados en la ventana que tenían compromiso.
    -- S11 (D-17): denominador = compromisos que vencían en la ventana (cumplidos o no); a tiempo = gate con todas
    -- sus firmas (completed_at) en o antes de la fecha comprometida. approved_30d queda por compatibilidad.
    'commitments', (SELECT jsonb_build_object(
             'due_30d', COUNT(*),
             'approved_30d', COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL),
             'on_time_30d', COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL AND (a.completed_at AT TIME ZONE v_tz)::date <= gp.commitment_date))
           FROM system_gate_plans gp
           LEFT JOIN system_gate_approvals a ON a.system_id = gp.system_id AND a.gate_id = gp.gate_id AND a.revoked_at IS NULL
           WHERE gp.project_id = p_project_id AND gp.commitment_date > p_date - 30 AND gp.commitment_date <= p_date),
    -- Éxito de primer arranque (F6, decisión 2026-10-19): sin trip/parada entre «primer arranque» y «operación estable».
    'startup', (SELECT jsonb_build_object(
             'started', COUNT(*),
             'successful', COUNT(*) FILTER (WHERE s.stable_at IS NOT NULL AND NOT s.tripped),
             'failed', COUNT(*) FILTER (WHERE s.tripped),
             'pending', COUNT(*) FILTER (WHERE s.stable_at IS NULL AND NOT s.tripped))
           FROM (SELECT fs.system_id, st.stable_at,
                        EXISTS (SELECT 1 FROM startup_events e
                                WHERE e.system_id = fs.system_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                                  AND e.status <> 'voided' AND e.occurred_at >= fs.occurred_at
                                  AND e.occurred_at < LEAST(v_to, COALESCE(st.stable_at, v_to))) AS tripped
                 FROM startup_events fs
                 LEFT JOIN LATERAL (SELECT MIN(x.occurred_at) AS stable_at FROM startup_events x
                                    WHERE x.system_id = fs.system_id AND x.kind = 'milestone' AND x.milestone = 'first_stable_operation'
                                      AND x.status = 'witnessed' AND x.occurred_at < v_to) st ON true
                 WHERE fs.project_id = p_project_id AND fs.kind = 'milestone' AND fs.milestone = 'first_startup'
                   AND fs.status = 'witnessed' AND fs.occurred_at < v_to) s),
    -- Falla repetida (F6): trips/paradas en la ventana y sistemas con 2 o más.
    'trips', (SELECT jsonb_build_object(
             'events_30d', COALESCE(SUM(x.n), 0),
             'systems_30d', COUNT(*),
             'repeat_systems_30d', COUNT(*) FILTER (WHERE x.n >= 2))
           FROM (SELECT e.system_id, COUNT(*) AS n FROM startup_events e
                 WHERE e.project_id = p_project_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                   AND e.status <> 'voided' AND e.occurred_at >= v_from AND e.occurred_at < v_to
                 GROUP BY e.system_id) x),
    -- Falla repetida (F7): pruebas de desempeño aceptadas al primer intento evaluado.
    'performance', (SELECT jsonb_build_object(
             'tests', COUNT(*),
             'accepted', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL),
             'accepted_first', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL AND a.prior = 0),
             'failed_runs', COALESCE(SUM(a.failed), 0))
           FROM performance_tests t
           CROSS JOIN LATERAL (
             SELECT MIN(pr.attempt) FILTER (WHERE pr.result IN ('accepted', 'accepted_with_deviation')) AS acc_attempt,
                    COUNT(*) FILTER (WHERE pr.result = 'failed') AS failed,
                    COUNT(*) FILTER (WHERE pr.attempt < (SELECT MIN(pr2.attempt) FROM performance_runs pr2
                                                          WHERE pr2.test_id = t.id AND pr2.result IN ('accepted', 'accepted_with_deviation')
                                                            AND pr2.result_at < v_to)) AS prior,
                    COUNT(*) AS evaluated
             FROM performance_runs pr
             WHERE pr.test_id = t.id AND pr.status = 'evaluated' AND pr.result_at < v_to) a
           WHERE t.project_id = p_project_id AND a.evaluated > 0),
    -- Completitud documental (F8, decisión 2026-10-19): As-Built/Final sobre los documentos ligados a sistemas.
    'documents', (SELECT jsonb_build_object(
             'total', COUNT(*),
             'linked', COUNT(*) FILTER (WHERE dx.linked),
             'as_built', COUNT(*) FILTER (WHERE dx.linked AND cur.status IN ('as_built', 'final')),
             'no_revision', COUNT(*) FILTER (WHERE d.current_revision_id IS NULL),
             'outdated_refs', (SELECT COUNT(*) FROM document_references dr JOIN documents d2 ON d2.id = dr.document_id
                               WHERE dr.project_id = p_project_id AND dr.revision_id <> d2.current_revision_id
                                 AND ((dr.itr_id IS NOT NULL AND EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = dr.itr_id))
                                   OR (dr.procedure_revision_id IS NOT NULL AND EXISTS (SELECT 1 FROM procedures pr2 WHERE pr2.current_revision_id = dr.procedure_revision_id)))))
           FROM documents d
           LEFT JOIN document_revisions cur ON cur.id = d.current_revision_id
           CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM document_systems ds WHERE ds.document_id = d.id) AS linked) dx
           WHERE d.project_id = p_project_id),
    -- Readiness de vendors (F8, decisión 2026-10-19): paquetes activos sin bloqueos.
    'vendors', (SELECT jsonb_build_object(
             'planned', COUNT(*) FILTER (WHERE vp.status = 'planned'),
             'mobilized', COUNT(*) FILTER (WHERE vp.status = 'mobilized'),
             'demobilized', COUNT(*) FILTER (WHERE vp.status = 'demobilized'),
             'active', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized')),
             'clear', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized') AND NOT vb.bad_tests AND vb.open_findings = 0 AND NOT vb.to_decide),
             'open_findings', COALESCE(SUM(vb.open_findings), 0))
           FROM vendor_packages vp
           CROSS JOIN LATERAL (SELECT
             -- S13 (F-05): una FAT/SAT fallida que ya tiene re-prueba no cuenta; cuenta la última de la cadena.
             EXISTS (SELECT 1 FROM vendor_activities va WHERE va.package_id = vp.id AND va.result IN ('pending', 'failed')
                       AND NOT EXISTS (SELECT 1 FROM vendor_activities rt WHERE rt.retest_of = va.id)) AS bad_tests,
             (SELECT COUNT(*) FROM vendor_findings vf
                LEFT JOIN punches pu ON pu.id = vf.punch_id
                LEFT JOIN actions ac ON ac.id = vf.action_id
               WHERE vf.package_id = vp.id
                 AND (pu.status::text IN ('open', 'in_progress') OR ac.status IN ('open', 'in_progress', 'done'))) AS open_findings,
             EXISTS (SELECT 1 FROM vendor_recommendations vr WHERE vr.package_id = vp.id AND vr.status = 'proposed') AS to_decide) vb
           WHERE vp.project_id = p_project_id AND vp.status <> 'cancelled')
  ) INTO v_kpis;

  INSERT INTO mgmt_kpi_snapshots (org_id, project_id, snapshot_date, weighted_pct, itr_total, gates_approved, gates_total, kpis)
  VALUES (v_org, p_project_id, p_date, CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END, v_itr, v_gapp, v_gtot, v_kpis)
  ON CONFLICT (project_id, snapshot_date) DO UPDATE
    SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, gates_approved = EXCLUDED.gates_approved,
        gates_total = EXCLUDED.gates_total, kpis = EXCLUDED.kpis, created_at = now();

  RETURN jsonb_build_object('systems', v_systems, 'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END);
END;
$function$;


-- ── 6. Anular una revisión emitida (F-24) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_document_revision(p_revision_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r document_revisions%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM document_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores anulan revisiones' USING ERRCODE = '42501';
  END IF;
  IF r.status IN ('draft', 'void') THEN RAISE EXCEPTION 'Solo se anula una revisión emitida (un borrador se descarta)' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo de la anulación (mín. 10 caracteres)' USING ERRCODE = '22023'; END IF;
  UPDATE document_revisions SET void_from_status = status, status = 'void', voided_by = auth.uid(), voided_at = now(), void_reason = v_reason
   WHERE id = r.id;
  PERFORM public.document_refresh_current(r.document_id);
END;
$fn$;

-- ── 7. Referencias automáticas al crear un ITR (F-02) ────────────────────
-- Documentos de campo (P&ID, PFD, plano, hoja de datos, especificación) ligados al sistema del subsistema del ITR,
-- más cualquier documento cuyo número coincida con el P&ID del tag o con el P&ID / diagrama de lazo / de conexionado
-- de las señales del tag o del lazo del ITR. Siempre a la revisión vigente; con la política «block», solo IFC+.
CREATE OR REPLACE FUNCTION public.document_key(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT NULLIF(upper(btrim(p_text)), '');
$fn$;

CREATE OR REPLACE FUNCTION public.itr_auto_document_refs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_policy text;
BEGIN
  SELECT public.org_document_policy(p.org_id) INTO v_policy FROM projects p WHERE p.id = NEW.project_id;
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, itr_id, created_by)
  SELECT NEW.project_id, d.id, d.current_revision_id, 'itr', NEW.id, auth.uid()
  FROM documents d
  JOIN document_revisions cur ON cur.id = d.current_revision_id
  WHERE d.project_id = NEW.project_id
    AND (v_policy <> 'block' OR public.document_status_controlled(cur.status))
    AND (
      (d.doc_type IN ('pid', 'pfd', 'drawing', 'datasheet', 'specification') AND EXISTS (
        SELECT 1 FROM document_systems ds JOIN subsystems ss ON ss.system_id = ds.system_id
        WHERE ds.document_id = d.id AND ss.id = NEW.subsystem_id))
      OR upper(btrim(d.number)) IN (
        SELECT public.document_key(t.pid_drawing) FROM tags t WHERE t.id = NEW.tag_id
        UNION
        SELECT public.document_key(x) FROM signals s
          CROSS JOIN LATERAL unnest(ARRAY[s.pid_drawing, s.loop_diagram, s.wiring_diagram]) x
         WHERE s.tag_id = NEW.tag_id OR (NEW.loop_id IS NOT NULL AND s.loop_id = NEW.loop_id)))
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$fn$;
CREATE TRIGGER itrs_auto_document_refs AFTER INSERT ON public.itrs
  FOR EACH ROW EXECUTE FUNCTION public.itr_auto_document_refs();

-- ── 8. Acciones masivas sobre un documento (F-02) ────────────────────────
-- Referencia la revisión vigente en todos los ITR sin firmas de los sistemas indicados (NULL = los del documento).
CREATE OR REPLACE FUNCTION public.reference_document_in_open_itrs(p_document_id uuid, p_system_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE d documents%ROWTYPE; v_role text; v_status text; v_systems uuid[]; v_n integer;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores referencian en lote' USING ERRCODE = '42501';
  END IF;
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'El documento % no tiene una revisión emitida', d.number USING ERRCODE = 'P0001'; END IF;
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  v_systems := COALESCE(p_system_ids, ARRAY(SELECT system_id FROM document_systems WHERE document_id = d.id));
  IF EXISTS (SELECT 1 FROM unnest(v_systems) s(id) WHERE NOT EXISTS (SELECT 1 FROM systems x WHERE x.id = s.id AND x.project_id = d.project_id)) THEN
    RAISE EXCEPTION 'Algún sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_systems) = 0 THEN RAISE EXCEPTION 'Indica los sistemas o liga el documento a sus sistemas' USING ERRCODE = '22023'; END IF;
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, itr_id, created_by)
  SELECT d.project_id, d.id, d.current_revision_id, 'itr', i.id, auth.uid()
  FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
  WHERE i.project_id = d.project_id AND ss.system_id = ANY (v_systems)
    AND NOT EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = i.id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

-- Lleva a la revisión vigente todas las referencias superadas del documento: las de registros abiertos se
-- actualizan; las de registros firmados/aprobados se revalidan con el motivo común (cada fila guarda quién,
-- cuándo, desde qué revisión y por qué, igual que la revalidación individual de §15.4).
CREATE OR REPLACE FUNCTION public.revalidate_document_references(p_document_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE d documents%ROWTYPE; v_role text; v_status text; v_reason text := public.mgmt_text(p_reason, 2000);
        v_open integer; v_locked integer;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores revalidan en lote' USING ERRCODE = '42501';
  END IF;
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'El documento % no tiene una revisión emitida', d.number USING ERRCODE = 'P0001'; END IF;
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Indica por qué los registros siguen siendo válidos con la revisión vigente (mín. 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  WITH x AS (
    SELECT r.id, CASE WHEN r.target_kind = 'itr' THEN EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = r.itr_id)
                      ELSE COALESCE((SELECT pr.status <> 'draft' FROM procedure_revisions pr WHERE pr.id = r.procedure_revision_id), false) END AS locked
    FROM document_references r
    WHERE r.document_id = d.id AND r.revision_id <> d.current_revision_id
  ), u AS (
    UPDATE document_references r SET
      revalidated_from    = CASE WHEN x.locked THEN r.revision_id ELSE r.revalidated_from END,
      revalidated_by      = CASE WHEN x.locked THEN auth.uid() ELSE r.revalidated_by END,
      revalidated_at      = CASE WHEN x.locked THEN now() ELSE r.revalidated_at END,
      revalidation_reason = CASE WHEN x.locked THEN v_reason ELSE r.revalidation_reason END,
      revision_id         = d.current_revision_id
    FROM x WHERE x.id = r.id
    RETURNING x.locked
  )
  SELECT count(*) FILTER (WHERE NOT u.locked), count(*) FILTER (WHERE u.locked) INTO v_open, v_locked FROM u;
  RETURN jsonb_build_object('updated', v_open, 'revalidated', v_locked);
END;
$fn$;

-- ── 9. Re-prueba de FAT/SAT (F-05) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_vendor_retest(p_activity_id uuid, p_planned_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE a vendor_activities%ROWTYPE; w record; v_id uuid;
BEGIN
  SELECT * INTO a FROM vendor_activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actividad no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(a.package_id, false);
  IF (w.pkg).status IN ('demobilized', 'cancelled') THEN RAISE EXCEPTION 'El paquete está cerrado' USING ERRCODE = 'P0001'; END IF;
  IF a.result NOT IN ('failed', 'passed_with_findings') THEN
    RAISE EXCEPTION 'Solo se repite una prueba fallida o aprobada con hallazgos' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_activities WHERE retest_of = a.id) THEN
    RAISE EXCEPTION 'Esta prueba ya tiene una re-prueba' USING ERRCODE = '23505';
  END IF;
  INSERT INTO vendor_activities (package_id, project_id, kind, title, planned_date, location, recorded_by, retest_of)
  VALUES (a.package_id, a.project_id, a.kind, left(regexp_replace(a.title, ' · re-prueba( \d+)?$', '') || ' · re-prueba', 200),
          p_planned_date, a.location, auth.uid(), a.id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ── 10. C&E: no borrar causas/efectos con ITR de prueba (F-19) ──────────
CREATE OR REPLACE FUNCTION public.ce_guard_delete_tested()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_n integer;
BEGIN
  IF TG_TABLE_NAME = 'ce_causes' THEN
    SELECT count(*) INTO v_n FROM itrs WHERE ce_cause_id = OLD.id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'La causa % tiene % ITR de prueba C&E: no se puede borrar (corrígela o crea una nueva revisión de la matriz)', OLD.code, v_n
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT count(DISTINCT i.id) INTO v_n FROM ce_links l JOIN itrs i ON i.ce_cause_id = l.cause_id WHERE l.effect_id = OLD.id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'El efecto % aparece en % ITR de prueba C&E: no se puede borrar', OLD.code, v_n USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN OLD;
END;
$fn$;
CREATE TRIGGER ce_causes_guard_delete BEFORE DELETE ON public.ce_causes
  FOR EACH ROW EXECUTE FUNCTION public.ce_guard_delete_tested();
CREATE TRIGGER ce_effects_guard_delete BEFORE DELETE ON public.ce_effects
  FOR EACH ROW EXECUTE FUNCTION public.ce_guard_delete_tested();

-- ── 11. Storage project-documents: solo control documental y tipos permitidos (F-25) ──
CREATE OR REPLACE FUNCTION public.storage_document_uploader(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid;
BEGIN
  BEGIN
    v_project := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.document_is_controller(public.register_caller_role(v_project));
END;
$fn$;
DROP POLICY project_documents_insert ON storage.objects;
CREATE POLICY project_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents' AND public.storage_document_uploader(name));
-- DWG/DXF llegan con tipos variables según el navegador: se admite octet-stream (se descarga, no se renderiza).
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'application/pdf', 'image/png', 'image/jpeg',
  'application/acad', 'application/dwg', 'image/vnd.dwg', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream']
 WHERE id = 'project-documents';

-- ── 12. Permisos ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.itr_auto_document_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ce_guard_delete_tested() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.org_document_policy(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_status_controlled(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_key(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.storage_document_uploader(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_document_revision(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reference_document_in_open_itrs(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revalidate_document_references(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_vendor_retest(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_document_policy(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.document_status_controlled(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.document_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_document_uploader(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_document_revision(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reference_document_in_open_itrs(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revalidate_document_references(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_retest(uuid, date) TO authenticated, service_role;
