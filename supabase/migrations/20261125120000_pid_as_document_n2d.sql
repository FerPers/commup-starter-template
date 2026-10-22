-- N2d (H-15/F-13, opción A aprobada por Luis 2026-10-21, «Maquetas N2»): un P&ID es un documento del registro
-- (doc_type = 'pid') con sus revisiones; el visor abre una revisión (la vigente por defecto) y los pines
-- (pid_hotspots) cuelgan de esa revisión. Al emitirse una revisión nueva, los pines de la anterior se copian
-- marcados «por revisar posición» (needs_review) hasta que alguien los confirma o los mueve.
-- Antes: pid_documents sin revisiones; resubir un plano dejaba el PDF viejo huérfano y los pines del plano
-- viejo sobre el nuevo, y el bloqueo por revisión superada (F8) no protegía los planos con pines.

-- 0. Prod no tiene P&ID cargados en el modelo viejo (0 planos, 0 pines, bucket vacío al escribir esto). Los PDF
--    viven en storage y no se pueden mover desde SQL: si apareciera alguno, la migración se detiene sin tocar nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pid_documents) OR EXISTS (SELECT 1 FROM public.pid_hotspots) THEN
    RAISE EXCEPTION 'N2d: hay planos o pines en el modelo viejo (pid_documents/pid_hotspots); migrarlos a documentos antes';
  END IF;
END $$;

-- 1. Pines por revisión.
ALTER TABLE public.pid_hotspots
  ADD COLUMN revision_id uuid REFERENCES public.document_revisions(id) ON DELETE CASCADE,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false;

-- 2. tag_360: cuenta solo los pines de la revisión vigente; el «primer plano» es el documento P&ID.
CREATE OR REPLACE VIEW public.tag_360 WITH (security_invoker = true) AS
 WITH itr_agg AS (
         SELECT i.tag_id,
            count(*) AS itr_total,
            count(*) FILTER (WHERE i.status = 'approved'::itr_status) AS itr_approved,
            count(*) FILTER (WHERE i.status <> 'approved'::itr_status) AS itr_open
           FROM itrs i
          WHERE i.tag_id IS NOT NULL
          GROUP BY i.tag_id
        ), punch_agg AS (
         SELECT p.tag_id,
            count(*) FILTER (WHERE p.category = 'A'::punch_category AND (p.status = ANY (ARRAY['open'::punch_status, 'in_progress'::punch_status]))) AS open_punches_a,
            count(*) FILTER (WHERE p.category = 'B'::punch_category AND (p.status = ANY (ARRAY['open'::punch_status, 'in_progress'::punch_status]))) AS open_punches_b,
            count(*) FILTER (WHERE p.category = 'C'::punch_category AND (p.status = ANY (ARRAY['open'::punch_status, 'in_progress'::punch_status]))) AS open_punches_c,
            count(*) FILTER (WHERE p.status = ANY (ARRAY['open'::punch_status, 'in_progress'::punch_status])) AS open_punches_total
           FROM punches p
          WHERE p.tag_id IS NOT NULL
          GROUP BY p.tag_id
        ), cert_agg AS (
         SELECT c.subsystem_id,
            count(*) FILTER (WHERE c.status = 'issued'::certificate_status) AS certs_issued,
            max(c.issued_date) FILTER (WHERE c.status = 'issued'::certificate_status) AS last_cert_date,
            string_agg(DISTINCT ph.code, ', '::text ORDER BY ph.code) FILTER (WHERE c.status = 'issued'::certificate_status) AS certs_summary
           FROM certificates c
             LEFT JOIN project_phases ph ON ph.id = c.phase_id
          WHERE c.subsystem_id IS NOT NULL
          GROUP BY c.subsystem_id
        ), preserv_agg AS (
         SELECT pp.tag_id,
            count(*) FILTER (WHERE pp.status = 'active'::preservation_plan_status) AS preservation_active_plans,
            min(pp.next_due_date) FILTER (WHERE pp.status = 'active'::preservation_plan_status) AS preservation_next_due
           FROM preservation_plans pp
          GROUP BY pp.tag_id
        ), hotspot_agg AS (
         SELECT h.tag_id,
            count(*) AS pid_hotspot_count,
            (array_agg(d_1.number ORDER BY h.created_at))[1] AS first_pid_drawing,
            (array_agg(d_1.id ORDER BY h.created_at))[1] AS first_pid_doc_id
           FROM pid_hotspots h
             JOIN document_revisions r_1 ON r_1.id = h.revision_id
             JOIN documents d_1 ON d_1.id = r_1.document_id AND d_1.current_revision_id = r_1.id
          GROUP BY h.tag_id
        )
 SELECT t.id AS tag_id,
    t.project_id,
    pr.org_id,
    t.tag_number,
    t.description,
    t.status::text AS tag_status,
    t.manufacturer,
    t.model,
    t.serial_number,
    t.preservation_required,
    t.pid_drawing,
    t.signal_type,
    t.sil_level,
    t.io_address,
    d.id AS discipline_id,
    d.code AS discipline_code,
    d.name AS discipline_name,
    d.color AS discipline_color,
    sub.id AS subsystem_id,
    sub.code AS subsystem_code,
    sub.name AS subsystem_name,
    sys.id AS system_id,
    sys.code AS system_code,
    sys.name AS system_name,
    a.id AS area_id,
    a.code AS area_code,
    a.name AS area_name,
    COALESCE(ia.itr_total, 0::bigint)::integer AS itr_total,
    COALESCE(ia.itr_approved, 0::bigint)::integer AS itr_approved,
    COALESCE(ia.itr_open, 0::bigint)::integer AS itr_open,
        CASE
            WHEN COALESCE(ia.itr_total, 0::bigint) = 0 THEN 0
            ELSE round(ia.itr_approved::numeric / ia.itr_total::numeric * 100::numeric)::integer
        END AS itr_pct,
        CASE
            WHEN COALESCE(ia.itr_total, 0::bigint) = 0 THEN 'grey'::text
            WHEN ia.itr_approved = ia.itr_total THEN 'green'::text
            WHEN ia.itr_approved > 0 THEN 'yellow'::text
            ELSE 'grey'::text
        END AS itr_semaforo,
    COALESCE(pa.open_punches_a, 0::bigint)::integer AS open_punches_a,
    COALESCE(pa.open_punches_b, 0::bigint)::integer AS open_punches_b,
    COALESCE(pa.open_punches_c, 0::bigint)::integer AS open_punches_c,
    COALESCE(pa.open_punches_total, 0::bigint)::integer AS open_punches_total,
    COALESCE(ca.certs_issued, 0::bigint)::integer AS certs_issued,
    ca.last_cert_date,
    ca.certs_summary,
    pra.preservation_next_due,
    COALESCE(pra.preservation_active_plans, 0::bigint)::integer AS preservation_active_plans,
    COALESCE(ha.pid_hotspot_count, 0::bigint)::integer AS pid_hotspot_count,
    ha.first_pid_drawing,
    ha.first_pid_doc_id,
        CASE
            WHEN COALESCE(pa.open_punches_a, 0::bigint) > 0 THEN 'red'::text
            WHEN COALESCE(ia.itr_total, 0::bigint) = 0 THEN 'grey'::text
            WHEN ia.itr_approved = ia.itr_total AND COALESCE(pa.open_punches_b, 0::bigint) = 0 THEN 'green'::text
            ELSE 'yellow'::text
        END AS semaforo_global
   FROM tags t
     JOIN projects pr ON pr.id = t.project_id
     JOIN subsystems sub ON sub.id = t.subsystem_id
     JOIN systems sys ON sys.id = sub.system_id
     JOIN areas a ON a.id = sys.area_id
     JOIN disciplines d ON d.id = t.discipline_id
     LEFT JOIN itr_agg ia ON ia.tag_id = t.id
     LEFT JOIN punch_agg pa ON pa.tag_id = t.id
     LEFT JOIN cert_agg ca ON ca.subsystem_id = sub.id
     LEFT JOIN preserv_agg pra ON pra.tag_id = t.id
     LEFT JOIN hotspot_agg ha ON ha.tag_id = t.id;

