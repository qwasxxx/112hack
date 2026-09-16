import type { ReactNode } from 'react';

export function StatusBadge({ tone = 'neutral', children }: { tone?: 'good' | 'warning' | 'danger' | 'neutral' | 'accent'; children: ReactNode }) {
  return <span className={`td-badge td-badge--${tone}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="td-empty">{children}</div>;
}

export function MetricCard({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone?: 'accent' | 'danger' }) {
  return <article className={`td-metric ${tone ? `td-metric--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 240; const height = 70; const max = Math.max(...values); const min = Math.min(...values);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * width},${height - ((value - min) / Math.max(1, max - min)) * (height - 12) - 6}`).join(' ');
  return <svg className="td-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
