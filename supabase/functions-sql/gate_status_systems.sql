-- fn: public.gate_status_systems(text,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
