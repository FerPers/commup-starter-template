import type { KeyboardEvent, MouseEvent } from 'react'

/**
 * G-12: un elemento que no es `<button>` pero se pulsa (fila de árbol, tarjeta, opción de una lista propia) necesita
 * rol, foco con Tab y Enter/Espacio. Preferir `<button type="button">` cuando el estilo lo permite; esto es para
 * cuando no (contenedores con layout propio). Nunca sobre algo que ya contiene otros botones o enlaces.
 *
 *   <div {...pressable(() => select(id))} style={…}>…</div>
 */
export function pressable(onPress: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: MouseEvent<HTMLElement>) => onPress(e),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(e) }
    },
  }
}
