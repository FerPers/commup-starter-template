-- fn: public.notify_registers_overdue()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.notify_registers_overdue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_n integer := 0; v_items integer := 0;
BEGIN
  FOR r IN
    SELECT ri.*, CASE WHEN ri.kind = 'bypass' THEN 'bypass' ELSE 'temporary' END AS why
    FROM register_items ri JOIN projects p ON p.id = ri.project_id
    WHERE ri.status = 'active' AND (
      (ri.kind = 'bypass' AND ri.activated_at IS NOT NULL AND (ri.data ->> 'max_duration_hours') ~ '^[0-9]+(\.[0-9]+)?$'
         AND ri.activated_at + ((ri.data ->> 'max_duration_hours')::numeric * interval '1 hour') < now())
      OR (ri.kind = 'temporary' AND (ri.data ->> 'planned_removal') ~ '^\d{4}-\d{2}-\d{2}$'
         AND (ri.data ->> 'planned_removal')::date < public.tz_today(COALESCE(p.timezone, 'UTC'))))
  LOOP
    v_items := v_items + 1;
    v_n := v_n + public.notify_users(r.org_id, ARRAY[r.owner_id, r.authorized_by, r.activated_by], 'register_overdue',
      CASE WHEN r.why = 'bypass' THEN 'Bypass vencido: ' ELSE 'Temporal vencido: ' END || r.number,
      CASE WHEN r.why = 'bypass' THEN r.title || ' — excedió su duración máxima de ' || (r.data ->> 'max_duration_hours') || ' h'
           ELSE r.title || ' — retiro planificado ' || (r.data ->> 'planned_removal') END,
      '/projects/' || r.project_id || '/registers/' || r.id,
      jsonb_build_object('itemId', r.id, 'projectId', r.project_id), 'register_overdue:' || r.id);
  END LOOP;
  RETURN jsonb_build_object('items', v_items, 'notified', v_n);
END;
$function$;
