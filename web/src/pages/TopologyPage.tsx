import { Dot, PageHeader, Segmented } from '../components/ui';
import type { TopoNode, ViewModel } from '../model/types';

function box(n: TopoNode) {
  return { left: n.x, top: n.y, width: n.w, height: n.h, background: n.bg, opacity: n.op };
}

function Node({ n }: { n: TopoNode }) {
  if (n.isGroup) {
    return (
      <div className="topo-node topo-group" style={box(n)}>
        <button type="button" className="topo-group-head" onClick={n.go}>
          <Dot color={n.dot} />
          {n.name}
          <span className="topo-group-sub">{n.sub}</span>
        </button>
        {n.vps?.map((v) => (
          <button key={v.n} type="button" className="topo-vps" onClick={v.go}>
            <Dot color={v.c} size={6} />
            <span className="mono">{v.n}</span>
            <span className="topo-vps-target">{v.t}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <button type="button" className="topo-node topo-btn" onClick={n.go} style={{ ...box(n), borderStyle: n.bs, justifyContent: n.jc }}>
      <span className="topo-name">
        <Dot color={n.dot} style={{ border: n.dotB }} />
        {n.name}
      </span>
      <span className="topo-sub">{n.sub}</span>
      {n.bars.map((b) => (
        <span key={b.l} className="topo-bar">
          <span className="topo-bar-label">{b.l}</span>
          <span className="track track-4"><span style={{ width: b.w, background: b.c }} /></span>
          <span className="topo-bar-value" style={{ color: b.tc }}>{b.v}</span>
        </span>
      ))}
    </button>
  );
}

export function TopologyPage({ vm }: { vm: ViewModel }) {
  const { topo } = vm;
  return (
    <div className="page page-tight">
      <PageHeader title="Topology" desc={`${topo.sub} · click anything to open it`}>
        <Segmented label="Layer" items={vm.layers} />
      </PageHeader>

      <div className="topo-frame">
        <div className="topo-canvas" style={{ height: topo.h }}>
          {topo.lines.map((l, i) => (
            <div key={i} className="topo-line" style={{ left: l.x, top: l.y, width: l.w, height: l.h, background: l.bg, borderTop: l.bt, borderLeft: l.bl }} />
          ))}
          {topo.pills.map((p) => (
            <span key={p.t} className="topo-pill" style={{ left: p.x, top: p.y, color: p.c, borderColor: p.b }}>{p.t}</span>
          ))}
          {topo.nodes.map((n) => <Node key={n.name} n={n} />)}
        </div>
      </div>

      <div className="legend">
        <span><span className="legend-solid" />Physical</span>
        <span><span className="legend-dash" style={{ borderColor: '#3E6CA8' }} />Edge tunnel</span>
        <span><span className="legend-dash" style={{ borderColor: '#A371F7' }} />Site Magic</span>
        <span><span className="legend-dash" style={{ borderColor: '#3FC4B0' }} />Data flow</span>
      </div>
    </div>
  );
}
