-- S16 (revisión integral 2026-10-19): PSSR por RPC.
--   A-04 / C-12  aprobar, rechazar y enviar solo por RPC SECURITY DEFINER; nadie pone status = 'approved' por REST.
--   C-32         firmas propias (user_id = auth.uid()) por capacidad (S14 has_capacity), solo en pending_approval;
--                firmas requeridas por plantilla (por defecto Operaciones + HSE, congeladas en el PSSR); aprueba un
--                líder con capacidad de Comisionamiento distinto de quien envió y de quienes firmaron; ítems
--                bloqueados después de enviar.
-- Decisiones de Luis (2026-10-20): firmas requeridas Operaciones + HSE por defecto (configurable por plantilla);
-- al rechazar, las firmas se anulan (quedan en activity_log) y el PSSR vuelve a edición con el motivo.

-- ── 1. Esquema ───────────────────────────────────────────────────────────
ALTER TABLE public.pssr_templates
  ADD COLUMN required_signatures text[] NOT NULL DEFAULT ARRAY['operations', 'hse'],
  ADD CONSTRAINT pssr_templates_required_signatures_check
    CHECK (required_signatures <@ ARRAY['commissioning', 'operations', 'hse']);
ALTER TABLE public.pssr_reviews
  ADD COLUMN required_signatures text[] NOT NULL DEFAULT ARRAY['operations', 'hse'],
  ADD COLUMN submitted_by uuid,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN rejected_by uuid,
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejected_reason text,
  ADD CONSTRAINT pssr_reviews_required_signatures_check CHECK (required_signatures <@ ARRAY['commissioning', 'operations', 'hse']);
ALTER TABLE public.pssr_signatures
  ADD COLUMN capacity text,
  ADD CONSTRAINT pssr_signatures_capacity_check CHECK (capacity IS NULL OR capacity IN ('commissioning', 'operations', 'hse'));
CREATE UNIQUE INDEX pssr_signatures_capacity_uq ON public.pssr_signatures (review_id, capacity) WHERE capacity IS NOT NULL;

-- ── 2. RLS: sin escritura directa de estado ni firmas ────────────────────
DROP POLICY pssr_reviews_update ON public.pssr_reviews;
DROP POLICY pssr_reviews_delete ON public.pssr_reviews;
CREATE POLICY pssr_reviews_delete ON public.pssr_reviews FOR DELETE
  USING (public.is_project_editor(project_id) AND status IN ('draft', 'in_progress', 'rejected'));
REVOKE UPDATE ON public.pssr_reviews FROM anon, authenticated;
DROP POLICY pssr_signatures_insert ON public.pssr_signatures;
DROP POLICY pssr_signatures_delete ON public.pssr_signatures;
REVOKE INSERT, UPDATE, DELETE ON public.pssr_signatures FROM anon, authenticated;

-- Alta del PSSR (insert directo de editores): siempre nace en borrador, sin aprobación, con las firmas de la plantilla.
CREATE OR REPLACE FUNCTION public.guard_pssr_review_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.status := 'draft';
  NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.rfsu_certificate_id := NULL;
  NEW.submitted_by := NULL; NEW.submitted_at := NULL; NEW.rejected_by := NULL; NEW.rejected_at := NULL; NEW.rejected_reason := NULL;
  NEW.required_signatures := COALESCE((SELECT required_signatures FROM pssr_templates WHERE id = NEW.template_id), ARRAY['operations', 'hse']);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER pssr_reviews_guard_insert BEFORE INSERT ON public.pssr_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_pssr_review_insert();

-- Ítems: se editan solo antes de enviar (o tras un rechazo); tocar uno pasa el PSSR a in_progress.
CREATE OR REPLACE FUNCTION public.guard_pssr_review_item()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_status text;
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO v_status FROM pssr_reviews WHERE id = COALESCE(NEW.review_id, OLD.review_id);
  IF v_status IN ('pending_approval', 'approved') THEN
    RAISE EXCEPTION 'El PSSR ya fue enviado: sus ítems no se modifican (un líder puede rechazarlo para corregir)' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE pssr_reviews SET status = 'in_progress', updated_at = now() WHERE id = NEW.review_id AND status IN ('draft', 'rejected');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;
CREATE TRIGGER pssr_review_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pssr_review_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_pssr_review_item();