-- 3. Fuera el modelo viejo (vacío, comprobado en el paso 0).
ALTER TABLE public.pid_hotspots DROP COLUMN pid_document_id;
ALTER TABLE public.pid_hotspots ALTER COLUMN revision_id SET NOT NULL;
CREATE UNIQUE INDEX pid_hotspots_revision_tag_page_key ON public.pid_hotspots (revision_id, tag_id, page_num);
CREATE INDEX idx_pid_hotspots_tag ON public.pid_hotspots (tag_id);
DROP TABLE public.pid_documents;
-- El bucket pid-documents queda vacío y sin políticas (los PDF de P&ID van en project-documents, inmutables).
DROP POLICY IF EXISTS pid_docs_storage_insert ON storage.objects;
DROP POLICY IF EXISTS pid_docs_storage_select ON storage.objects;
DROP POLICY IF EXISTS pid_docs_storage_delete ON storage.objects;

-- 4. Un pin es de un documento P&ID del mismo proyecto (y su tag también, con el guard genérico).
CREATE OR REPLACE FUNCTION public.pid_hotspot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_type text;
BEGIN
  SELECT d.project_id, d.org_id, d.doc_type INTO v_project, v_org, v_type
  FROM document_revisions r JOIN documents d ON d.id = r.document_id WHERE r.id = NEW.revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = '23503'; END IF;
  IF v_project IS DISTINCT FROM NEW.project_id OR v_org IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'La revisión es de otro proyecto' USING ERRCODE = '23503';
  END IF;
  IF v_type <> 'pid' THEN RAISE EXCEPTION 'Solo los documentos P&ID llevan pines' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER pid_hotspots_guard BEFORE INSERT OR UPDATE OF revision_id, project_id, org_id ON public.pid_hotspots
  FOR EACH ROW EXECUTE FUNCTION public.pid_hotspot_guard();
CREATE TRIGGER pid_hotspots_same_project BEFORE INSERT OR UPDATE OF tag_id, project_id ON public.pid_hotspots
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_project();

-- 5. Revisión nueva vigente → los pines de la anterior pasan a la nueva «por revisar» (si la nueva aún no tiene).
--    Solo hacia adelante: una revisión anulada que devuelve la vigente a una anterior no copia (esa conserva los suyos).
CREATE OR REPLACE FUNCTION public.pid_carry_hotspots()
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
  IF EXISTS (SELECT 1 FROM pid_hotspots WHERE revision_id = NEW.current_revision_id) THEN RETURN NULL; END IF;
  IF (SELECT seq FROM document_revisions WHERE id = NEW.current_revision_id)
     <= (SELECT seq FROM document_revisions WHERE id = OLD.current_revision_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO pid_hotspots (revision_id, tag_id, project_id, org_id, page_num, x_pct, y_pct, created_by, needs_review)
  SELECT NEW.current_revision_id, h.tag_id, h.project_id, h.org_id, h.page_num, h.x_pct, h.y_pct, h.created_by, true
  FROM pid_hotspots h WHERE h.revision_id = OLD.current_revision_id;
  RETURN NULL;
END;
$function$;
CREATE TRIGGER documents_pid_carry_hotspots AFTER UPDATE OF current_revision_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.pid_carry_hotspots();

REVOKE EXECUTE ON FUNCTION public.pid_hotspot_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pid_carry_hotspots() FROM anon;
