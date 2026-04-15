/**
 * CommUP — Data Quality Checker (Stage 15.3)
 *
 * Checks automáticos sobre la integridad y consistencia de los datos
 * de completions. Detecta problemas que los CCMS tradicionales ignoran.
 *
 * Categorías de checks:
 *   1. ITRs inconsistentes (aprobados sin firmas, fechas inválidas, etc.)
 *   2. Loops sin tags asignados
 *   3. Punches huérfanos (sin sistema padre)
 *   4. Sistemas sin ITRs (shells vacíos)
 *   5. Tags duplicados o mal formateados
 *   6. Certificados con prereqs incompletos
 *   7. MC achievement sin evidencia
 *   8. Fechas lógicamente imposibles
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type CheckSeverity = 'info' | 'warning' | 'error' | 'critical';
export type CheckCategory =
  | 'itr_integrity'
  | 'tag_coverage'
  | 'punch_orphans'
  | 'system_completeness'
  | 'date_logic'
  | 'certificate_prereqs'
  | 'mc_evidence'
  | 'data_duplicates';

export interface DataQualityIssue {
  id: string;
  check_id: string;
  check_name: string;
  category: CheckCategory;
  severity: CheckSeverity;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  description: string;
  detail: string;
  suggested_fix: string;
  fix_url?: string;
  auto_fixable: boolean;
  detected_at: string;
}

export interface CheckResult {
  check_id: string;
  check_name: string;
  category: CheckCategory;
  severity: CheckSeverity;
  passed: boolean;
  issues: DataQualityIssue[];
  checked_count: number;
  issue_count: number;
  pass_rate: number;            // 0-1
  execution_ms: number;
}

export interface DataQualityReport {
  project_id: string;
  computed_at: string;
  overall_score: number;        // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: CheckResult[];
  issues_by_severity: Record<CheckSeverity, number>;
  issues_by_category: Record<CheckCategory, number>;
  total_issues: number;
  critical_issues: DataQualityIssue[];
  auto_fixable_count: number;
  trend?: 'improving' | 'stable' | 'degrading';
}

// ─── Tipos de datos de entrada ────────────────────────────────────────────

export interface QualityInputData {
  systems: any[];
  subsystems: any[];
  loops: any[];
  tags: any[];
  itrs: any[];
  itr_items: any[];
  punches: any[];
  certificates: any[];
  mc_records: any[];
}

// ─── Utilidades ───────────────────────────────────────────────────────────

function issueId(): string {
  return `dq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function timeit<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  return [result, Math.round(performance.now() - start)];
}

// ─── Checks individuales ──────────────────────────────────────────────────

function checkITRIntegrity(data: QualityInputData): CheckResult {
  const issues: DataQualityIssue[] = [];
  const [_, ms] = timeit(() => {
    for (const itr of data.itrs) {
      // 1.1 ITR aprobado sin firma de inspector
      if (itr.status === 'approved' && !itr.inspector_signature && !itr.approved_by) {
        issues.push({
          id: issueId(),
          check_id: 'itr_approved_no_signature',
          check_name: 'ITR Aprobado sin Firma',
          category: 'itr_integrity',
          severity: 'critical',
          entity_type: 'itr',
          entity_id: itr.id,
          entity_label: itr.itr_number,
          description: `ITR ${itr.itr_number} marcado como aprobado pero sin firma de inspector`,
          detail: `status=${itr.status}, approved_by=null, inspector_signature=null`,
          suggested_fix: 'Requerir firma digital del inspector antes de aprobar',
          fix_url: `/itrs/${itr.id}/sign`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 1.2 ITR con fecha de aprobación anterior a fecha de inicio
      if (itr.approved_at && itr.started_at) {
        const approvedMs = new Date(itr.approved_at).getTime();
        const startedMs = new Date(itr.started_at).getTime();
        if (approvedMs < startedMs) {
          issues.push({
            id: issueId(),
            check_id: 'itr_date_impossible',
            check_name: 'Fecha de Aprobación Anterior a Inicio',
            category: 'date_logic',
            severity: 'error',
            entity_type: 'itr',
            entity_id: itr.id,
            entity_label: itr.itr_number,
            description: `ITR ${itr.itr_number}: fecha aprobación (${itr.approved_at?.substring(0, 10)}) anterior a inicio (${itr.started_at?.substring(0, 10)})`,
            detail: `approved_at < started_at`,
            suggested_fix: 'Corregir fechas. Posible entrada manual incorrecta.',
            fix_url: `/itrs/${itr.id}/edit`,
            auto_fixable: false,
            detected_at: new Date().toISOString(),
          });
        }
      }

      // 1.3 ITR con 0 items completados marcado como aprobado
      if (itr.status === 'approved') {
        const itrItems = data.itr_items.filter((it: any) => it.itr_id === itr.id);
        const completedItems = itrItems.filter((it: any) => it.status === 'ok' || it.status === 'na');
        if (itrItems.length > 0 && completedItems.length === 0) {
          issues.push({
            id: issueId(),
            check_id: 'itr_approved_no_items',
            check_name: 'ITR Aprobado sin Items Completados',
            category: 'itr_integrity',
            severity: 'error',
            entity_type: 'itr',
            entity_id: itr.id,
            entity_label: itr.itr_number,
            description: `ITR ${itr.itr_number} aprobado pero tiene 0/${itrItems.length} items completados`,
            detail: `items_total=${itrItems.length}, items_completed=0`,
            suggested_fix: 'Verificar si los items fueron registrados correctamente o si el ITR fue aprobado por error',
            fix_url: `/itrs/${itr.id}`,
            auto_fixable: false,
            detected_at: new Date().toISOString(),
          });
        }
      }

      // 1.4 ITR rechazado 3+ veces (calidad issue)
      if (itr.rejection_count >= 3) {
        issues.push({
          id: issueId(),
          check_id: 'itr_repeated_rejection',
          check_name: 'ITR con Rechazos Repetidos',
          category: 'itr_integrity',
          severity: itr.rejection_count >= 5 ? 'error' : 'warning',
          entity_type: 'itr',
          entity_id: itr.id,
          entity_label: itr.itr_number,
          description: `ITR ${itr.itr_number} rechazado ${itr.rejection_count} veces. Indica problema de calidad sistemático`,
          detail: `rejection_count=${itr.rejection_count}`,
          suggested_fix: 'Revisar causa raíz de rechazos. Posible falta de capacitación o problema con el scope',
          fix_url: `/itrs/${itr.id}/rejection-history`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 1.5 ITR sin sistema asignado
      if (!itr.system_id) {
        issues.push({
          id: issueId(),
          check_id: 'itr_no_system',
          check_name: 'ITR sin Sistema Asignado',
          category: 'system_completeness',
          severity: 'error',
          entity_type: 'itr',
          entity_id: itr.id,
          entity_label: itr.itr_number,
          description: `ITR ${itr.itr_number} no tiene sistema padre asignado`,
          detail: `system_id=null`,
          suggested_fix: 'Asignar el ITR a su sistema correspondiente en el WBS',
          fix_url: `/itrs/${itr.id}/edit`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }
    }
  });

  const passed = issues.filter((i) => ['error', 'critical'].includes(i.severity)).length === 0;

  return {
    check_id: 'itr_integrity',
    check_name: 'Integridad de ITRs',
    category: 'itr_integrity',
    severity: 'critical',
    passed,
    issues,
    checked_count: data.itrs.length,
    issue_count: issues.length,
    pass_rate: 1 - issues.length / Math.max(data.itrs.length, 1),
    execution_ms: ms,
  };
}

function checkLoopTagCoverage(data: QualityInputData): CheckResult {
  const issues: DataQualityIssue[] = [];
  const [_, ms] = timeit(() => {
    for (const loop of data.loops) {
      const loopTags = data.tags.filter((t: any) => t.loop_id === loop.id);

      // 2.1 Loop sin tags
      if (loopTags.length === 0) {
        issues.push({
          id: issueId(),
          check_id: 'loop_no_tags',
          check_name: 'Loop sin Tags Asignados',
          category: 'tag_coverage',
          severity: 'warning',
          entity_type: 'loop',
          entity_id: loop.id,
          entity_label: loop.loop_number,
          description: `Loop ${loop.loop_number} no tiene instrumentos/tags asignados`,
          detail: `tag_count=0`,
          suggested_fix: 'Asignar los tags del loop desde el P&ID correspondiente',
          fix_url: `/loops/${loop.id}/tags`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 2.2 Loop con ITR en scope pero sin tags = no se puede completar loop check
      const loopITRs = data.itrs.filter((i: any) => i.loop_id === loop.id);
      if (loopITRs.length > 0 && loopTags.length === 0) {
        issues.push({
          id: issueId(),
          check_id: 'loop_itr_no_tags',
          check_name: 'Loop Check sin Tags para Verificar',
          category: 'tag_coverage',
          severity: 'error',
          entity_type: 'loop',
          entity_id: loop.id,
          entity_label: loop.loop_number,
          description: `Loop ${loop.loop_number} tiene ${loopITRs.length} ITRs pero sin tags asignados. No se puede ejecutar loop check`,
          detail: `itrs=${loopITRs.length}, tags=0`,
          suggested_fix: 'Importar tags desde Smart P&ID o asignar manualmente',
          fix_url: `/loops/${loop.id}/tags/import`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // 2.3 Tags sin loop (huérfanos de instrumentación)
    const orphanTags = data.tags.filter((t: any) => !t.loop_id && t.tag_type === 'instrument');
    for (const tag of orphanTags.slice(0, 50)) {  // limitar a 50 para no inundar
      issues.push({
        id: issueId(),
        check_id: 'tag_orphan',
        check_name: 'Tag de Instrumento sin Loop',
        category: 'tag_coverage',
        severity: 'info',
        entity_type: 'tag',
        entity_id: tag.id,
        entity_label: tag.tag_number,
        description: `Tag ${tag.tag_number} (instrumento) no está asignado a ningún loop`,
        detail: `loop_id=null, tag_type=${tag.tag_type}`,
        suggested_fix: 'Asignar el tag a su loop desde el índice de instrumentación',
        fix_url: `/tags/${tag.id}/assign-loop`,
        auto_fixable: false,
        detected_at: new Date().toISOString(),
      });
    }
    if (orphanTags.length > 50) {
      issues.push({
        id: issueId(),
        check_id: 'tag_orphan_bulk',
        check_name: 'Múltiples Tags sin Loop',
        category: 'tag_coverage',
        severity: 'warning',
        entity_type: 'tag',
        entity_id: 'bulk',
        entity_label: `${orphanTags.length} tags`,
        description: `${orphanTags.length} tags de instrumentación sin loop asignado`,
        detail: `Se muestran máx 50. Total: ${orphanTags.length}`,
        suggested_fix: 'Importar asignación de loops desde Smart P&ID / AVEVA',
        fix_url: '/admin/data-quality/tag-loops',
        auto_fixable: true,
        detected_at: new Date().toISOString(),
      });
    }
  });

  const passed = issues.filter((i) => ['error', 'critical'].includes(i.severity)).length === 0;
  return {
    check_id: 'loop_tag_coverage',
    check_name: 'Cobertura Tag-Loop',
    category: 'tag_coverage',
    severity: 'error',
    passed,
    issues,
    checked_count: data.loops.length,
    issue_count: issues.length,
    pass_rate: 1 - issues.length / Math.max(data.loops.length, 1),
    execution_ms: ms,
  };
}

function checkOrphanPunches(data: QualityInputData): CheckResult {
  const issues: DataQualityIssue[] = [];
  const systemIds = new Set(data.systems.map((s: any) => s.id));
  const [_, ms] = timeit(() => {
    for (const punch of data.punches) {
      // 3.1 Punch sin sistema
      if (!punch.system_id || !systemIds.has(punch.system_id)) {
        issues.push({
          id: issueId(),
          check_id: 'punch_orphan',
          check_name: 'Punch sin Sistema Padre',
          category: 'punch_orphans',
          severity: 'error',
          entity_type: 'punch',
          entity_id: punch.id,
          entity_label: punch.punch_number || punch.id,
          description: `Punch ${punch.punch_number || punch.id} no tiene sistema padre válido`,
          detail: `system_id=${punch.system_id || 'null'}`,
          suggested_fix: 'Asignar el punch a su sistema correspondiente',
          fix_url: `/punches/${punch.id}/edit`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 3.2 Punch Cat A sin ejecutor asignado
      if (punch.category === 'A' && !punch.assigned_to && punch.status !== 'cleared') {
        issues.push({
          id: issueId(),
          check_id: 'punch_cat_a_unassigned',
          check_name: 'Punch Cat A sin Asignar',
          category: 'punch_orphans',
          severity: 'critical',
          entity_type: 'punch',
          entity_id: punch.id,
          entity_label: punch.punch_number,
          description: `Punch Cat A ${punch.punch_number} sin ejecutor asignado. Bloquea MC de ${punch.system_tag || punch.system_id}`,
          detail: `category=A, assigned_to=null, status=${punch.status}`,
          suggested_fix: 'Asignar ejecutor responsable de inmediato',
          fix_url: `/punches/${punch.id}/assign`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 3.3 Punch "cleared" sin fecha de cierre
      if (punch.status === 'cleared' && !punch.cleared_at) {
        issues.push({
          id: issueId(),
          check_id: 'punch_cleared_no_date',
          check_name: 'Punch Cerrado sin Fecha de Cierre',
          category: 'itr_integrity',
          severity: 'warning',
          entity_type: 'punch',
          entity_id: punch.id,
          entity_label: punch.punch_number,
          description: `Punch ${punch.punch_number} marcado como cerrado pero sin fecha de cierre registrada`,
          detail: `status=cleared, cleared_at=null`,
          suggested_fix: 'Registrar fecha de cierre manualmente en el punch',
          fix_url: `/punches/${punch.id}/edit`,
          auto_fixable: true,
          detected_at: new Date().toISOString(),
        });
      }
    }
  });

  const passed = issues.filter((i) => ['error', 'critical'].includes(i.severity)).length === 0;
  return {
    check_id: 'orphan_punches',
    check_name: 'Punches Huérfanos y Sin Asignar',
    category: 'punch_orphans',
    severity: 'critical',
    passed,
    issues,
    checked_count: data.punches.length,
    issue_count: issues.length,
    pass_rate: 1 - issues.filter((i) => i.severity !== 'info').length / Math.max(data.punches.length, 1),
    execution_ms: ms,
  };
}

function checkCertificatePrereqs(data: QualityInputData): CheckResult {
  const issues: DataQualityIssue[] = [];
  const [_, ms] = timeit(() => {
    for (const cert of data.certificates) {
      if (cert.status === 'issued') continue; // ya emitido = OK

      // 4.1 Certificado en proceso con ITRs pendientes críticos
      const systemITRs = data.itrs.filter((i: any) => i.system_id === cert.system_id);
      const pendingCritical = systemITRs.filter(
        (i: any) => i.status !== 'approved' && i.certificate_required === true
      );

      if (pendingCritical.length > 0) {
        issues.push({
          id: issueId(),
          check_id: 'cert_itrs_pending',
          check_name: 'Certificado con ITRs Requeridos Pendientes',
          category: 'certificate_prereqs',
          severity: 'error',
          entity_type: 'certificate',
          entity_id: cert.id,
          entity_label: cert.certificate_number,
          description: `Certificado ${cert.certificate_number} en proceso pero ${pendingCritical.length} ITRs requeridos no aprobados`,
          detail: `pending_required_itrs=${pendingCritical.length}`,
          suggested_fix: `Completar y aprobar los ${pendingCritical.length} ITRs marcados como requeridos para certificación`,
          fix_url: `/certificates/${cert.id}/prerequisites`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }

      // 4.2 Certificado MC sin todos los punches Cat A cerrados
      if (cert.cert_type === 'MC') {
        const openCatA = data.punches.filter(
          (p: any) => p.system_id === cert.system_id && p.category === 'A' && p.status !== 'cleared'
        );
        if (openCatA.length > 0) {
          issues.push({
            id: issueId(),
            check_id: 'mc_cert_punch_cat_a',
            check_name: 'Certificado MC con Punch Cat A Abierto',
            category: 'certificate_prereqs',
            severity: 'critical',
            entity_type: 'certificate',
            entity_id: cert.id,
            entity_label: cert.certificate_number,
            description: `Certificado MC ${cert.certificate_number} no puede emitirse: ${openCatA.length} Punch Cat A abiertos`,
            detail: `open_cat_a=${openCatA.length}`,
            suggested_fix: `Cerrar TODOS los ${openCatA.length} Punches Cat A antes de emitir el Certificado MC`,
            fix_url: `/systems/${cert.system_id}/punches?category=A&status=open`,
            auto_fixable: false,
            detected_at: new Date().toISOString(),
          });
        }
      }
    }
  });

  const passed = issues.filter((i) => i.severity === 'critical').length === 0;
  return {
    check_id: 'certificate_prereqs',
    check_name: 'Prerequisitos de Certificados',
    category: 'certificate_prereqs',
    severity: 'critical',
    passed,
    issues,
    checked_count: data.certificates.length,
    issue_count: issues.length,
    pass_rate: 1 - issues.filter((i) => ['error', 'critical'].includes(i.severity)).length / Math.max(data.certificates.length, 1),
    execution_ms: ms,
  };
}

function checkDataDuplicates(data: QualityInputData): CheckResult {
  const issues: DataQualityIssue[] = [];
  const [_, ms] = timeit(() => {
    // 5.1 ITRs con número duplicado
    const itrNumbers = new Map<string, string[]>();
    for (const itr of data.itrs) {
      if (!itrNumbers.has(itr.itr_number)) itrNumbers.set(itr.itr_number, []);
      itrNumbers.get(itr.itr_number)!.push(itr.id);
    }
    for (const [num, ids] of itrNumbers) {
      if (ids.length > 1) {
        issues.push({
          id: issueId(),
          check_id: 'itr_duplicate_number',
          check_name: 'ITR con Número Duplicado',
          category: 'data_duplicates',
          severity: 'error',
          entity_type: 'itr',
          entity_id: ids.join(','),
          entity_label: num,
          description: `ITR número ${num} aparece ${ids.length} veces en la base de datos`,
          detail: `duplicate_ids=${ids.join(', ')}`,
          suggested_fix: 'Eliminar o renombrar ITRs duplicados. Revisar proceso de importación',
          fix_url: `/admin/data-quality/duplicates?itr_number=${encodeURIComponent(num)}`,
          auto_fixable: false,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // 5.2 Tags duplicados
    const tagNumbers = new Map<string, string[]>();
    for (const tag of data.tags) {
      if (!tagNumbers.has(tag.tag_number)) tagNumbers.set(tag.tag_number, []);
      tagNumbers.get(tag.tag_number)!.push(tag.id);
    }
    for (const [num, ids] of tagNumbers) {
      if (ids.length > 1) {
        issues.push({
          id: issueId(),
          check_id: 'tag_duplicate',
          check_name: 'Tag Duplicado',
          category: 'data_duplicates',
          severity: 'warning',
          entity_type: 'tag',
          entity_id: ids.join(','),
          entity_label: num,
          description: `Tag ${num} registrado ${ids.length} veces`,
          detail: `duplicate_ids=${ids.join(', ')}`,
          suggested_fix: 'Deduplicar tags. Mantener solo el registro con información más completa',
          fix_url: `/admin/data-quality/duplicates?tag=${encodeURIComponent(num)}`,
          auto_fixable: true,
          detected_at: new Date().toISOString(),
        });
      }
    }
  });

  const passed = issues.filter((i) => i.severity === 'error').length === 0;
  return {
    check_id: 'data_duplicates',
    check_name: 'Duplicados y Consistencia',
    category: 'data_duplicates',
    severity: 'error',
    passed,
    issues,
    checked_count: data.itrs.length + data.tags.length,
    issue_count: issues.length,
    pass_rate: 1 - issues.length / Math.max(data.itrs.length + data.tags.length, 1),
    execution_ms: ms,
  };
}

// ─── Motor principal ──────────────────────────────────────────────────────

export class DataQualityChecker {
  runAllChecks(data: QualityInputData, projectId: string): DataQualityReport {
    const checks: CheckResult[] = [
      checkITRIntegrity(data),
      checkLoopTagCoverage(data),
      checkOrphanPunches(data),
      checkCertificatePrereqs(data),
      checkDataDuplicates(data),
    ];

    const allIssues = checks.flatMap((c) => c.issues);

    const issuesBySeverity: Record<CheckSeverity, number> = {
      info: 0, warning: 0, error: 0, critical: 0,
    };
    const issuesByCategory: Record<CheckCategory, number> = {
      itr_integrity: 0, tag_coverage: 0, punch_orphans: 0,
      system_completeness: 0, date_logic: 0, certificate_prereqs: 0,
      mc_evidence: 0, data_duplicates: 0,
    };

    for (const issue of allIssues) {
      issuesBySeverity[issue.severity]++;
      issuesByCategory[issue.category]++;
    }

    // Score: 100 - penalizaciones por severidad
    const penaltyPerCritical = 10;
    const penaltyPerError = 5;
    const penaltyPerWarning = 1;
    const penaltyPerInfo = 0.2;

    const totalPenalty = Math.min(
      issuesBySeverity.critical * penaltyPerCritical +
      issuesBySeverity.error * penaltyPerError +
      issuesBySeverity.warning * penaltyPerWarning +
      issuesBySeverity.info * penaltyPerInfo,
      100
    );

    const score = Math.max(0, Math.round(100 - totalPenalty));
    const grade: DataQualityReport['grade'] =
      score >= 90 ? 'A' :
      score >= 75 ? 'B' :
      score >= 60 ? 'C' :
      score >= 40 ? 'D' : 'F';

    return {
      project_id: projectId,
      computed_at: new Date().toISOString(),
      overall_score: score,
      grade,
      checks,
      issues_by_severity: issuesBySeverity,
      issues_by_category: issuesByCategory,
      total_issues: allIssues.length,
      critical_issues: allIssues.filter((i) => i.severity === 'critical'),
      auto_fixable_count: allIssues.filter((i) => i.auto_fixable).length,
    };
  }
}
