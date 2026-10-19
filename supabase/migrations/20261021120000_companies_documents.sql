-- Fase 8, sesión 1 (decisiones de Luis, 2026-10-19; doc §15): empresas y registro maestro de documentos.
--
--   companies                 catálogo por org (operadora/cliente, EPC, vendor, subcontratista, otra). Miembros,
--                             personal de operaciones y equipos de prueba se ligan a una empresa (company_id).
--   firma «nombre · empresa»  las tablas de firma guardan la empresa del firmante congelada al firmar (trigger).
--   documents                 registro maestro por proyecto (número único, tipo, disciplina, empresa emisora, sistemas)
--   document_revisions        revisiones: estado Draft → IFR → IFC → As-Built → Final; PDF opcional en el bucket
--                             project-documents (<project_id>/<document_id>/…, inmutable) y/o enlace https al EDMS.
--                             Vigente = la última revisión emitida (estado ≠ draft); las anteriores quedan superadas.
--   document_references       un ITR o una revisión de procedimiento referencia la revisión vigente de un documento.
--                             Referencia desactualizada (otra revisión vigente) = bloqueo duro al firmar el ITR o
--                             aprobar el procedimiento; si ya estaba firmado/aprobado, el gate del sistema queda con
--                             condición (criterio implícito documents_current) hasta revalidar con motivo o rehacer.
--   gates nuevos              el gate de arranque (RFSU / fase SU) nace con requires_lineup (decisión §15.8).
--
-- Lectura por RLS; escritura SOLO por RPC SECURITY DEFINER. client solo lee.

-- ── 1. Empresas ──────────────────────────────────────────────────────────
CREATE TABLE public.companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  short_name  text,
  kind        text NOT NULL DEFAULT 'other',
  tax_id      text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_kind_check CHECK (kind IN ('owner', 'epc', 'vendor', 'subcontractor', 'other')),
  CONSTRAINT companies_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX companies_org_name_uq ON public.companies (org_id, lower(btrim(name)));

ALTER TABLE public.org_members    ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.ops_personnel  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.test_equipment ADD COLUMN owner_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- La empresa siempre es de la misma org que la fila que la referencia.
CREATE OR REPLACE FUNCTION public.company_same_org_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'test_equipment' THEN v_company := NEW.owner_company_id; ELSE v_company := NEW.company_id; END IF;
  IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_company AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'La empresa no pertenece a la organización' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER org_members_company_guard BEFORE INSERT OR UPDATE OF company_id ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.company_same_org_guard();
CREATE TRIGGER ops_personnel_company_guard BEFORE INSERT OR UPDATE OF company_id ON public.ops_personnel
  FOR EACH ROW EXECUTE FUNCTION public.company_same_org_guard();
CREATE TRIGGER test_equipment_company_guard BEFORE INSERT OR UPDATE OF owner_company_id ON public.test_equipment
  FOR EACH ROW EXECUTE FUNCTION public.company_same_org_guard();

-- Backfill: los textos libres existentes pasan a ser empresas (tipo «otra») y se enlazan.
INSERT INTO public.companies (org_id, name)
SELECT DISTINCT ON (x.org_id, lower(btrim(x.name))) x.org_id, btrim(x.name)
FROM (SELECT org_id, company AS name FROM public.ops_personnel WHERE NULLIF(btrim(company), '') IS NOT NULL
      UNION ALL
      SELECT org_id, owner_company FROM public.test_equipment WHERE NULLIF(btrim(owner_company), '') IS NOT NULL) x
ON CONFLICT DO NOTHING;
UPDATE public.ops_personnel p SET company_id = c.id FROM public.companies c
 WHERE c.org_id = p.org_id AND lower(btrim(c.name)) = lower(btrim(p.company)) AND p.company_id IS NULL;
