-- fn: public.notify_preservation_overdue()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
