import type { ViewModel } from '../model/types';
import { Dot } from './ui';

export function Sidebar({ vm, expanded }: { vm: ViewModel; expanded: boolean }) {
  return (
    <nav aria-label="Sections" className={expanded ? 'sidebar' : 'sidebar sidebar-collapsed'} style={{ flexBasis: vm.sideW }}>
      {vm.groups.map((g) => (
        <div key={g.t} className="side-group">
          {g.showHead && (
            <button type="button" className="side-group-head" onClick={g.toggle} aria-expanded={g.open}>
              <span>{g.t}</span>
              <span aria-hidden="true">{g.chev}</span>
            </button>
          )}
          {g.open &&
            g.items.map((i) => (
              <button
                key={i.t}
                type="button"
                className="side-item"
                onClick={i.go}
                title={i.t}
                aria-label={expanded ? undefined : i.t}
                aria-current={i.cur === 'page' ? 'page' : undefined}
              >
                <span className="side-abbr">{i.ab}</span>
                {expanded && <span className="side-label">{i.t}</span>}
                {i.hasBadge && <span className="badge" style={{ background: i.bc }}>{i.badge}</span>}
                {i.hasDot && <Dot color={i.dot} size={7} />}
              </button>
            ))}
        </div>
      ))}
    </nav>
  );
}