-- ── 3. Reglas comunes ────────────────────────────────────────────────────
-- Punch abiertos del sistema sin disposición para el arranque o «cerrar antes del arranque» (= startupDispositionBlockers).
CREATE OR REPLACE FUNCTION public.pssr_punch_blocker(p_review_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT NULLIF(concat_ws('; ',
    CASE WHEN count(*) FILTER (WHERE pu.startup_disposition IS NULL) > 0
      THEN count(*) FILTER (WHERE pu.startup_disposition IS NULL) || ' punch abierto(s) sin disposición para el arranque ('
           || string_agg(pu.punch_number, ', ' ORDER BY pu.punch_number) FILTER (WHERE pu.startup_disposition IS NULL) || ')' END,
    CASE WHEN count(*) FILTER (WHERE pu.startup_disposition = 'close_before_startup') > 0
      THEN count(*) FILTER (WHERE pu.startup_disposition = 'close_before_startup') || ' punch marcado(s) «cerrar antes del arranque» siguen abiertos ('
           || string_agg(pu.punch_number, ', ' ORDER BY pu.punch_number) FILTER (WHERE pu.startup_disposition = 'close_before_startup') || ')' END), '')
  FROM pssr_reviews r
  JOIN subsystems ss ON ss.system_id = r.system_id
  JOIN punches pu ON pu.subsystem_id = ss.id AND pu.project_id = r.project_id AND pu.status IN ('open', 'in_progress')
  WHERE r.id = p_review_id;
$fn$;

CREATE OR REPLACE FUNCTION public.pssr_items_pending(p_review_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT count(*)::int FROM pssr_review_items WHERE review_id = p_review_id AND status NOT IN ('si', 'na');
$fn$;

-- ── 4. RPC ───────────────────────────────────────────────────────────────
-- Enviar a aprobación (cualquier miembro no-client): todos los ítems sí/NA y sin punch que bloquee el arranque.
CREATE OR REPLACE FUNCTION public.submit_pssr(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_n integer; v_block text;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('draft', 'in_progress', 'rejected') THEN RAISE EXCEPTION 'El PSSR ya fue enviado o aprobado' USING ERRCODE = 'P0001'; END IF;
  v_n := public.pssr_items_pending(r.id);
  IF v_n > 0 THEN RAISE EXCEPTION '% ítem(s) sin completar o con estado NO', v_n USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pssr_review_items WHERE review_id = r.id) THEN RAISE EXCEPTION 'El PSSR no tiene ítems' USING ERRCODE = 'P0001'; END IF;
  v_block := public.pssr_punch_blocker(r.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  UPDATE pssr_reviews SET status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now(), updated_at = now() WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'submitted', jsonb_build_object('projectId', r.project_id));
END;
$fn$;

-- Firmar por una capacidad requerida (persona con esa capacidad en el proyecto; una firma por capacidad y persona).
CREATE OR REPLACE FUNCTION public.sign_pssr(p_review_id uuid, p_capacity text, p_signature_data text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r pssr_reviews%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se firma un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF NOT (p_capacity = ANY (r.required_signatures)) THEN RAISE EXCEPTION 'Este PSSR no requiere la firma %', p_capacity USING ERRCODE = '22023'; END IF;
  IF NOT public.has_capacity(r.project_id, p_capacity) THEN
    RAISE EXCEPTION 'No estás designado para firmar como % en este proyecto', p_capacity USING ERRCODE = '42501';
  END IF;
  IF r.submitted_by = auth.uid() THEN RAISE EXCEPTION 'Firma una persona distinta de quien envió el PSSR' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND capacity = p_capacity) THEN
    RAISE EXCEPTION 'La firma % ya fue registrada', p_capacity USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este PSSR: cada firma es de una persona distinta' USING ERRCODE = '23505';
  END IF;
  IF p_signature_data IS NULL OR length(p_signature_data) < 20 OR length(p_signature_data) > 300000 THEN
    RAISE EXCEPTION 'Firma no válida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO pssr_signatures (review_id, user_id, discipline, capacity, signature_data, signed_at)
  VALUES (r.id, auth.uid(), p_capacity, p_capacity, p_signature_data, now())
  RETURNING id INTO v_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'signed', jsonb_build_object('capacity', p_capacity));
  RETURN v_id;
END;
$fn$;

-- Retirar la firma propia mientras el PSSR espera aprobación.
CREATE OR REPLACE FUNCTION public.unsign_pssr(p_signature_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s pssr_signatures%ROWTYPE; r pssr_reviews%ROWTYPE;
BEGIN
  SELECT * INTO s FROM pssr_signatures WHERE id = p_signature_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Firma no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF s.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo puedes retirar tu propia firma' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM pssr_reviews WHERE id = s.review_id;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'El PSSR ya fue decidido' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM pssr_signatures WHERE id = s.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'unsigned', jsonb_build_object('capacity', s.capacity));
END;
$fn$;

-- Aprobar y emitir el RFSU del sistema (líder con capacidad de Comisionamiento, distinto de quien envió y de los
-- firmantes; todas las firmas requeridas; ítems sí/NA; sin punch que bloquee el arranque).
CREATE OR REPLACE FUNCTION public.approve_pssr(p_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_missing text[]; v_block text; v_phase uuid; v_cert uuid; v_n integer;
        v_sys systems%ROWTYPE; v_number text;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores aprueban el PSSR' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_capacity(r.project_id, 'commissioning') THEN
    RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se aprueba un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF r.submitted_by = auth.uid() THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien envió el PSSR' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Quien aprueba no puede ser uno de los firmantes' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(c) INTO v_missing FROM unnest(r.required_signatures) c
   WHERE NOT EXISTS (SELECT 1 FROM pssr_signatures s WHERE s.review_id = r.id AND s.capacity = c);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Faltan firmas: %', array_to_string(v_missing, ', ') USING ERRCODE = 'P0001'; END IF;
  v_n := public.pssr_items_pending(r.id);
  IF v_n > 0 THEN RAISE EXCEPTION '% ítem(s) sin completar o con estado NO', v_n USING ERRCODE = 'P0001'; END IF;
  v_block := public.pssr_punch_blocker(r.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;

  -- Fase que emite el RFSU (certificado «RFSU…»); si no hay, la última fase de la org (como hacía la acción).
  SELECT id INTO v_phase FROM project_phases WHERE org_id = r.org_id AND certificate_name ILIKE 'RFSU%' ORDER BY order_index LIMIT 1;
  IF v_phase IS NULL THEN SELECT id INTO v_phase FROM project_phases WHERE org_id = r.org_id ORDER BY order_index DESC LIMIT 1; END IF;
  IF v_phase IS NULL THEN RAISE EXCEPTION 'No hay fases configuradas en la organización' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_sys FROM systems WHERE id = r.system_id;
  -- Numeración serializada por proyecto (S17 la reemplaza por un contador atómico por tipo y subsistema).
  PERFORM pg_advisory_xact_lock(hashtext('rfsu:' || r.project_id::text));
  SELECT 'RFSU-' || lpad((count(*) + 1)::text, 3, '0') INTO v_number FROM certificates WHERE project_id = r.project_id;
  INSERT INTO certificates (project_id, system_id, phase_id, certificate_number, title, status, issued_date, issued_by, approved_by)
  VALUES (r.project_id, r.system_id, v_phase, v_number, 'RFSU — ' || COALESCE(v_sys.name, 'Sistema') || ' (' || COALESCE(v_sys.code, '') || ')',
          'issued', public.project_today(r.project_id), auth.uid(), auth.uid())
  RETURNING id INTO v_cert;
  UPDATE pssr_reviews SET status = 'approved', approved_by = auth.uid(), approved_at = now(), rfsu_certificate_id = v_cert, updated_at = now()
   WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'approved', jsonb_build_object('projectId', r.project_id, 'certNumber', v_number, 'certId', v_cert));
  RETURN v_cert;
END;
$fn$;

-- Rechazar (líder+, con motivo): vuelve a edición y las firmas se anulan (quedan en activity_log).
CREATE OR REPLACE FUNCTION public.reject_pssr(p_review_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_sigs jsonb;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores rechazan el PSSR' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se rechaza un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del rechazo' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'capacity', capacity, 'signed_at', signed_at)), '[]') INTO v_sigs
  FROM pssr_signatures WHERE review_id = r.id;
  DELETE FROM pssr_signatures WHERE review_id = r.id;
  UPDATE pssr_reviews SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejected_reason = v_reason, updated_at = now()
   WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'rejected', jsonb_build_object('projectId', r.project_id, 'reason', v_reason, 'voided_signatures', v_sigs));
