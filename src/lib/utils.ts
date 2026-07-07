import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Detects phase A/B/C from ITR code suffix (e.g. "E13C" → 'A', "E10A" → 'A', "E03B" → 'B')
// Codes ending in C letter = phase C, B/BV suffix = phase B, else phase A
export function detectItrPhase(code: string): 'A' | 'B' | 'C' {
  const upper = code.toUpperCase()
  if (/C(\d+|-\d+)?$/.test(upper)) return 'C'
  if (/B(V)?(-\d+)?$/.test(upper)) return 'B'
  return 'A'
}
