-- F-21a (plan referente § P; propuesta y maquetas aprobadas por Luis 2026-10-23): red-line de campo sobre un P&ID.
-- Un red-line (RL-0001, por proyecto) es un registro sobre una REVISIÓN de un plano que agrupa marcas en rojo:
--   cloud = nube (2 puntos: esquinas opuestas) · pen = trazo (polilínea de 2..500 puntos) · text = texto (1 punto + t)
--   · point = red-line puntual del teléfono (1 punto; F-21b).
-- Las marcas van en `marks` (jsonb, [{k, p:[[x,y],…], t?}]) en unidad 0..1 de la página YA ROTADA, con el tamaño y
-- la rotación de la página al dibujar (igual que pid_markups). No se reusa la capa `redline` de pid_markups: el visor,
-- system_pid_sheets y los triggers de copia/auditoría de esa tabla son de los límites de sistema.
-- Decisiones de Luis: crea Líder en adelante (is_project_editor); estados abierta → aceptada / rechazada (con
-- motivo, otra persona, Líder en adelante) → incorporada en la revisión X (F-21c); sin efecto en las liberaciones.
-- Comentarios: cualquier miembro del proyecto (también el cliente). Fotos: bucket redline-photos inmutable,
-- <project_id>/<redline_id>/…, registradas por RPC. Un red-line guardado no se borra: si quedó mal, se rechaza.
-- Escritura SOLO por RPC SECURITY DEFINER; las tablas solo tienen política de lectura.

-- ── 1. Validación de las marcas ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pid_redline_marks_ok(p_marks jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_m jsonb; v_k text; v_n integer; v_pt jsonb;
BEGIN
  IF p_marks IS NULL OR jsonb_typeof(p_marks) <> 'array' OR jsonb_array_length(p_marks) NOT BETWEEN 1 AND 50 THEN
    RETURN false;
  END IF;
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_marks) LOOP
    IF jsonb_typeof(v_m) <> 'object' OR jsonb_typeof(v_m -> 'p') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    v_k := v_m ->> 'k';
    v_n := jsonb_array_length(v_m -> 'p');
    IF v_k = 'cloud' THEN IF v_n <> 2 THEN RETURN false; END IF;
    ELSIF v_k = 'pen' THEN IF v_n NOT BETWEEN 2 AND 500 THEN RETURN false; END IF;
    ELSIF v_k IN ('text', 'point') THEN IF v_n <> 1 THEN RETURN false; END IF;
    ELSE RETURN false;
    END IF;
    IF v_k = 'text' THEN
      IF jsonb_typeof(v_m -> 't') IS DISTINCT FROM 'string' OR char_length(btrim(v_m ->> 't')) NOT BETWEEN 1 AND 120 THEN RETURN false; END IF;
    ELSIF v_m ? 't' THEN
      RETURN false;
    END IF;
    FOR v_pt IN SELECT * FROM jsonb_array_elements(v_m -> 'p') LOOP
      IF jsonb_typeof(v_pt) <> 'array' OR jsonb_array_length(v_pt) <> 2
         OR jsonb_typeof(v_pt -> 0) <> 'number' OR jsonb_typeof(v_pt -> 1) <> 'number'
         OR (v_pt ->> 0)::numeric NOT BETWEEN 0 AND 1 OR (v_pt ->> 1)::numeric NOT BETWEEN 0 AND 1 THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$function$;

-- ── 2. Tablas ────────────────────────────────────────────────────────────────

