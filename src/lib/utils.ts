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

export function getPunchCategoryColor(category: 'A' | 'B' | 'C'): string {
  return { A: '#EF4444', B: '#F59E0B', C: '#6B7280' }[category]
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    not_started: '#6B7280',
    in_progress: '#3B82F6',
    completed: '#10B981',
    approved: '#059669',
    rejected: '#EF4444',
    open: '#EF4444',
    closed: '#10B981',
  }
  return colors[status] ?? '#6B7280'
}
