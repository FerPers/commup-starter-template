export type ApiScope =
  | 'tags:read'   | 'tags:write'
  | 'itrs:read'   | 'itrs:write'
  | 'punches:read'| 'punches:write'
  | 'certificates:read'
  | 'systems:read'
  | 'events:read'
  | '*'

export const API_SCOPES: { value: ApiScope; label: string; description: string }[] = [
  { value: 'tags:read',          label: 'tags:read',          description: 'Listar y leer tags con métricas 360°' },
  { value: 'tags:write',         label: 'tags:write',         description: 'Crear y actualizar tags' },
  { value: 'itrs:read',          label: 'itrs:read',          description: 'Listar ITR instances' },
  { value: 'itrs:write',         label: 'itrs:write',         description: 'Crear y actualizar ITRs' },
  { value: 'punches:read',       label: 'punches:read',       description: 'Listar punches' },
  { value: 'punches:write',      label: 'punches:write',      description: 'Crear y actualizar punches' },
  { value: 'certificates:read',  label: 'certificates:read',  description: 'Listar certificados' },
  { value: 'systems:read',       label: 'systems:read',       description: 'Leer jerarquía areas→systems→subsystems' },
  { value: 'events:read',        label: 'events:read',        description: 'Polling de domain_events para sincronización' },
  { value: '*',                  label: '* (superscope)',     description: 'Acceso total — usar solo para integraciones de confianza' },
]
