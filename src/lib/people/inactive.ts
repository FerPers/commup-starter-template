/**
 * Etiqueta «(inactivo)» (2026-09-07).
 *
 * Regla de dominio: los contratistas ejecutan ITRs y salen del proyecto; sus
 * nombres y firmas deben permanecer. «Remover» en Admin→Usuarios solo borra la
 * membresía (org_members), nunca el perfil. Un usuario referenciado por una
 * firma, punch o asignación que ya no es miembro de la org se muestra con el
 * sufijo «(inactivo)».
 *
 * Helpers puros: el conjunto de miembros lo carga cada página (una consulta a
 * org_members, que la mayoría ya hace para los desplegables de asignación).
 */

/** Construye el conjunto de ids de miembros a partir de cualquier lista con `user_id`. */
export function memberIdSet(members: ReadonlyArray<{ user_id: string }> | null | undefined): Set<string> {
  return new Set((members ?? []).map(m => m.user_id))
}

/**
 * true cuando el usuario tiene id conocido y NO está en el conjunto de miembros.
 * Sin id (null/undefined) no se puede afirmar nada → false.
 */
export function isInactiveMember(
  userId: string | null | undefined,
  memberIds: ReadonlySet<string>,
): boolean {
  return Boolean(userId) && !memberIds.has(userId as string)
}
