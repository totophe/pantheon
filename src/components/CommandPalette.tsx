import type { ViewModel } from '../model/types';
import { Dot, SearchIcon } from './ui';

export function CommandPalette({ vm }: { vm: ViewModel }) {
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) vm.closePalette();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Search" className="palette">
        <div className="palette-head">
          <span className="muted"><SearchIcon size={16} /></span>
          <label>
            <span className="sr-only">Search</span>
            <input
              autoFocus
              value={vm.pq}
              onChange={vm.onPq}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && vm.results[0]) vm.results[0].go();
              }}
              placeholder="hermes, 10.30, vlan 70, gpu, k2so, atlas…"
            />
          </label>
          <button type="button" className="esc" onClick={vm.closePalette}>Esc</button>
        </div>
        <div className="palette-results">
          {vm.results.map((r) => (
            <button key={r.type + r.n} type="button" className="palette-row" onClick={r.go}>
              <span className="palette-type">{r.type}</span>
              <Dot color={r.c} size={7} />
              <span className="palette-name">{r.n}</span>
              <span className="palette-sub">{r.s}</span>
            </button>
          ))}
          {vm.noResults && <div className="palette-empty">No match.</div>}
        </div>
      </div>
    </div>
  );
}
