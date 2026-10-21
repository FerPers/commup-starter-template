-- fn: public.claim_push_events(integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.claim_push_events(p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, org_id uuid, project_id uuid, aggregate_type text, aggregate_id uuid, event_type text, payload jsonb, occurred_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    DELETE FROM push_outbox po
    WHERE po.event_id IN (
      SELECT q.event_id FROM push_outbox q ORDER BY q.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING po.event_id
  )
  SELECT d.id, d.org_id, d.project_id, d.aggregate_type, d.aggregate_id, d.event_type, d.payload, d.occurred_at
  FROM domain_events d JOIN c ON c.event_id = d.id
  ORDER BY d.occurred_at
$function$;
