-- S20 — borra el banco de carga LOADTEST (org, proyecto y todo lo que cuelga por cascada).
-- Uso: node scripts/loadtest/run.mjs scripts/loadtest/teardown.sql [--db-url <url-rama>]  (o psql; nunca prod, ver seed.sql)
--
-- 2026-10-22: el borrado en cascada choca con los guards de BORRADO que llegaron después de S20 (plantillas
-- asignadas congeladas, último owner de la org, auditoría y borrado lógico de criterios de liberación, log de
-- límites congelados) y con los triggers de eventos y de estado de gates. Se apagan SOLO dentro de esta
-- transacción y con lista explícita: los mismos que se apagan se vuelven a encender (nunca se toca un trigger
-- que ya estuviera apagado). Los triggers internos de llave foránea (la cascada) siguen activos.
-- Lista = todos los triggers no internos ON DELETE del esquema public al 2026-10-23 (con los de requisitos ITR, R2b); si se agrega uno nuevo,
-- sumarlo aquí (la transacción falla y no borra nada si falta).
-- Toma bloqueo exclusivo de estas tablas mientras dura (segundos): correr en una hora tranquila.
BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.ce_causes DISABLE TRIGGER ce_causes_guard_delete;
ALTER TABLE public.ce_effects DISABLE TRIGGER ce_effects_guard_delete;
ALTER TABLE public.certificate_punch_exceptions DISABLE TRIGGER cert_exceptions_certificate_base;
ALTER TABLE public.certificates DISABLE TRIGGER certificates_gate_dirty_del, DISABLE TRIGGER trg_events_certificates;
ALTER TABLE public.document_references DISABLE TRIGGER document_references_gate_dirty_del;
ALTER TABLE public.documents DISABLE TRIGGER documents_gate_dirty_del;
ALTER TABLE public.equipment_type_templates DISABLE TRIGGER equipment_type_templates_req_dirty_del;
ALTER TABLE public.gate_criteria DISABLE TRIGGER gate_config_audit, DISABLE TRIGGER gate_criteria_gate_dirty, DISABLE TRIGGER gate_criteria_soft_delete;
ALTER TABLE public.itr_assignments DISABLE TRIGGER itr_assignments_integrity;
ALTER TABLE public.itr_attachments DISABLE TRIGGER itr_attachments_integrity;
ALTER TABLE public.itr_responses DISABLE TRIGGER itr_responses_integrity;
ALTER TABLE public.itr_signatures DISABLE TRIGGER itr_signatures_gate_dirty_del;
ALTER TABLE public.itr_template_items DISABLE TRIGGER itr_items_frozen, DISABLE TRIGGER itr_template_items_req_dirty_del;
ALTER TABLE public.itr_template_sections DISABLE TRIGGER itr_sections_frozen;
ALTER TABLE public.itr_templates DISABLE TRIGGER itr_template_frozen, DISABLE TRIGGER itr_templates_req_dirty_del;
ALTER TABLE public.itr_test_equipment DISABLE TRIGGER itr_test_equipment_integrity;
ALTER TABLE public.itrs DISABLE TRIGGER itrs_certificate_base, DISABLE TRIGGER itrs_gate_dirty_del, DISABLE TRIGGER itrs_integrity, DISABLE TRIGGER itrs_req_dirty_del, DISABLE TRIGGER trg_events_itrs;
ALTER TABLE public.lineup_sheets DISABLE TRIGGER lineup_sheets_gate_dirty_del;
ALTER TABLE public.loops DISABLE TRIGGER trg_events_loops;
ALTER TABLE public.org_members DISABLE TRIGGER org_members_owner_guard;
ALTER TABLE public.performance_certificates DISABLE TRIGGER performance_certificates_gate_dirty_del;
ALTER TABLE public.performance_disturbances DISABLE TRIGGER performance_eval_preview_reset;
ALTER TABLE public.performance_run_data DISABLE TRIGGER performance_eval_preview_reset;
ALTER TABLE public.performance_test_revisions DISABLE TRIGGER performance_test_revisions_gate_dirty_del;
ALTER TABLE public.performance_tests DISABLE TRIGGER performance_tests_gate_dirty_del;
ALTER TABLE public.procedures DISABLE TRIGGER procedures_gate_dirty_del;
ALTER TABLE public.project_disciplines DISABLE TRIGGER project_disciplines_req_dirty_del;
ALTER TABLE public.project_phases DISABLE TRIGGER project_phases_req_dirty_del;
ALTER TABLE public.project_constraints DISABLE TRIGGER project_constraints_gate_dirty_del;
ALTER TABLE public.pssr_review_items DISABLE TRIGGER pssr_review_items_guard;
ALTER TABLE public.pssr_reviews DISABLE TRIGGER pssr_reviews_gate_dirty_del;
ALTER TABLE public.punches DISABLE TRIGGER punches_certificate_base, DISABLE TRIGGER punches_gate_dirty_del, DISABLE TRIGGER trg_events_punches;
ALTER TABLE public.readiness_gates DISABLE TRIGGER gate_config_audit, DISABLE TRIGGER readiness_gates_gate_dirty;
ALTER TABLE public.register_events DISABLE TRIGGER register_events_gate_dirty_del;
ALTER TABLE public.register_item_tags DISABLE TRIGGER register_item_tags_gate_dirty_del;
ALTER TABLE public.register_items DISABLE TRIGGER register_items_gate_dirty_del;
ALTER TABLE public.register_types DISABLE TRIGGER register_types_gate_dirty;
ALTER TABLE public.signals DISABLE TRIGGER trg_events_signals;
ALTER TABLE public.subsystems DISABLE TRIGGER subsystems_frozen_boundary_log, DISABLE TRIGGER subsystems_gate_dirty_del, DISABLE TRIGGER trg_events_subsystems;
ALTER TABLE public.system_dependencies DISABLE TRIGGER system_dependencies_gate_dirty_del;
ALTER TABLE public.system_gate_approvals DISABLE TRIGGER system_gate_approvals_gate_dirty_del;
ALTER TABLE public.system_gate_attestations DISABLE TRIGGER system_gate_attestations_gate_dirty_del;
ALTER TABLE public.system_gate_signatures DISABLE TRIGGER system_gate_signatures_gate_dirty_del;
ALTER TABLE public.systems DISABLE TRIGGER trg_events_systems;
ALTER TABLE public.tag_itr_overrides DISABLE TRIGGER tag_itr_overrides_req_dirty_del;
ALTER TABLE public.tags DISABLE TRIGGER tags_frozen_boundary_log, DISABLE TRIGGER tags_gate_dirty_del, DISABLE TRIGGER trg_events_tags;

