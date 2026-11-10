import type { ReactNode } from 'react';
import { Action, Dot, FanIcon } from '../components/ui';
import type { Card, ObjectVM, RefItem } from '../model/types';

function ListItem({ i }: { i: RefItem }) {
  const body = (
    <>
      <Dot color={i.c} />
      <span className="list-text">
        <span className={i.hasGo ? 'list-title underlined' : 'list-title'}>{i.t}</span>
        <span className="list-sub">{i.s}</span>
      </span>
      <span className="list-right" style={{ color: i.rc }}>{i.r}</span>
    </>
  );
  return i.hasGo ? (
    <button type="button" className="list-item" onClick={i.go}>{body}</button>
  ) : (
    <div className="list-item">{body}</div>
  );
}

function Board({ c }: { c: Card }) {
  const sel = c.sel!;
  return (
    <>
      <div className="board-legend">
        <span>{c.chassis} · click a part</span>
        <span className="heat-scale">cool<span />at threshold</span>
      </div>
      <div className="table-scroll">
        <div className="board">
          <span className="board-tag board-front">FRONT</span>
          <span className="board-tag board-rear">REAR</span>
          {c.comps!.map((p) =>
            p.isFan ? (
              <span key={p.label}>
                <button type="button" className="board-fan" onClick={p.pick} aria-label={p.label} style={{ left: p.x, top: p.y, width: p.s, height: p.s, borderColor: p.ring }}>
                  <FanIcon size="80%" duration={p.dur!} />
                </button>
                <span className="board-fan-value" style={{ left: p.x, top: p.ly, width: p.s }}>{p.val}</span>
              </span>
            ) : (
              <button
                key={p.label}
                type="button"
                className="board-part"
                onClick={p.pick}
                style={{ left: p.x, top: p.y, width: p.w, height: p.h, borderColor: p.border, background: p.fill, boxShadow: p.glow, flexDirection: p.dir, alignItems: p.align }}
              >
                <span className="board-part-label">{p.label}</span>
                <span className="board-part-value" style={{ color: p.vc }}>{p.val}</span>
              </button>
            ),
          )}
        </div>
      </div>
      <div className="board-selected" aria-live="polite">
        <strong>{sel.label}</strong>
        <span className="board-selected-value" style={{ color: sel.c }}>{sel.val}</span>
        <span className="meta">{sel.meta}</span>
        <span className="track track-6 board-selected-bar"><span style={{ width: sel.w, background: sel.c }} /></span>
      </div>
      {sel.hasNote && <p className="board-note">{sel.note}</p>}
    </>
  );
}

function CardBody({ c, rangeLabel }: { c: Card; rangeLabel: string }): ReactNode {
  const items = c.items ?? [];
  switch (c.type) {
    case 'kv':
      return (
        <dl className="kv">
          {items.map((i) => (
            <div key={i.k} className="kv-row">
              <dt>{i.k}</dt>
              <dd style={{ color: i.c }}>{i.v}</dd>
            </div>
          ))}
        </dl>
      );
    case 'bars':
      return items.map((i) => (
        <div key={i.l} className="meter">
          <div className="meter-labels">
            <span>{i.l}</span>
            <span className="meter-value" style={{ color: i.tc }}>{i.v}</span>
          </div>
          <div className="track track-6"><span style={{ width: i.w, background: i.c }} /></div>
        </div>
      ));
    case 'list':
      return <div className="list">{items.map((i: RefItem, n) => <ListItem key={n} i={i} />)}</div>;
    case 'chart':
      return (
        <>
          <div className="chart-value">
            <span style={{ color: c.vc }}>{c.v}</span>
            <span className="chart-range">{rangeLabel}</span>
          </div>
          <svg viewBox="0 0 300 80" width="100%" height="80" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2="300" y1={c.thrY} y2={c.thrY} stroke="#E3B341" strokeWidth="1" strokeDasharray="3 4" opacity={c.thrOp} />
            <polygon points={c.area} fill={c.lc} opacity="0.14" />
            <polyline points={c.pts} fill="none" stroke={c.lc} strokeWidth="1.8" />
          </svg>
        </>
      );
    case 'note':
      return <p className="note">{c.text}</p>;
    case 'fans':
      return (
        <div className="fans">
          {items.map((f) => (
            <div key={f.l} className="fan-item">
              <FanIcon size={44} duration={f.dur} housing />
              <span className="fan-rpm">{f.v}</span>
              <span className="fan-label">{f.l}</span>
            </div>
          ))}
        </div>
      );
    case 'board':
      return <Board c={c} />;
  }
}

export function ObjectPage({ o, rangeLabel }: { o: ObjectVM; rangeLabel: string }) {
  return (
    <div className="page">
      <div className="obj-head">
        <div className="obj-identity">
          <div className="obj-avatar">{o.ab}</div>
          <div className="obj-titles">
            <div className="obj-title-row">
              <h1>{o.name}</h1>
              <span className="pill pill-status" style={{ color: o.sc, background: o.stint }}>{o.status}</span>
              <span className="pill pill-type">{o.type}</span>
            </div>
            <span className="obj-sub">{o.sub}</span>
          </div>
        </div>
        <div className="obj-actions">
          {o.actions.map((a) => <Action key={a.l} a={a} />)}
        </div>
      </div>

      <div role="tablist" aria-label="Sections" className="tabs">
        {o.tabs.map((t) => (
          <button key={t.label} type="button" role="tab" aria-selected={t.on} onClick={t.pick}>{t.label}</button>
        ))}
      </div>

      <div className="obj-body">
        <div className="card-grid" role="tabpanel">
          {o.cards.map((c, n) => (
            <section key={(c.t ?? '') + n} className="card obj-card" style={{ gridColumn: c.gc, borderColor: c.bd }}>
              {c.hasTitle && <h2>{c.t}</h2>}
              <CardBody c={c} rangeLabel={rangeLabel} />
              {c.hasBtn && (
                <div><button type="button" className="btn btn-card btn-primary" onClick={c.btnFn}>{c.btnL}</button></div>
              )}
            </section>
          ))}
        </div>

        <aside aria-label="Relationships" className="card relationships">
          <h2>Relationships</h2>
          {o.noRel && <span className="meta">No known relationships.</span>}
          {o.rel.map((g) => (
            <div key={g.l} className="rel-group">
              <span className="rel-label">{g.l}</span>
              {g.items.map((i, n) => {
                const body = (
                  <>
                    <Dot color={i.c} size={7} />
                    <span className="rel-name">{i.t}</span>
                    <span className="rel-sub">{i.s}</span>
                  </>
                );
                return i.hasGo ? (
                  <button key={n} type="button" className="rel-item" onClick={i.go}>{body}</button>
                ) : (
                  <div key={n} className="rel-item">{body}</div>
                );
              })}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
