/**
 * Cargadores de los PDF de registro (S24): arman la entrada de cada renderer desde la BD. Los usan las rutas
 * `…/pdf` (cliente del usuario, con RLS) y el paquete de handover (service role, la org ya verificada), así el
 * PDF del ZIP es el mismo que se descarga desde la pantalla. Todos filtran por `projectId`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { ProcedurePdfInput } from './procedure'
import type { PerformancePdfInput } from './performance-report'
import type { PssrPdfData } from './pssr'
import type { CertPdfData } from './certificate'
import type { ItrDocumentRef, ItrPdfData, ItrTestEquipmentRef } from './itr'
import type { EventPdfInput, LineupPdfInput, RunPdfInput } from './startup-records'
import type { LoshPdfInput } from './losh'
import type { RedlinePdfItem, RedlinesPdfInput } from './redlines'
import { fromStoredMarks, type RedlineStatus } from '@/lib/pid/redlines'
import { normalizeRotation } from '@/lib/pid/geometry'
import { bi } from './renderer'
import { loadSystemLosh } from '@/lib/pid/losh-server'
import { systemTabHref } from '@/lib/systems/file-tabs'
import type { Evaluation } from '@/lib/performance/catalog'
import { PROCEDURE_SECTIONS, rangeLabel, type ProcedureSection } from '@/lib/startup/catalog'
import { loadPdfBranding, type PdfBranding } from './branding'
import { siteUrl } from '@/lib/site-url'
import { fromJson } from '@/lib/supabase/casts'

type Db = SupabaseClient<Database>
/** Traductor del espacio `Startup` (next-intl). */
type T = (key: string) => string
type Lang = 'es' | 'en'

type DocRef = { number: string; title: string; used_rev: string; current_rev: string | null; revalidated_from: string | null; revalidation_reason: string | null }

async function profileNames(db: Db, ids: (string | null | undefined)[]) {
  const people = [...new Set(ids.filter((x): x is string => !!x))]
  const { data } = people.length ? await db.from('profiles').select('id, full_name').in('id', people) : { data: [] }
  return (u: string | null | undefined) => (u ? (data ?? []).find(p => p.id === u)?.full_name ?? null : null)
}

/** Revisión de un procedimiento (`revId`; por defecto la vigente). */
export async function loadProcedurePdf(
  db: Db,
  x: { projectId: string; procedureId: string; revId?: string | null; orgName: string; lang: Lang; t: T },
): Promise<{ input: ProcedurePdfInput; filename: string } | null> {
  const { projectId, procedureId, t } = x
  const [{ data: project }, { data: proc }] = await Promise.all([
    db.from('projects').select('code, timezone').eq('id', projectId).maybeSingle(),
    db.from('procedures').select('id, number, title, kind, current_revision_id, systems(code, name)').eq('id', procedureId).eq('project_id', projectId).maybeSingle(),
  ])
  if (!project || !proc) return null
  const targetRev = x.revId ?? proc.current_revision_id
  const { data: rev } = targetRev
    ? await db.from('procedure_revisions').select('*').eq('id', targetRev).eq('procedure_id', procedureId).maybeSingle()
    : await db.from('procedure_revisions').select('*').eq('procedure_id', procedureId).order('rev', { ascending: false }).limit(1).maybeSingle()
  if (!rev) return null
  const [{ data: steps }, { data: refs }, name] = await Promise.all([
    db.from('procedure_steps')
      .select('ord, action, responsible, expected_value, is_hold_point, hold_capacity, stop_criteria, tags(tag_number)').eq('revision_id', rev.id).order('ord'),
    // S13 (F-11): documentos referenciados por esta revisión.
    db.from('document_references')
      .select('revalidation_reason, used:document_revisions!document_references_revision_id_fkey(rev), from:document_revisions!document_references_revalidated_from_fkey(rev), documents(number, title, current:document_revisions!documents_current_revision_fkey(rev))')
      .eq('project_id', projectId).eq('procedure_revision_id', rev.id),
    profileNames(db, [rev.created_by, rev.approved_by, rev.field_verified_by]),
  ])
  const documentRefs: DocRef[] = (refs ?? []).map(r => {
    const d = r.documents
    return {
      number: d?.number ?? '—', title: d?.title ?? '', used_rev: (r.used)?.rev ?? '—', current_rev: d?.current?.rev ?? null,
      revalidated_from: (r.from)?.rev ?? null, revalidation_reason: r.revalidation_reason,
    }
  }).sort((a, b) => a.number.localeCompare(b.number))
  const sys = proc.systems

  return {
    filename: `${project.code}-${proc.number}-R${rev.rev}.pdf`,
    input: {
      timezone: project.timezone,
      lang: x.lang,
      orgName: x.orgName,
      projectCode: project.code,
      number: proc.number,
      title: proc.title,
      kindLabel: t(`kind.${proc.kind}`),
      system: sys ? `${sys.code} — ${sys.name}` : null,
      rev: rev.rev,
      statusLabel: t(`revStatus.${rev.status}`),
      approved: rev.status === 'approved',
      sectionLabels: Object.fromEntries(PROCEDURE_SECTIONS.map(k => [k, t(`section.${k}`)])) as Record<ProcedureSection, string>,
      sections: (rev.sections ?? {}) as Record<string, string>,
      steps: (steps ?? []).map(s => ({
        ord: s.ord, action: s.action, responsible: s.responsible, expected: s.expected_value, tag: (s.tags)?.tag_number ?? null,
        hold: s.is_hold_point, capacityLabel: s.hold_capacity ? t(`capacity.${s.hold_capacity}`) : null, stop: s.stop_criteria,
      })),
      author: name(rev.created_by),
      approvedBy: name(rev.approved_by),
      approvedAt: rev.approved_at,
      fieldVerifiedBy: name(rev.field_verified_by),
      fieldVerifiedAt: rev.field_verified_at,
      walkdownNote: rev.walkdown_note,
      hash: rev.content_hash,
      documentRefs,
    },
  }
}

