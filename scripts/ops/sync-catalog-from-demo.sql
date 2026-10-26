-- 2026-10-26: lleva al Catálogo (CommUp Catálogo) las revisiones ACTIVAS de la org DEMO (v2/v3 activadas por la
-- migración 20270105120000), antes de borrar la org DEMO. Reemplaza a scripts/itr-v2/sincronizar-catalogo.mjs,
-- que quedó sin sus helpers cuando A40 pasó la copia a la RPC. Usa las mismas RPC que la pantalla, como Luis
-- (owner de las dos orgs): clone_itr_template_from_catalog (revisión nueva, o código nuevo con su matriz) y
-- activate_itr_template_revision (la matriz del catálogo sigue a la activa).
--   · Fuera: DEMO-CAL-V2 (referencia de demo) y los códigos en v1 en las dos orgs (M06B, M11B: sin cambios).
--   · Borra del catálogo las plantillas de prueba LCT-FT y P06A(1).
--   · La matriz del catálogo queda aceptada como en DEMO (por código de tipo de equipo × código de plantilla).
-- Uso: supabase db query --linked -f scripts/ops/sync-catalog-from-demo.sql (termina en ROLLBACK; COMMIT para aplicar).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '300s';

CREATE TEMP TABLE sync_log (code text, kind text, version int, new_id uuid) ON COMMIT DROP;
GRANT ALL ON sync_log TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "fc1593b4-5fc1-4eae-9fb0-b213ecae7366", "role": "authenticated"}';

DO $$
DECLARE
  v_demo constant uuid := 'e12c53b2-85fd-462f-86f3-bba318aa77ee';
  v_cat constant uuid := '0ea5bfe9-4b09-471f-8194-30e780ecbb25';
  r record;
  res jsonb;
BEGIN
  FOR r IN
    SELECT s.id, s.code, s.version,
           (SELECT max(version) FROM itr_templates c WHERE c.org_id = v_cat AND c.code = s.code) AS cat_latest
    FROM itr_templates s
    WHERE s.org_id = v_demo AND s.is_active AND s.code <> 'DEMO-CAL-V2'
    ORDER BY s.code
  LOOP
    CONTINUE WHEN r.version = 1 AND r.cat_latest IS NOT NULL;
    res := public.clone_itr_template_from_catalog(r.id, v_cat, NULL, r.cat_latest IS NOT NULL, r.cat_latest, NULL, NULL);
    IF res->>'kind' = 'revision' THEN
      PERFORM public.activate_itr_template_revision((res->>'id')::uuid);
    END IF;
    INSERT INTO sync_log VALUES (r.code, res->>'kind', (res->>'version')::int, (res->>'id')::uuid);
  END LOOP;
END $$;

RESET ROLE;

DELETE FROM itr_templates WHERE org_id = '0ea5bfe9-4b09-471f-8194-30e780ecbb25' AND code IN ('LCT-FT', 'P06A(1)');

-- Matriz: misma decisión que en DEMO (aceptada), emparejada por código.
WITH demo AS (
  SELECT e.code AS eq_code, t.code AS tpl_code, m.status, m.source, m.confidence, m.reason, m.model
  FROM equipment_type_templates m
  JOIN equipment_types e ON e.id = m.equipment_type_id
  JOIN itr_templates t ON t.id = m.itr_template_id
  WHERE m.org_id = 'e12c53b2-85fd-462f-86f3-bba318aa77ee' AND m.status = 'accepted'
), target AS (
  SELECT d.*, ce.id AS cat_eq, ct.id AS cat_tpl
  FROM demo d
  JOIN equipment_types ce ON ce.org_id = '0ea5bfe9-4b09-471f-8194-30e780ecbb25' AND ce.code = d.eq_code
  JOIN itr_templates ct ON ct.org_id = '0ea5bfe9-4b09-471f-8194-30e780ecbb25' AND ct.code = d.tpl_code AND ct.is_active
)
INSERT INTO equipment_type_templates (org_id, equipment_type_id, itr_template_id, status, source, confidence, reason, model, reviewed_by, reviewed_at)
SELECT '0ea5bfe9-4b09-471f-8194-30e780ecbb25', cat_eq, cat_tpl, 'accepted', source, confidence, reason, model, 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366', now()
FROM target
ON CONFLICT (org_id, equipment_type_id, itr_template_id)
DO UPDATE SET status = 'accepted', reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at;

-- Verificación.
WITH c AS (SELECT * FROM itr_templates WHERE org_id = '0ea5bfe9-4b09-471f-8194-30e780ecbb25'),
     d AS (SELECT * FROM itr_templates WHERE org_id = 'e12c53b2-85fd-462f-86f3-bba318aa77ee' AND is_active AND code <> 'DEMO-CAL-V2')
SELECT
  (SELECT string_agg(kind || '=' || n, ' ') FROM (SELECT kind, count(*) n FROM sync_log GROUP BY 1) z) sincronizadas,
  (SELECT count(*) FROM c WHERE is_active) activas_catalogo,
  (SELECT count(*) FROM (SELECT code FROM c WHERE is_active GROUP BY 1 HAVING count(*) > 1) z) codigos_con_2_activas,
  (SELECT count(*) FROM d WHERE NOT EXISTS (SELECT 1 FROM c WHERE c.code = d.code AND c.is_active)) demo_sin_activa_en_catalogo,
  (SELECT count(*) FROM d JOIN c ON c.code = d.code AND c.is_active
     WHERE (SELECT count(*) FROM itr_template_items WHERE template_id = d.id) <> (SELECT count(*) FROM itr_template_items WHERE template_id = c.id)
        OR d.requires_test_equipment <> c.requires_test_equipment OR d.required_signatures <> c.required_signatures) difieren,
  (SELECT count(*) FROM itr_template_items i JOIN c ON c.id = i.template_id AND c.is_active WHERE i.item_type = 'table' AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.options->'columns') x WHERE x->>'decides' = 'true')) tablas_que_deciden,
  (SELECT string_agg(status || '=' || n, ' ') FROM (SELECT m.status, count(*) n FROM equipment_type_templates m JOIN c ON c.id = m.itr_template_id AND c.is_active GROUP BY 1) z) matriz_activa,
  (SELECT count(*) FROM equipment_type_templates m JOIN c ON c.id = m.itr_template_id AND NOT c.is_active) matriz_en_inactivas;
ROLLBACK;
