-- fn: public.document_references_blocker(text,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
