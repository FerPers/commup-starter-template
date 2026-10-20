-- fn: public.certificate_blocker(uuid,uuid,uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.certificate_blocker(p_subsystem_id uuid, p_phase_id uuid, p_justified uuid[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE e jsonb := public.certificate_eligibility(p_subsystem_id, p_phase_id); v_missing int;
BEGIN
  IF (e ->> 'openCatA')::int > 0 THEN RETURN 'Hay ' || (e ->> 'openCatA') || ' punch(es) Cat A abiertos — deben cerrarse antes de emitir'; END IF;
  IF (e ->> 'totalItrs')::int = 0 THEN RETURN 'No hay ITRs asignados en esta fase para el subsistema'; END IF;
  IF (e ->> 'approvedItrs')::int < (e ->> 'totalItrs')::int THEN
    RETURN 'Faltan ' || ((e ->> 'totalItrs')::int - (e ->> 'approvedItrs')::int) || ' ITR(s) por aprobar';
  END IF;
  IF (e ->> 'catBOverLimit')::boolean THEN
    RETURN 'Hay ' || jsonb_array_length(e -> 'openCatBPunches') || ' punch(es) Cat B abiertos; el máximo por subsistema es ' || (e ->> 'catBLimit');
  END IF;
  SELECT count(*) INTO v_missing FROM jsonb_array_elements(e -> 'openCatBPunches') b
   WHERE NOT ((b ->> 'id')::uuid = ANY (COALESCE(p_justified, '{}'::uuid[])));
  IF v_missing > 0 THEN RETURN 'Deben justificarse todos los punches Cat B abiertos (' || v_missing || ' sin justificación)'; END IF;
  RETURN NULL;
END;
$function$;
