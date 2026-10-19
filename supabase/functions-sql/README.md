# Funciones SQL canónicas (S03, 2026-10-19)

Cada archivo es **exactamente** lo que devuelve `pg_get_functiondef` en prod para esa función, con una
cabecera `-- fn: <firma>` y el `;` final. Es la fuente legible del cuerpo que corre: no hace falta
reproducir migraciones para saber qué calcula un gate o una cola de «Mi trabajo».

| Archivo | Para qué |
|---|---|
| `compute_system_gates` / `compute_project_gates` | Readiness por sistema × gate (Control Tower) |
| `approve_system_gate` / `sign_system_gate` | Aprobación y multifirma de gates |
| `my_work_counts` | Badge y colas de «Mi trabajo» |
| `daily_report_data` / `take_mgmt_snapshot` | Reporte diario y KPIs de gestión |
| `sign_itr_atomic` / `evaluate_itr_capture` | Firma de ITR y evaluación de su contenido |
| `seed_default_gate_for_phase` | Gate sembrado al crear una fase |
| `transition_procedure_revision` | Flujo de revisiones de procedimientos |
| `add_mgmt_attachment` / `update_punch_ops_status` | Evidencias de gestión y estado operativo del punch |

## Cambiar una función

1. Editar su archivo aquí.
2. `node scripts/sql/canonical-functions.mjs emit <nombre>` → pegar el resultado en una migración nueva.
3. Probar con `BEGIN … ROLLBACK` (`supabase db query --linked -f`) y aplicar con autorización.
4. `node scripts/sql/canonical-functions.mjs dump` → deja el archivo como lo normaliza Postgres. Commit.

**Prohibido** parchear con `replace(pg_get_functiondef(…))`: `src/lib/sql/no-anchor-patches.test.ts`
falla en cualquier migración posterior a `20261028120000`. `tests/db/function-drift.test.ts` compara
el md5 de cada archivo con la BD (RPC `function_definition_md5`, que nunca devuelve el cuerpo).

Para sumar una función: `node scripts/sql/canonical-functions.mjs dump 'public.<nombre>(<tipos>)'`.
