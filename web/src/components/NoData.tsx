import type { ViewModel } from '../model/types';

/** Shown instead of a page when no source has delivered any data. */
export function NoData({ vm }: { vm: ViewModel }) {
  return (
    <section className="card no-data">
      <h1>No data yet</h1>
      <p>No data source has delivered anything, so there is nothing to show. Data sources lists each source and its state.</p>
      <div className="no-data-actions">
        <button type="button" className="btn btn-md btn-primary" onClick={vm.goSources}>Data sources</button>
      </div>
    </section>
  );
}