UPDATE public.test_equipment t SET owner_company_id = c.id FROM public.companies c
 WHERE c.org_id = t.org_id AND lower(btrim(c.name)) = lower(btrim(t.owner_company)) AND t.owner_company_id IS NULL;

-- Etiqueta de la empresa de un usuario en una org (para congelar en las firmas).
CREATE OR REPLACE FUNCTION public.member_company_name(p_org_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(NULLIF(c.short_name, ''), c.name)
  FROM org_members om JOIN companies c ON c.id = om.company_id
  WHERE om.org_id = p_org_id AND om.user_id = p_user_id;
$fn$;
REVOKE EXECUTE ON FUNCTION public.member_company_name(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Firma «nombre · empresa» congelada ────────────────────────────────
ALTER TABLE public.itr_signatures          ADD COLUMN signer_company text;
ALTER TABLE public.system_gate_signatures  ADD COLUMN signer_company text;
ALTER TABLE public.system_gate_approvals   ADD COLUMN approved_company text;
ALTER TABLE public.performance_certificates
  ADD COLUMN commissioning_company text, ADD COLUMN operations_company text, ADD COLUMN client_company text;
ALTER TABLE public.ownership_transfers
  ADD COLUMN commissioning_company text, ADD COLUMN operations_company text;

CREATE OR REPLACE FUNCTION public.freeze_signer_company()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'itr_signatures' THEN
    SELECT p.org_id INTO v_org FROM itrs i JOIN projects p ON p.id = i.project_id WHERE i.id = NEW.itr_id;
    NEW.signer_company := public.member_company_name(v_org, NEW.user_id);
  ELSIF TG_TABLE_NAME = 'system_gate_signatures' THEN
    NEW.signer_company := public.member_company_name(NEW.org_id, NEW.user_id);
  ELSIF TG_TABLE_NAME = 'system_gate_approvals' THEN
    IF TG_OP = 'INSERT' THEN NEW.approved_company := public.member_company_name(NEW.org_id, NEW.approved_by); END IF;
  ELSIF TG_TABLE_NAME = 'performance_certificates' THEN
    IF NEW.commissioning_signed_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.commissioning_signed_by IS DISTINCT FROM NEW.commissioning_signed_by) THEN
      NEW.commissioning_company := public.member_company_name(NEW.org_id, NEW.commissioning_signed_by); END IF;
    IF NEW.operations_signed_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.operations_signed_by IS DISTINCT FROM NEW.operations_signed_by) THEN
      NEW.operations_company := public.member_company_name(NEW.org_id, NEW.operations_signed_by); END IF;
    IF NEW.client_signed_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.client_signed_by IS DISTINCT FROM NEW.client_signed_by) THEN
      NEW.client_company := public.member_company_name(NEW.org_id, NEW.client_signed_by); END IF;
  ELSIF TG_TABLE_NAME = 'ownership_transfers' THEN
    IF NEW.commissioning_signed_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.commissioning_signed_by IS DISTINCT FROM NEW.commissioning_signed_by) THEN
      NEW.commissioning_company := public.member_company_name(NEW.org_id, NEW.commissioning_signed_by); END IF;
    IF NEW.operations_signed_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.operations_signed_by IS DISTINCT FROM NEW.operations_signed_by) THEN
      NEW.operations_company := public.member_company_name(NEW.org_id, NEW.operations_signed_by); END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER itr_signatures_company BEFORE INSERT ON public.itr_signatures
  FOR EACH ROW EXECUTE FUNCTION public.freeze_signer_company();
CREATE TRIGGER system_gate_signatures_company BEFORE INSERT ON public.system_gate_signatures
  FOR EACH ROW EXECUTE FUNCTION public.freeze_signer_company();
CREATE TRIGGER system_gate_approvals_company BEFORE INSERT ON public.system_gate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.freeze_signer_company();
CREATE TRIGGER performance_certificates_company BEFORE INSERT OR UPDATE ON public.performance_certificates
  FOR EACH ROW EXECUTE FUNCTION public.freeze_signer_company();
