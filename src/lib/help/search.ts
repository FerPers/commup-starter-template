// N3b: búsqueda en la ayuda. Sin acentos ni mayúsculas; todas las palabras deben aparecer; el título pesa más.

export type HelpEntry = { id: string; title: string; text: string }
export type HelpHit = { id: string; title: string; snippet: string }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function searchHelp(entries: readonly HelpEntry[], q: string, max = 8): HelpHit[] {
  const words = fold(q).split(/\s+/).filter(w => w.length >= 2)
  if (!words.length) return []
  const scored: { e: HelpEntry; score: number; at: number }[] = []
  for (const e of entries) {
    const title = fold(e.title)
    const text = fold(e.text)
    if (!words.every(w => title.includes(w) || text.includes(w))) continue
    const score = words.reduce((n, w) => n + (title.includes(w) ? 10 : 0) + Math.min(5, text.split(w).length - 1), 0)
    scored.push({ e, score, at: Math.max(0, text.indexOf(words[0])) })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map(({ e, at }) => {
    const start = Math.max(0, at - 40)
    return { id: e.id, title: e.title, snippet: `${start > 0 ? '…' : ''}${e.text.slice(start, start + 110).trim()}…` }
  })
}
