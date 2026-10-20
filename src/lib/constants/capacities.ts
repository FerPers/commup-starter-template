// Firmantes designados por proyecto (S14, D14; migración 20261109120000). Fuente única de capacidades para
// cliente y servidor (sin imports de servidor). Reglas:
//   - Por proyecto y capacidad: si hay designados (project_capacities), firman solo ellos, con cualquier rol.
//   - Sin designados rige el rol de respaldo (CAPACITY_FALLBACK_ROLES = SQL capacity_fallback_roles) y la UI avisa.
//   - Solo owner/admin designan. client_rep = empresa operadora (companies.kind = 'owner') o rol client;
//     commissioning nunca a un rol client.
// La decisión final siempre es la RPC (has_capacity); esto solo decide qué botones mostrar.

export const CAPACITIES = ['commissioning', 'operations', 'hse', 'client_rep'] as const
export type Capacity = (typeof CAPACITIES)[number]

/** = SQL capacity_fallback_roles() (test de paridad en capacities.test.ts). */
export const CAPACITY_FALLBACK_ROLES: Record<Capacity, readonly string[]> = {
  commissioning: ['owner', 'admin', 'architect', 'leader'],
  operations: ['owner', 'admin', 'architect', 'leader', 'client'],
  hse: ['owner', 'admin', 'architect', 'leader', 'client'],
  client_rep: ['client'],
}

/** Quién designa firmantes (SQL assign_project_capacity → is_org_admin). */
export const CAPACITY_ADMIN_ROLES: readonly string[] = ['owner', 'admin']

export type CapacityState = { allowed: boolean; designated: boolean }
/** Capacidades efectivas de una persona en un proyecto (RPC my_capacities). */
export type MyCapacities = Record<Capacity, CapacityState>

export const isCapacity = (v: string): v is Capacity => (CAPACITIES as readonly string[]).includes(v)

/** Solo por rol (sin designaciones): para tests y para pantallas que aún no cargan my_capacities. */
export function fallbackCapacities(role: string): MyCapacities {
  return Object.fromEntries(CAPACITIES.map(c => [c, { allowed: CAPACITY_FALLBACK_ROLES[c].includes(role), designated: false }])) as MyCapacities
}

/** Filas de my_capacities → mapa completo (lo que no venga = sin permiso). */
export function toMyCapacities(rows: { capacity: string; allowed: boolean; designated: boolean }[] | null | undefined): MyCapacities {
  const out = Object.fromEntries(CAPACITIES.map(c => [c, { allowed: false, designated: false }])) as MyCapacities
  for (const r of rows ?? []) if (isCapacity(r.capacity)) out[r.capacity] = { allowed: !!r.allowed, designated: !!r.designated }
  return out
}

export const can = (caps: MyCapacities, c: string): boolean => isCapacity(c) && caps[c].allowed

/** Piso para designar (= SQL capacity_eligible): mensaje de error o null. */
export function capacityIneligible(capacity: Capacity, member: { role: string; companyKind: string | null }): string | null {
  if (capacity === 'commissioning' && member.role === 'client') return 'client_commissioning'
  if (capacity === 'client_rep' && member.role !== 'client' && member.companyKind !== 'owner') return 'client_rep_company'
  return null
}

/** Rol de firma de un certificado → capacidad que lo firma (S17, D15; = SQL certificate_role_capacity). */
export const CERT_ROLE_CAPACITY = { completion: 'commissioning', client: 'client_rep', authority: 'operations' } as const satisfies Record<string, Capacity>
export type CertSignRole = keyof typeof CERT_ROLE_CAPACITY
