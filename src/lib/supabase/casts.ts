import type { Json } from '@/types/supabase.generated'

// G-18: las dos fronteras con la BD que TypeScript no puede comprobar, con nombre. Todo lo demás (filas de
// tablas y vistas, embebidos) se tipa solo con `SupabaseClient<Database>`; ESLint prohíbe `as unknown as`.

/**
 * Un jsonb o el resultado jsonb de una función SQL → su tipo del dominio. La forma la garantiza la función o
 * el trigger que lo escribe (supabase/functions-sql/…), no el compilador: mantenerlos en paridad.
 */
export function fromJson<T>(value: Json | null | undefined): T {
  // eslint-disable-next-line no-restricted-syntax -- G-18: única conversión Json → tipo del dominio
  return value as unknown as T
}

/**
 * Argumento de una función SQL que acepta NULL. Los tipos generados declaran no nulo todo argumento (Postgres
 * no guarda su nulabilidad), así que el NULL se pasa por aquí.
 */
export function sqlArg<T>(value: T | null | undefined): T {
  return (value ?? null) as T
}
