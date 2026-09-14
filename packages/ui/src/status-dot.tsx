import type { CSSProperties } from 'react';

const tones = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  muted: 'var(--muted)',
} as const;

export function StatusDot(props: { tone: keyof typeof tones; label: string }) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text)',
    fontSize: 14,
  };
  const dot: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: tones[props.tone],
  };
  return (
    <span style={style}>
      <span style={dot} />
      {props.label}
    </span>
  );
}
