/**
 * R2b (maquetas M): código del cliente por plantilla, por proyecto con defecto de la org. La fuente es SQL
 * (template_client_codes, template_client_codes_for, set_template_client_codes); aquí el vigente y el armado de
 * los cambios que manda la pantalla. Tests en client-codes.test.ts.
 */

export type ClientCodeRow = { code: string; org: string | null; project: string | null }
export type ClientCodeDraft = { org?: string; project?: string }

/** El del proyecto gana sobre el defecto de la org (igual que template_client_codes_for). */
export const effectiveClientCode = (r: { org: string | null; project: string | null }) => r.project ?? r.org

/** Cambios por nivel ({código: valor}); '' = quitar. Lo que quedó igual (sin contar espacios) no viaja. */
export function clientCodeChanges(rows: ClientCodeRow[], drafts: Record<string, ClientCodeDraft>) {
  const org: Record<string, string> = {}
  const project: Record<string, string> = {}
  for (const r of rows) {
    const d = drafts[r.code]
    if (!d) continue
    if (d.org !== undefined && d.org.trim() !== (r.org ?? '')) org[r.code] = d.org.trim()
    if (d.project !== undefined && d.project.trim() !== (r.project ?? '')) project[r.code] = d.project.trim()
  }
  return { org, project, count: Object.keys(org).length + Object.keys(project).length }
}
