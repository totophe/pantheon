import { useEffect } from 'react';
import { Breadcrumbs } from './components/Breadcrumbs';
import { CommandPalette } from './components/CommandPalette';
import { NoData } from './components/NoData';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PageHeader } from './components/ui';
import { store, useView } from './model/store';
import { HomePage } from './pages/HomePage';
import { ListPage } from './pages/ListPage';
import { ObjectPage } from './pages/ObjectPage';
import { PowerPage } from './pages/PowerPage';
import { TopologyPage } from './pages/TopologyPage';

export function App() {
  const { state, vm, error } = useView();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        store.setState({ palette: !store.state.palette, bell: false, pq: '' });
      } else if (e.key === 'Escape' && (store.state.palette || store.state.bell)) {
        store.setState({ palette: false, bell: false, pq: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!vm) {
    return (
      <div className="app">
        <main className="main">
          <section className="card no-data" role="status">
            <h1>{error ? 'Cannot reach the Pantheon server' : 'Loading…'}</h1>
            {error && <p>{error}. Check that the server is running, then try again.</p>}
            {error && <div><button type="button" className="btn btn-md btn-primary" onClick={() => void store.load()}>Try again</button></div>}
          </section>
        </main>
      </div>
    );
  }

  const known = vm.isHome || vm.isTopo || vm.isPower || vm.isList || vm.isObj;
  // Settings pages work without an inventory; everything else has nothing to show.
  const empty = vm.noData && state.route !== 'sources' && state.route !== 'notifications';

  return (
    <div className="app">
      <TopBar vm={vm} />
      <div className="shell">
        <Sidebar vm={vm} expanded={state.side} />
        <main className="main">
          {error && <div role="alert" className="banner-crit">The server is not answering ({error}). What you see may be out of date.</div>}
          <Breadcrumbs crumbs={vm.crumbs} />
          {empty && <NoData vm={vm} />}
          {!empty && vm.isHome && <HomePage vm={vm} />}
          {!empty && vm.isTopo && <TopologyPage vm={vm} />}
          {!empty && vm.isPower && <PowerPage vm={vm} />}
          {!empty && vm.isList && <ListPage page={vm.page} />}
          {!empty && vm.isObj && <ObjectPage o={vm.o} rangeLabel={vm.rangeLabel} />}
          {!empty && !known && (
            <div className="page">
              <PageHeader title="Not found" desc="Pantheon does not know this object." />
              <div><button type="button" className="btn btn-md btn-secondary" onClick={vm.goHome}>Back to overview</button></div>
            </div>
          )}
        </main>
      </div>
      {vm.paletteOpen && <CommandPalette vm={vm} />}
    </div>
  );
}
