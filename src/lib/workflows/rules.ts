/**
 * I-10 (S02): combinaciones evento → acción que se disparan a sí mismas. «Punch creado → crear punch»
 * generaba un punch, que emitía otro `punches.created`, y así sin fin. La edge function evaluate-workflow
 * además ignora los `.created` de filas creadas por un workflow y limita las ejecuciones por regla.
 */
const REFLEXIVE: Record<string, string[]> = {
  create_punch: ['punches.created'],
}

/** El texto sale de `ActionErrors.workflows.reflexive` (acción y pantalla). */
export function isReflexiveRule(triggerEvent: string, actionType: string): boolean {
  return REFLEXIVE[actionType]?.includes(triggerEvent.trim()) ?? false
}
