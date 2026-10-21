-- S20 sesión 2: readiness a escala.
--   D-07  Estado materializado de gates por sistema (system_gate_status) con «sistema sucio» por versión. Control Tower,
--         look-ahead y reporte diario leen el estado guardado y solo recalculan los sistemas que cambiaron (y los que
--         dependen de ellos). Línea base LOADTEST (300 sistemas): compute_project_gates 3,0 s en cada carga.
--   B-06  Políticas por fila con is_project_member/editor/field_member → conjuntos (get_my_*_project_ids), el patrón
--         del Sprint E. Mismas reglas.
--   B-17  FK compuestas (…_id, project_id): la BD ya no acepta un tag, punch, ITR o certificado que apunte a un
--         subsistema/tag/ITR/sistema de otro proyecto. En prod no había filas inconsistentes (verificado 2026-10-20).
--         ⚠ Revertido en 20261116130000: una segunda FK entre las mismas tablas rompe los embeds de PostgREST (PGRST201).
--   B-21  Avisos de los crons (preservación, restricciones y PSSR vencidos) en una sola función SQL por cron, en vez de
--         2 peticiones por fila desde el Worker.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- B-17 · FK compuestas
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Las FK simples existentes se quedan (llevan el ON DELETE); las compuestas solo exigen el mismo proyecto.
ALTER TABLE public.systems    ADD CONSTRAINT systems_id_project_key    UNIQUE (id, project_id);
ALTER TABLE public.subsystems ADD CONSTRAINT subsystems_id_project_key UNIQUE (id, project_id);
ALTER TABLE public.tags       ADD CONSTRAINT tags_id_project_key       UNIQUE (id, project_id);
ALTER TABLE public.itrs       ADD CONSTRAINT itrs_id_project_key       UNIQUE (id, project_id);

