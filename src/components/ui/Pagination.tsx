'use client';

import { useTranslations } from 'next-intl';
import { Button } from './Button';

export interface PaginationProps {
  /** Página actual, 1-based */
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}

/** Paginador servidor (Sprint E): anterior / «Página X de Y» / siguiente + rango visible */
export function Pagination({ page, total, pageSize, onPage, disabled = false }: PaginationProps) {
  const tc = useTranslations('Common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label={tc('page', { page, total: pages })}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}
    >
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {tc('rangeInfo', { from, to, total })}
      </span>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1}>
            {tc('prevPage')}
          </Button>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {tc('page', { page, total: pages })}
          </span>
          <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= pages}>
            {tc('nextPage')}
          </Button>
        </div>
      )}
    </nav>
  );
}
