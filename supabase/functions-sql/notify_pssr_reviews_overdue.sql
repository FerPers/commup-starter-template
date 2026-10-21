-- fn: public.notify_pssr_reviews_overdue()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