-- Primero los proyectos (arrastran tags, ITR, punch…) y después la org: borrando solo la org, la cascada
-- puede llegar a `disciplines` antes que a `punches` y la FK punches_discipline_id_fkey lo rechaza.
DELETE FROM public.projects WHERE org_id = '10ad7e57-0000-4000-8000-000000000001';
DELETE FROM public.organizations WHERE id = '10ad7e57-0000-4000-8000-000000000001';

ALTER TABLE public.ce_causes ENABLE TRIGGER ce_causes_guard_delete;
ALTER TABLE public.ce_effects ENABLE TRIGGER ce_effects_guard_delete;
ALTER TABLE public.certificate_punch_exceptions ENABLE TRIGGER cert_exceptions_certificate_base;
ALTER TABLE public.certificates ENABLE TRIGGER certificates_gate_dirty_del, ENABLE TRIGGER trg_events_certificates;
ALTER TABLE public.document_references ENABLE TRIGGER document_references_gate_dirty_del;
ALTER TABLE public.documents ENABLE TRIGGER documents_gate_dirty_del;
ALTER TABLE public.equipment_type_templates ENABLE TRIGGER equipment_type_templates_req_dirty_del;
ALTER TABLE public.gate_criteria ENABLE TRIGGER gate_config_audit, ENABLE TRIGGER gate_criteria_gate_dirty, ENABLE TRIGGER gate_criteria_soft_delete;
ALTER TABLE public.itr_assignments ENABLE TRIGGER itr_assignments_integrity;
ALTER TABLE public.itr_attachments ENABLE TRIGGER itr_attachments_integrity;
ALTER TABLE public.itr_responses ENABLE TRIGGER itr_responses_integrity;
ALTER TABLE public.itr_signatures ENABLE TRIGGER itr_signatures_gate_dirty_del;
ALTER TABLE public.itr_template_items ENABLE TRIGGER itr_items_frozen, ENABLE TRIGGER itr_template_items_req_dirty_del;
ALTER TABLE public.itr_template_sections ENABLE TRIGGER itr_sections_frozen;
ALTER TABLE public.itr_templates ENABLE TRIGGER itr_template_frozen, ENABLE TRIGGER itr_templates_req_dirty_del;
ALTER TABLE public.itr_test_equipment ENABLE TRIGGER itr_test_equipment_integrity;
ALTER TABLE public.itrs ENABLE TRIGGER itrs_certificate_base, ENABLE TRIGGER itrs_gate_dirty_del, ENABLE TRIGGER itrs_integrity, ENABLE TRIGGER itrs_req_dirty_del, ENABLE TRIGGER trg_events_itrs;
ALTER TABLE public.lineup_sheets ENABLE TRIGGER lineup_sheets_gate_dirty_del;
ALTER TABLE public.loops ENABLE TRIGGER trg_events_loops;
ALTER TABLE public.org_members ENABLE TRIGGER org_members_owner_guard;
ALTER TABLE public.performance_certificates ENABLE TRIGGER performance_certificates_gate_dirty_del;
ALTER TABLE public.performance_disturbances ENABLE TRIGGER performance_eval_preview_reset;
ALTER TABLE public.performance_run_data ENABLE TRIGGER performance_eval_preview_reset;
ALTER TABLE public.performance_test_revisions ENABLE TRIGGER performance_test_revisions_gate_dirty_del;
ALTER TABLE public.performance_tests ENABLE TRIGGER performance_tests_gate_dirty_del;
ALTER TABLE public.procedures ENABLE TRIGGER procedures_gate_dirty_del;
ALTER TABLE public.project_disciplines ENABLE TRIGGER project_disciplines_req_dirty_del;
ALTER TABLE public.project_phases ENABLE TRIGGER project_phases_req_dirty_del;
ALTER TABLE public.project_constraints ENABLE TRIGGER project_constraints_gate_dirty_del;
ALTER TABLE public.pssr_review_items ENABLE TRIGGER pssr_review_items_guard;
ALTER TABLE public.pssr_reviews ENABLE TRIGGER pssr_reviews_gate_dirty_del;
ALTER TABLE public.punches ENABLE TRIGGER punches_certificate_base, ENABLE TRIGGER punches_gate_dirty_del, ENABLE TRIGGER trg_events_punches;
ALTER TABLE public.readiness_gates ENABLE TRIGGER gate_config_audit, ENABLE TRIGGER readiness_gates_gate_dirty;
ALTER TABLE public.register_events ENABLE TRIGGER register_events_gate_dirty_del;
ALTER TABLE public.register_item_tags ENABLE TRIGGER register_item_tags_gate_dirty_del;
ALTER TABLE public.register_items ENABLE TRIGGER register_items_gate_dirty_del;
ALTER TABLE public.register_types ENABLE TRIGGER register_types_gate_dirty;
ALTER TABLE public.signals ENABLE TRIGGER trg_events_signals;
ALTER TABLE public.subsystems ENABLE TRIGGER subsystems_frozen_boundary_log, ENABLE TRIGGER subsystems_gate_dirty_del, ENABLE TRIGGER trg_events_subsystems;
ALTER TABLE public.system_dependencies ENABLE TRIGGER system_dependencies_gate_dirty_del;
ALTER TABLE public.system_gate_approvals ENABLE TRIGGER system_gate_approvals_gate_dirty_del;
ALTER TABLE public.system_gate_attestations ENABLE TRIGGER system_gate_attestations_gate_dirty_del;
ALTER TABLE public.system_gate_signatures ENABLE TRIGGER system_gate_signatures_gate_dirty_del;
ALTER TABLE public.systems ENABLE TRIGGER trg_events_systems;
ALTER TABLE public.tag_itr_overrides ENABLE TRIGGER tag_itr_overrides_req_dirty_del;
ALTER TABLE public.tags ENABLE TRIGGER tags_frozen_boundary_log, ENABLE TRIGGER tags_gate_dirty_del, ENABLE TRIGGER trg_events_tags;

COMMIT;
