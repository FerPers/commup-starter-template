import { z } from 'zod'

/**
 * A-20 (S02): entrada de `completeSetup`. Esa action escribe con el cliente service role, así que
 * todo campo se valida y se reconstruye aquí: z.object descarta las claves de más (antes un `...p`
 * podía mandar `id` u otras columnas a project_phases / disciplines).
 */
const text = (max: number) => z.string().trim().max(max)
const optionalDate = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/)

export const setupInputSchema = z.object({
  userFullName: text(120).pipe(z.string().min(2)),
  org: z.object({
    name: text(120).pipe(z.string().min(2)),
    slug: z.string().trim().toLowerCase().transform(v => v.replace(/^-+|-+$/g, ''))
      .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/)),
  }),
  project: z.object({
    name: text(150).pipe(z.string().min(1)),
    code: text(30).pipe(z.string().min(1)),
    location: text(200),
    client: text(200),
    country: text(100),
    region: text(100),
    start_date: optionalDate,
    end_date: optionalDate,
  }),
  phases: z.array(z.object({
    code: text(20).pipe(z.string().min(1)),
    name: text(120).pipe(z.string().min(1)),
    order_index: z.number().int().min(0).max(100),
    color,
    certificate_name: text(60),
  })).min(1).max(20),
  disciplines: z.array(z.object({
    code: text(20).pipe(z.string().min(1)),
    name: text(120).pipe(z.string().min(1)),
    color,
  })).min(1).max(60),
})

export type SetupInput = z.input<typeof setupInputSchema>
export type SetupData = z.output<typeof setupInputSchema>
