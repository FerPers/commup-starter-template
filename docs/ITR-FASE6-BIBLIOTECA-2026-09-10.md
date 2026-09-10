# Fase 6 — Biblioteca de formatos ITR — 2026-09-10

Decisión 7 de Luis (2026-09-09): **organización catálogo + clonación**; el administrador o arquitecto de cada organización trae los formatos que necesita. Este documento describe lo construido hoy, lo probado y la secuencia operativa para regenerar Ecopetrol.

---

## 1. Lo que ya existía

- `organizations.settings.is_template_catalog` (interruptor en `/admin/config`, solo owner) y `is_catalog_org()` en RLS: las plantillas, secciones e ítems de una org catálogo son legibles por cualquier usuario autenticado.
- Modal «Importar de otra org» (`ImportFromOrgModal`) con `listImportableTemplates` (catálogo ∪ orgs del usuario) y clonación unitaria o masiva.
- `is_global` en `itr_templates`: 0 filas; queda sin uso (el modelo elegido es catálogo + clonación).

Brechas que hacían inviable la biblioteca: el clon copiaba `version: 1` siempre, omitía `title_es`, `equipment_type_id` y **las condiciones**, hacía N inserts sin transacción y no guardaba de dónde venía. Un código ya existente se saltaba: no había camino para traer la v2 del catálogo a una org que ya tenía la v1.

## 2. Lo construido hoy

Migración `20260910120000_itr_template_catalog_clone.sql` (aplicada en prod):

| Pieza | Qué hace |
|---|---|
| Columnas `itr_templates.source_template_id`, `source_org_id`, `source_version`, `imported_at` | Procedencia de cada revisión importada. `source_template_id` apunta a la revisión concreta del origen (FK, `ON DELETE SET NULL`). |
| RPC `clone_itr_template_from_catalog(p_source_template_id, p_target_org_id, p_code_suffix)` | SECURITY DEFINER. Exige editor (owner/admin/architect/leader) en la org destino; el origen debe ser la **revisión activa** de una org catálogo o de una org de la que el usuario es miembro. Mapea disciplina y fase por código (error si faltan) y tipo de equipo por código (NULL si falta, avisado). Código nuevo → **v1 activa** (`created`). Código existente → **revisión nueva inactiva** con version = max+1 (`revision`), que se revisa y se activa con `activate_itr_template_revision` (re-apunta la matriz). Ya importada esa misma revisión → `skipped`. Copia cabecera completa, secciones, ítems (`requires_document`, `option_outcomes`, tablas) y re-mapea las condiciones. Una sola transacción; registra `imported_from_catalog` en `activity_log`. |
| Función `list_catalog_template_updates(p_org_id)` | SECURITY INVOKER (RLS). Plantillas activas de la org con procedencia cuyo origen ya tiene una revisión activa distinta y no traída. |

Aplicación:

- `src/app/actions/itr-templates.ts`: `cloneTemplateInternal` llama a la RPC; `cloneTemplateToActiveOrg` devuelve `mode`, `version`, `isActive`, `equipmentTypeMapped`; `cloneTemplatesToActiveOrg` cuenta `created / updated / skipped`; `listImportableTemplates` añade `localVersion` y `localState` (`missing` / `current` / `outdated`).
- `ImportFromOrgModal`: botón «Importar» / «Nueva revisión» / «Al día» según el estado local; mensajes por modo.
- `/admin/templates`: aviso ámbar «N plantillas tienen una revisión nueva en el catálogo» con acceso directo al modal.
- Tipos (`database.ts`, `supabase.generated.ts`) y `tests/db/catalog-clone.test.ts` (membresía y RLS; se omite sin credenciales de prueba).

## 3. Verificación

Prueba en prod dentro de una transacción revertida (DO … RAISE), impersonando a Luis (owner de DEMO y Ecopetrol):

| Caso | Resultado |
|---|---|
| I06A v2 (DEMO, activa) → Ecopetrol, que tiene I06A v1 activa | `revision`, v2 inactiva, 3 secciones, 19 ítems, 17 selecciones con resultado, `title_es` y procedencia guardados |
| Misma llamada otra vez | `skipped` (misma revisión origen) |
| I10A v3 (borrador inactivo) → Ecopetrol | Error «Only the active revision can be imported» |
| I06A v2 → la propia DEMO | Error «already belongs to the target organization» |
| I10A v2 (74 condiciones) → Ecopetrol | `revision`; 74 condiciones re-mapeadas, 0 colgantes |
| Inspector de Ecopetrol intenta importar | Error «Template editor membership required» |

Tras la prueba: Ecopetrol sigue con 302 plantillas, 0 procedencias, 0 registros de importación. `npm run typecheck` limpio; 168 pruebas unitarias pasan (14 omitidas por falta de credenciales de DB); lint limpio en los archivos tocados.

## 4. Secuencia operativa para Ecopetrol (pendiente)

Hoy la revisión activa de DEMO sigue siendo la v1 en casi todos los códigos (los 262 borradores v2 de la Fase 2 están inactivos). Traer Ecopetrol ahora copiaría v1 sobre v1. Orden correcto:

1. **Designar el catálogo.** Opción A (inmediata): marcar DEMO como catálogo en `/admin/config`. Opción B (recomendada a medio plazo): crear una org «Biblioteca CommUp», hacerla catálogo y poblarla desde DEMO con «Importar todos» (la RPC sirve para eso: DEMO → Biblioteca), para que el catálogo no conviva con datos de demostración ni con las 3 plantillas QA.
2. **Activar en el catálogo, por lote, las revisiones v2/v3** revisadas (Fase 1 y Fase 2). Solo la revisión activa se exporta.
3. En Ecopetrol, con Luis como owner: `/admin/templates` mostrará el aviso «N plantillas tienen una revisión nueva en el catálogo». «Importar todos» crea las revisiones v2 **inactivas** en Ecopetrol; sus v1 siguen activas e intactas.
4. Revisar y activar por lote en Ecopetrol («Activar esta revisión»); la matriz equipo×ITR de Ecopetrol se re-apunta sola. Prerrequisito: que Ecopetrol tenga las disciplinas y fases con los mismos códigos (hoy las tiene, porque sus 302 v1 se importaron así) y, si se quiere conservar `equipment_type_id`, los tipos de equipo con el mismo código.
5. Los scripts locales `preparar-*.mjs` de la entrega del 09-09 quedan retirados: no están en el repo y el único camino de publicación es revisión → activación.

## 5. Decisiones abiertas para Luis

- Catálogo en DEMO (opción A) o en una org dedicada (opción B).
- Si una org edita su copia y luego trae una revisión nueva del catálogo, la revisión traída **no** incorpora los cambios locales: es una copia del catálogo que la org revisa antes de activar. Es el comportamiento acordado («cada org evoluciona su copia»); si se quiere fusión, es una fase aparte.
- Preservación y PSSR tienen su propia clonación (`preservation.ts`, `pssr.ts`) con las mismas carencias que tenía la de ITR (sin procedencia ni revisiones). Fuera del alcance del plan ITR; se anota.
