-- fn: public.notify_constraints_overdue()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
