import { useMemo, useSyncExternalStore } from 'react';
import { api, type Snapshot } from '../api/client';
import { buildView } from './buildView';
import type { AppState, StoreLike, ViewModel } from './types';

const ROUTES = [
  'home', 'topology', 'sites', 'hosts', 'power', 'storage', 'network', 'edge', 'services',
  'guests', 'containers', 'alerts', 'protection', 'drift', 'updates', 'sources', 'notifications',
];

/** Below this width the sidebar is a full-width menu that closes after navigating. */
const narrow = window.matchMedia('(max-width: 720px)');

const initialState: AppState = {
  route: 'home', obj: null, tab: 'Overview', scope: 'all', range: '24 h', side: !narrow.matches, closed: {},
  bell: false, palette: false, pq: '', layer: 'all', gk: 'all', at: 'open', hwSel: null, price: null,
};

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

/**
 * UI state plus the latest snapshot from the server.
 *
 * The location (route / object / tab) is mirrored in the URL hash. The snapshot
 * is fetched again whenever the server reports a change or the time range moves.
 */
class Store {
  state: AppState = { ...initialState, ...fromHash(window.location.hash) };
  snapshot: Snapshot | null = null;
  /** Why the server could not be reached, if it could not. */
  error: string | null = null;

  private listeners = new Set<() => void>();
  private loading = false;
  private stale = false;
  private priceTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    window.addEventListener('hashchange', () => {
      const loc = fromHash(window.location.hash);
      if (toHash(loc) !== toHash(this.state)) {
        this.setState({ ...loc, bell: false, palette: false, pq: '', hwSel: null });
      }
    });
    // The event stream announces every change, including the current version on (re)connect.
    api.subscribe(() => void this.load());
    void this.load();
  }

  /** Fetch a fresh snapshot. Calls made while one is in flight collapse into a single follow-up. */
  load = async () => {
    if (this.loading) {
      this.stale = true;
      return;
    }
    this.loading = true;
    try {
      do {
        this.stale = false;
        const range = this.state.range;
        const snapshot = await api.snapshot(range);
        if (range === this.state.range) this.snapshot = snapshot;
        else this.stale = true;
        this.error = null;
      } while (this.stale);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
      this.emit();
    }
  };

  setState = (patch: Partial<AppState>) => {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    const hash = toHash(this.state);
    if (hash !== toHash(prev) && hash !== (window.location.hash || '#/')) {
      // A tab switch replaces the entry; moving to another page adds one.
      const sameObject = prev.route === this.state.route && prev.obj === this.state.obj;
      window.history[sameObject ? 'replaceState' : 'pushState'](null, '', hash);
    }
    if (this.state.range !== prev.range) void this.load();
    this.listeners.forEach((l) => l());
  };

  nav = (route: string, id?: string) => {
    this.setState({
      route, obj: id || null, tab: 'Overview', bell: false, palette: false, pq: '', hwSel: null,
      side: narrow.matches ? false : this.state.side,
    });
    window.scrollTo(0, 0);
  };

  // Changes go to the server; the event stream then brings the new snapshot.
  act = (key: string) => this.request(api.act(key));
  toggle = (group: string, key: string) => this.request(api.toggle(group, key));
  setPrice = (value: string) => {
    clearTimeout(this.priceTimer);
    this.priceTimer = setTimeout(() => this.request(api.setPrice(value)), 250);
  };

  private request(call: Promise<unknown>) {
    call.then(() => this.load(), (err) => {
      this.error = err instanceof Error ? err.message : String(err);
      this.emit();
    });
  }

  /** Re-render with a new state identity, so views derived from the snapshot recompute. */
  private emit() {
    this.state = { ...this.state };
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;
}

export const store = new Store();

/** The current state and, once the first snapshot has arrived, the view model derived from both. */
export function useView(): { state: AppState; vm: ViewModel | null; error: string | null } {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const vm = useMemo(() => (store.snapshot ? buildView(store as StoreLike) : null), [state]);
  return { state, vm, error: store.error };
}
