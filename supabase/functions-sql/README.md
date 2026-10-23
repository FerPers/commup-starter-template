# Funciones SQL canónicas (S03, 2026-10-19)

Cada archivo es **exactamente** lo que devuelve `pg_get_functiondef` en prod para esa función, con una
cabecera `-- fn: <firma>` y el `;` final. Es la fuente legible del cuerpo que corre: no hace falta
reproducir migraciones para saber qué calcula un gate o una cola de «Mi trabajo».

| Archivo | Para qué |
|---|---|
| `compute_system_gates` / `compute_system_gates_upto` / `compute_project_gates` | Readiness por sistema × gate (Control Tower). `_upto` evalúa hasta un orden (proveedores de dependencias, S11) |
| `compute_project_gates` / `gate_status_compute` / `gate_status_mark` / `gate_status_systems` / `gate_status_dirty_trg` / `gate_status_org_trg` / `gate_status_on_system_insert` / `gate_status_audit` | Estado materializado de gates (S20, D-07): `system_gate_status` por sistema, versión que suben los triggers, recálculo de los sucios y auditoría nocturna |
| `notify_preservation_overdue` / `notify_constraints_overdue` / `notify_pssr_reviews_overdue` / `get_my_field_project_ids` | Avisos de los crons en SQL (S20, B-21); conjunto de proyectos de campo para las políticas (B-06) |
| `emit_domain_event` / `emit_business_event` / `outbox_dispatch` / `claim_webhook_deliveries` / `cleanup_event_retention` | Bus de eventos (S21): catálogo v1 y eventos de negocio, outbox por minuto (pg_cron), reserva de entregas, retención |
| `my_readiness_items` / `my_work_counts` / `notify_users` / `notify_obligation_trg` / `gate_status_transition_trg` / `gate_status_refresh_dirty` / `capacity_holders` / `project_role_members` / `gate_approvers` / `gate_cosigners` / `notification_push_enqueue_trg` / `claim_push_notifications` | Avisos y colas (S22): colas de readiness, un aviso por obligación nueva y por transición de gate, push desde notifications |
| `guard_same_project` | B-17: subsistema/sistema/tag/ITR referenciados del mismo proyecto (trigger en subsystems, tags, itrs, punches, certificates) |
| `gate_status_compute` / `system_open_punches` / `gate_conditions_create_actions` / `register_required_fields` / `transition_register_item` / `notify_registers_overdue` / `mgmt_check_source` | Readiness v2 (S23): bloqueo por gate guardado, punch A/B por sistema, condiciones = acciones, campos obligatorios de registros y vencidos |
| `compute_project_readiness` / `compute_project_progress` | Readiness y avance físico del proyecto, set-based con una sola verificación de pertenencia (S20; banco en `scripts/loadtest/`) |
| `compute_project_gate_progress` | Avance de cada sistema en cada gate (ITR aprobados de la fase / ITR de la fase) en una consulta: skyline de liberación (E1) |
| `compute_project_pid_coverage` / `compute_project_pid_drawing_coverage` | Cobertura del P&ID (E2): tags con pin en la revisión vigente de un P&ID, por sistema y por plano |
| `org_gate_policy` / `system_pssr_status` / `system_phase_level` / `startup_prerequisites` | Política de regresión (D13), PSSR único, nivel por fase con corte de punch, prerrequisitos de arranque (S11) |
| `approve_system_gate` / `sign_system_gate` | Aprobación y multifirma de gates |
| `my_work_counts` | Badge y colas de «Mi trabajo» |
| `daily_report_data` / `take_mgmt_snapshot` | Reporte diario y KPIs de gestión (vendors: la FAT/SAT con re-prueba no cuenta, S13) |
| `document_refresh_current` / `add_document_reference` / `update_document_reference` / `document_references_blocker` / `new_procedure_revision` | Control documental (S13): vigente por fecha de emisión, anuladas fuera, política IFR/IFA de la org, R2 de procedimiento hereda referencias |
| `get_my_org_ids` / `get_my_project_ids` / `get_my_editor_project_ids` / `is_org_admin` / `is_org_editor` / `is_org_privileged` / `is_project_member` / `is_project_editor` / `is_project_field_member` / `user_in_project_org` / `org_caller_role` | Helpers de RLS y rol: solo membresías activas y no vencidas (S15, I-21) |
| `submit_pssr` / `sign_pssr` / `approve_pssr` / `reject_pssr` / `pssr_punch_blocker` | PSSR por RPC (S16): ítems sí/NA, punch con disposición, firmas por capacidad, aprobador distinto, RFSU |
| `certificate_eligibility` / `certificate_blocker` / `certificate_previous_blocker` / `refresh_certificate_block` / `certificate_role_capacity` / `issue_certificate` / `sign_certificate` / `revoke_certificate` / `reopen_certificate` | Certificados por RPC (S17): elegibilidad (= `eligibility.ts`), fase anterior, bloqueo por cambio de base, firma por capacidad (D15) y número atómico |
| `itr_generation_candidates` / `itr_generation_summary` / `generate_itrs` | Generación masiva de ITR desde la matriz aprobada (S19): reglas de candidatos, vista previa e inserción por lotes. R1: los pares de una disciplina de plantilla fuera del alcance del proyecto salen `out_of_scope` |
| `project_discipline_scope` / `set_project_disciplines` / `project_disciplines_on_project_insert` / `project_disciplines_on_discipline_insert` | Alcance de disciplinas del proyecto (R1): impacto por disciplina, única escritura (motivo si hay ITR) y «por defecto, todas» |
| `tag_itr_requirements` / `tag_requirements_page` / `tag_requirements_summary` / `set_tag_itr_override` | Requisitos ITR por tag (R2a): estado de cada requisito sobre el motor `itr_generation_candidates` (matriz aceptada + alcance + excepciones de `tag_itr_overrides`), página del registro, totales y única escritura de las excepciones |
| `tag_requirements_export` / `template_client_codes_for` / `set_template_client_codes` | R2b: las tres vistas del Excel del registro (gerencial, sistema × subsistema × disciplina × etapa, detalle con tope) y código del cliente por plantilla (proyecto gana sobre el defecto de la org; única escritura) |
| `tag_itr_requirements_core` / `tag_requirements_refresh` / `tag_requirements_rebuild` / `tag_requirements_rebuild_pending` / `tag_requirements_mark_tags` / `tag_requirements_mark_org` / `tag_requirements_mark_projects` / `tag_requirements_audit` | Requisitos ITR materializados por tag (R2b): tags sucios por triggers, recálculo al leer de lo sucio, recálculo completo por pg_cron `tag-requirements-rebuild` en proyectos grandes (mientras tanto, en vivo) y auditoría contra el cálculo en vivo |
| `release_hold_point` / `transition_procedure_run` / `start_procedure_run` / `complete_run_step` / `system_staffing` / `record_competency` / `void_competency_record` / `request_ownership_transfer` / `sign_ownership_transfer` / `ownership_check_keys` / `org_transfer_non_dispensable` / `record_startup_event` / `add_startup_event_param` / `performance_freeze_run` / `refreeze_performance_run` / `performance_evaluate_core` / `record_performance_result` / `set_performance_disturbance_exclusion` / `acknowledge_performance_exclusions` / `set_lineup_item` / `verify_lineup_item` / `update_procedure` | Arranque y desempeño (S25a): línea de tiempo de ejecuciones, turnos del roster, competencias anulables, traspaso con no dispensables y reconocimiento por firmante, orden de hitos, re-congelado sin borrar, exclusiones reconocidas por el cliente |
| `set_lineup_item` / `complete_lineup_sheet` / `create_lineup_sheet` / `procedure_write_content` / `procedure_revision_hash` / `new_procedure_revision` / `copy_procedure` | S25b: line-up encontrada/dejada con candado/sello, rango esperado por paso, line-up por flags del tipo de equipo |
| `generate_handover_package` / `verify_handover_package` | Paquete de handover v3 (S24): todo F1–F8 por sistema con firmas y hashes; verificación pública por sha256 de handover.json (solo service_role) |
| `record_decision` / `log_sync_conflict` / `upsert_push_subscription` | DEC solo líder+; conflictos offline y push en la org correcta (S15) |
| `capacity_fallback_roles` / `has_capacity` / `capacity_designated` / `hold_release_roles` | Firmantes designados (S14, D14): con designados en `project_capacities` firman solo ellos; sin designados, el rol de respaldo (= `CAPACITY_FALLBACK_ROLES` en TS, test de paridad) |
| `release_hold_point` / `witness_startup_event` / `sign_ownership_transfer` / `issue_performance_certificate` / `sign_performance_certificate` / `set_gate_weights` | Firmas de arranque, traspaso y PTC por capacidad (S14); pesos de gates solo owner/admin |
| `save_procedure_revision` / `save_performance_revision` / `transition_performance_revision` | Borradores: `editors[]`, quien editó no aprueba (S14, E-30) |
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
