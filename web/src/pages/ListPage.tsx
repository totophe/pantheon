import { Action, Dot, LinkButton, PageHeader, Segmented, Tiles } from '../components/ui';
import type { ListPageVM, Table } from '../model/types';

function DataTable({ tb }: { tb: Table }) {
  const columns = { gridTemplateColumns: tb.grid };
  return (
    <section className="card card-flush">
      {tb.hasTitle && (
        <div className="card-head">
          <h2>{tb.title}</h2>
          <span className="meta">{tb.count}</span>
        </div>
      )}
      <div className="table-scroll">
        <div role="table" aria-label={tb.title || undefined} style={{ minWidth: tb.minW }}>
          <div role="row" className="table-head" style={columns}>
            {tb.cols.map((h, i) => <span key={i} role="columnheader">{h}</span>)}
          </div>
          {tb.empty && <div className="table-empty">Nothing here for this scope.</div>}
          {tb.rows.map((r, i) => (
            <div key={i} role="row" className="table-row" style={{ ...columns, opacity: r.op }}>
              <span role="cell" className="name-cell">
                <Dot color={r.dot} />
                {r.hasGo ? <LinkButton onClick={r.go} className="ellipsis medium">{r.name}</LinkButton> : <span className="medium">{r.name}</span>}
              </span>
              {r.cells.map((x, j) => (
                <span key={j} role="cell" className="ellipsis" title={x.t} style={{ color: x.c, fontFamily: x.ff, fontSize: x.fs }}>{x.t}</span>
              ))}
              {tb.hasActions && (
                <span role="cell" className="row-actions">
                  {r.actions.map((a) => <Action key={a.l} a={a} size="sm" />)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ListPage({ page }: { page: ListPageVM }) {
  return (
    <div className="page">
      <PageHeader title={page.title} desc={page.desc}>
        {page.hasChips && <Segmented label="Filter" items={page.chips} wrap />}
      </PageHeader>
      {page.hasTiles && <Tiles tiles={page.tiles} />}
      {page.hasProgress && (
        <div className="progress-card">
          <div className="progress-labels"><span>{page.progLabel}</span><span>{page.progPct}</span></div>
          <div className="track track-6" role="progressbar" aria-label={page.progLabel} aria-valuenow={parseInt(page.progPct ?? '0', 10)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: page.progPct, background: '#3FC4B0' }} />
          </div>
        </div>
      )}
      {page.tables.map((tb, i) => <DataTable key={i} tb={tb} />)}
    </div>
  );
}
