-- P4 (plan referente 2026-10-22, «Control y entregable»; decisiones de Luis 2026-10-23: conector = marca navegable):
-- conector entre hojas. Un sistema que sigue en otra hoja lleva en esta un conector (1 punto, el símbolo de flecha
-- fuera de hoja) con la hoja destino: otro P&ID del proyecto (o el mismo, otra página) + página. El visor lo abre
-- enfocando el conector de vuelta; si la otra hoja no tiene un conector del mismo sistema hacia esta, «sin par».
-- El destino apunta al DOCUMENTO (no a la revisión): sigue valiendo cuando cualquiera de las dos hojas se reemite.
-- Si el documento destino se borra, el conector queda sin destino (SET NULL) y el visor lo muestra así.

-- ── 1. Columnas y tipo ───────────────────────────────────────────────────────
ALTER TABLE public.pid_markups
  ADD COLUMN target_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN target_page integer CHECK (target_page IS NULL OR target_page >= 1);

ALTER TABLE public.pid_markups DROP CONSTRAINT pid_markups_kind_check;
ALTER TABLE public.pid_markups ADD CONSTRAINT pid_markups_kind_check
  CHECK (kind IN ('line', 'limit', 'label', 'connector'));
ALTER TABLE public.pid_markups ADD CONSTRAINT pid_markups_target_connector_only
  CHECK ((target_document_id IS NULL AND target_page IS NULL) OR kind = 'connector');

CREATE INDEX pid_markups_target_idx ON public.pid_markups (target_document_id) WHERE target_document_id IS NOT NULL;

COMMENT ON COLUMN public.pid_markups.target_document_id IS
  'P4: solo en un conector, el P&ID donde sigue el sistema (NULL = destino borrado).';

-- ── 2. Puntos: el conector lleva 1, como la etiqueta (= validMarkupPoints) ────
CREATE OR REPLACE FUNCTION public.pid_markup_points_ok(p_kind text, p_points jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_points IS NULL OR jsonb_typeof(p_points) <> 'array' THEN false
    WHEN jsonb_array_length(p_points) < (CASE WHEN p_kind IN ('label', 'connector') THEN 1 ELSE 2 END) THEN false
    WHEN jsonb_array_length(p_points) > (CASE p_kind WHEN 'line' THEN 500 WHEN 'limit' THEN 2 ELSE 1 END) THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_points) e
      WHERE CASE
        WHEN jsonb_typeof(e) <> 'array' OR jsonb_array_length(e) <> 2 THEN true
        WHEN jsonb_typeof(e -> 0) <> 'number' OR jsonb_typeof(e -> 1) <> 'number' THEN true
        ELSE (e ->> 0)::numeric NOT BETWEEN 0 AND 1 OR (e ->> 1)::numeric NOT BETWEEN 0 AND 1
      END)
  END
$function$;

-- ── 3. Destino: un P&ID del mismo proyecto ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.pid_markup_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.other_system_id IS NOT NULL
     AND (SELECT s.project_id FROM systems s WHERE s.id = NEW.other_system_id) IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'pid_markups.other_system_id: % es de otro proyecto', NEW.other_system_id USING ERRCODE = '23503';
  END IF;
  IF NEW.target_document_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.target_document_id IS DISTINCT FROM OLD.target_document_id
          OR NEW.project_id IS DISTINCT FROM OLD.project_id)
     AND NOT EXISTS (SELECT 1 FROM documents d
                     WHERE d.id = NEW.target_document_id AND d.project_id = NEW.project_id AND d.doc_type = 'pid') THEN
    RAISE EXCEPTION 'pid_markups.target_document_id: % no es un P&ID del proyecto', NEW.target_document_id USING ERRCODE = '23503';
  END IF;
  IF NEW.kind = 'connector' AND NEW.target_page IS NULL AND NEW.target_document_id IS NOT NULL THEN
    NEW.target_page := 1;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 4. Revisión nueva vigente: los conectores también pasan «por revisar» ──────
CREATE OR REPLACE FUNCTION public.pid_carry_markups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.doc_type <> 'pid' OR NEW.current_revision_id IS NULL OR OLD.current_revision_id IS NULL
     OR NEW.current_revision_id = OLD.current_revision_id THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pid_markups WHERE revision_id = NEW.current_revision_id) THEN RETURN NULL; END IF;
  IF (SELECT seq FROM document_revisions WHERE id = NEW.current_revision_id)
     <= (SELECT seq FROM document_revisions WHERE id = OLD.current_revision_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO pid_markups (org_id, project_id, revision_id, page_num, layer, kind, system_id, other_system_id,
                           points, page_width, page_height, page_rotation, label, needs_review, created_by,
                           target_document_id, target_page)
  SELECT m.org_id, m.project_id, NEW.current_revision_id, m.page_num, m.layer, m.kind, m.system_id, m.other_system_id,
         m.points, m.page_width, m.page_height, m.page_rotation, m.label, true, m.created_by,
         m.target_document_id, m.target_page
  FROM pid_markups m WHERE m.revision_id = OLD.current_revision_id AND m.layer = 'losh';
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pid_markup_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pid_carry_markups() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pid_markup_points_ok(text, jsonb) FROM anon;
