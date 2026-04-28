'use client';

import { useEffect, useState, type CSSProperties, type ReactNode, type Key } from 'react';
import { Table, THead, TBody, TR, TH, TD, TableWrapper } from './Table';
import { EmptyState } from './EmptyState';
import { SkeletonStack } from './Skeleton';

export type DataTableResponsive = 'scroll' | 'scroll-sticky' | 'stack';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  sticky?: 'left' | 'right';
  hideBelow?: number;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  loading?: boolean;
  empty?: ReactNode;
  responsive?: DataTableResponsive;
  stackBreakpoint?: number;
  onRowClick?: (row: T) => void;
  ariaLabel?: string;
  style?: CSSProperties;
  rowStyle?: (row: T) => CSSProperties | undefined;
}

function useViewportWidth(): number {
  const [w, setW] = useState<number>(typeof window === 'undefined' ? 1280 : window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  responsive = 'scroll-sticky',
  stackBreakpoint = 768,
  onRowClick,
  ariaLabel,
  style,
  rowStyle,
}: DataTableProps<T>) {
  const vw = useViewportWidth();
  const useStack = responsive === 'stack' && vw < stackBreakpoint;

  if (loading) {
    return (
      <TableWrapper style={style}>
        <div style={{ padding: 16 }}>
          <SkeletonStack rows={5} lineHeight={20} gap={12} />
        </div>
      </TableWrapper>
    );
  }

  if (rows.length === 0) {
    return (
      <TableWrapper style={style}>
        {empty ?? <EmptyState title="No data" description="There are no records to display." />}
      </TableWrapper>
    );
  }

  if (useStack) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              cursor: onRowClick ? 'pointer' : undefined,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              ...(rowStyle?.(row) ?? {}),
            }}
          >
            {columns.filter(c => !c.hideBelow || vw >= c.hideBelow).map((c) => (
              <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{c.header}</span>
                <span style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{c.cell(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const cellPad = '12px';
  const stickyZ = 2;

  return (
    <TableWrapper style={style}>
      <div style={{ overflowX: 'auto' }}>
        <Table aria-label={ariaLabel}>
          <THead>
            <TR>
              {columns.map((c, i) => {
                const stickyStyle: CSSProperties = c.sticky === 'left'
                  ? { position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: stickyZ }
                  : c.sticky === 'right'
                  ? { position: 'sticky', right: 0, background: 'var(--gray-50)', zIndex: stickyZ }
                  : {};
                return (
                  <TH key={c.key ?? i} style={{
                    width: c.width,
                    textAlign: c.align ?? 'left',
                    padding: cellPad,
                    ...stickyStyle,
                  }}>
                    {c.header}
                  </TH>
                );
              })}
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  ...(onRowClick ? { cursor: 'pointer' } : {}),
                  ...(rowStyle?.(row) ?? {}),
                }}
              >
                {columns.map((c, i) => {
                  const rs = rowStyle?.(row);
                  const rowBg = (rs?.background as string | undefined) ?? 'var(--card-bg)';
                  const stickyStyle: CSSProperties = c.sticky === 'left'
                    ? { position: 'sticky', left: 0, background: rowBg, zIndex: stickyZ }
                    : c.sticky === 'right'
                    ? { position: 'sticky', right: 0, background: rowBg, zIndex: stickyZ }
                    : {};
                  return (
                    <TD key={c.key ?? i} style={{
                      textAlign: c.align ?? 'left',
                      padding: cellPad,
                      ...stickyStyle,
                    }}>
                      {c.cell(row)}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </TableWrapper>
  );
}