ALTER TABLE public.subsystems   ADD CONSTRAINT subsystems_system_same_project_fkey   FOREIGN KEY (system_id, project_id)    REFERENCES public.systems (id, project_id);
ALTER TABLE public.tags         ADD CONSTRAINT tags_subsystem_same_project_fkey      FOREIGN KEY (subsystem_id, project_id) REFERENCES public.subsystems (id, project_id);
ALTER TABLE public.itrs         ADD CONSTRAINT itrs_subsystem_same_project_fkey      FOREIGN KEY (subsystem_id, project_id) REFERENCES public.subsystems (id, project_id);
ALTER TABLE public.itrs         ADD CONSTRAINT itrs_tag_same_project_fkey            FOREIGN KEY (tag_id, project_id)       REFERENCES public.tags (id, project_id);
ALTER TABLE public.punches      ADD CONSTRAINT punches_subsystem_same_project_fkey   FOREIGN KEY (subsystem_id, project_id) REFERENCES public.subsystems (id, project_id);
ALTER TABLE public.punches      ADD CONSTRAINT punches_tag_same_project_fkey         FOREIGN KEY (tag_id, project_id)       REFERENCES public.tags (id, project_id);
ALTER TABLE public.punches      ADD CONSTRAINT punches_itr_same_project_fkey         FOREIGN KEY (itr_id, project_id)       REFERENCES public.itrs (id, project_id);
ALTER TABLE public.certificates ADD CONSTRAINT certificates_subsystem_same_project_fkey FOREIGN KEY (subsystem_id, project_id) REFERENCES public.subsystems (id, project_id);
ALTER TABLE public.certificates ADD CONSTRAINT certificates_system_same_project_fkey FOREIGN KEY (system_id, project_id)    REFERENCES public.systems (id, project_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- B-06 · Políticas set-based
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Proyectos donde el usuario captura en campo (= is_project_field_member).
CREATE OR REPLACE FUNCTION public.get_my_field_project_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
    AND om.role IN ('owner', 'admin', 'architect', 'leader', 'inspector')
$function$;
REVOKE EXECUTE ON FUNCTION public.get_my_field_project_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_field_project_ids() TO authenticated, service_role;

ALTER POLICY cables_select ON public.cables USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY cables_write ON public.cables USING (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY cert_punch_exceptions_select ON public.certificate_punch_exceptions USING (EXISTS ( SELECT 1 FROM certificates WHERE certificates.id = certificate_punch_exceptions.certificate_id AND certificates.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY certificates_delete ON public.certificates USING ((project_id IN ( SELECT get_my_editor_project_ids())) AND (status = ANY (ARRAY['pending'::certificate_status, 'rejected'::certificate_status])));
ALTER POLICY handover_package_systems_select ON public.handover_package_systems USING (EXISTS ( SELECT 1 FROM handover_packages hp WHERE hp.id = handover_package_systems.package_id AND hp.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY handover_packages_select ON public.handover_packages USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY itr_number_counters_select ON public.itr_number_counters USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY itr_suggestions_select ON public.itr_suggestions USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY loop_tags_select ON public.loop_tags USING (EXISTS ( SELECT 1 FROM loops WHERE loops.id = loop_tags.loop_id AND loops.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY loop_tags_write ON public.loop_tags USING (EXISTS ( SELECT 1 FROM loops WHERE loops.id = loop_tags.loop_id AND loops.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY pid_documents_delete ON public.pid_documents USING (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY pid_documents_insert ON public.pid_documents WITH CHECK (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY pid_documents_select ON public.pid_documents USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY pid_documents_update ON public.pid_documents USING (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY pid_hotspots_delete ON public.pid_hotspots USING ((project_id IN ( SELECT get_my_editor_project_ids())) OR (created_by = auth.uid()));
ALTER POLICY pid_hotspots_insert ON public.pid_hotspots WITH CHECK (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY pid_hotspots_select ON public.pid_hotspots USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY pid_hotspots_update ON public.pid_hotspots USING (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY preservation_attachments_delete ON public.preservation_attachments USING (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_attachments.record_id AND pp.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY preservation_attachments_insert ON public.preservation_attachments WITH CHECK (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_attachments.record_id AND pp.project_id IN ( SELECT get_my_field_project_ids())));
ALTER POLICY preservation_attachments_select ON public.preservation_attachments USING (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_attachments.record_id AND pp.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY pres_rec_resp_delete ON public.preservation_record_responses USING (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_record_responses.record_id AND pp.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY pres_rec_resp_insert ON public.preservation_record_responses WITH CHECK (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_record_responses.record_id AND pp.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY pres_rec_resp_select ON public.preservation_record_responses USING (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_record_responses.record_id AND pp.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY pres_rec_resp_update ON public.preservation_record_responses USING (EXISTS ( SELECT 1 FROM preservation_records pr JOIN preservation_plans pp ON pp.id = pr.plan_id WHERE pr.id = preservation_record_responses.record_id AND pp.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY pssr_review_items_delete ON public.pssr_review_items USING (EXISTS ( SELECT 1 FROM pssr_reviews WHERE pssr_reviews.id = pssr_review_items.review_id AND pssr_reviews.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY pssr_review_items_insert ON public.pssr_review_items WITH CHECK (EXISTS ( SELECT 1 FROM pssr_reviews WHERE pssr_reviews.id = pssr_review_items.review_id AND pssr_reviews.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY pssr_review_items_select ON public.pssr_review_items USING (EXISTS ( SELECT 1 FROM pssr_reviews WHERE pssr_reviews.id = pssr_review_items.review_id AND pssr_reviews.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY pssr_review_items_update ON public.pssr_review_items USING (EXISTS ( SELECT 1 FROM pssr_reviews WHERE pssr_reviews.id = pssr_review_items.review_id AND pssr_reviews.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY pssr_reviews_delete ON public.pssr_reviews USING ((project_id IN ( SELECT get_my_editor_project_ids())) AND (status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'rejected'::text])));
ALTER POLICY pssr_reviews_insert ON public.pssr_reviews WITH CHECK (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY pssr_reviews_select ON public.pssr_reviews USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY pssr_signatures_select ON public.pssr_signatures USING (EXISTS ( SELECT 1 FROM pssr_reviews WHERE pssr_reviews.id = pssr_signatures.review_id AND pssr_reviews.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY punch_attachments_delete ON public.punch_attachments USING (EXISTS ( SELECT 1 FROM punches WHERE punches.id = punch_attachments.punch_id AND ((punches.project_id IN ( SELECT get_my_editor_project_ids())) OR ((punch_attachments.uploaded_by = auth.uid()) AND (punches.project_id IN ( SELECT get_my_project_ids()))))));
ALTER POLICY punch_attachments_insert ON public.punch_attachments WITH CHECK ((uploaded_by = auth.uid()) AND EXISTS ( SELECT 1 FROM punches WHERE punches.id = punch_attachments.punch_id AND punches.project_id IN ( SELECT get_my_field_project_ids())));
ALTER POLICY punch_attachments_select ON public.punch_attachments USING (EXISTS ( SELECT 1 FROM punches WHERE punches.id = punch_attachments.punch_id AND punches.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY punch_comments_insert ON public.punch_comments WITH CHECK ((user_id = auth.uid()) AND EXISTS ( SELECT 1 FROM punches pu WHERE pu.id = punch_comments.punch_id AND pu.project_id IN ( SELECT get_my_field_project_ids())));
ALTER POLICY punch_counters_select ON public.punch_counters USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY punch_pho_events_select ON public.punch_post_handover_events USING (EXISTS ( SELECT 1 FROM punches pu WHERE pu.id = punch_post_handover_events.punch_id AND pu.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY punches_insert ON public.punches WITH CHECK ((project_id IN ( SELECT get_my_field_project_ids())) AND (raised_by = auth.uid()));
ALTER POLICY punches_update ON public.punches USING (project_id IN ( SELECT get_my_field_project_ids())) WITH CHECK (project_id IN ( SELECT get_my_field_project_ids()));
ALTER POLICY work_plan_items_delete ON public.work_plan_items USING (EXISTS ( SELECT 1 FROM work_plans WHERE work_plans.id = work_plan_items.work_plan_id AND work_plans.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY work_plan_items_insert ON public.work_plan_items WITH CHECK (EXISTS ( SELECT 1 FROM work_plans WHERE work_plans.id = work_plan_items.work_plan_id AND work_plans.project_id IN ( SELECT get_my_editor_project_ids())));
ALTER POLICY work_plan_items_select ON public.work_plan_items USING (EXISTS ( SELECT 1 FROM work_plans WHERE work_plans.id = work_plan_items.work_plan_id AND work_plans.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY work_plan_items_update ON public.work_plan_items USING (EXISTS ( SELECT 1 FROM work_plans WHERE work_plans.id = work_plan_items.work_plan_id AND work_plans.project_id IN ( SELECT get_my_project_ids())));
ALTER POLICY work_plans_delete ON public.work_plans USING (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY work_plans_insert ON public.work_plans WITH CHECK (project_id IN ( SELECT get_my_editor_project_ids()));
ALTER POLICY work_plans_select ON public.work_plans USING (project_id IN ( SELECT get_my_project_ids()));
ALTER POLICY work_plans_update ON public.work_plans USING (project_id IN ( SELECT get_my_editor_project_ids()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- D-07 · Estado materializado de gates por sistema
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Una fila por sistema (la crea el trigger de systems). Cada cambio que puede mover un gate suma 1 a `version` del
-- sistema afectado; el estado guardado vale mientras computed_version = version. Bloquear la fila al marcar hace que
-- un recálculo concurrente nunca deje «limpio» un sistema con un cambio que no vio (ver compute_project_gates).
-- Sin políticas: solo la leen y escriben las funciones SECURITY DEFINER de abajo.
CREATE TABLE public.system_gate_status (
  system_id        uuid PRIMARY KEY REFERENCES public.systems (id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version          bigint NOT NULL DEFAULT 1,
  computed_version bigint,
  gates            jsonb,
  computed_at      timestamptz
);
CREATE INDEX system_gate_status_project_idx ON public.system_gate_status (project_id);
CREATE INDEX system_gate_status_org_idx ON public.system_gate_status (org_id);
ALTER TABLE public.system_gate_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_gate_status FROM anon, authenticated;

-- Marca sistemas sucios. Bloquea en orden de id para que dos marcas concurrentes no se crucen.
CREATE OR REPLACE FUNCTION public.gate_status_mark(p_system_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH l AS (
    SELECT st.system_id FROM system_gate_status st
    WHERE st.system_id = ANY (p_system_ids)
    ORDER BY st.system_id
    FOR UPDATE
  )
  UPDATE system_gate_status st SET version = st.version + 1
  FROM l WHERE st.system_id = l.system_id
$function$;

-- Sistemas afectados por un lote de filas (jsonb) de una tabla fuente del motor de gates.
CREATE OR REPLACE FUNCTION public.gate_status_systems(p_table text, p_rows jsonb)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH r AS (SELECT x FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x),
  item AS (  -- registros F3: la fila misma o la de su tag/evento
    SELECT (CASE WHEN p_table = 'register_items' THEN x ->> 'id' ELSE x ->> 'item_id' END)::uuid AS id
    FROM r WHERE p_table IN ('register_items', 'register_item_tags', 'register_events')
  ),
  ids AS (
    SELECT (x ->> 'system_id')::uuid AS sid FROM r
    WHERE p_table IN ('subsystems', 'pssr_reviews', 'system_gate_approvals', 'system_gate_attestations', 'project_constraints',
                      'lineup_sheets', 'system_dependencies', 'register_items', 'procedures', 'performance_certificates')
    UNION SELECT (x ->> 'primary_system_id')::uuid FROM r WHERE p_table = 'performance_tests'
    UNION SELECT ss.system_id FROM r JOIN subsystems ss ON ss.id = (x ->> 'subsystem_id')::uuid
      WHERE p_table IN ('itrs', 'punches', 'certificates', 'tags')
    UNION SELECT ss.system_id FROM r JOIN tags t ON t.id = (x ->> 'tag_id')::uuid JOIN subsystems ss ON ss.id = t.subsystem_id
      WHERE p_table IN ('itrs', 'punches', 'register_item_tags')
    UNION SELECT ss.system_id FROM r JOIN itrs i ON i.id = (x ->> 'itr_id')::uuid JOIN subsystems ss ON ss.id = i.subsystem_id
      WHERE p_table IN ('itr_signatures', 'document_references')
    UNION SELECT a.system_id FROM r JOIN system_gate_approvals a ON a.id = (x ->> 'approval_id')::uuid
      WHERE p_table = 'system_gate_signatures'
    UNION SELECT ri.system_id FROM item JOIN register_items ri ON ri.id = item.id
    UNION SELECT ss.system_id FROM item JOIN register_item_tags rit ON rit.item_id = item.id
      JOIN tags t ON t.id = rit.tag_id JOIN subsystems ss ON ss.id = t.subsystem_id
    UNION SELECT pt.primary_system_id FROM r JOIN performance_tests pt ON pt.id = (x ->> 'test_id')::uuid
      WHERE p_table IN ('performance_test_revisions', 'performance_certificates')
    UNION SELECT pr.system_id FROM r JOIN procedure_revisions prv ON prv.id = (x ->> 'procedure_revision_id')::uuid
      JOIN procedures pr ON pr.id = prv.procedure_id WHERE p_table = 'document_references'
    UNION SELECT ss.system_id FROM r JOIN document_references dr ON dr.document_id = (x ->> 'id')::uuid
      JOIN itrs i ON i.id = dr.itr_id JOIN subsystems ss ON ss.id = i.subsystem_id WHERE p_table = 'documents'
    UNION SELECT pr.system_id FROM r JOIN document_references dr ON dr.document_id = (x ->> 'id')::uuid
      JOIN procedure_revisions prv ON prv.id = dr.procedure_revision_id JOIN procedures pr ON pr.id = prv.procedure_id
      WHERE p_table = 'documents'
  )
  SELECT COALESCE(array_agg(DISTINCT sid) FILTER (WHERE sid IS NOT NULL), '{}') FROM ids
$function$;

-- Trigger por sentencia (tablas de transición): un lote de 100k ITR marca cada sistema una sola vez. Los argumentos
-- son las columnas que importan en un UPDATE (sin argumentos: cualquier cambio).
CREATE OR REPLACE FUNCTION public.gate_status_dirty_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM new_rows n;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_rows FROM old_rows o;
  ELSIF TG_NARGS = 0 THEN
    SELECT jsonb_agg(z.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS x FROM old_rows o UNION ALL SELECT to_jsonb(n) FROM new_rows n) z;
  ELSE
    SELECT jsonb_agg(v.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS o, to_jsonb(n) AS n FROM old_rows o JOIN new_rows n ON n.id = o.id) c
    CROSS JOIN LATERAL (VALUES (c.o), (c.n)) v(x)
    WHERE EXISTS (SELECT 1 FROM unnest(TG_ARGV) k WHERE c.o -> k IS DISTINCT FROM c.n -> k);
  END IF;
  IF v_rows IS NOT NULL THEN
    PERFORM public.gate_status_mark(public.gate_status_systems(TG_TABLE_NAME, v_rows));
  END IF;
  RETURN NULL;
END;
$function$;

-- Configuración de la org (gates, criterios, tipos de registro que bloquean, política y límite Cat B): todos sus sistemas.
CREATE OR REPLACE FUNCTION public.gate_status_org_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  -- Por ramas: plpgsql falla al leer un campo que la tabla no tiene, aunque la expresión no lo use.
  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
  ELSE
    v_org := NEW.org_id;
  END IF;
  PERFORM public.gate_status_mark(ARRAY(SELECT st.system_id FROM system_gate_status st WHERE st.org_id = v_org));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gate_status_on_system_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO system_gate_status (system_id, project_id, org_id)
  SELECT n.id, n.project_id, p.org_id FROM new_rows n JOIN projects p ON p.id = n.project_id
  ON CONFLICT (system_id) DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER systems_gate_status_ins AFTER INSERT ON public.systems
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gate_status_on_system_insert();

-- Tablas fuente de compute_system_gates_upto (y de lo que llama: system_phase_level, system_pssr_status,
-- lineup_is_stale) con las columnas que mueven el resultado compacto (nivel, estado, fallas, aprobación).
DO $do$
DECLARE r record; v_args text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('itrs',                       'status,phase_id,subsystem_id,tag_id'),
    ('itr_signatures',             ''),
    ('punches',                    'status,category,subsystem_id,tag_id,created_at'),
    ('certificates',               'status,phase_id,subsystem_id'),
    ('tags',                       'subsystem_id,criticality'),
    ('subsystems',                 'system_id'),
    ('pssr_reviews',               'status,system_id,created_at'),
    ('system_gate_approvals',      ''),
    ('system_gate_signatures',     ''),
    ('system_gate_attestations',   ''),
    ('system_dependencies',        ''),
    ('register_items',             'status,system_id,type_id,kind'),
    ('register_item_tags',         ''),
    ('register_events',            ''),
    ('project_constraints',        'status,escalation_level,gate_id,system_id'),
    ('lineup_sheets',              'status,purpose,verified_at,system_id'),
    ('document_references',        ''),
    ('documents',                  'current_revision_id'),
    ('procedures',                 'current_revision_id,system_id'),
    ('performance_tests',          'status,primary_system_id'),
    ('performance_test_revisions', 'status'),
    ('performance_certificates',   'status')
  ) v(t, cols) LOOP
    v_args := CASE WHEN r.cols = '' THEN ''
                   ELSE (SELECT string_agg(quote_literal(c), ', ') FROM unnest(string_to_array(r.cols, ',')) c) END;
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.gate_status_dirty_trg()', r.t || '_gate_dirty_ins', r.t);
    EXECUTE format('CREATE TRIGGER %I AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.gate_status_dirty_trg(%s)', r.t || '_gate_dirty_upd', r.t, v_args);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.gate_status_dirty_trg()', r.t || '_gate_dirty_del', r.t);
  END LOOP;
END;
$do$;

CREATE TRIGGER readiness_gates_gate_dirty AFTER INSERT OR UPDATE OR DELETE ON public.readiness_gates
  FOR EACH ROW EXECUTE FUNCTION public.gate_status_org_trg();
CREATE TRIGGER gate_criteria_gate_dirty AFTER INSERT OR UPDATE OR DELETE ON public.gate_criteria
  FOR EACH ROW EXECUTE FUNCTION public.gate_status_org_trg();
CREATE TRIGGER register_types_gate_dirty AFTER INSERT OR UPDATE OR DELETE ON public.register_types
  FOR EACH ROW EXECUTE FUNCTION public.gate_status_org_trg();
CREATE TRIGGER organizations_gate_dirty AFTER UPDATE OF settings ON public.organizations
  FOR EACH ROW WHEN (OLD.settings IS DISTINCT FROM NEW.settings) EXECUTE FUNCTION public.gate_status_org_trg();

-- Gates compactos de un sistema (lo que guarda system_gate_status.gates y devuelve compute_project_gates).
CREATE OR REPLACE FUNCTION public.gate_status_compute(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
           'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
           'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr WHERE cr ->> 'result' = 'fail'),
           'approval', g.approval
         ) ORDER BY g.gate_order, g.gate_code), '[]'::jsonb)
  FROM public.compute_system_gates(p_system_id) g
$function$;

-- Ahora VOLATILE: guarda lo que recalcula. Misma firma y misma salida que antes.
CREATE OR REPLACE FUNCTION public.compute_project_gates(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, gates jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_needs uuid[];
  v_write boolean := current_setting('transaction_read_only') = 'off';
BEGIN
  -- S20: una sola verificación de pertenencia; las consultas internas ya no pagan la RLS por fila.
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- S20 (D-07): a recalcular = sin estado, sucios o que dependen (en cadena) de uno sucio (las dependencias son del
  -- mismo proyecto, guard_system_dependency).
  WITH RECURSIVE dirty(id) AS (
    SELECT s.id FROM systems s LEFT JOIN system_gate_status st ON st.system_id = s.id
    WHERE s.project_id = p_project_id
      AND (st.system_id IS NULL OR st.computed_version IS DISTINCT FROM st.version)
    UNION
    SELECT d.system_id FROM system_dependencies d JOIN dirty ON d.depends_on_system_id = dirty.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_needs FROM dirty;

  IF v_write AND cardinality(v_needs) > 0 THEN
    -- Versión leída y cálculo en la misma sentencia (misma foto): un cambio que entra después ya sumó su versión y el
    -- sistema queda sucio. SKIP LOCKED: el que otra transacción está marcando no se guarda ahora (sigue sucio).
    WITH c AS MATERIALIZED (
      SELECT st.system_id, st.version, public.gate_status_compute(st.system_id) AS gates
      FROM system_gate_status st WHERE st.system_id = ANY (v_needs)
    ), lk AS (
      SELECT st.system_id FROM system_gate_status st JOIN c ON c.system_id = st.system_id
      ORDER BY st.system_id
      FOR UPDATE OF st SKIP LOCKED
    )
    UPDATE system_gate_status st
    SET gates = c.gates, computed_version = c.version, computed_at = now()
    FROM c
    WHERE st.system_id = c.system_id AND st.system_id IN (SELECT lk.system_id FROM lk)
      AND (st.computed_version IS NULL OR st.computed_version <= c.version);
  END IF;

  RETURN QUERY
  SELECT s.id, s.code, s.name, a.code, a.name,
         CASE WHEN st.gates IS NOT NULL AND st.computed_version = st.version AND (v_write OR NOT s.id = ANY (v_needs))
              THEN st.gates
              ELSE public.gate_status_compute(s.id) END
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  LEFT JOIN system_gate_status st ON st.system_id = s.id
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
END;
$function$;

-- Red de seguridad (cron nocturno, solo service_role): recalcula los sistemas «limpios» y corrige los que no
-- coinciden. drift > 0 = falta un trigger de invalidación; el cron lo reporta.
CREATE OR REPLACE FUNCTION public.gate_status_audit(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_checked integer; v_drift integer;
BEGIN
  WITH c AS MATERIALIZED (
    SELECT st.system_id, st.version, st.gates, public.gate_status_compute(st.system_id) AS live
    FROM system_gate_status st
    WHERE st.project_id = p_project_id AND st.computed_version = st.version
  ), fixed AS (
    UPDATE system_gate_status st SET gates = c.live, computed_at = now()
    FROM c
    WHERE st.system_id = c.system_id AND c.live IS DISTINCT FROM c.gates AND st.version = c.version
    RETURNING st.system_id
  )
  SELECT (SELECT COUNT(*) FROM c), (SELECT COUNT(*) FROM fixed) INTO v_checked, v_drift;
  RETURN jsonb_build_object('checked', v_checked, 'drift', v_drift);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gate_status_mark(uuid[]), public.gate_status_systems(text, jsonb),
  public.gate_status_dirty_trg(), public.gate_status_org_trg(), public.gate_status_on_system_insert(),
  public.gate_status_compute(uuid), public.gate_status_audit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gate_status_audit(uuid) TO service_role;

-- Estado inicial: una fila por sistema, calculada ahora (la primera carga de Control Tower ya lee lo guardado).
INSERT INTO public.system_gate_status (system_id, project_id, org_id)
SELECT s.id, s.project_id, p.org_id FROM public.systems s JOIN public.projects p ON p.id = s.project_id
ON CONFLICT (system_id) DO NOTHING;
UPDATE public.system_gate_status
SET gates = public.gate_status_compute(system_id), computed_version = version, computed_at = now();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- B-21 · Avisos de los crons en SQL (solo service_role)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS notifications_preservation_plan_idx
  ON public.notifications ((payload ->> 'planId'), created_at) WHERE kind = 'preservation_overdue';

-- Planes activos vencidos (día del proyecto): un aviso por plan y día del proyecto al responsable.
CREATE OR REPLACE FUNCTION public.notify_preservation_overdue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_scanned integer; v_inserted integer;
BEGIN
  WITH due AS MATERIALIZED (
    SELECT pp.id, pp.project_id, pp.tag_id, pp.responsible_user_id, pp.procedure_id, pp.next_due_date, p.org_id,
           public.tz_today(COALESCE(p.timezone, 'UTC')) AS today, COALESCE(p.timezone, 'UTC') AS tz
    FROM preservation_plans pp JOIN projects p ON p.id = pp.project_id
    WHERE pp.status = 'active' AND pp.responsible_user_id IS NOT NULL
      AND pp.next_due_date < public.tz_today(COALESCE(p.timezone, 'UTC'))
  ), ins AS (
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    SELECT d.org_id, d.responsible_user_id, 'preservation_overdue',
           'Preservación vencida: ' || COALESCE(t.tag_number, ''),
           COALESCE(NULLIF(pr.title, ''), pr.code, 'Procedimiento') || ' (vencido hace ' || (d.today - d.next_due_date)
             || ' día' || CASE WHEN d.today - d.next_due_date = 1 THEN '' ELSE 's' END || ')',
           '/projects/' || d.project_id || '/preservation',
           jsonb_build_object('planId', d.id, 'projectId', d.project_id, 'tagId', d.tag_id,
                              'nextDueDate', d.next_due_date, 'overdueDays', d.today - d.next_due_date)
    FROM due d
    LEFT JOIN tags t ON t.id = d.tag_id
    LEFT JOIN preservation_procedures pr ON pr.id = d.procedure_id
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.kind = 'preservation_overdue' AND n.payload ->> 'planId' = d.id::text
        AND n.recipient_user_id = d.responsible_user_id AND n.created_at >= public.tz_day_start(d.today, d.tz))
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM due), (SELECT COUNT(*) FROM ins) INTO v_scanned, v_inserted;
  RETURN jsonb_build_object('scanned', v_scanned, 'inserted', v_inserted, 'skipped', v_scanned - v_inserted);
END;
$function$;

-- Restricciones abiertas vencidas: aviso al responsable y a quien la registró; se repite cada 3 días.
CREATE OR REPLACE FUNCTION public.notify_constraints_overdue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_scanned integer; v_fired integer; v_inserted integer;
BEGIN
  WITH overdue AS MATERIALIZED (
    SELECT pc.*, public.tz_today(COALESCE(p.timezone, 'UTC')) - pc.need_date AS days
    FROM project_constraints pc JOIN projects p ON p.id = pc.project_id
    WHERE pc.status = 'open' AND pc.need_date < public.tz_today(COALESCE(p.timezone, 'UTC'))
  ), due AS MATERIALIZED (
    SELECT o.* FROM overdue o
    WHERE (o.last_overdue_notif_at IS NULL OR o.last_overdue_notif_at < now() - interval '3 days')
      AND COALESCE(o.owner_id, o.created_by) IS NOT NULL
  ), ins AS (
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    SELECT d.org_id, u.uid, 'constraint_overdue', 'Restricción vencida: ' || d.number,
           d.title || ' (vencida hace ' || d.days || ' día' || CASE WHEN d.days = 1 THEN '' ELSE 's' END
             || ', nivel ' || d.escalation_level || ')'
             || CASE WHEN d.escalation_level < 4 THEN ' — considera escalar a nivel ' || (d.escalation_level + 1) ELSE '' END,
           '/projects/' || d.project_id || '/daily/constraint/' || d.id,
           jsonb_build_object('constraintId', d.id, 'projectId', d.project_id, 'number', d.number,
                              'needDate', d.need_date, 'level', d.escalation_level, 'overdueDays', d.days)
    FROM due d
    CROSS JOIN LATERAL (SELECT DISTINCT x AS uid FROM unnest(ARRAY[d.owner_id, d.created_by]) x WHERE x IS NOT NULL) u
    RETURNING 1
  ), upd AS (
    UPDATE project_constraints pc SET last_overdue_notif_at = now() FROM due WHERE pc.id = due.id RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM overdue), (SELECT COUNT(*) FROM upd), (SELECT COUNT(*) FROM ins)
    INTO v_scanned, v_fired, v_inserted;
  RETURN jsonb_build_object('scanned', v_scanned, 'fired', v_fired, 'inserted', v_inserted);
END;
$function$;

-- PSSR en curso o por aprobar con fecha de revisión vencida: aviso a los miembros activos de la org; cada 3 días.
CREATE OR REPLACE FUNCTION public.notify_pssr_reviews_overdue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_scanned integer; v_fired integer; v_inserted integer;
BEGIN
  WITH overdue AS MATERIALIZED (
    SELECT r.id, r.org_id, r.project_id, r.review_number, r.title, r.review_due_date, r.last_overdue_notif_at,
           public.tz_today(COALESCE(p.timezone, 'UTC')) - r.review_due_date AS days
    FROM pssr_reviews r JOIN projects p ON p.id = r.project_id
    WHERE r.status IN ('in_progress', 'pending_approval') AND r.review_due_date IS NOT NULL
      AND r.review_due_date < public.tz_today(COALESCE(p.timezone, 'UTC'))
  ), due AS MATERIALIZED (
    SELECT o.* FROM overdue o
    WHERE (o.last_overdue_notif_at IS NULL OR o.last_overdue_notif_at < now() - interval '3 days')
      AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = o.org_id AND om.status = 'active'
                    AND (om.access_expires_at IS NULL OR om.access_expires_at > now()))
  ), ins AS (
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    SELECT d.org_id, om.user_id, 'pssr_review_overdue', 'PSSR vencido: ' || d.review_number,
           d.title || ' (vencido hace ' || d.days || ' día' || CASE WHEN d.days = 1 THEN '' ELSE 's' END || ')',
           '/projects/' || d.project_id || '/pssr/' || d.id,
           jsonb_build_object('reviewId', d.id, 'projectId', d.project_id, 'reviewNumber', d.review_number,
                              'reviewDueDate', d.review_due_date, 'overdueDays', d.days)
    FROM due d
    JOIN org_members om ON om.org_id = d.org_id AND om.status = 'active'
      AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
    RETURNING 1
  ), upd AS (
    UPDATE pssr_reviews r SET last_overdue_notif_at = now() FROM due WHERE r.id = due.id RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM overdue), (SELECT COUNT(*) FROM upd), (SELECT COUNT(*) FROM ins)
    INTO v_scanned, v_fired, v_inserted;
  RETURN jsonb_build_object('scanned', v_scanned, 'fired', v_fired, 'inserted', v_inserted);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_preservation_overdue(), public.notify_constraints_overdue(),
  public.notify_pssr_reviews_overdue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_preservation_overdue(), public.notify_constraints_overdue(),
  public.notify_pssr_reviews_overdue() TO service_role;