CREATE TRIGGER ownership_transfers_company BEFORE INSERT OR UPDATE ON public.ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_signer_company();

-- ── 3. Registro maestro de documentos ────────────────────────────────────
CREATE TABLE public.documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  number              text NOT NULL,
  title               text NOT NULL,
  doc_type            text NOT NULL DEFAULT 'other',
  discipline_id       uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  current_revision_id uuid,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_type_check CHECK (doc_type IN
    ('pid', 'pfd', 'datasheet', 'drawing', 'specification', 'procedure', 'manual', 'calculation', 'vendor', 'other')),
  CONSTRAINT documents_number_check CHECK (length(btrim(number)) BETWEEN 1 AND 80),
  CONSTRAINT documents_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 300)
);
CREATE UNIQUE INDEX documents_project_number_uq ON public.documents (project_id, upper(btrim(number)));

CREATE TABLE public.document_revisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq          integer NOT NULL,
  rev          text NOT NULL,
  status       text NOT NULL,
  issued_on    date,
  file_path    text,
  file_name    text,
  external_url text,
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_revisions_status_check CHECK (status IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final')),
  CONSTRAINT document_revisions_rev_check CHECK (length(btrim(rev)) BETWEEN 1 AND 20),
  CONSTRAINT document_revisions_url_check CHECK (external_url IS NULL OR external_url ~* '^https://'),
  CONSTRAINT document_revisions_seq_uq UNIQUE (document_id, seq)
);
CREATE UNIQUE INDEX document_revisions_rev_uq ON public.document_revisions (document_id, upper(btrim(rev)));
ALTER TABLE public.documents ADD CONSTRAINT documents_current_revision_fkey
  FOREIGN KEY (current_revision_id) REFERENCES public.document_revisions(id) ON DELETE SET NULL;

CREATE TABLE public.document_systems (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  system_id   uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, system_id)
);
CREATE INDEX document_systems_system_idx ON public.document_systems (system_id);

-- Referencia de un ITR o de una revisión de procedimiento a la revisión de un documento.
CREATE TABLE public.document_references (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id      uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  revision_id      uuid NOT NULL REFERENCES public.document_revisions(id) ON DELETE RESTRICT,
  target_kind      text NOT NULL,
  itr_id           uuid REFERENCES public.itrs(id) ON DELETE CASCADE,
  procedure_revision_id uuid REFERENCES public.procedure_revisions(id) ON DELETE CASCADE,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Revalidación de una referencia superada en un ITR firmado / procedimiento aprobado (con motivo).
  revalidated_by   uuid,
  revalidated_at   timestamptz,
  revalidated_from uuid REFERENCES public.document_revisions(id) ON DELETE SET NULL,
  revalidation_reason text,
  CONSTRAINT document_references_kind_check CHECK (
    (target_kind = 'itr' AND itr_id IS NOT NULL AND procedure_revision_id IS NULL)
    OR (target_kind = 'procedure_revision' AND procedure_revision_id IS NOT NULL AND itr_id IS NULL))
);
CREATE UNIQUE INDEX document_references_itr_uq ON public.document_references (itr_id, document_id) WHERE itr_id IS NOT NULL;
CREATE UNIQUE INDEX document_references_proc_uq ON public.document_references (procedure_revision_id, document_id) WHERE procedure_revision_id IS NOT NULL;
CREATE INDEX document_references_document_idx ON public.document_references (document_id);
CREATE INDEX document_references_project_idx ON public.document_references (project_id);

ALTER TABLE public.companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_revisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_systems    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_my_org_ids()));
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY document_revisions_select ON public.document_revisions FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY document_systems_select ON public.document_systems FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY document_references_select ON public.document_references FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- Bucket de documentos: <project_id>/<document_id>/…, inmutable.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-documents', 'project-documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY project_documents_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_project_ids()::text));
CREATE POLICY project_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_project_ids()::text));
CREATE POLICY project_documents_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'project-documents') WITH CHECK (bucket_id <> 'project-documents');
CREATE POLICY project_documents_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'project-documents');