/**
 * Reporte de un intento de desempeño cerrado o evaluado. Sin evaluación guardada la calcula con
 * `evaluate_performance_run`; `{ error }` si la RPC falla.
 */
export async function loadPerformancePdf(
  db: Db,
  x: { projectId: string; runId: string; orgName: string; lang: Lang; t: T },
): Promise<{ input: PerformancePdfInput; filename: string } | { error: string } | null> {
  const { projectId, runId, t } = x
  const [{ data: project }, { data: run }] = await Promise.all([
    db.from('projects').select('code, timezone').eq('id', projectId).maybeSingle(),
    db.from('performance_runs').select('*').eq('id', runId).eq('project_id', projectId).maybeSingle(),
  ])
  if (!project || !run || !['closed', 'evaluated'].includes(run.status)) return null

  let evaluation = fromJson<Evaluation | null>(run.evaluation)
  if (!evaluation) {
    const { data, error } = await db.rpc('evaluate_performance_run', { p_run_id: runId })
    if (error) return { error: error.message }
    evaluation = fromJson<Evaluation>(data)
  }

  const [{ data: test }, { data: rev }, { data: vars }, { data: rsys }, { data: dist }, { data: cert }, { data: action }] = await Promise.all([
    db.from('performance_tests').select('number, title, systems!performance_tests_primary_system_id_fkey(code, name)').eq('id', run.test_id).single(),
    db.from('performance_test_revisions').select('*, procedures(number, title)').eq('id', run.revision_id).single(),
    db.from('performance_variables').select('id, key, label, unit, source, op, operand_a, operand_b, manual_every_min, signals(signal_tag)').eq('revision_id', run.revision_id).order('ord'),
    db.from('performance_revision_systems').select('systems(code)').eq('revision_id', run.revision_id),
    db.from('performance_disturbances').select('*').eq('run_id', runId).order('started_at'),
    db.from('performance_certificates').select('*').eq('run_id', runId).maybeSingle(),
    run.action_id ? db.from('actions').select('number, title').eq('id', run.action_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (!test || !rev) return null

  // Series del periodo formal desde los datos congelados (PostgREST corta en 1000 filas: se pagina).
  const plotted = (vars ?? []).filter(v => v.source !== 'derived')
  const rows: { variable_id: string; bucket: string; avg_val: number | null }[] = []
  if (run.formal_started_at) {
    for (let from = 0; from < 30000; from += 1000) {
      const { data } = await db.from('performance_run_data').select('variable_id, bucket, avg_val').eq('run_id', runId)
        .gte('bucket', run.formal_started_at.slice(0, 16)).order('bucket').range(from, from + 999)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }

  const name = await profileNames(db, [rev.approved_by, run.result_by, cert?.commissioning_signed_by, cert?.operations_signed_by, cert?.client_signed_by, ...(dist ?? []).flatMap(d => [d.excluded_by, d.client_ack_by])])
  const sys = test.systems
  const proc = rev.procedures

  return {
    filename: `${project.code}-${run.number.replace('/', '-')}.pdf`,
    input: {
      timezone: project.timezone,
      lang: x.lang,
      orgName: x.orgName,
      projectCode: project.code,
      test: { number: test.number, title: test.title },
      run: {
        number: run.number, status: run.status, stabilizationAt: run.stabilization_started_at, formalAt: run.formal_started_at, formalNote: run.formal_start_note,
        closedAt: run.closed_at, earlyClose: run.early_close, earlyReason: run.early_close_reason, evaluationHash: run.evaluation_hash,
        resultBy: name(run.result_by), resultAt: run.result_at,
      },
      revision: {
        rev: rev.rev, hash: rev.content_hash, stabilizationMin: rev.stabilization_min, formalMin: rev.formal_min, sampleIntervalS: rev.sample_interval_s,
        minCoveragePct: Number(rev.min_coverage_pct), approvedBy: name(rev.approved_by), approvedAt: rev.approved_at,
      },
      sections: (rev.sections ?? {}) as Record<string, string>,
      primarySystem: sys ? `${sys.code} — ${sys.name}` : '—',
      systems: (rsys ?? []).map(s => (s.systems)?.code).filter((c): c is string => !!c).sort(),
      procedure: proc ? `${proc.number} — ${proc.title}` : null,
      variables: (vars ?? []).map(v => ({
        key: v.key, label: v.label, source: v.source, unit: v.unit, every: v.source === 'manual' ? v.manual_every_min : null,
        ref: v.source === 'signal' ? (v.signals)?.signal_tag ?? '' : v.source === 'derived' ? `${v.operand_a} ${v.op} ${v.operand_b}` : '',
      })),
      evaluation,
      disturbances: (dist ?? []).map(d => ({
        start: d.started_at, end: d.ended_at, kind: d.kind, description: d.description, excluded: d.excluded, reason: d.exclusion_reason, by: name(d.excluded_by),
        ackBy: name(d.client_ack_by), ackAt: d.client_ack_at,
      })),
      series: plotted.map(v => ({
        key: v.key, unit: v.unit,
        points: rows.filter(p => p.variable_id === v.id && p.avg_val !== null).map(p => ({ t: Date.parse(p.bucket), v: Number(p.avg_val) })),
      })),
      action: action ? `${action.number} — ${action.title}` : null,
      certificate: cert ? {
        number: cert.number, status: cert.status, hash: cert.content_hash,
        signatures: (['commissioning', 'operations', 'client'] as const).map(c => ({ capacity: c, name: name(cert[`${c}_signed_by`]), at: cert[`${c}_signed_at`] })),
      } : null,
      labels: {
        result: r => t(`perf.result.${r}`), outcome: o => t(`perf.outcome.${o}`), reason: r => t(`perf.reason.${r}`), source: s => t(`perf.source.${s}`),
        distKind: k => t(`perf.distKind.${k}`), certStatus: s => t(`perf.certStatus.${s}`), capacity: c => t(`perf.cert.cap.${c}`),
      },
    },
  }
}

export async function loadPssrPdf(db: Db, x: { projectId: string; reviewId: string }): Promise<{ input: PssrPdfData; filename: string } | null> {
  const [{ data: review }, { data: project }, { data: items }, { data: signatures }] = await Promise.all([
    db.from('pssr_reviews')
      .select('id, review_number, title, status, notes, review_due_date, approved_at, rfsu_certificate_id, systems(code, name)')
      .eq('id', x.reviewId).eq('project_id', x.projectId).maybeSingle(),
    db.from('projects').select('code, name, client, timezone').eq('id', x.projectId).maybeSingle(),
    db.from('pssr_review_items')
      .select('id, item_order, category, element, requirement, notes_hint, status, responsible, actions, completion_date')
      .eq('review_id', x.reviewId).order('item_order'),
    db.from('pssr_signatures').select('id, discipline, signature_data, signed_at, profiles(full_name)').eq('review_id', x.reviewId).order('signed_at'),
  ])
  if (!review) return null
  // status es columna text en DB — casts estrechos a los unions del PDF
  return {
    filename: `PSSR-${review.review_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      ...review,
      status: review.status as PssrPdfData['status'],
      projectName: project?.name ?? '',
      projectCode: project?.code ?? '',
      projectClient: project?.client ?? null,
      timezone: project?.timezone ?? null,
      items: (items ?? []).map(i => ({ ...i, status: i.status as PssrPdfData['items'][number]['status'] })),
      signatures: signatures ?? [],
    },
  }
}

export async function loadCertificatePdf(db: Db, x: { projectId: string; certId: string; branding?: PdfBranding }): Promise<{ input: CertPdfData; filename: string } | null> {
  const [{ data: cert }, { data: project }, { data: exceptions }, { data: signatures }, branding] = await Promise.all([
    db.from('certificates')
      .select(`
        id, certificate_number, title, status,
        issued_date, notes, created_at,
        project_phases(id, code, name, color, certificate_name),
        subsystems(id, code, name, systems(id, code, name)),
        issued_by_profile:profiles!issued_by(full_name)
      `)
      .eq('id', x.certId).eq('project_id', x.projectId).maybeSingle(),
    db.from('projects').select('code, name, client, timezone').eq('id', x.projectId).maybeSingle(),
    db.from('certificate_punch_exceptions')
      .select('id, justification, approved_at, punches(punch_number, description, category), approved_by_profile:profiles!approved_by(full_name)')
      .eq('certificate_id', x.certId).order('approved_at'),
    db.from('certificate_signatures')
      .select('id, role, signed_at, comments, signer_profile:profiles!user_id(full_name)')
      .eq('certificate_id', x.certId).order('signed_at'),
    x.branding ?? loadPdfBranding(db, x.projectId),
  ])
  if (!cert) return null

  const subsystemId = cert.subsystems?.id
  const phaseId = cert.project_phases?.id
  const { data: itrs } = subsystemId && phaseId
    ? await db.from('itrs')
        .select('id, itr_number, status, progress_pct, itr_templates(code, title), tags(tag_number, description)')
        .eq('project_id', x.projectId).eq('subsystem_id', subsystemId).eq('phase_id', phaseId).eq('status', 'approved')
    : { data: [] }

  return {
    filename: `CERT-${cert.certificate_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      ...cert,
      projectName: project?.name ?? '',
      projectCode: project?.code ?? '',
      projectClient: project?.client ?? null,
      timezone: project?.timezone ?? null,
      exceptions: exceptions ?? [],
      itrs: itrs ?? [],
      signatures: signatures ?? [],
      branding,
      recordUrl: `${siteUrl()}/projects/${x.projectId}/certificates/${x.certId}`,
    },
  }
}

/** ITR con respuestas, firmas, adjuntos, equipos y documentos de referencia. `tagId` acota a la ruta del tag. */
export async function loadItrPdf(db: Db, x: { projectId: string; itrId: string; tagId?: string; branding?: PdfBranding }): Promise<{ input: ItrPdfData; filename: string } | null> {
  let q = db.from('itrs')
    .select(`
      id,
      itr_number,
      status,
      progress_pct,
      scheduled_date,
      template_id,
      project_id,
      tag_id,
      source_rows,
      required_signatures,
      loops ( loop_number ),
      ce_causes ( code, description, ce_matrices ( code ) ),
      itr_templates (
        code,
        title,
        title_es,
        description,
        itr_template_sections (
          id,
          title,
          order_index,
          itr_template_items (
            id,
            item_number,
            description,
            description_es,
            item_type,
            is_critical,
            is_required,
            acceptance_min,
            acceptance_max,
            acceptance_text,
            unit,
            options,
            order_index
          )
        )
      ),
      itr_responses (
        item_id,
        value_text,
        value_numeric,
        value_bool,
        value_option,
        remarks,
        is_passed
      ),
      itr_signatures (
        role,
        signed_at,
        signature_image,
        signer_company,
        profiles ( full_name )
      ),
      itr_attachments (
        item_id,
        file_url,
        file_type,
        captured_at
      ),
      itr_test_equipment ( used_on, calibrated_on, calibration_due, certificate_number, snapshot ),
      tags ( tag_number, description, manufacturer, model, serial_number, datasheet_number, pid_drawing, range_min, range_max, eng_unit, revision ),
      projects ( code, name )
    `)
    .eq('id', x.itrId)
    .eq('project_id', x.projectId)
  if (x.tagId) q = q.eq('tag_id', x.tagId)
  const { data: itr } = await q.maybeSingle()
  if (!itr) return null

  // S13 (F-11): documentos de referencia con la revisión usada y la vigente al imprimir.
  const tplCode = (itr.itr_templates as { code: string } | null)?.code
  const [{ data: refs }, branding, { data: clientCode }] = await Promise.all([
    db.from('document_references')
      .select('revalidation_reason, used:document_revisions!document_references_revision_id_fkey(rev, status), from:document_revisions!document_references_revalidated_from_fkey(rev), documents(number, title, current:document_revisions!documents_current_revision_fkey(rev))')
      .eq('project_id', x.projectId).eq('itr_id', x.itrId),
    x.branding ?? loadPdfBranding(db, x.projectId),
    // R2b: código del cliente de la plantilla (proyecto > defecto de la org)
    tplCode
      ? db.rpc('template_client_codes_for', { p_project_id: x.projectId }).eq('template_code', tplCode.toUpperCase()).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const documentRefs: ItrDocumentRef[] = (refs ?? []).map(r => {
    const d = r.documents
    const used = r.used
    return {
      number: d?.number ?? '-', title: d?.title ?? '', used_rev: used?.rev ?? '-', used_status: used?.status ?? null,
      current_rev: d?.current?.rev ?? null, revalidated_from: (r.from)?.rev ?? null, revalidation_reason: r.revalidation_reason,
    }
  }).sort((a, b) => a.number.localeCompare(b.number))

  return {
    filename: `ITR-${itr.itr_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      ...itr,
      document_refs: documentRefs,
      client_code: clientCode?.client_code ?? null,
      // snapshot es jsonb: la foto de calibración que copió el trigger al registrar el equipo.
      itr_test_equipment: (itr.itr_test_equipment ?? []).map(u => ({ ...u, snapshot: u.snapshot as ItrTestEquipmentRef['snapshot'] })),
      branding,
      // E2: QR a la ficha del ITR (vive bajo su tag; un ITR sin tag no tiene página propia y sale sin QR).
      recordUrl: itr.tag_id ? `${siteUrl()}/projects/${x.projectId}/tags/${itr.tag_id}/itrs/${x.itrId}` : null,
    },
  }
}

// ── Registros de arranque (S24b, E-22) ──────────────────────────────────────

type StartupCommon = { projectId: string; orgName: string; lang: Lang; t: T }

/** Ejecución de un procedimiento con sus pasos, holds, paradas y los eventos que la citan. */
export async function loadRunPdf(db: Db, x: StartupCommon & { runId: string }): Promise<{ input: RunPdfInput; filename: string } | null> {
  const [{ data: project }, { data: run }] = await Promise.all([
    db.from('projects').select('code, timezone').eq('id', x.projectId).maybeSingle(),
    db.from('procedure_runs')
      .select('*, procedures(number, title), procedure_revisions(rev, sections, content_hash), systems(code, name)')
      .eq('id', x.runId).eq('project_id', x.projectId).maybeSingle(),
  ])
  if (!project || !run) return null
  const [{ data: steps }, { data: events }, { data: timeline }] = await Promise.all([
    db.from('procedure_run_steps')
      .select('step_id, ord, status, actual_value, comment, done_by, done_at, released_by, released_at, release_comment, out_of_range, procedure_steps(action, responsible, expected_value, expected_min, expected_max, expected_unit, is_hold_point, hold_capacity, stop_criteria, tags(tag_number))')
      .eq('run_id', x.runId).order('ord'),
    db.from('startup_events').select('number, occurred_at, title, kind, milestone, category')
      .eq('run_id', x.runId).eq('project_id', x.projectId).neq('status', 'voided').order('occurred_at'),
    // S25 (E-10): línea de tiempo de la ejecución.
    db.from('procedure_run_events').select('kind, step_id, user_id, field_at, recorded_at, comment').eq('run_id', x.runId).limit(500),
  ])
  const name = await profileNames(db, [
    run.started_by, run.completed_by, run.stopped_by, run.aborted_by,
    ...(steps ?? []).flatMap(s => [s.done_by, s.released_by]), ...(timeline ?? []).map(e => e.user_id),
  ])
  const proc = run.procedures
  const rev = run.procedure_revisions as { rev: number; sections: Record<string, string> | null; content_hash: string | null }
  const sys = run.systems
  return {
    filename: `${project.code}-${run.number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      lang: x.lang, timezone: project.timezone, orgName: x.orgName, projectCode: project.code, label: x.t,
      number: run.number, status: run.status,
      procedure: { number: proc.number, title: proc.title, rev: rev.rev, hash: rev.content_hash },
      system: sys ? `${sys.code} — ${sys.name}` : null,
      safety: rev.sections?.safety ?? null, stopCriteria: rev.sections?.stop_criteria ?? null,
      startedBy: name(run.started_by), startedAt: run.started_at,
      completedBy: name(run.completed_by), completedAt: run.completed_at,
      stoppedBy: name(run.stopped_by), stoppedAt: run.stopped_at, stopReason: run.stop_reason,
      abortedBy: name(run.aborted_by), abortedAt: run.aborted_at, abortReason: run.abort_reason,
      steps: (steps ?? []).map(s => {
        const st = s.procedure_steps
        return {
          ord: s.ord, action: st.action, tag: st.tags?.tag_number ?? null, responsible: st.responsible, expected: st.expected_value, stop: st.stop_criteria,
          range: rangeLabel(st.expected_min === null ? null : Number(st.expected_min), st.expected_max === null ? null : Number(st.expected_max), st.expected_unit) || null,
          outOfRange: s.out_of_range,
          hold: st.is_hold_point, holdCapacity: st.hold_capacity, status: s.status, actual: s.actual_value, comment: s.comment,
          doneBy: name(s.done_by), doneAt: s.done_at, releasedBy: name(s.released_by), releasedAt: s.released_at, releaseComment: s.release_comment,
        }
      }),
      timeline: (timeline ?? [])
        .map(e => {
          const ord = e.step_id ? (steps ?? []).find(s => s.step_id === e.step_id)?.ord : undefined
          return { at: e.field_at ?? e.recorded_at, label: `${x.t(`run.event.${e.kind}`)}${ord ? ` #${ord}` : ''}`, by: name(e.user_id), comment: e.comment }
        })
        .sort((a, b) => a.at.localeCompare(b.at)),
      events: (events ?? []).map(e => ({
        number: e.number, occurredAt: e.occurred_at, title: e.title,
        label: e.kind === 'milestone' && e.milestone ? x.t(`milestone.${e.milestone}`) : e.category ? x.t(`category.${e.category}`) : '',
      })),
    },
  }
}

export async function loadLineupPdf(db: Db, x: StartupCommon & { sheetId: string }): Promise<{ input: LineupPdfInput; filename: string } | null> {
  const [{ data: project }, { data: sheet }] = await Promise.all([
    db.from('projects').select('code, timezone').eq('id', x.projectId).maybeSingle(),
    db.from('lineup_sheets').select('*, systems(code, name), procedures(number, title)').eq('id', x.sheetId).eq('project_id', x.projectId).maybeSingle(),
  ])
  if (!project || !sheet) return null
  const [{ data: items }, { data: stale }] = await Promise.all([
    db.from('lineup_items')
      .select('ord, label, required_position, required_note, is_critical, found_position, as_found_position, lock_number, seal_number, remarks, set_by, set_at, verified_by, verified_at, tags(tag_number, description)')
      .eq('sheet_id', x.sheetId).order('ord'),
    sheet.status === 'verified' ? db.rpc('lineup_is_stale', { p_sheet_id: x.sheetId }) : Promise.resolve({ data: false }),
  ])
  const name = await profileNames(db, [sheet.issued_by, sheet.verified_by, ...(items ?? []).flatMap(i => [i.set_by, i.verified_by])])
  const sys = sheet.systems
  const proc = sheet.procedures
  return {
    filename: `${project.code}-${sheet.number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      lang: x.lang, timezone: project.timezone, orgName: x.orgName, projectCode: project.code, label: x.t,
      number: sheet.number, title: sheet.title, status: sheet.status, purpose: sheet.purpose,
      system: sys ? `${sys.code} — ${sys.name}` : null, procedure: proc ? `${proc.number} — ${proc.title}` : null,
      issuedBy: name(sheet.issued_by), issuedAt: sheet.issued_at, verifiedBy: name(sheet.verified_by), verifiedAt: sheet.verified_at,
      hash: sheet.content_hash, stale: !!stale,
      items: (items ?? []).map(i => {
        const tag = i.tags
        return {
          ord: i.ord, tag: tag?.tag_number ?? null, description: tag?.description ?? null, label: i.label ?? '',
          required: i.required_position, requiredNote: i.required_note, critical: i.is_critical, found: i.found_position, remarks: i.remarks,
          asFound: i.as_found_position, lock: i.lock_number, seal: i.seal_number,
          setBy: name(i.set_by), setAt: i.set_at, verifiedBy: name(i.verified_by), verifiedAt: i.verified_at,
        }
      }),
    },
  }
}

export async function loadEventPdf(db: Db, x: StartupCommon & { eventId: string }): Promise<{ input: EventPdfInput; filename: string } | null> {
  const [{ data: project }, { data: ev }] = await Promise.all([
    db.from('projects').select('code, timezone').eq('id', x.projectId).maybeSingle(),
    db.from('startup_events').select('*, systems(code, name), procedure_runs(number)').eq('id', x.eventId).eq('project_id', x.projectId).maybeSingle(),
  ])
  if (!project || !ev) return null
  const [{ data: params }, { data: tags }, name] = await Promise.all([
    db.from('startup_event_params').select('label, value, value_text, unit, quality, sampled_at, offset_s, source').eq('event_id', x.eventId).order('created_at'),
    db.from('startup_event_tags').select('tags(tag_number)').eq('event_id', x.eventId),
    profileNames(db, [ev.recorded_by, ev.witness_by, ev.voided_by]),
  ])
  const sys = ev.systems
  const run = ev.procedure_runs
  return {
    filename: `${project.code}-${ev.number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      lang: x.lang, timezone: project.timezone, orgName: x.orgName, projectCode: project.code, label: x.t,
      number: ev.number, kind: ev.kind as 'milestone' | 'free', milestone: ev.milestone, category: ev.category, status: ev.status,
      title: ev.title, description: ev.description, occurredAt: ev.occurred_at,
      system: sys ? `${sys.code} — ${sys.name}` : null, run: run?.number ?? null,
      tags: (tags ?? []).map(r => (r.tags)?.tag_number).filter((v): v is string => !!v).sort(),
      recordedBy: name(ev.recorded_by), recordedAt: ev.recorded_at,
      witnessCapacity: ev.witness_capacity, witnessBy: name(ev.witness_by), witnessAt: ev.witness_at,
      voidedBy: name(ev.voided_by), voidedAt: ev.voided_at, voidReason: ev.void_reason, backdateReason: ev.backdate_reason,
      params: (params ?? []).map(p => ({
        label: p.label, value: p.value === null ? null : Number(p.value), valueText: p.value_text, unit: p.unit, quality: p.quality,
        sampledAt: p.sampled_at, offsetS: p.offset_s, source: p.source,
      })),
    },
  }
}

/** P4: tope de bytes de los PDF originales de P&ID que entran en un PDF LOSH (el resto queda listado en la portada). */
export const MAX_LOSH_SOURCE_BYTES = 40 * 1024 * 1024

/**
 * P4: PDF LOSH de un sistema = sus hojas P&ID vigentes con sus marcas. null si el sistema no es del proyecto;
 * `input.losh.sheets` vacío si no tiene límites marcados (la ruta igual lo entrega, con la portada que lo dice).
 */
export async function loadLoshPdf(db: Db, x: { projectId: string; systemId: string; branding?: PdfBranding }): Promise<{ input: LoshPdfInput; filename: string } | null> {
  const [losh, { data: project }, branding] = await Promise.all([
    loadSystemLosh(db, x),
    db.from('projects').select('code, name, timezone').eq('id', x.projectId).maybeSingle(),
    x.branding ?? loadPdfBranding(db, x.projectId),
  ])
  if (!losh || !project) return null

  const sources: Record<string, Uint8Array> = {}
  const omitted: { number: string; reason: string }[] = []
  let bytes = 0
  for (const sheet of losh.sheets) {
    if (!sheet.file_path) { omitted.push({ number: sheet.number, reason: bi('la revisión no tiene PDF', 'the revision has no PDF') }); continue }
    const { data: blob, error } = await db.storage.from('project-documents').download(sheet.file_path)
    if (error || !blob) { omitted.push({ number: sheet.number, reason: bi('no se pudo descargar el PDF', 'the PDF could not be downloaded') }); continue }
    if (bytes + blob.size > MAX_LOSH_SOURCE_BYTES) {
      omitted.push({ number: sheet.number, reason: bi(`supera el tope de ${MAX_LOSH_SOURCE_BYTES / 1024 / 1024} MB de planos`, `exceeds the ${MAX_LOSH_SOURCE_BYTES / 1024 / 1024} MB drawing cap`) })
      continue
    }
    bytes += blob.size
    sources[sheet.revision_id] = new Uint8Array(await blob.arrayBuffer())
  }

  return {
    filename: `Limites-${losh.system.code.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      projectName: project.name, projectCode: project.code, timezone: project.timezone, branding, losh, sources, omitted,
      recordUrl: `${siteUrl()}${systemTabHref(x.projectId, x.systemId, 'drawings')}`,
    },
  }
}

/**
 * F-21c: PDF de red-lines de un sistema (pestaña «Planos» y anexo del paquete de handover). null si el sistema no es
 * del proyecto; `input.redlines` vacío si no tiene (la ruta igual lo entrega; el paquete lo omite). Se descargan los PDF
 * de las revisiones con red-lines sin incorporar (tope MAX_LOSH_SOURCE_BYTES, como el de límites).
 */
export async function loadRedlinesPdf(db: Db, x: { projectId: string; systemId: string; branding?: PdfBranding }): Promise<{ input: RedlinesPdfInput; filename: string } | null> {
  const [{ data: system }, { data: project }, { data: rows }, branding] = await Promise.all([
    db.from('systems').select('code, name, color').eq('id', x.systemId).eq('project_id', x.projectId).maybeSingle(),
    db.from('projects').select('code, name, timezone').eq('id', x.projectId).maybeSingle(),
    // bounded: red-lines de un sistema (tope 1000)
    db.from('pid_redlines')
      .select(`id, number, page_num, status, description, marks, page_rotation, created_at, created_by, reviewed_by, reviewed_at, review_note, revision_id,
        documents(number),
        rev:document_revisions!pid_redlines_revision_id_fkey(rev, file_path),
        inc:document_revisions!pid_redlines_incorporated_revision_id_fkey(rev)`)
      .eq('project_id', x.projectId).eq('system_id', x.systemId).order('seq').limit(1000),
    x.branding ?? loadPdfBranding(db, x.projectId),
  ])
  if (!system || !project) return null

  const people = [...new Set((rows ?? []).flatMap(r => [r.created_by, r.reviewed_by]).filter((v): v is string => !!v))]
  const { data: profiles } = people.length ? await db.from('profiles').select('id, full_name').in('id', people) : { data: [] }
  const nameOf = new Map((profiles ?? []).map(p => [p.id, p.full_name ?? '—']))

  const redlines: RedlinePdfItem[] = (rows ?? []).map(r => ({
    id: r.id, number: r.number, page_num: r.page_num, status: r.status as RedlineStatus, description: r.description,
    marks: fromStoredMarks(r.marks), page_rotation: normalizeRotation(r.page_rotation), created_at: r.created_at,
    reviewed_at: r.reviewed_at, review_note: r.review_note, revision_id: r.revision_id,
    document_number: (r.documents as { number: string } | null)?.number ?? '?',
    rev: (r.rev as { rev: string } | null)?.rev ?? '?',
    incorporated_rev: (r.inc as { rev: string } | null)?.rev ?? null,
    created_by_name: nameOf.get(r.created_by) ?? '—',
    reviewed_by_name: r.reviewed_by ? nameOf.get(r.reviewed_by) ?? '—' : null,
  }))

  const sources: Record<string, Uint8Array> = {}
  const omitted: { number: string; reason: string }[] = []
  let bytes = 0
  const revs = new Map<string, { label: string; file_path: string | null }>()
  for (const r of rows ?? []) {
    if (r.status !== 'open' && r.status !== 'accepted') continue
    const rev = r.rev as { rev: string; file_path: string | null } | null
    revs.set(r.revision_id, { label: `${(r.documents as { number: string } | null)?.number ?? '?'} rev ${rev?.rev ?? '?'}`, file_path: rev?.file_path ?? null })
  }
  for (const [revId, rev] of revs) {
    if (!rev.file_path) { omitted.push({ number: rev.label, reason: bi('la revisión no tiene PDF', 'the revision has no PDF') }); continue }
    const { data: blob, error } = await db.storage.from('project-documents').download(rev.file_path)
    if (error || !blob) { omitted.push({ number: rev.label, reason: bi('no se pudo descargar el PDF', 'the PDF could not be downloaded') }); continue }
    if (bytes + blob.size > MAX_LOSH_SOURCE_BYTES) {
      omitted.push({ number: rev.label, reason: bi(`supera el tope de ${MAX_LOSH_SOURCE_BYTES / 1024 / 1024} MB de planos`, `exceeds the ${MAX_LOSH_SOURCE_BYTES / 1024 / 1024} MB drawing cap`) })
      continue
    }
    bytes += blob.size
    sources[revId] = new Uint8Array(await blob.arrayBuffer())
  }

  return {
    filename: `Redlines-${system.code.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    input: {
      projectName: project.name, projectCode: project.code, timezone: project.timezone, branding,
      system: { code: system.code, name: system.name, color: system.color }, redlines, sources, omitted,
      recordUrl: `${siteUrl()}${systemTabHref(x.projectId, x.systemId, 'drawings')}`,
    },
  }
}