CREATE TABLE public.pid_redlines (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id                uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id               uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  revision_id               uuid NOT NULL REFERENCES public.document_revisions(id) ON DELETE CASCADE,
  page_num                  integer NOT NULL CHECK (page_num >= 1),
  seq                       integer NOT NULL,
  number                    text NOT NULL,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'incorporated')),
  description               text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 3 AND 2000),
  system_id                 uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  tag_id                    uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  marks                     jsonb NOT NULL CHECK (public.pid_redline_marks_ok(marks)),
  page_width                numeric NOT NULL CHECK (page_width > 0),
  page_height               numeric NOT NULL CHECK (page_height > 0),
  page_rotation             smallint NOT NULL CHECK (page_rotation IN (0, 90, 180, 270)),
  created_by                uuid NOT NULL REFERENCES public.profiles(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  reviewed_by               uuid REFERENCES public.profiles(id),
  reviewed_at               timestamptz,
  review_note               text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  incorporated_revision_id  uuid REFERENCES public.document_revisions(id) ON DELETE SET NULL,
  incorporated_by           uuid REFERENCES public.profiles(id),
  incorporated_at           timestamptz,
  UNIQUE (project_id, seq),
  CHECK (status <> 'rejected' OR char_length(btrim(review_note)) >= 10)
);
CREATE INDEX pid_redlines_revision_idx ON public.pid_redlines (revision_id, page_num);
CREATE INDEX pid_redlines_project_status_idx ON public.pid_redlines (project_id, status);
CREATE INDEX pid_redlines_document_idx ON public.pid_redlines (document_id);

CREATE TRIGGER pid_redlines_same_project BEFORE INSERT OR UPDATE OF system_id, tag_id, project_id ON public.pid_redlines
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();

CREATE TABLE public.pid_redline_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redline_id  uuid NOT NULL REFERENCES public.pid_redlines(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pid_redline_comments_redline_idx ON public.pid_redline_comments (redline_id, created_at);

CREATE TABLE public.pid_redline_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redline_id  uuid NOT NULL REFERENCES public.pid_redlines(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path   text NOT NULL UNIQUE,
  file_name   text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type   text,
  size_bytes  bigint,
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pid_redline_photos_redline_idx ON public.pid_redline_photos (redline_id);

ALTER TABLE public.pid_redlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pid_redline_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pid_redline_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pid_redlines_select ON public.pid_redlines FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY pid_redline_comments_select ON public.pid_redline_comments FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY pid_redline_photos_select ON public.pid_redline_photos FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 3. Fotos: bucket inmutable <project_id>/<redline_id>/… ──────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('redline-photos', 'redline-photos', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY redline_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'redline-photos'
         AND (storage.foldername(name))[1] IN (SELECT public.get_my_project_ids()::text));
CREATE POLICY redline_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'redline-photos'
              AND (storage.foldername(name))[1] IN (SELECT public.get_my_editor_project_ids()::text));
CREATE POLICY redline_photos_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'redline-photos') WITH CHECK (bucket_id <> 'redline-photos');
CREATE POLICY redline_photos_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'redline-photos');

-- ── 4. RPC ───────────────────────────────────────────────────────────────────

