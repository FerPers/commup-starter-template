-- A30 (ola 1, revisión 2026-10-23 hallazgo 12): analítica con contratos antiguos.
--
-- Desde S21 los eventos de ITR se llaman `itr` / `itr.approved` / `itr.rejected` (negocio, con `subsystem_id` en
-- el payload), pero estas vistas seguían filtrando `itrs` / `itrs.updated`, que ya no existen:
--   - analytics_bottlenecks (la usa «Cuellos de botella» en Calidad de datos): los rechazos recientes daban siempre 0
--     y todo subsistema con ITR pendientes salía «sin avance en 14 días» (+25). Se corrige con los eventos actuales;
--   - analytics_subsystem_velocity + analytics_project_forecast: sin consumidores (getProjectForecast no se llamaba
--     desde ninguna pantalla) y con una agregación equivocada (pendientes totales ÷ promedio de velocidades por
--     subsistema, etiquetada «p50» sin distribución). Se retiran; una estimación por ritmo, si vuelve, se valida
--     antes con datos históricos.
-- También se borra el código TS abandonado (src/analytics/*) en el mismo cambio.

DROP FUNCTION IF EXISTS public.analytics_project_forecast(uuid);
DROP VIEW IF EXISTS public.analytics_subsystem_velocity;

CREATE OR REPLACE VIEW public.analytics_bottlenecks WITH (security_invoker = on) AS
 WITH recent_rejects AS (
         SELECT (de.payload ->> 'subsystem_id'::text)::uuid AS subsystem_id,
            count(*) AS n
           FROM domain_events de
          WHERE de.aggregate_type = 'itr'::text AND de.event_type = 'itr.rejected'::text AND de.occurred_at >= (now() - '30 days'::interval)
          GROUP BY ((de.payload ->> 'subsystem_id'::text)::uuid)
        ), stalled AS (
         SELECT s.id AS subsystem_id
           FROM subsystems s
             LEFT JOIN domain_events de ON de.aggregate_type = 'itr'::text AND de.event_type = 'itr.approved'::text AND ((de.payload ->> 'subsystem_id'::text)::uuid) = s.id AND de.occurred_at >= (now() - '14 days'::interval)
          GROUP BY s.id
         HAVING count(de.*) = 0
        )
 SELECT ap.subsystem_id,
    ap.project_id,
    ap.org_id,
    ap.subsystem_code,
    ap.subsystem_name,
    ap.system_id,
    ap.system_name,
    ap.itrs_remaining,
    ap.punch_a_open,
    ap.punch_b_open,
    ap.punch_c_open,
    COALESCE(rj.n, 0::bigint) AS recent_rejects,
    ap.total_itrs,
    ap.itrs_approved,
    LEAST(100::bigint,
        CASE
            WHEN ap.punch_a_open > 0 THEN 40
            ELSE 0
        END +
        CASE
            WHEN st.subsystem_id IS NOT NULL AND ap.itrs_remaining > 0 THEN 25
            ELSE 0
        END +
        CASE
            WHEN ap.total_itrs > 0 AND (ap.punch_a_open + ap.punch_b_open + ap.punch_c_open) > ap.total_itrs THEN 20
            ELSE 0
        END +
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM certificates c
              WHERE c.subsystem_id = ap.subsystem_id AND c.status <> 'issued'::certificate_status)) AND ap.punch_a_open > 0 THEN 10
            ELSE 0
        END + LEAST(15::bigint, COALESCE(rj.n, 0::bigint) * 5)) AS bottleneck_score,
    array_remove(ARRAY[
        CASE
            WHEN ap.punch_a_open > 0 THEN 'punch_a_open'::text
            ELSE NULL::text
        END,
        CASE
            WHEN st.subsystem_id IS NOT NULL AND ap.itrs_remaining > 0 THEN 'no_velocity_14d'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ap.total_itrs > 0 AND (ap.punch_a_open + ap.punch_b_open + ap.punch_c_open) > ap.total_itrs THEN 'punch_ratio_high'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM certificates c
              WHERE c.subsystem_id = ap.subsystem_id AND c.status <> 'issued'::certificate_status)) AND ap.punch_a_open > 0 THEN 'cert_blocked'::text
            ELSE NULL::text
        END,
        CASE
            WHEN COALESCE(rj.n, 0::bigint) > 0 THEN 'recent_rejections'::text
            ELSE NULL::text
        END], NULL::text) AS reasons
   FROM analytics_subsystem_progress ap
     LEFT JOIN recent_rejects rj ON rj.subsystem_id = ap.subsystem_id
     LEFT JOIN stalled st ON st.subsystem_id = ap.subsystem_id;

COMMENT ON VIEW public.analytics_bottlenecks IS 'Score 0..100 por subsystem. Ordenar DESC para cuellos de botella críticos. A30: eventos itr.approved / itr.rejected.';
