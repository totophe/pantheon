import { Dot, PageHeader } from '../components/ui';
import type { ViewModel } from '../model/types';

export function HomePage({ vm }: { vm: ViewModel }) {
  return (
    <div className="page page-home">
      <PageHeader title="Overview" desc={vm.scopeLine}>
        <span className="overall-pill" style={{ color: vm.overall.c, background: vm.overall.tint }}>{vm.overall.label}</span>
      </PageHeader>

      <section aria-label="Needs attention" className="card card-flush">
        <div className="card-head card-head-lg">
          <h2>Needs attention</h2>
          <span className="meta">{vm.attentionN} items</span>
        </div>
        {vm.noAttention && <div className="attention-empty">Nothing needs you right now.</div>}
        {vm.attention.map((a) => (
          <div key={a.title} className="attention-row">
            <span className="sev-bar" style={{ background: a.c, height: 34 }} />
            <span className="attention-text">
              <span className="attention-title">{a.title}</span>
              <span className="meta">{a.domain} · {a.where} · {a.when}</span>
            </span>
            <button type="button" className="btn btn-row btn-secondary" onClick={a.go}>{a.action} →</button>
          </div>
        ))}
      </section>

      <section aria-label="Health by domain" className="section">
        <h2>Health by domain</h2>
        <div className="domain-grid">
          {vm.domains.map((d) => (
            <button key={d.t} type="button" className="domain-card" onClick={d.go}>
              <span className="domain-head">
                <Dot color={d.c} />
                <strong>{d.t}</strong>
                <span className="meta" style={{ color: d.c }}>{d.s}</span>
              </span>
              <span className="domain-stats">
                <span className="stat"><span className="stat-value">{d.v1}</span><span className="stat-label">{d.l1}</span></span>
                <span className="stat"><span className="stat-value">{d.v2}</span><span className="stat-label">{d.l2}</span></span>
              </span>
              <span className="meta">{d.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Recent changes" className="card changes">
        <h2>Recent changes · {vm.rangeLabel}</h2>
        {vm.changes.map((c) => (
          <div key={c.t + c.x} className="change-row">
            <span className="change-time">{c.t}</span>
            <span className="change-kind">{c.k}</span>
            <span style={{ color: c.c }}>{c.x}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