-- Crea un red-line sobre una revisión de un P&ID (Líder en adelante).
CREATE OR REPLACE FUNCTION public.create_pid_redline(
  p_revision_id uuid, p_page_num integer, p_description text, p_marks jsonb, p_page_width numeric, p_page_height numeric,
  p_page_rotation integer, p_system_id uuid DEFAULT NULL, p_tag_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_doc uuid; v_project uuid; v_org uuid; v_type text; v_status text; v_seq integer; v_id uuid; v_number text;
BEGIN
  SELECT r.document_id, d.project_id, p.org_id, d.doc_type, r.status
    INTO v_doc, v_project, v_org, v_type, v_status
  FROM document_revisions r JOIN documents d ON d.id = r.document_id JOIN projects p ON p.id = d.project_id
  WHERE r.id = p_revision_id;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_editor(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_type <> 'pid' THEN RAISE EXCEPTION 'Solo los P&ID llevan red-line' USING ERRCODE = '22023'; END IF;
  IF v_status = 'void' THEN RAISE EXCEPTION 'La revisión está anulada' USING ERRCODE = 'P0001'; END IF;
  IF p_page_num IS NULL OR p_page_num < 1 THEN RAISE EXCEPTION 'Página no válida' USING ERRCODE = '22023'; END IF;
  IF char_length(btrim(coalesce(p_description, ''))) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'Describe qué cambió en campo (al menos 3 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF NOT public.pid_redline_marks_ok(p_marks) THEN RAISE EXCEPTION 'Marcas no válidas' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pid_redlines:' || v_project::text));
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM pid_redlines WHERE project_id = v_project;
  v_number := 'RL-' || lpad(v_seq::text, 4, '0');

  INSERT INTO pid_redlines (org_id, project_id, document_id, revision_id, page_num, seq, number, description, system_id, tag_id,
                            marks, page_width, page_height, page_rotation, created_by)
  VALUES (v_org, v_project, v_doc, p_revision_id, p_page_num, v_seq, v_number, btrim(p_description), p_system_id, p_tag_id,
          p_marks, p_page_width, p_page_height, p_page_rotation, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END;
$function$;

-- Corrige descripción, sistema o tag mientras está abierta (Líder en adelante).
CREATE OR REPLACE FUNCTION public.update_pid_redline(p_id uuid, p_description text, p_system_id uuid DEFAULT NULL, p_tag_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row pid_redlines%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM pid_redlines WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Red-line no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_editor(v_row.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'open' THEN RAISE EXCEPTION 'Solo se corrige un red-line abierto' USING ERRCODE = 'P0001'; END IF;
  IF char_length(btrim(coalesce(p_description, ''))) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'Describe qué cambió en campo (al menos 3 caracteres)' USING ERRCODE = '22023';
  END IF;
  UPDATE pid_redlines SET description = btrim(p_description), system_id = p_system_id, tag_id = p_tag_id, updated_at = now()
  WHERE id = p_id;
END;
$function$;

-- Acepta o rechaza un red-line abierto: Líder en adelante y distinto de quien lo creó; rechazar exige motivo ≥ 10.
CREATE OR REPLACE FUNCTION public.review_pid_redline(p_id uuid, p_accept boolean, p_note text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row pid_redlines%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT * INTO v_row FROM pid_redlines WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Red-line no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_editor(v_row.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'open' THEN RAISE EXCEPTION 'El red-line ya fue revisado' USING ERRCODE = 'P0001'; END IF;
  IF v_row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Lo revisa otra persona, no quien lo creó' USING ERRCODE = 'P0001';
  END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Falta la decisión' USING ERRCODE = '22023'; END IF;
  IF NOT p_accept AND char_length(coalesce(v_note, '')) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  UPDATE pid_redlines
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(v_note, 1000), updated_at = now()
  WHERE id = p_id;
END;
$function$;

-- Comentario de cualquier miembro del proyecto (también el cliente).
CREATE OR REPLACE FUNCTION public.add_pid_redline_comment(p_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_id uuid;
BEGIN
  SELECT project_id INTO v_project FROM pid_redlines WHERE id = p_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Red-line no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_member(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Comentario vacío o muy largo' USING ERRCODE = '22023';
  END IF;
  INSERT INTO pid_redline_comments (redline_id, project_id, body, created_by)
  VALUES (p_id, v_project, btrim(p_body), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Registra una foto ya subida a redline-photos en <project_id>/<redline_id>/… (Líder en adelante; abierto o aceptado).
CREATE OR REPLACE FUNCTION public.add_pid_redline_photo(p_id uuid, p_file_path text, p_file_name text, p_mime_type text DEFAULT NULL, p_size_bytes bigint DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row pid_redlines%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_row FROM pid_redlines WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Red-line no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_editor(v_row.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('open', 'accepted') THEN
    RAISE EXCEPTION 'El red-line está cerrado: no admite más fotos' USING ERRCODE = 'P0001';
  END IF;
  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_row.project_id::text || '/' || p_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'redline-photos' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Foto no válida' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_file_name, ''))) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Nombre de archivo obligatorio' USING ERRCODE = '22023';
  END IF;
  INSERT INTO pid_redline_photos (redline_id, project_id, file_path, file_name, mime_type, size_bytes, created_by)
  VALUES (p_id, v_row.project_id, p_file_path, btrim(p_file_name), left(p_mime_type, 100), p_size_bytes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_pid_redline(uuid, integer, text, jsonb, numeric, numeric, integer, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_pid_redline(uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_pid_redline(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_pid_redline_comment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_pid_redline_photo(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pid_redline(uuid, integer, text, jsonb, numeric, numeric, integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pid_redline(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_pid_redline(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pid_redline_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pid_redline_photo(uuid, text, text, text, bigint) TO authenticated;
GRANT SELECT ON public.pid_redlines, public.pid_redline_comments, public.pid_redline_photos TO authenticated;
