import { useEffect } from 'react';
import { Breadcrumbs } from './components/Breadcrumbs';
import { CommandPalette } from './components/CommandPalette';
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
  const { state, vm } = useView();

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

  const known = vm.isHome || vm.isTopo || vm.isPower || vm.isList || vm.isObj;

  return (
    <div className="app">
      <TopBar vm={vm} />
      <div className="shell">
        <Sidebar vm={vm} expanded={state.side} />
        <main className="main">
          <Breadcrumbs crumbs={vm.crumbs} />
          {vm.isHome && <HomePage vm={vm} />}
          {vm.isTopo && <TopologyPage vm={vm} />}
          {vm.isPower && <PowerPage vm={vm} />}
          {vm.isList && <ListPage page={vm.page} />}
          {vm.isObj && <ObjectPage o={vm.o} rangeLabel={vm.rangeLabel} />}
          {!known && (
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
