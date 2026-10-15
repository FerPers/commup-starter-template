/**
 * PDF del procedimiento de levantamiento de pendientes (fase 4 · bloque A, §6.1 y §10.8 del plan
 * readiness). Documento para entregar al cliente: criterios de categoría por impacto funcional,
 * matriz impacto → categoría, ejemplos por disciplina, flujo resolver → verificar, revisión del
 * supervisor y disposición para el arranque. Bilingüe; el contenido sale de la guía (category-guide).
 */

import {
  CATEGORY_CRITERIA,
  DISCIPLINE_EXAMPLES,
  IMPACT_HELP,
  PUNCH_IMPACTS,
  STARTUP_DISPOSITIONS,
  STARTUP_DISPOSITION_HELP,
  SUGGESTED_CATEGORY,
  type PunchImpact,
  type StartupDisposition,
} from '@/lib/punches/category-guide'
import { A4_W, BOTTOM_LIMIT, COLOR, CONTENT_W, FOOTER_H, MARGIN, Renderer, sanitize, wrapText, type TableCol } from './renderer'

type Lang = 'es' | 'en'

export type PunchProcedureData = {
  orgName: string
  lang: Lang
  /** Etiquetas cortas desde i18n (PunchGuide.impact.* y PunchGuide.disposition.*). */
  impactLabel: Record<PunchImpact, string>
  dispositionLabel: Record<StartupDisposition, string>
  /** Disciplinas de la org (código → nombre); las que no tienen ejemplos propios usan los genéricos. */
  disciplines: { code: string; name: string }[]
}

const T = {
  title: { es: 'Procedimiento de levantamiento de pendientes (punch)', en: 'Punch item raising procedure' },
  purpose: { es: '1. Propósito y alcance', en: '1. Purpose and scope' },
  purposeText: {
    es: 'Define cómo se levantan, categorizan, resuelven, verifican y cierran los pendientes (punch) durante la completación mecánica, el pre-comisionamiento y el comisionamiento. La categoría se decide por el IMPACTO FUNCIONAL y de seguridad del pendiente, no por su tamaño físico. Un pendiente Cat C nunca bloquea un gate; por eso categorizarlo bien desde el inicio es obligatorio.',
    en: 'Defines how punch items are raised, categorised, resolved, verified and closed during mechanical completion, pre-commissioning and commissioning. The category is decided by the FUNCTIONAL and safety IMPACT of the item, not by its physical size. A Cat C item never blocks a gate, which is why categorising it correctly from the start is mandatory.',
  },
  categories: { es: '2. Categorías', en: '2. Categories' },
  matrix: { es: '3. Impacto → categoría sugerida', en: '3. Impact → suggested category' },
  matrixNote: {
    es: 'Al levantar un punch el impacto es obligatorio. CommUp sugiere la categoría según el impacto y avisa si se elige otra; quien levanta decide y el supervisor revisa.',
    en: 'The impact is mandatory when raising a punch. CommUp suggests the category from the impact and warns if a different one is chosen; the originator decides and the supervisor reviews.',
  },
  colImpact: { es: 'Impacto', en: 'Impact' },
  colMeaning: { es: 'Qué cubre', en: 'What it covers' },
  colCat: { es: 'Categoría', en: 'Category' },
  examples: { es: '4. Ejemplos por disciplina', en: '4. Examples by discipline' },
  flow: { es: '5. Flujo del pendiente', en: '5. Punch workflow' },
  flowSteps: {
    es: [
      'Levantar: tag, impacto (obligatorio), categoría, descripción clara y fotos. Se asigna responsable y fecha objetivo.',
      'Revisión de categoría: un supervisor distinto de quien levantó confirma o recategoriza (el cambio exige motivo y queda auditado).',
      'Resolver: quien corrige el pendiente lo marca «Resuelto», describiendo qué se hizo, con evidencia fotográfica. El punch sigue abierto.',
      'Verificar en campo: una persona distinta de quien resolvió inspecciona y acepta (se cierra) o rechaza con motivo (vuelve a «en curso»).',
      'Cerrado: solo un punch verificado en campo se cierra. Nadie puede cerrar su propia resolución.',
    ],
    en: [
      'Raise: tag, impact (mandatory), category, clear description and photos. Assign an owner and a target date.',
      'Category review: a supervisor other than the originator confirms or re-categorises (a change requires a reason and is audited).',
      'Resolve: whoever fixes the item marks it «Resolved», describing what was done, with photo evidence. The punch stays open.',
      'Field verification: someone other than the resolver inspects and accepts (it closes) or rejects with a reason (back to «in progress»).',
      'Closed: only a field-verified punch is closed. Nobody can close their own resolution.',
    ],
  },
  startup: { es: '6. Disposición para el arranque (PSSR)', en: '6. Start-up disposition (PSSR)' },
  startupText: {
    es: 'Antes de aprobar el PSSR de un sistema, cada punch abierto debe tener disposición. Ningún punch marcado «cerrar antes del arranque» puede seguir abierto.',
    en: 'Before approving a system PSSR, every open punch must have a disposition. No punch marked «close before start-up» may remain open.',
  },
  signoff: { es: 'Aprobación del procedimiento', en: 'Procedure approval' },
  preparedBy: { es: 'Elaborado por', en: 'Prepared by' },
  reviewedBy: { es: 'Revisado por', en: 'Reviewed by' },
  approvedBy: { es: 'Aprobado por (cliente)', en: 'Approved by (client)' },
  generic: { es: 'Otras disciplinas (ejemplos generales)', en: 'Other disciplines (general examples)' },
  generated: { es: 'Generado', en: 'Generated' },
  page: { es: 'Página', en: 'Page' },
  nameDate: { es: 'Nombre / fecha', en: 'Name / Date' },
} as const

