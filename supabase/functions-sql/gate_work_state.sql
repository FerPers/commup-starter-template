-- fn: public.gate_work_state(text, jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_work_state(p_status text, p_criteria jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- A08 (E4, D7 del plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md): un gate «no listo» se lee según su causa.
  --   blocked = algo que no se resuelve haciendo el trabajo planeado: Cat A abierto, ITR no conforme o Cat B sobre el
  --             tope en algún subsistema; gate anterior o sistema proveedor en regresión; registro controlado o
  --             restricción en nivel 4 que bloquean;
  --   nodata  = la fase no tiene ITR en el alcance del sistema (o el gate no tiene fase): no se sabe qué falta;
  --   work    = trabajo en curso (ITR por aprobar, gate anterior o proveedor sin liberar, certificados, PSSR, line-up…).
  -- Luis, 2026-10-25: una dependencia sin liberar es la secuencia normal (como el gate anterior); bloquea solo si el
  -- proveedor está en regresión.
  -- Espejo en TS: src/lib/readiness/work-state.ts (paridad en tests/db/gate-work-state-parity.test.ts).
  SELECT CASE
    WHEN p_status IS DISTINCT FROM 'not_ready' THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) cr
      WHERE cr ->> 'result' = 'fail' AND (
           cr ->> 'kind' IN ('registers_clear', 'constraints_clear')
        OR (cr ->> 'kind' = 'previous_gate' AND COALESCE((cr -> 'detail' ->> 'regressed')::boolean, false))
        OR (cr ->> 'kind' = 'dependencies_ready' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(cr -> 'detail' -> 'dependencies', '[]'::jsonb)) dp
              WHERE dp ->> 'provider_status' = 'regressed'))
        OR (cr ->> 'kind' = 'itr_phase_approved' AND (
              COALESCE((cr -> 'detail' ->> 'open_cat_a')::int, 0) > 0
           OR COALESCE((cr -> 'detail' ->> 'itr_rejected')::int, 0) > 0
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(cr -> 'detail' -> 'red_subsystems', '[]'::jsonb)) rs
                      WHERE rs ->> 'reason' IN ('cat_a', 'cat_b_over_limit'))))))
      THEN 'blocked'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) cr
      WHERE cr ->> 'kind' = 'itr_phase_approved' AND cr ->> 'result' = 'fail'
        AND (cr -> 'detail' ? 'error' OR COALESCE((cr -> 'detail' ->> 'itr_total')::int, 0) = 0))
      THEN 'nodata'
    ELSE 'work'
  END
$function$;
