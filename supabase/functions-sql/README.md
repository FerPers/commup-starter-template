# Funciones SQL canónicas (S03, 2026-10-19)

Cada archivo es **exactamente** lo que devuelve `pg_get_functiondef` en prod para esa función, con una
cabecera `-- fn: <firma>` y el `;` final. Es la fuente legible del cuerpo que corre: no hace falta
reproducir migraciones para saber qué calcula un gate o una cola de «Mi trabajo».

| Archivo | Para qué |
|---|---|
| `compute_system_gates` / `compute_system_gates_upto` / `compute_project_gates` | Readiness por sistema × gate (Control Tower). `_upto` evalúa hasta un orden (proveedores de dependencias, S11) |
| `org_gate_policy` / `system_pssr_status` / `system_phase_level` / `startup_prerequisites` | Política de regresión (D13), PSSR único, nivel por fase con corte de punch, prerrequisitos de arranque (S11) |
| `approve_system_gate` / `sign_system_gate` | Aprobación y multifirma de gates |
| `my_work_counts` | Badge y colas de «Mi trabajo» |
| `daily_report_data` / `take_mgmt_snapshot` | Reporte diario y KPIs de gestión (vendors: la FAT/SAT con re-prueba no cuenta, S13) |
| `document_refresh_current` / `add_document_reference` / `update_document_reference` / `document_references_blocker` / `new_procedure_revision` | Control documental (S13): vigente por fecha de emisión, anuladas fuera, política IFR/IFA de la org, R2 de procedimiento hereda referencias |
| `cancel_vendor_package` / `decide_vendor_recommendation` | Vendors (S13): terminación anticipada de un movilizado; quien propone no decide |
| `sign_itr_atomic` / `evaluate_itr_capture` | Firma de ITR y evaluación de su contenido |
| `seed_default_gate_for_phase` | Gate sembrado al crear una fase |
| `guard_itr_row` / `guard_itr_content` / `itr_signing_roles` | Integridad del ITR: firmas requeridas congeladas, asignaciones por rol sin firmar, una persona por rol (S04) |
| `reopen_itr_atomic` | Reapertura auditada de un ITR firmado |
| `guard_assigned_itr_template` / `create_itr_template_revision` / `clone_itr_template_from_catalog` | Plantillas: inmutables con ITR, revisiones y clones del catálogo |
| `transition_procedure_revision` | Flujo de revisiones de procedimientos |
| `add_mgmt_attachment` / `update_punch_ops_status` | Evidencias de gestión y estado operativo del punch |
| `project_today` / `project_timezone` | «Hoy» del proyecto (`projects.timezone`, S10/D12). Toda fecha «de hoy» en SQL pasa por aquí, no por `CURRENT_DATE` |
| `create_daily_report_draft` / `refresh_daily_report_data` / `set_daily_report_ai_draft` / `replace_daily_report_ai_draft` / `update_daily_report_sections` / `issue_daily_report` / `revise_daily_report` / `open_shift_handover` / `handover_snapshot` | Reporte diario y relevo (S10) |
| `take_kpi_snapshot` / `preservation_is_overdue` / `preservation_due_counts` | Snapshot KPI y vencidas de preservación (S09/S10) |
| `evaluate_performance_run` | Evaluación previa de desempeño, guardada en `evaluation_preview` (S10/B-26) |
| `ingest_signal_samples` / `signal_series` / `ensure_signal_sample_partitions` / `cleanup_signal_samples_retention` / `performance_compute_evaluation` | IIoT: ingesta validada por muestra, serie reducida, particiones mensuales y retención, evaluación con umbrales de calidad (S12) |
| Sellos de fecha con el día del proyecto (S10) | `sign_itr_atomic`, `refresh_itr_status`, `cancel_punch`, `verify_punch`, `finalize_preservation_record`, `itr_test_equipment_fill`, `record_decision`, `record_competency`, `person_system_level`, `add_document_revision`, `issue_document_revision`, `add_vendor_report`, `record_vendor_activity_result`, `analytics_project_forecast` |

## Cambiar una función

1. Editar su archivo aquí.
2. `node scripts/sql/canonical-functions.mjs emit <nombre>` → pegar el resultado en una migración nueva.
3. Probar con `BEGIN … ROLLBACK` (`supabase db query --linked -f`) y aplicar con autorización.
4. `node scripts/sql/canonical-functions.mjs dump` → deja el archivo como lo normaliza Postgres. Commit.

**Prohibido** parchear con `replace(pg_get_functiondef(…))`: `src/lib/sql/no-anchor-patches.test.ts`
falla en cualquier migración posterior a `20261028120000`. `tests/db/function-drift.test.ts` compara
el md5 de cada archivo con la BD (RPC `function_definition_md5`, que nunca devuelve el cuerpo).

Para sumar una función: `node scripts/sql/canonical-functions.mjs dump 'public.<nombre>(<tipos>)'`. Los tipos propios van calificados (`public.punches`, `public.punch_category`): `function_definition_md5` resuelve la firma con `search_path` vacío.
