import { useMemo, useSyncExternalStore } from 'react';
import { buildView } from './buildView';
import type { AppState, StoreLike, ViewModel } from './types';

const ROUTES = [
  'home', 'topology', 'sites', 'hosts', 'power', 'storage', 'network', 'edge', 'services',
  'guests', 'containers', 'alerts', 'protection', 'drift', 'updates', 'sources', 'notifications',
];

const initialState: AppState = {
  route: 'home', obj: null, tab: 'Overview', scope: 'all', range: '24 h', side: true, closed: {},
  bell: false, palette: false, pq: '',
  acked: {}, silenced: {}, accepted: {}, off: {}, sched: {},
  notif: { ntfy: true, email: true, quiet: true, slack: false },
  k2soFixed: false, memFixed: false, sonarrFixed: false, rep: 'idle', pct: 0, layer: 'all',
  diag: 'idle', step: -1, gk: 'all', at: 'open', hwSel: null, onBatt: false, batt: 100, cap: false,
  price: '0.30',
};

/** Below this width the sidebar is a full-width menu that closes after navigating. */
const narrow = window.matchMedia('(max-width: 720px)');

type Location = Pick<AppState, 'route' | 'obj' | 'tab'>;

function toHash(s: Location): string {
  if (s.route === 'obj' && s.obj) {
    const tab = s.tab !== 'Overview' ? '/' + encodeURIComponent(s.tab) : '';
    return `#/o/${encodeURIComponent(s.obj)}${tab}`;
  }
  return s.route === 'home' ? '#/' : `#/${s.route}`;
}

function fromHash(hash: string): Location {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'o' && parts[1]) return { route: 'obj', obj: parts[1], tab: parts[2] || 'Overview' };
  return { route: ROUTES.includes(parts[0]) ? parts[0] : 'home', obj: null, tab: 'Overview' };
}

/** UI state container. The location (route / object / tab) is mirrored in the URL hash. */
class Store implements StoreLike {
  state: AppState = { ...initialState, side: !narrow.matches, ...fromHash(window.location.hash) };

  // Timer slots used by the simulated long-running actions in buildView().
  t?: ReturnType<typeof setTimeout>;
  iv?: ReturnType<typeof setInterval>;
  ivU?: ReturnType<typeof setInterval>;

  private listeners = new Set<() => void>();

  constructor() {
    window.addEventListener('hashchange', () => {
      const loc = fromHash(window.location.hash);
      if (toHash(loc) !== toHash(this.state)) {
        this.setState({ ...loc, bell: false, palette: false, pq: '', hwSel: null });
      }
    });
  }

  setState = (patch: Partial<AppState>) => {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    const hash = toHash(this.state);
    if (hash !== toHash(prev) && hash !== (window.location.hash || '#/')) {
      // A tab switch replaces the entry; moving to another page adds one.
      const sameObject = prev.route === this.state.route && prev.obj === this.state.obj;
      window.history[sameObject ? 'replaceState' : 'pushState'](null, '', hash);
    }
    this.listeners.forEach((l) => l());
  };

  nav = (route: string, id?: string) => {
    this.setState({
      route, obj: id || null, tab: 'Overview', bell: false, palette: false, pq: '', hwSel: null,
      side: narrow.matches ? false : this.state.side,
    });
    window.scrollTo(0, 0);
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;
}

export const store = new Store();

/** The current state and the view model derived from it. */
export function useView(): { state: AppState; vm: ViewModel } {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const vm = useMemo(() => buildView(store), [state]);
  return { state, vm };
}