END;
$fn$;

-- Notas (miembro no-client) y fecha límite (líder+), mientras no esté aprobado.
CREATE OR REPLACE FUNCTION public.update_pssr_meta(p_review_id uuid, p_set_notes boolean, p_notes text, p_set_due boolean, p_due date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r pssr_reviews%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status = 'approved' THEN RAISE EXCEPTION 'El PSSR ya está aprobado' USING ERRCODE = 'P0001'; END IF;
  IF p_set_due AND v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'La fecha límite la fija un líder o superior' USING ERRCODE = '42501';
  END IF;
  UPDATE pssr_reviews SET
    notes = CASE WHEN p_set_notes THEN public.mgmt_text(p_notes, 8000) ELSE notes END,
    review_due_date = CASE WHEN p_set_due THEN p_due ELSE review_due_date END,
    last_overdue_notif_at = CASE WHEN p_set_due THEN NULL ELSE last_overdue_notif_at END,
    updated_at = now()
  WHERE id = r.id;
END;
$fn$;

-- ── 5. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.guard_pssr_review_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_pssr_review_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pssr_punch_blocker(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pssr_items_pending(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_pssr(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_pssr(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unsign_pssr(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_pssr(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_pssr(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_pssr_meta(uuid, boolean, text, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pssr_punch_blocker(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pssr_items_pending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_pssr(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_pssr(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unsign_pssr(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_pssr(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_pssr(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_pssr_meta(uuid, boolean, text, boolean, date) TO authenticated, service_role;
