-- fn: public.startup_snapshot_param(uuid,uuid,uuid,timestamp with time zone)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.startup_snapshot_param(p_event_id uuid, p_project_id uuid, p_signal_id uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sig record; v_s record;
BEGIN
  SELECT s.id, s.signal_tag, s.eng_unit INTO v_sig FROM signals s JOIN tags t ON t.id = s.tag_id
   WHERE s.id = p_signal_id AND t.project_id = p_project_id;
  IF v_sig.id IS NULL THEN RAISE EXCEPTION 'La señal no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
  SELECT value, quality, sampled_at INTO v_s FROM signal_samples
   WHERE signal_id = p_signal_id AND sampled_at BETWEEN p_at - interval '5 minutes' AND p_at + interval '5 minutes'
   ORDER BY (quality <> 0), abs(extract(epoch FROM sampled_at - p_at)) LIMIT 1;
  INSERT INTO startup_event_params (event_id, project_id, signal_id, label, value, unit, quality, sampled_at, offset_s, source, added_by)
  VALUES (p_event_id, p_project_id, p_signal_id, v_sig.signal_tag, v_s.value, v_sig.eng_unit, v_s.quality, v_s.sampled_at,
          CASE WHEN v_s.sampled_at IS NOT NULL THEN round(extract(epoch FROM v_s.sampled_at - p_at))::int END,
          CASE WHEN v_s.sampled_at IS NOT NULL THEN 'iiot' ELSE 'iiot_missing' END, auth.uid());
END;
$function$;
