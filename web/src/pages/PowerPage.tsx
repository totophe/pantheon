import { Dot, LinkButton, PageHeader, Tiles } from '../components/ui';
import type { ViewModel } from '../model/types';

export function PowerPage({ vm }: { vm: ViewModel }) {
  const { pw } = vm;
  return (
    <div className="page">
      <PageHeader title="Power" desc="Every watt: where it comes from, where it goes, and how we know">
        <label className="tariff">
          Your tariff €/kWh
          <input type="text" inputMode="decimal" value={pw.price} onChange={pw.onPrice} />
        </label>
      </PageHeader>

      {pw.banner && (
        <div role="status" className="banner-crit">
          <strong>Mains lost.</strong> {pw.banner}
        </div>
      )}

      <Tiles tiles={pw.tiles} />

      <section aria-label="Where the watts go" className="section">
        <h2>Where the watts go</h2>
        <div className="watt-stack">
          {pw.stack.map((s) => <span key={s.t} title={s.t} style={{ width: s.w, background: s.c }} />)}
        </div>
        <div className="branch-grid">
          {pw.branches.map((b) => (
            <div key={b.t} className="card card-flush">
              <div className="branch-head">
                <span className="swatch" style={{ background: b.c }} />
                <span className="branch-title">
                  {b.hasGo ? <LinkButton onClick={b.go} className="strong">{b.t}</LinkButton> : <strong>{b.t}</strong>}
                  <span className="branch-sub">{b.sub}</span>
                </span>
                <span className="branch-total mono" style={{ color: b.tc }}>{b.total}</span>
              </div>
              {b.rows.map((r) => (
                <div key={r.name} className="branch-row" style={{ opacity: r.op }}>
                  <span className="name-cell">
                    <Dot color={r.dot} size={7} />
                    {r.hasGo ? <LinkButton onClick={r.go} className="ellipsis">{r.name}</LinkButton> : <span>{r.name}</span>}
                  </span>
                  <span className="track track-8"><span style={{ width: r.share, background: b.c }} /></span>
                  <span className="mono right" style={{ color: r.wc }}>{r.wTxt}</span>
                  <span className="chip chip-end" style={{ background: r.srcBg, color: r.srcC }}>{r.src}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Consumption over time" className="card">
        <div className="chart-head">
          <h2>Consumption · {vm.rangeLabel}</h2>
          <span className="chart-legend">
            {pw.legend.map((l) => (
              <span key={l.label}><span className="swatch-sm" style={{ background: l.c }} />{l.label}</span>
            ))}
          </span>
        </div>
        <div role="img" aria-label="Power draw per period, stacked by branch" className="power-bars">
          {pw.bars.map((b, i) => (
            <span key={i}>
              <span className="bar-ups" style={{ height: b.u }} />
              <span className="bar-wall" style={{ height: b.w }} />
              <span className="bar-siteb" style={{ height: b.s }} />
            </span>
          ))}
        </div>
        <div className="chart-axis"><span>{pw.from}</span><span>peak {pw.peak}</span><span>now</span></div>
      </section>

      <div className="insight-grid">
        {pw.insights.map((i) => (
          <section key={i.t} className="card insight" style={{ borderColor: i.bd }}>
            <strong>{i.t}</strong>
            <p>{i.text}</p>
            {i.hasBtn && (
              <button type="button" className="btn btn-card" onClick={i.fn} style={{ background: i.bg, color: i.fg, borderColor: i.bdb }}>{i.btn}</button>
            )}
          </section>
        ))}
      </div>

      <section aria-label="How we measure" className="card card-flush">
        <div className="card-head">
          <h2>How we measure</h2>
          <button type="button" className="text-btn" onClick={vm.goSources}>Data sources →</button>
        </div>
        {pw.methods.map((m) => (
          <div key={m.t} className="method-row">
            <span><span className="chip" style={{ background: m.bg, color: m.c }}>{m.t}</span></span>
            <span className="text-2">{m.d}</span>
            <span className="meta right">{m.acc}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
