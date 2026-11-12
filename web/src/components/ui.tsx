import type { CSSProperties, ReactNode } from 'react';
import type { ActionBtn, Seg, Tile } from '../model/types';

export function Dot({ color, size = 8, style }: { color: string; size?: number; style?: CSSProperties }) {
  return <span className="dot" style={{ width: size, height: size, background: color, ...style }} />;
}

/** Segmented control: one pressed option out of a few. */
export function Segmented({ label, items, inset, wrap }: { label: string; items: Seg[]; inset?: boolean; wrap?: boolean }) {
  return (
    <div role="group" aria-label={label} className={`seg${inset ? ' seg-inset' : ''}${wrap ? ' seg-wrap' : ''}`}>
      {items.map((s) => (
        <button key={s.label} type="button" aria-pressed={s.on} onClick={s.pick}>
          {s.dot && <Dot color={s.dot} size={7} />}
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        <span className="page-desc">{desc}</span>
      </div>
      {children}
    </div>
  );
}

export function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div key={t.l} className="tile">
          <span className="tile-label">{t.l}</span>
          <span className="tile-value" style={{ color: t.c }}>{t.v}</span>
          <span className="tile-label">{t.s}</span>
        </div>
      ))}
    </div>
  );
}

/** Button whose emphasis (primary / secondary) is decided by the view model. */
export function Action({ a, size = 'md' }: { a: ActionBtn; size?: 'sm' | 'md' }) {
  return (
    <button type="button" className={`btn btn-${size}`} onClick={a.fn} style={{ background: a.bg, color: a.fg, borderColor: a.bd }}>
      {a.l}
    </button>
  );
}

/** Underlined in-app link rendered as a button. */
export function LinkButton({ onClick, children, className = '' }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`link-btn ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

const BLADES = 'M20 16C18 8 22 3 27 5c-1 5-3 8-7 11zM24 20c8-2 13 2 11 7-5-1-8-3-11-7zM20 24c2 8-2 13-7 11 1-5 3-8 7-11zM16 20c-8 2-13-2-11-7 5 1 8 3 11 7z';

export function FanIcon({ size, duration, housing }: { size: number | string; duration: string; housing?: boolean }) {
  return (
    <svg className="fan" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ animationDuration: duration }}>
      {housing && <circle cx="20" cy="20" r="18" fill="#12161C" stroke="#2A313C" />}
      <circle cx="20" cy="20" r="4" fill="#9AA4B2" />
      <path d={BLADES} fill="#5C6878" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" stroke="#4C9AFF" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9 13 3l10 6" />
      <path d="M3 23h20" />
      <path d="M6 11v9M11 11v9M15 11v9M20 11v9" />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
