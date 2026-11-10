import type { ViewModel } from '../model/types';

/** Shown instead of a page when no source has delivered any data. */
export function NoData({ vm }: { vm: ViewModel }) {
  return (
    <section className="card no-data">
      <h1>No data yet</h1>
      <p>
        {vm.mock.on
          ? 'The mock datasets are empty.'
          : 'Mock data is off and no integration is connected, so there is nothing to show. Turn mock data back on to explore Pantheon with the demo home lab.'}
      </p>
      <div className="no-data-actions">
        {!vm.mock.on && <button type="button" className="btn btn-md btn-primary" onClick={vm.mock.toggle}>Use mock data</button>}
        <button type="button" className="btn btn-md btn-secondary" onClick={vm.goSources}>Data sources</button>
      </div>
    </section>
  );
}
