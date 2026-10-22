/**
 * N3b: «Tu rol» y «Ayuda de esta página» (ruta → sección del manual). Aparte de manual.ts para que el menú de
 * usuario (cliente) no cargue el texto del manual. Un test exige que cada id exista en el manual.
 */

/** Sección del rol y las de los procedimientos que más usa, en orden. */
export const ROLE_HELP: Readonly<Record<string, readonly string[]>> = {
  inspector: ['4.1', '5.3', '5.4', '5.14', '6'],
  leader: ['4.2', '5.2', '5.4', '5.7', '5.8', '5.10', '5.12'],
  architect: ['4.4', '4.3', '5.1', '5.2', '5.17'],
  admin: ['4.5', '4.3', '5.8', '5.23'],
  owner: ['4.6', '4.5', '4.3', '5.8'],
  client: ['4.7', '5.4', '5.10', '5.21'],
}

/** Ruta → sección (la más específica primero). `role` = la sección del rol de quien pregunta. */
const PAGE_HELP: readonly [RegExp, string][] = [
  [/^\/projects\/[^/]+\/tags\/[^/]+\/itrs\//, '5.3'],
  [/^\/projects\/[^/]+\/itrs\/generate/, '5.2'],
  [/^\/projects\/[^/]+\/itrs/, '5.3'],
  [/^\/projects\/[^/]+\/tags/, '5.2'],
  [/^\/projects\/[^/]+\/punches/, '5.4'],
  [/^\/projects\/[^/]+\/preservation/, '5.5'],
  [/^\/projects\/[^/]+\/pssr/, '5.6'],
  [/^\/projects\/[^/]+\/certificates/, '5.7'],
  [/^\/projects\/[^/]+\/(readiness|systems)/, '5.8'],
  [/^\/projects\/[^/]+\/registers/, '5.9'],
  [/^\/projects\/[^/]+\/daily\/reports/, '5.12'],
  [/^\/projects\/[^/]+\/daily\/handovers/, '5.13'],
  [/^\/projects\/[^/]+\/(planning|work-plans)/, '5.11'],
  [/^\/projects\/[^/]+\/daily/, '5.10'],
  [/^\/projects\/[^/]+\/startup\/(procedures|runs)/, '5.14'],
  [/^\/projects\/[^/]+\/startup\/lineups/, '5.15'],
  [/^\/projects\/[^/]+\/startup\/events/, '5.16'],
  [/^\/projects\/[^/]+\/startup\/(operations|transfers)/, '5.20'],
  [/^\/projects\/[^/]+\/startup\/performance/, '5.21'],
  [/^\/projects\/[^/]+\/startup/, '3.4'],
  [/^\/projects\/[^/]+\/(signals|loops|ce-matrices|import-signals)/, '5.17'],
  [/^\/projects\/[^/]+\/documents/, '5.18'],
  [/^\/projects\/[^/]+\/vendors/, '5.19'],
  [/^\/projects\/[^/]+\/(kpis|reports)/, '5.22'],
  [/^\/projects\/[^/]+\/import/, '5.1'],
  [/^\/projects\/[^/]+\/?$/, '3'],
  [/^\/(punch-list|ops)/, '5.4'],
  [/^\/preservation/, '5.5'],
  [/^\/control-tower/, '5.8'],
  [/^\/kpis/, '5.22'],
  [/^\/admin\/(api-keys|webhooks|workflows)/, '5.23'],
  [/^\/admin\/templates/, '5.2'],
  [/^\/admin/, '4.5'],
  [/^\/(scan|tag_360)/, '2.5'],
  [/^\/(dashboard|projects\/?$)/, '2.4'],
  [/^\/my-work/, 'role'],
]

export function helpSectionFor(pathname: string, role: string | null | undefined): string {
  const hit = PAGE_HELP.find(([re]) => re.test(pathname))?.[1]
  if (!hit || hit === 'role') return ROLE_HELP[role ?? '']?.[0] ?? '2'
  return hit
}

/** Todos los ids que usa la ayuda contextual (para el test: cada uno existe en el manual). */
export const HELP_SECTION_IDS: readonly string[] = [...new Set([...PAGE_HELP.map(([, id]) => id).filter(id => id !== 'role'), ...Object.values(ROLE_HELP).flat()])]
