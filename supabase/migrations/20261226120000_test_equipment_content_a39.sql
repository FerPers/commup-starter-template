-- A39 contenido (ola 2): decisiones 39-1…39-5 de docs/FICHA-A37-A38-A39-2026-10-24.md, aprobadas por Luis el 2026-10-24.
--
-- Los 27 códigos que «dejaron de exigir» equipo de prueba no fueron una decisión: la marca se rellenó en
-- 20261016150000 buscando el texto «Test Equipment Used» y las v2 (2026-09-10) ya no lo traían. Solo cambia la
-- plantilla: cada ITR congeló su requisito al crearse (A39 código, 20261222120000), así que ningún ITR existente
-- cambia de regla. Sin filtro de org: la decisión es del código (catálogo y DEMO).

-- 39-1 (25 códigos que miden con instrumento), 39-3 (I10A, la calibración) y 39-4 (I30C, causas simuladas).
UPDATE public.itr_templates SET requires_test_equipment = true
WHERE NOT requires_test_equipment AND upper(code) IN (
  'E03B','E04B','E05B','E07B','E10B','E11B','E13B','E13C','E14-1B','E15B','E18B','E20B','E22B',
  'E34B','E41B','E47B','E48B','E50B','E54B','H50B','I28C','T02A','T03A','T07A','T08A',
  'I10A','I30C');

-- 39-2: verificación funcional (E17B) y simulación con software (E42-1B), sin patrón calibrable.
UPDATE public.itr_templates SET requires_test_equipment = false
WHERE requires_test_equipment AND upper(code) IN ('E17B','E42-1B');

-- 39-5: la sección nativa guarda equipo, certificado y vigencia en la fecha de uso, y bloquea la firma si está
-- vencido. Se retira la captura duplicada en texto, solo en borradores sin ITR que exigen el equipo:
--   · «Equipo de prueba» T.n de los borradores v2 (I01A v3 y 26 más);
WITH drafts AS (
  SELECT t.id FROM public.itr_templates t
  WHERE NOT t.is_active AND t.requires_test_equipment
    AND NOT EXISTS (SELECT 1 FROM public.itrs x WHERE x.template_id = t.id)
)
DELETE FROM public.itr_template_items i
USING drafts d, public.itr_template_sections s
WHERE i.template_id = d.id AND s.id = i.section_id AND s.title = 'Equipo de prueba'
  AND i.item_number ~ '^T\.[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM public.itr_template_items j WHERE j.condition_item_id = i.id);

DELETE FROM public.itr_template_sections s
WHERE s.title = 'Equipo de prueba'
  AND NOT EXISTS (SELECT 1 FROM public.itr_template_items i WHERE i.section_id = s.id)
  AND EXISTS (SELECT 1 FROM public.itr_templates t WHERE t.id = s.template_id AND NOT t.is_active AND t.requires_test_equipment
              AND NOT EXISTS (SELECT 1 FROM public.itrs x WHERE x.template_id = t.id));

--   · «Equipo patrón utilizado» 7.01–7.07 del borrador I10A (tipo, fabricante, modelo, serie, certificado, fechas
--     y vigencia); quedan la verificación del inspector y las observaciones, renumeradas 7.01 y 7.02.
WITH drafts AS (
  SELECT t.id FROM public.itr_templates t
  WHERE upper(t.code) = 'I10A' AND NOT t.is_active AND t.requires_test_equipment
    AND NOT EXISTS (SELECT 1 FROM public.itrs x WHERE x.template_id = t.id)
), removed AS (
  DELETE FROM public.itr_template_items i
  USING drafts d, public.itr_template_sections s
  WHERE i.template_id = d.id AND s.id = i.section_id AND s.title = 'Equipo patrón utilizado'
    AND i.item_number IN ('7.01','7.02','7.03','7.04','7.05','7.06','7.07')
    AND NOT EXISTS (SELECT 1 FROM public.itr_template_items j WHERE j.condition_item_id = i.id)
  RETURNING i.template_id
)
UPDATE public.itr_template_items i
SET item_number = CASE i.item_number WHEN '7.08' THEN '7.01' ELSE '7.02' END
FROM public.itr_template_sections s
WHERE s.id = i.section_id AND s.title = 'Equipo patrón utilizado'
  AND i.item_number IN ('7.08','7.09')
  AND i.template_id IN (SELECT DISTINCT template_id FROM removed);