-- ── 4. RPC: empresas (owner/admin) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_caller_role(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT om.role::text FROM org_members om WHERE om.org_id = p_org_id AND om.user_id = auth.uid();
$fn$;
REVOKE EXECUTE ON FUNCTION public.org_caller_role(uuid) FROM PUBLIC, anon, authenticated;

-- Crea (p_id NULL) o actualiza una empresa.
CREATE OR REPLACE FUNCTION public.save_company(
  p_org_id uuid, p_id uuid, p_name text, p_short_name text, p_kind text, p_tax_id text, p_notes text, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text := public.org_caller_role(p_org_id); v_id uuid; v_name text := public.mgmt_text(p_name, 160);
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo owner o admin gestionan empresas' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Nombre obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_kind NOT IN ('owner', 'epc', 'vendor', 'subcontractor', 'other') THEN RAISE EXCEPTION 'Tipo de empresa no válido' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE org_id = p_org_id AND lower(btrim(name)) = lower(v_name) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Ya existe una empresa con ese nombre' USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO companies (org_id, name, short_name, kind, tax_id, notes, is_active, created_by)
    VALUES (p_org_id, v_name, public.mgmt_text(p_short_name, 40), p_kind, public.mgmt_text(p_tax_id, 40),
            public.mgmt_text(p_notes, 2000), COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE companies SET name = v_name, short_name = public.mgmt_text(p_short_name, 40), kind = p_kind,
           tax_id = public.mgmt_text(p_tax_id, 40), notes = public.mgmt_text(p_notes, 2000),
           is_active = COALESCE(p_is_active, true), updated_at = now()
     WHERE id = p_id AND org_id = p_org_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Empresa de un miembro de la org (owner/admin).
CREATE OR REPLACE FUNCTION public.set_member_company(p_org_id uuid, p_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text := public.org_caller_role(p_org_id);
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo owner o admin asignan empresas' USING ERRCODE = '42501';
  END IF;
  UPDATE org_members SET company_id = p_company_id WHERE org_id = p_org_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado' USING ERRCODE = 'P0002'; END IF;
END;
$fn$;

-- ── 5. RPC: documentos (control documental = líder+) ─────────────────────
CREATE OR REPLACE FUNCTION public.document_is_controller(p_role text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(p_role IN ('owner', 'admin', 'architect', 'leader'), false);
$fn$;

CREATE OR REPLACE FUNCTION public.document_check_refs(p_project_id uuid, p_discipline_id uuid, p_company_id uuid, p_systems uuid[])
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_discipline_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM disciplines WHERE id = p_discipline_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Disciplina de otra organización' USING ERRCODE = '22023';
  END IF;
  IF p_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Empresa de otra organización' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_systems, '{}'::uuid[])) s(id)
             WHERE NOT EXISTS (SELECT 1 FROM systems x WHERE x.id = s.id AND x.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Algún sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.document_check_refs(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- Crea (p_id NULL) o actualiza la ficha de un documento y sus sistemas.
CREATE OR REPLACE FUNCTION public.save_document(
  p_project_id uuid, p_id uuid, p_number text, p_title text, p_doc_type text,
  p_discipline_id uuid, p_company_id uuid, p_systems uuid[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text := public.register_caller_role(p_project_id); v_org uuid; v_id uuid;
        v_number text := upper(public.mgmt_text(p_number, 80)); v_title text := public.mgmt_text(p_title, 300);
BEGIN
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores gestionan el registro de documentos' USING ERRCODE = '42501';
  END IF;
  IF v_number IS NULL OR v_title IS NULL THEN RAISE EXCEPTION 'Número y título son obligatorios' USING ERRCODE = '22023'; END IF;
  IF p_doc_type NOT IN ('pid', 'pfd', 'datasheet', 'drawing', 'specification', 'procedure', 'manual', 'calculation', 'vendor', 'other') THEN
    RAISE EXCEPTION 'Tipo de documento no válido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.document_check_refs(p_project_id, p_discipline_id, p_company_id, p_systems);
  IF EXISTS (SELECT 1 FROM documents WHERE project_id = p_project_id AND upper(btrim(number)) = v_number AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Ya existe el documento %', v_number USING ERRCODE = '23505';
  END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_id IS NULL THEN
    INSERT INTO documents (org_id, project_id, number, title, doc_type, discipline_id, company_id, created_by)
    VALUES (v_org, p_project_id, v_number, v_title, p_doc_type, p_discipline_id, p_company_id, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE documents SET number = v_number, title = v_title, doc_type = p_doc_type, discipline_id = p_discipline_id,
           company_id = p_company_id, updated_at = now()
     WHERE id = p_id AND project_id = p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  END IF;
  DELETE FROM document_systems WHERE document_id = v_id AND NOT (system_id = ANY (COALESCE(p_systems, '{}'::uuid[])));
  INSERT INTO document_systems (document_id, system_id, project_id)
  SELECT v_id, s, p_project_id FROM unnest(COALESCE(p_systems, '{}'::uuid[])) s ON CONFLICT DO NOTHING;
  RETURN v_id;
END;
$fn$;

-- Vigente = la última revisión emitida (estado ≠ draft) por orden de registro.
CREATE OR REPLACE FUNCTION public.document_refresh_current(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_cur uuid;
BEGIN
  SELECT id INTO v_cur FROM document_revisions WHERE document_id = p_document_id AND status <> 'draft' ORDER BY seq DESC LIMIT 1;
  UPDATE documents SET current_revision_id = v_cur, updated_at = now() WHERE id = p_document_id;
  RETURN v_cur;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.document_refresh_current(uuid) FROM PUBLIC, anon, authenticated;

-- Registra una revisión. El archivo (opcional) ya debe estar subido en project-documents/<project>/<document>/…
CREATE OR REPLACE FUNCTION public.add_document_revision(
  p_document_id uuid, p_rev text, p_status text, p_issued_on date,
  p_file_path text, p_file_name text, p_external_url text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE d documents%ROWTYPE; v_role text; v_rev text := upper(public.mgmt_text(p_rev, 20)); v_id uuid; v_seq integer;
        v_url text := public.mgmt_text(p_external_url, 1000); v_path text := public.mgmt_text(p_file_path, 500);
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores registran revisiones' USING ERRCODE = '42501';
  END IF;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Indica la revisión' USING ERRCODE = '22023'; END IF;
  IF p_status NOT IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https://' THEN RAISE EXCEPTION 'El enlace debe ser https' USING ERRCODE = '22023'; END IF;
  IF v_path IS NOT NULL AND (split_part(v_path, '/', 1) <> d.project_id::text OR split_part(v_path, '/', 2) <> d.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-documents' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'Archivo no válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND upper(btrim(rev)) = v_rev) THEN
    RAISE EXCEPTION 'La revisión % ya existe', v_rev USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND status = 'draft') THEN
    RAISE EXCEPTION 'Hay una revisión en borrador: emítela o descártala primero' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM document_revisions WHERE document_id = d.id;
  INSERT INTO document_revisions (document_id, project_id, seq, rev, status, issued_on, file_path, file_name, external_url, notes, created_by)
  VALUES (d.id, d.project_id, v_seq, v_rev, p_status, CASE WHEN p_status <> 'draft' THEN COALESCE(p_issued_on, current_date) END,
          v_path, CASE WHEN v_path IS NOT NULL THEN public.mgmt_text(p_file_name, 255) END, v_url, public.mgmt_text(p_notes, 2000), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.document_refresh_current(d.id);
  RETURN v_id;
END;
$fn$;

-- Emite un borrador (draft → estado emitido) o descarta el borrador (p_status NULL).
CREATE OR REPLACE FUNCTION public.issue_document_revision(p_revision_id uuid, p_status text, p_issued_on date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
    UPDATE document_revisions SET status = p_status, issued_on = COALESCE(p_issued_on, current_date) WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.document_refresh_current(r.document_id);
END;
$fn$;

-- ── 6. Referencias de ITR / procedimiento a documentos ───────────────────
-- Un ITR se considera cerrado a cambios de referencias desde su primera firma; una revisión de procedimiento,
-- fuera de borrador.
CREATE OR REPLACE FUNCTION public.document_reference_target(p_kind text, p_target_id uuid,
  OUT project_id uuid, OUT locked boolean, OUT label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF p_kind = 'itr' THEN
    SELECT i.project_id, EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = i.id), i.itr_number
      INTO project_id, locked, label FROM itrs i WHERE i.id = p_target_id;
  ELSIF p_kind = 'procedure_revision' THEN
    SELECT r.project_id, r.status <> 'draft', p.number || ' R' || r.rev
      INTO project_id, locked, label FROM procedure_revisions r JOIN procedures p ON p.id = r.procedure_id WHERE r.id = p_target_id;
  ELSE
    RAISE EXCEPTION 'Tipo de referencia no válido' USING ERRCODE = '22023';
  END IF;
  IF project_id IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.document_reference_target(text, uuid) FROM PUBLIC, anon, authenticated;

-- Agrega la referencia a la revisión vigente del documento (miembro no-client; el registro abierto a cambios).
CREATE OR REPLACE FUNCTION public.add_document_reference(p_kind text, p_target_id uuid, p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t record; d documents%ROWTYPE; v_role text; v_id uuid;
BEGIN
  SELECT * INTO t FROM public.document_reference_target(p_kind, p_target_id);
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN RAISE EXCEPTION 'El registro ya está firmado o fuera de borrador: no se cambian sus referencias' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO d FROM documents WHERE id = p_document_id AND project_id = t.project_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento de otro proyecto' USING ERRCODE = '22023'; END IF;
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'El documento % no tiene una revisión emitida', d.number USING ERRCODE = 'P0001'; END IF;
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, itr_id, procedure_revision_id, created_by)
  VALUES (t.project_id, d.id, d.current_revision_id, p_kind,
          CASE WHEN p_kind = 'itr' THEN p_target_id END, CASE WHEN p_kind = 'procedure_revision' THEN p_target_id END, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'El documento % ya está referenciado', d.number USING ERRCODE = '23505'; END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.remove_document_reference(p_reference_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r document_references%ROWTYPE; t record; v_role text;
BEGIN
  SELECT * INTO r FROM document_references WHERE id = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referencia no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM public.document_reference_target(r.target_kind, COALESCE(r.itr_id, r.procedure_revision_id));
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN RAISE EXCEPTION 'El registro ya está firmado o fuera de borrador: no se cambian sus referencias' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM document_references WHERE id = r.id;
END;
$fn$;

-- Lleva la referencia a la revisión vigente. Abierto: cualquier miembro no-client. Ya firmado/aprobado:
-- revalidación de un líder+ con motivo (≥ 10 caracteres), que queda registrada (decisión §15.4).
CREATE OR REPLACE FUNCTION public.update_document_reference(p_reference_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r document_references%ROWTYPE; t record; d documents%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO r FROM document_references WHERE id = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referencia no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO d FROM documents WHERE id = r.document_id;
  IF d.current_revision_id IS NULL OR d.current_revision_id = r.revision_id THEN RAISE EXCEPTION 'La referencia ya está en la revisión vigente' USING ERRCODE = 'P0001'; END IF;
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
$fn$;

-- Mensaje de bloqueo si el registro referencia revisiones superadas (NULL si todo vigente).
CREATE OR REPLACE FUNCTION public.document_references_blocker(p_kind text, p_target_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT 'Revisión de documento superada: ' || string_agg(d.number || ' (usa ' || rv.rev || ', vigente ' || cur.rev || ')', ', ' ORDER BY d.number)
         || '. Actualiza la referencia antes de continuar.'
  FROM document_references r
  JOIN documents d ON d.id = r.document_id
  JOIN document_revisions rv ON rv.id = r.revision_id
  JOIN document_revisions cur ON cur.id = d.current_revision_id
  WHERE r.revision_id <> d.current_revision_id
    AND ((p_kind = 'itr' AND r.itr_id = p_target_id) OR (p_kind = 'procedure_revision' AND r.procedure_revision_id = p_target_id))
  HAVING count(*) > 0;
$fn$;
REVOKE EXECUTE ON FUNCTION public.document_references_blocker(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 7. Bloqueo duro: firmar ITR y aprobar/enviar procedimiento ───────────
DO $patch$
DECLARE v_def text; v_anchor text := E'IF eq_block IS NOT NULL THEN RAISE EXCEPTION ''%'', eq_block; END IF;';
BEGIN
  v_def := pg_get_functiondef('public.sign_itr_atomic(uuid, text, text)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'sign_itr_atomic: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor, v_anchor || E'\n-- Fase 8: no se firma contra una revisión de documento superada.\n'
    || E'eq_block:=public.document_references_blocker(''itr'',p_itr_id);\n'
    || E'IF eq_block IS NOT NULL THEN RAISE EXCEPTION ''%'', eq_block; END IF;');
END;
$patch$;

DO $patch$
DECLARE v_def text; v_blk text; v_anchors text[] := ARRAY[
  E'    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN',
  E'    SELECT id INTO v_prev FROM procedure_revisions WHERE procedure_id = r.procedure_id AND status = ''approved'' AND id <> r.id;'];
  a text;
BEGIN
  v_def := pg_get_functiondef('public.transition_procedure_revision(uuid, text, text)'::regprocedure);
  IF position('v_doc text' IN v_def) = 0 THEN
    v_def := replace(v_def, 'v_prev uuid;', 'v_prev uuid; v_doc text;');
  END IF;
  v_blk := E'    -- Fase 8: no se envía ni aprueba contra una revisión de documento superada.\n'
        || E'    v_doc := public.document_references_blocker(''procedure_revision'', r.id);\n'
        || E'    IF v_doc IS NOT NULL THEN RAISE EXCEPTION ''%'', v_doc USING ERRCODE = ''P0001''; END IF;\n';
  FOREACH a IN ARRAY v_anchors LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'transition_procedure_revision: ancla no encontrada o repetida: %', a;
    END IF;
    v_def := replace(v_def, a, v_blk || a);
  END LOOP;
  EXECUTE v_def;
END;
$patch$;

-- ── 8. Motor de gates: criterio implícito documents_current ─────────────
-- Condición (amarilla) si un ITR firmado del sistema o la revisión aprobada vigente de un procedimiento del sistema
-- referencia una revisión superada (decisión §15.4). Se inserta antes del criterio de desempeño (F7).
DO $patch$
DECLARE v_def text; v_anchor text := E'    -- Prueba de desempeño (F7): criterio implícito y bloqueante si el gate lo exige.';
BEGIN
  v_def := pg_get_functiondef('public.compute_system_gates(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'compute_system_gates: ancla no encontrada o repetida';
  END IF;
  v_def := replace(v_def, v_anchor, $blk$    -- Documentos vigentes (F8): referencias superadas en registros ya firmados/aprobados del sistema → condición.
    SELECT COUNT(*)::int,
           COALESCE(jsonb_agg(jsonb_build_object('reference_id', x.ref_id, 'document', x.doc_number, 'used', x.used_rev,
             'current', x.cur_rev, 'kind', x.kind, 'target', x.target, 'target_id', x.target_id) ORDER BY x.doc_number, x.target), '[]'::jsonb)
      INTO v_failn, v_fail
    FROM (
      SELECT dr.id AS ref_id, d.number AS doc_number, rv.rev AS used_rev, cur.rev AS cur_rev, 'itr' AS kind,
             i.itr_number AS target, i.id AS target_id
      FROM document_references dr
      JOIN documents d ON d.id = dr.document_id
      JOIN document_revisions rv ON rv.id = dr.revision_id
      JOIN document_revisions cur ON cur.id = d.current_revision_id
      JOIN itrs i ON i.id = dr.itr_id
      JOIN tags tg ON tg.id = i.tag_id
      JOIN subsystems ss ON ss.id = tg.subsystem_id
      WHERE ss.system_id = p_system_id AND dr.revision_id <> d.current_revision_id
        AND EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = i.id)
      UNION ALL
      SELECT dr.id, d.number, rv.rev, cur.rev, 'procedure', pr.number || ' R' || prv.rev, pr.id
      FROM document_references dr
      JOIN documents d ON d.id = dr.document_id
      JOIN document_revisions rv ON rv.id = dr.revision_id
      JOIN document_revisions cur ON cur.id = d.current_revision_id
      JOIN procedure_revisions prv ON prv.id = dr.procedure_revision_id
      JOIN procedures pr ON pr.id = prv.procedure_id AND pr.current_revision_id = prv.id
      WHERE pr.system_id = p_system_id AND dr.revision_id <> d.current_revision_id
    ) x;
    v_crit := v_crit || jsonb_build_array(jsonb_build_object(
      'criterion_id', NULL, 'kind', 'documents_current', 'label', NULL, 'blocking', false,
      'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'warn' END,
      'detail', jsonb_build_object('outdated', v_fail, 'outdated_count', v_failn)));
    IF v_failn > 0 AND v_level = 'green' THEN v_level := 'yellow'; END IF;

$blk$ || v_anchor);
  EXECUTE v_def;
END;
$patch$;

-- ── 9. Gate de arranque con line-up por defecto (organizaciones nuevas) ──
DO $patch$
DECLARE v_def text;
  v_anchor text := E'  INSERT INTO readiness_gates (org_id, code, name, order_index, phase_id, requires_previous)\n  VALUES (v_phase.org_id, v_code, v_phase.name, v_phase.order_index * 10, v_phase.id, NOT v_first)';
BEGIN
  v_def := pg_get_functiondef('public.seed_default_gate_for_phase(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'seed_default_gate_for_phase: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor,
       E'  INSERT INTO readiness_gates (org_id, code, name, order_index, phase_id, requires_previous, requires_lineup)\n'
    || E'  VALUES (v_phase.org_id, v_code, v_phase.name, v_phase.order_index * 10, v_phase.id, NOT v_first,\n'
    || E'          v_code = ''RFSU'' OR upper(btrim(v_phase.code)) = ''SU'')');
END;
$patch$;

-- ── 10. Permisos ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.company_same_org_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.freeze_signer_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_company(uuid, uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_company(uuid, uuid, uuid)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_document(uuid, uuid, text, text, text, uuid, uuid, uuid[])   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_document_revision(uuid, text, text, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_document_revision(uuid, text, date)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_document_reference(text, uuid, uuid)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_document_reference(uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_document_reference(uuid, text)                             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_company(uuid, uuid, text, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_company(uuid, uuid, uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_document(uuid, uuid, text, text, text, uuid, uuid, uuid[])   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_document_revision(uuid, text, text, date, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_document_revision(uuid, text, date)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_document_reference(text, uuid, uuid)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_document_reference(uuid)                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_document_reference(uuid, text)                             TO authenticated, service_role;
