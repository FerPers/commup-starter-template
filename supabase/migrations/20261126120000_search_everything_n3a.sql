-- N3a (H-17, «Maquetas N3» aprobadas por Luis 2026-10-22): búsqueda global ⌘K.
-- search_everything(q, org, proyecto?) devuelve hasta p_limit coincidencias por tipo: tags, sistemas, subsistemas, ITR,
-- punch, certificados, documentos, gestión diaria (ACC · RES · TQ · DEC), registros de campo, arranque (PRC · EVT ·
-- TRF), desempeño (PTT · PTC), vendors (VND), reportes diarios (RD) y relevos (REL).
-- SECURITY INVOKER: corre con la RLS del usuario (solo ve lo de sus proyectos). Los tags, ITR y punch (los grandes)
-- usan los índices trigram de Sprint E. El orden: número exacto, número que empieza, número que contiene, título.
-- La ruta de cada resultado la arma la app (src/lib/search/catalog.ts) con kind + id + project_id + extra_id.

CREATE OR REPLACE FUNCTION public.search_everything(p_q text, p_org_id uuid, p_project_id uuid DEFAULT NULL, p_limit integer DEFAULT 6)
 RETURNS TABLE(kind text, id uuid, project_id uuid, ref text, title text, extra_id uuid, rank integer)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT btrim(p_q) AS raw,
           '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS anyw,
           replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pre,
           length(btrim(p_q)) >= 3 AS long_enough,
           -- Con menos de 3 caracteres solo números que empiezan así (contiene «10» en 100k ITR es caro y poco útil).
           CASE WHEN length(btrim(p_q)) >= 3 THEN '%' ELSE '' END
             || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS m,
           LEAST(GREATEST(COALESCE(p_limit, 6), 1), 20) AS lim
    WHERE length(btrim(COALESCE(p_q, ''))) >= 2
  ),
  scope AS (
    SELECT pr.id FROM projects pr WHERE pr.org_id = p_org_id AND (p_project_id IS NULL OR pr.id = p_project_id)
  ),
  hits AS (
    (SELECT 'tag'::text, t.id, t.project_id, t.tag_number, t.description, NULL::uuid,
            CASE WHEN upper(t.tag_number) = upper(q.raw) THEN 0 WHEN t.tag_number ILIKE q.pre THEN 1 WHEN t.tag_number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM tags t, q WHERE t.project_id IN (SELECT sc.id FROM scope sc)
        AND (t.tag_number ILIKE q.m OR (q.long_enough AND t.description ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'system', s.id, s.project_id, s.code, s.name, NULL::uuid,
            CASE WHEN upper(s.code) = upper(q.raw) THEN 0 WHEN s.code ILIKE q.pre THEN 1 WHEN s.code ILIKE q.anyw THEN 2 ELSE 3 END
       FROM systems s, q WHERE s.project_id IN (SELECT sc.id FROM scope sc)
        AND (s.code ILIKE q.m OR (q.long_enough AND s.name ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'subsystem', s.id, s.project_id, s.code, s.name, NULL::uuid,
            CASE WHEN upper(s.code) = upper(q.raw) THEN 0 WHEN s.code ILIKE q.pre THEN 1 WHEN s.code ILIKE q.anyw THEN 2 ELSE 3 END
       FROM subsystems s, q WHERE s.project_id IN (SELECT sc.id FROM scope sc)
        AND (s.code ILIKE q.m OR (q.long_enough AND s.name ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'itr', i.id, i.project_id, i.itr_number, tg.tag_number, i.tag_id,
            CASE WHEN upper(i.itr_number) = upper(q.raw) THEN 0 WHEN i.itr_number ILIKE q.pre THEN 1 ELSE 2 END
       FROM itrs i LEFT JOIN tags tg ON tg.id = i.tag_id, q WHERE i.project_id IN (SELECT sc.id FROM scope sc)
        AND i.itr_number ILIKE q.m
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'punch', p.id, p.project_id, p.punch_number, p.description, NULL::uuid,
            CASE WHEN upper(p.punch_number) = upper(q.raw) THEN 0 WHEN p.punch_number ILIKE q.pre THEN 1 WHEN p.punch_number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM punches p, q WHERE p.project_id IN (SELECT sc.id FROM scope sc)
        AND (p.punch_number ILIKE q.m OR (q.long_enough AND p.description ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'certificate', c.id, c.project_id, c.certificate_number, c.title, NULL::uuid,
            CASE WHEN upper(c.certificate_number) = upper(q.raw) THEN 0 WHEN c.certificate_number ILIKE q.pre THEN 1 WHEN c.certificate_number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM certificates c, q WHERE c.project_id IN (SELECT sc.id FROM scope sc)
        AND (c.certificate_number ILIKE q.m OR (q.long_enough AND c.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'document', d.id, d.project_id, d.number, d.title, NULL::uuid,
            CASE WHEN upper(d.number) = upper(q.raw) THEN 0 WHEN d.number ILIKE q.pre THEN 1 WHEN d.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM documents d, q WHERE d.project_id IN (SELECT sc.id FROM scope sc)
        AND (d.number ILIKE q.m OR (q.long_enough AND d.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'action', a.id, a.project_id, a.number, a.title, NULL::uuid,
            CASE WHEN upper(a.number) = upper(q.raw) THEN 0 WHEN a.number ILIKE q.pre THEN 1 WHEN a.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM actions a, q WHERE a.project_id IN (SELECT sc.id FROM scope sc)
        AND (a.number ILIKE q.m OR (q.long_enough AND a.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'constraint', r.id, r.project_id, r.number, r.title, NULL::uuid,
            CASE WHEN upper(r.number) = upper(q.raw) THEN 0 WHEN r.number ILIKE q.pre THEN 1 WHEN r.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM project_constraints r, q WHERE r.project_id IN (SELECT sc.id FROM scope sc)
        AND (r.number ILIKE q.m OR (q.long_enough AND r.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'tq', x.id, x.project_id, x.number, x.subject, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM technical_queries x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.subject ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'decision', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM decisions x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'register', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM register_items x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'procedure', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM procedures x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'event', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM startup_events x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'transfer', x.id, x.project_id, x.number, s.code, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 ELSE 2 END
       FROM ownership_transfers x LEFT JOIN systems s ON s.id = x.system_id, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND x.number ILIKE q.m
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'performance_test', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM performance_tests x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'ptc', x.id, x.project_id, x.number, t.title, x.run_id,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 ELSE 2 END
       FROM performance_certificates x LEFT JOIN performance_tests t ON t.id = x.test_id, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND x.number ILIKE q.m
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'vendor', x.id, x.project_id, x.number, x.title, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 WHEN x.number ILIKE q.anyw THEN 2 ELSE 3 END
       FROM vendor_packages x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND (x.number ILIKE q.m OR (q.long_enough AND x.title ILIKE q.anyw))
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'report', x.id, x.project_id, x.number, x.report_date::text, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 ELSE 2 END
       FROM daily_reports x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND x.number ILIKE q.m
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
    UNION ALL
    (SELECT 'handover', x.id, x.project_id, x.number, NULL::text, NULL::uuid,
            CASE WHEN upper(x.number) = upper(q.raw) THEN 0 WHEN x.number ILIKE q.pre THEN 1 ELSE 2 END
       FROM shift_handovers x, q WHERE x.project_id IN (SELECT sc.id FROM scope sc)
        AND x.number ILIKE q.m
      ORDER BY 7, 4 LIMIT (SELECT lim FROM q))
  )
  SELECT * FROM hits;
$function$;

REVOKE EXECUTE ON FUNCTION public.search_everything(text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_everything(text, uuid, uuid, integer) TO authenticated;
