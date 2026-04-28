import type { CSSProperties, ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';

export function Table({ children, style, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      {...rest}
      style={{
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: 0,
        fontSize: 'var(--text-sm)',
        ...style,
      }}
    >
      {children}
    </table>
  );
}

export function THead({ children, style, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...rest}
      style={{
        background: 'var(--gray-50)',
        textAlign: 'left',
        ...style,
      }}
    >
      {children}
    </thead>
  );
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({ children, style, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      style={{ borderBottom: '1px solid var(--border)', ...style }}
    >
      {children}
    </tr>
  );
}

export function TH({ children, style, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{
        padding: '10px 12px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

export function TD({ children, style, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      style={{
        padding: '12px',
        color: 'var(--text-strong)',
        borderBottom: '1px solid var(--border)',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export interface TableWrapperProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function TableWrapper({ children, style }: TableWrapperProps) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}