export async function renderPunchProcedurePdf(data: PunchProcedureData): Promise<Uint8Array> {
  const L = data.lang
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${T.title[L]} · ${data.orgName}`))
  r.doc.setAuthor('CommUp')
  const generatedAt = new Date().toISOString().slice(0, 10)

  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`CommUp · ${data.orgName} · ${T.generated[L]}: ${generatedAt}`), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const pageStr = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(pageStr, { x: totalX - r.fontRegular.widthOfTextAtSize(pageStr, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })

  const bullet = (text: string, size = 9, indent = 10) => {
    const lines = wrapText(text, r.fontRegular, size, CONTENT_W - indent - 8)
    lines.forEach((line, i) => {
      r.ensureSpace(size + 3)
      if (i === 0) r.drawText('-', { x: MARGIN + indent - 8, y: r.y - size, size, color: COLOR.muted })
      r.drawText(line, { x: MARGIN + indent, y: r.y - size, size, color: COLOR.text })
      r.moveY(size + 3)
    })
  }
  const heading = (text: string, size = 10, color = COLOR.text) => {
    r.ensureSpace(size + 16)
    r.moveY(4)
    r.drawText(text, { x: MARGIN, y: r.y - size, size, bold: true, color })
    r.moveY(size + 4)
  }

  // ── Portada ──
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  r.drawTextCentered('CommUp', { y: r.y - 18, size: 18, bold: true, color: COLOR.purple })
  r.moveY(22)
  r.drawTextCentered(T.title[L], { y: r.y - 13, size: 13, bold: true, color: COLOR.text, maxWidth: CONTENT_W })
  r.moveY(15)
  r.drawTextCentered(data.orgName, { y: r.y - 11, size: 11, color: COLOR.muted, maxWidth: CONTENT_W })
  r.moveY(16)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(6)

  r.accentSection(T.purpose[L])
  r.paragraph(T.purposeText[L])

  r.accentSection(T.categories[L])
  const catColor = { A: COLOR.red, B: COLOR.amber, C: COLOR.muted } as const
  for (const c of ['A', 'B', 'C'] as const) {
    heading(CATEGORY_CRITERIA[c].title[L], 10, catColor[c])
    r.paragraph(CATEGORY_CRITERIA[c].rule[L])
    r.paragraph(CATEGORY_CRITERIA[c].blocks[L], { oblique: true, color: COLOR.muted })
  }

  r.accentSection(T.matrix[L])
  const cols: TableCol[] = [
    { w: 110, label: T.colImpact[L] },
    { w: CONTENT_W - 110 - 70, label: T.colMeaning[L] },
    { w: 70, label: T.colCat[L], align: 'center' },
  ]
  r.tableHeader(cols)
  PUNCH_IMPACTS.forEach((i, idx) => {
    r.tableRow(cols, [data.impactLabel[i], IMPACT_HELP[i][L], `Cat ${SUGGESTED_CATEGORY[i]}`], { alternate: idx % 2 === 1, valueBold: [true, false, true] })
  })
  r.moveY(4)
  r.paragraph(T.matrixNote[L], { oblique: true, color: COLOR.muted })

  r.accentSection(T.examples[L])
  const known = data.disciplines.filter(d => DISCIPLINE_EXAMPLES[d.code.trim().toUpperCase()])
  const sections = [
    ...known.map(d => ({ title: `${d.code} — ${d.name}`, ex: DISCIPLINE_EXAMPLES[d.code.trim().toUpperCase()] })),
    { title: T.generic[L], ex: DISCIPLINE_EXAMPLES.GENERIC },
  ]
  for (const s of sections) {
    if (r.y - 60 < BOTTOM_LIMIT) r.newPage()
    heading(s.title, 9.5)
    for (const c of ['A', 'B', 'C'] as const) {
      for (const e of s.ex[c]) bullet(`Cat ${c}: ${e[L]}`, 8.5)
    }
  }

  r.accentSection(T.flow[L])
  T.flowSteps[L].forEach((step, i) => r.paragraph(`${i + 1}. ${step}`))

  r.accentSection(T.startup[L])
  r.paragraph(T.startupText[L])
  for (const d of STARTUP_DISPOSITIONS) bullet(`${data.dispositionLabel[d]}: ${STARTUP_DISPOSITION_HELP[d][L]}`)

  r.moveY(10)
  r.accentSection(T.signoff[L])
  r.signatureGrid([{ role: T.preparedBy[L] }, { role: T.reviewedBy[L] }, { role: T.approvedBy[L] }], { placeholder: T.nameDate[L] })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
