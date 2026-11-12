import type { ViewModel } from '../model/types';
import { Dot, Logo, SearchIcon, Segmented } from './ui';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({ vm }: { vm: ViewModel }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button type="button" className="icon-btn" onClick={vm.toggleSide} aria-label="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button type="button" className="brand" onClick={vm.goHome}>
          <Logo />
          <span>Pantheon</span>
        </button>
      </div>

      <Segmented label="Site scope" items={vm.scopes} inset />

      <button type="button" className="search-trigger" onClick={vm.openPalette}>
        <SearchIcon />
        <span>Search anything…</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div className="topbar-right">
        <Segmented label="Time range" items={vm.ranges} inset />
        <button type="button" className="sources-status" onClick={vm.goSources}>
          <Dot color={vm.srcDot} size={6} />
          {vm.srcLabel}
        </button>
        <button
          type="button"
          className="icon-btn bell"
          onClick={vm.toggleBell}
          aria-label={`Alerts, ${vm.bell.n} open`}
          aria-expanded={vm.bellOpen}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          {vm.bell.show && (
            <span className="badge bell-badge" style={{ background: vm.bell.c }}>{vm.bell.n}</span>
          )}
        </button>
      </div>

      {vm.bellOpen && (
        <div role="dialog" aria-label="Open alerts" className="bell-panel">
          <div className="bell-panel-head">
            <strong>Open alerts</strong>
            <button type="button" className="text-btn" onClick={vm.goAlerts}>Open inbox →</button>
          </div>
          {vm.bellEmpty && <div className="bell-empty">All clear.</div>}
          {vm.bellItems.map((a) => (
            <button key={a.title} type="button" className="bell-item" onClick={a.go}>
              <span className="sev-bar" style={{ background: a.c, height: 28 }} />
              <span className="stack">
                <span className="bell-item-title">{a.title}</span>
                <span className="bell-item-meta">{a.where} · {a.when}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
