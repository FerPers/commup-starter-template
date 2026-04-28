import type { CSSProperties } from 'react';

export type SkeletonShape = 'line' | 'block' | 'circle';

export interface SkeletonProps {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function Skeleton({ shape = 'line', width, height, style }: SkeletonProps) {
  const base: CSSProperties = {
    background: 'linear-gradient(90deg, var(--gray-100) 0%, var(--gray-200) 50%, var(--gray-100) 100%)',
    backgroundSize: '200% 100%',
    animation: 'commup-shimmer 1.4s ease-in-out infinite',
    display: 'inline-block',
  };

  const shapeStyles: Record<SkeletonShape, CSSProperties> = {
    line:   { width: width ?? '100%', height: height ?? 12, borderRadius: 'var(--radius-sm)' },
    block:  { width: width ?? '100%', height: height ?? 80, borderRadius: 'var(--radius-md)' },
    circle: { width: width ?? 40, height: height ?? 40, borderRadius: '50%' },
  };

  return (
    <>
      <span aria-busy="true" aria-live="polite" style={{ ...base, ...shapeStyles[shape], ...style }} />
      <style>{'@keyframes commup-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>
    </>
  );
}

export interface SkeletonStackProps {
  rows?: number;
  gap?: number;
  lineHeight?: number;
  style?: CSSProperties;
}

export function SkeletonStack({ rows = 3, gap = 8, lineHeight = 12, style }: SkeletonStackProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} shape="line" height={lineHeight} width={i === rows - 1 ? '70%' : '100%'} />
      ))}
    </div>
  );
}
