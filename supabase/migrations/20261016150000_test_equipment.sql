-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 · bloque B (plan readiness, decisiones §10.3 y §10.9–10.12): equipos de prueba calibrados.
--
-- · Inventario por ORGANIZACIÓN (test_equipment): tipo, marca/modelo/serie, n.º de certificado,
--   fechas de calibración y vencimiento; PDF del certificado opcional (bucket test-equipment, <org>/…).
-- · El ITR registra los equipos usados (itr_test_equipment) con una FOTO de la calibración al momento
--   de uso: la evidencia no cambia si después se edita el inventario.
-- · Validez contra la FECHA DE USO (13.42): vigente si used_on ∈ [calibrado, vence]. Registrar un
--   equipo vencido se permite (con aviso); FIRMAR el ITR no (sign_itr_atomic).
-- · itr_templates.requires_test_equipment: la firma exige al menos un equipo. Se marca en las
--   plantillas que hoy piden el equipo por texto («Test Equipment Used», serie, vencimiento…).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Inventario ───────────────────────────────────────────────────────────
CREATE TABLE public.test_equipment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code               text NOT NULL,
  kind               text NOT NULL,
  make               text,
  model              text,
  serial_number      text NOT NULL,
  owner_company      text,
  certificate_number text NOT NULL,
  calibrated_on      date NOT NULL,
  calibration_due    date NOT NULL,
  certificate_path   text,
  notes              text,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_equipment_code_uq UNIQUE (org_id, code),
  CONSTRAINT test_equipment_kind_check CHECK (kind IN (
    'insulation_tester', 'loop_calibrator', 'pressure_gauge', 'deadweight_tester', 'multimeter',
    'clamp_meter', 'earth_tester', 'relay_tester', 'torque_wrench', 'thermometer', 'flow_meter', 'other')),
  CONSTRAINT test_equipment_dates_check CHECK (calibration_due >= calibrated_on),
  CONSTRAINT test_equipment_text_check CHECK (length(btrim(code)) BETWEEN 1 AND 60 AND length(btrim(serial_number)) BETWEEN 1 AND 100
    AND length(btrim(certificate_number)) BETWEEN 1 AND 100),
  CONSTRAINT test_equipment_cert_path_check CHECK (certificate_path IS NULL OR certificate_path LIKE org_id::text || '/%')
);
CREATE INDEX test_equipment_org_due_idx ON public.test_equipment (org_id, calibration_due) WHERE is_active;

COMMENT ON TABLE public.test_equipment IS 'Equipos de prueba de la organización con su calibración (fase 4-B). Validez contra la fecha de uso en el ITR.';

ALTER TABLE public.test_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_equipment_select ON public.test_equipment FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_my_org_ids()));
-- Escriben los roles de edición de la org (owner/admin/architect/leader).
CREATE POLICY test_equipment_insert ON public.test_equipment FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = test_equipment.org_id AND m.user_id = auth.uid()
    AND m.role::text IN ('owner', 'admin', 'architect', 'leader')));
CREATE POLICY test_equipment_update ON public.test_equipment FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = test_equipment.org_id AND m.user_id = auth.uid()
    AND m.role::text IN ('owner', 'admin', 'architect', 'leader')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = test_equipment.org_id AND m.user_id = auth.uid()
    AND m.role::text IN ('owner', 'admin', 'architect', 'leader')));
-- Borrar solo si nunca se usó (la FK de itr_test_equipment lo impide); si no, se desactiva.
CREATE POLICY test_equipment_delete ON public.test_equipment FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = test_equipment.org_id AND m.user_id = auth.uid()
    AND m.role::text IN ('owner', 'admin')));

CREATE OR REPLACE FUNCTION public.test_equipment_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'La organización del equipo no cambia'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER test_equipment_touch BEFORE UPDATE ON public.test_equipment
  FOR EACH ROW EXECUTE FUNCTION public.test_equipment_touch();

-- ── 2. Uso en el ITR ────────────────────────────────────────────────────────
CREATE TABLE public.itr_test_equipment (
  itr_id             uuid NOT NULL REFERENCES public.itrs(id) ON DELETE CASCADE,
  equipment_id       uuid NOT NULL REFERENCES public.test_equipment(id) ON DELETE RESTRICT,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  used_on            date NOT NULL DEFAULT CURRENT_DATE,
  -- Foto de la calibración al momento de uso (la llena el trigger; el cliente no la controla).
  calibrated_on      date NOT NULL,
  calibration_due    date NOT NULL,
  certificate_number text NOT NULL,
  snapshot           jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by           uuid DEFAULT auth.uid(),
  added_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (itr_id, equipment_id)
);
CREATE INDEX itr_test_equipment_equipment_idx ON public.itr_test_equipment (equipment_id);

ALTER TABLE public.itr_test_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY itr_test_equipment_select ON public.itr_test_equipment FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY itr_test_equipment_insert ON public.itr_test_equipment FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY itr_test_equipment_delete ON public.itr_test_equipment FOR DELETE TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()) AND EXISTS (
    SELECT 1 FROM public.projects p JOIN public.org_members m ON m.org_id = p.org_id
    WHERE p.id = itr_test_equipment.project_id AND m.user_id = auth.uid() AND m.role::text <> 'client'));

