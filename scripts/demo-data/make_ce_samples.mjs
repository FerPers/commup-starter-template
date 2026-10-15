// Genera docs/samples/CE-A300-S01-001.xlsx y .pdf: matriz C&E de ejemplo (deetanizadora, DEMO) para
// probar la importación con IA (fase 4-D, sesión 3). GD-301, XV-301 y BDV-301 NO existen en DEMO a
// propósito: la revisión debe marcarlos en ámbar.  Uso: node scripts/demo-data/make_ce_samples.mjs
import * as XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const causes = [
  ['C-01', 'PT-107', 'Muy alta presión en el tope', 'PAHH', '28 barg', '1oo1'],
  ['C-02', 'LT-105', 'Muy bajo nivel en el fondo', 'LALL', '10 %', '1oo1'],
  ['C-03', 'LT-105', 'Muy alto nivel en el fondo', 'LAHH', '90 %', '1oo1'],
  ['C-04', 'TT-108', 'Muy alta temperatura en el rehervidor', 'TAHH', '140 °C', '1oo1'],
  ['C-05', 'GD-301', 'Gas confirmado en el área', 'GAHH', '20 % LIE', '2oo3'],
  ['C-06', 'HS-301', 'Paro manual de la unidad', 'Manual', '', ''],
]
const effects = [
  ['E-01', 'XV-301', 'Cierre de alimentación', 'Cerrar'],
  ['E-02', 'P-103B', 'Paro bomba de reflujo', 'Parar'],
  ['E-03', 'C-105', 'Paro compresor de tope', 'Parar'],
  ['E-04', 'BDV-301', 'Despresurización (blowdown)', 'Abrir'],
  ['E-05', '', 'Alarma en sala de control', 'Alarma'],
]
const marks = {
  'C-01': { 'E-01': 'X', 'E-03': 'X', 'E-05': 'X' },
  'C-02': { 'E-02': 'X', 'E-05': 'X' },
  'C-03': { 'E-01': 'X', 'E-05': 'X' },
  'C-04': { 'E-01': 'X', 'E-04': 'T10', 'E-05': 'X' },
  'C-05': { 'E-01': 'X', 'E-02': 'X', 'E-03': 'X', 'E-04': 'X', 'E-05': 'X' },
  'C-06': { 'E-01': 'X', 'E-02': 'X', 'E-03': 'X', 'E-04': 'X', 'E-05': 'X' },
}

// ── Excel: encabezado de efectos en 4 filas (código, tag, descripción, acción) y una fila por causa.
const rows = [
  ['MATRIZ CAUSA-EFECTO — DEETANIZADORA (A300-S01)'],
  ['Documento: CE-A300-S01-001   Rev. 0   Proyecto: DEMO Planta GLP - Fase 2'],
  [],
  ['', '', '', '', '', 'Efecto →', ...effects.map(e => e[0])],
  ['', '', '', '', '', 'Tag', ...effects.map(e => e[1])],
  ['', '', '', '', '', 'Descripción', ...effects.map(e => e[2])],
  ['Causa', 'Tag', 'Descripción', 'Alarma', 'Set point', 'Votación', ...effects.map(e => e[3])],
  ...causes.map(c => [...c, ...effects.map(e => marks[c[0]][e[0]] ?? '')]),
  [],
  ['X = acción directa · T10 = acción con retardo de 10 s'],
]
const ws = XLSX.utils.aoa_to_sheet(rows)
ws['!cols'] = [8, 10, 34, 8, 10, 10, ...effects.map(() => 14)].map(wch => ({ wch }))
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Portada'], ['Ver hoja «C&E»']]), 'Portada')
XLSX.utils.book_append_sheet(wb, ws, 'C&E')
writeFileSync('docs/samples/CE-A300-S01-001.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

// ── PDF: la misma matriz como plano (A4 horizontal), encabezados de efecto rotados.
const pdf = await PDFDocument.create()
const page = pdf.addPage([842, 595])
const font = await pdf.embedFont(StandardFonts.Helvetica)
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
const clean = s => s.replace('°', ' deg').replace('→', '->')
const text = (s, x, y, size = 8, f = font, rotate) => page.drawText(clean(s), { x, y, size, font: f, rotate })
text('MATRIZ CAUSA-EFECTO - DEETANIZADORA (A300-S01)', 40, 555, 14, bold)
text('Documento CE-A300-S01-001  -  Rev. 0  -  DEMO Planta GLP - Fase 2', 40, 538, 9)
const colX = [40, 80, 130, 330, 375, 430]
const gridX = 480, cellW = 60, headTop = 500, headBottom = 380, rowH = 22
;['Causa', 'Tag', 'Descripción', 'Alarma', 'Set point', 'Voto'].forEach((h, i) => text(h, colX[i], headBottom + 6, 8, bold))
effects.forEach((e, j) => {
  const x = gridX + j * cellW
  page.drawRectangle({ x, y: headBottom, width: cellW, height: headTop - headBottom, borderWidth: 0.5, borderColor: rgb(0.4, 0.4, 0.4) })
  text(`${e[0]}  ${e[1]}`, x + 18, headBottom + 6, 8, bold, degrees(90))
  text(`${e[2]} (${e[3]})`, x + 34, headBottom + 6, 7, font, degrees(90))
})
causes.forEach((c, i) => {
  const y = headBottom - (i + 1) * rowH
  page.drawLine({ start: { x: 40, y }, end: { x: gridX + effects.length * cellW, y }, thickness: 0.3, color: rgb(0.6, 0.6, 0.6) })
  c.forEach((v, k) => text(v, colX[k], y + 7, 8, k === 0 ? bold : font))
  effects.forEach((e, j) => {
    const x = gridX + j * cellW
    page.drawRectangle({ x, y, width: cellW, height: rowH, borderWidth: 0.5, borderColor: rgb(0.4, 0.4, 0.4) })
    const m = marks[c[0]][e[0]]
    if (m) text(m, x + cellW / 2 - 6, y + 7, 10, bold)
  })
})
text('X = acción directa   T10 = acción con retardo de 10 s', 40, headBottom - causes.length * rowH - 20, 8)
writeFileSync('docs/samples/CE-A300-S01-001.pdf', await pdf.save())
console.log('ok')