-- Antes de insertar: proyecto del ITR, mismo org que el equipo, rol ≠ client, foto de calibración.
CREATE OR REPLACE FUNCTION public.itr_test_equipment_fill() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
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
  NEW.used_on := CURRENT_DATE;
  NEW.calibrated_on := eq.calibrated_on;
  NEW.calibration_due := eq.calibration_due;
  NEW.certificate_number := eq.certificate_number;
  NEW.snapshot := jsonb_build_object('code', eq.code, 'kind', eq.kind, 'make', eq.make, 'model', eq.model,
    'serial_number', eq.serial_number, 'owner_company', eq.owner_company, 'certificate_path', eq.certificate_path);
  NEW.added_by := auth.uid();
  NEW.added_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER itr_test_equipment_fill BEFORE INSERT ON public.itr_test_equipment
  FOR EACH ROW EXECUTE FUNCTION public.itr_test_equipment_fill();
-- Igual que respuestas y adjuntos: un ITR firmado no cambia sin reapertura auditada.
CREATE TRIGGER itr_test_equipment_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.itr_test_equipment
  FOR EACH ROW EXECUTE FUNCTION public.guard_itr_content();

-- ── 3. Plantillas que exigen equipo ─────────────────────────────────────────
ALTER TABLE public.itr_templates ADD COLUMN requires_test_equipment boolean NOT NULL DEFAULT false;

-- Una revisión asignada a ITRs es inmutable salvo is_active; requires_test_equipment también es metadato
-- (las plantillas marcadas ya pedían el equipo como ítem de texto: el requisito no cambia, ahora se valida).
CREATE OR REPLACE FUNCTION public.guard_assigned_itr_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE tid uuid;
BEGIN
  IF TG_TABLE_NAME='itr_templates' THEN tid:=OLD.id;
  ELSE
    tid:=CASE WHEN TG_OP='DELETE' THEN OLD.template_id ELSE NEW.template_id END;
    IF TG_OP='UPDATE' AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN RAISE EXCEPTION 'Cannot move template content'; END IF;
    -- Cascade from a template delete already authorised by the itr_templates trigger.
    IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.itr_templates WHERE id=tid) THEN RETURN OLD; END IF;
  END IF;
  PERFORM 1 FROM public.itr_templates WHERE id=tid FOR UPDATE;
  IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.itr_templates t JOIN public.org_members m ON m.org_id=t.org_id WHERE t.id=tid AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','architect','leader')) THEN RAISE EXCEPTION 'Template editor membership required'; END IF;
  IF EXISTS(SELECT 1 FROM public.itrs WHERE template_id=tid) THEN
    IF TG_TABLE_NAME='itr_templates' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'is_active'-'requires_test_equipment')=(to_jsonb(OLD)-'is_active'-'requires_test_equipment') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Assigned revision is immutable; publish a new revision';
  END IF;
  IF TG_TABLE_NAME='itr_template_items' AND TG_OP<>'DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM public.itr_template_sections WHERE id=NEW.section_id AND template_id=NEW.template_id) THEN RAISE EXCEPTION 'Section revision mismatch'; END IF;
    IF NEW.condition_item_id IS NOT NULL AND (NEW.condition_item_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.itr_template_items WHERE id=NEW.condition_item_id AND template_id=NEW.template_id)) THEN RAISE EXCEPTION 'Condition revision mismatch'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;
UPDATE public.itr_templates t SET requires_test_equipment = true
WHERE EXISTS (
  SELECT 1 FROM public.itr_template_items i
  WHERE i.template_id = t.id
    AND (i.description ILIKE '%test equipment%' OR i.description ILIKE '%equipo de prueba%'
         OR i.description ILIKE 'calibration expiry date%' OR i.description ILIKE 'equipment calibration expiry%')
);

-- ── 4. Bloqueo de la firma ──────────────────────────────────────────────────
-- Motivo por el que el ITR no se puede firmar por equipos de prueba, o NULL.
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
    WHEN (SELECT t.requires_test_equipment FROM itrs i JOIN itr_templates t ON t.id = i.template_id WHERE i.id = p_itr_id)
      AND NOT EXISTS (SELECT 1 FROM itr_test_equipment u WHERE u.itr_id = p_itr_id)
      THEN 'Registra el equipo de prueba usado (con su calibración) antes de firmar.'
  END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.itr_test_equipment_blocker(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.itr_test_equipment_blocker(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sign_itr_atomic(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]:=ARRAY['executor','supervisor','client']; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
-- Fase 4-B: equipo de prueba registrado y calibrado en la fecha de uso.
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN (SELECT count(DISTINCT role) FROM public.itr_signatures WHERE itr_id=p_itr_id)=3 THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=CURRENT_DATE WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;

-- ── 5. Certificados (PDF opcional) ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('test-equipment', 'test-equipment', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY test_equipment_cert_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'test-equipment' AND (storage.foldername(name))[1] IN (SELECT public.get_my_org_ids()::text));
CREATE POLICY test_equipment_cert_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'test-equipment' AND EXISTS (
    SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id::text = (storage.foldername(name))[1]
      AND m.role::text IN ('owner', 'admin', 'architect', 'leader')));
