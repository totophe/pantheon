/**
 * View model for the Pantheon UI.
 *
 * Turns the server's snapshot (`self.snapshot`, from GET /api/snapshot) and the
 * UI state into everything the React components render. The snapshot is
 * semantic (objects, sections, levels); colours, sizes and layout are decided
 * here. Static theme colours live in src/styles.css.
 *
 * `self` is the store (src/model/store.ts): `self.state`, `self.setState()`,
 * `self.nav()`, and the calls that change things on the server: `self.act()`,
 * `self.toggle()`, `self.setPrice()`, `self.sync()`.
 */
export function buildView(self) {
    var st = self.state;
    var OK = '#3FB950', WARN = '#E3B341', CRIT = '#F85149', MUTE = '#9AA4B2', INFO = '#7DB4FF', TXT = '#E6EAF0';
    var LINK = '#3A4350', TUN = '#3E6CA8', SM = '#A371F7', FLOW = '#3FC4B0';
    var ST = { ok: ['Healthy', OK], warn: ['Warning', WARN], crit: ['Critical', CRIT], plan: ['Planned', MUTE], off: ['Stopped', MUTE], info: ['Info', INFO] };
    var go = function (id) { return function () { self.nav('obj', id); }; };
    var to = function (r) { return function () { self.nav(r); }; };
    var full = '1 / -1', one = 'auto';
    var LV = { ok: OK, warn: WARN, crit: CRIT, info: INFO, mute: MUTE, text: TXT };
    var lv = function (x) { return LV[x] || x; };
    var TONE = { warn: '#5A4A1F', crit: '#6B2A2A', ok: '#2F5A3A' };

    // ---------- card builders ----------
    var barColor = function (p, w, c) { return p >= (c || 95) ? CRIT : (p >= (w || 80) ? WARN : OK); };
    var kv = function (t, pairs, gc) { return { type: 'kv', t: t, gc: gc || one, items: pairs.map(function (p) { return { k: p[0], v: p[1], c: lv(p[2]) || TXT }; }) }; };
    var bars = function (t, arr, gc) { return { type: 'bars', t: t, gc: gc || one, items: arr.map(function (b) { var c = lv(b[3]) || barColor(b[1]); return { l: b[0], w: Math.min(100, b[1]) + '%', v: b[2] || (b[1] + '%'), c: c, tc: c === OK ? TXT : c }; }) }; };
    var temps = function (t, arr, gc) { return { type: 'bars', t: t, gc: gc || one, items: arr.map(function (b) { var c = b[1] >= b[3] ? CRIT : (b[1] >= b[2] ? WARN : (b[1] / b[2] < 0.68 ? '#2E7DD1' : OK)); return { l: b[0], w: Math.min(100, Math.round(b[1] / b[3] * 100)) + '%', v: b[1] + ' °C', c: c, tc: c === WARN || c === CRIT ? c : TXT }; }) }; };
    var list = function (t, items, gc) { return { type: 'list', t: t, gc: gc || one, items: items }; };
    var chart = function (s) {
      var y = function (v) { return (80 - v / s.max * 76).toFixed(1); };
      var pts = s.values.map(function (v, i) { return (i * 10) + ',' + y(v); });
      var c = s.warn && s.value >= s.warn ? WARN : '#7DB4FF';
      return { type: 'chart', t: s.t, v: s.value + s.unit, vc: c === WARN ? WARN : TXT, lc: c, pts: pts.join(' '), area: '0,80 ' + pts.join(' ') + ' 300,80', thrY: s.warn ? y(s.warn) : 0, thrOp: s.warn ? '1' : '0', gc: one };
    };
    var fans = function (t, arr) { return { type: 'fans', t: t, gc: one, items: arr.map(function (f) { return { l: f[0], v: f[1] + ' rpm', dur: (Math.max(0.12, 300 / f[1])).toFixed(2) + 's' }; }) }; };

    // ---------- snapshot ----------
    var inv = self.snapshot;
    var act = function (key) { return function () { self.act(key); }; };
    var toggle = function (group, key) { return function () { self.toggle(group, key); }; };
    var scopeId = inv.scopes.some(function (s) { return s.id === st.scope; }) ? st.scope : 'all';

    // Sections arrive semantic; this decides how each kind looks.
    var present = function (s) {
      var gc = s.wide ? full : one, c;
      if (s.type === 'kv') return kv(s.t, s.items.map(function (i) { return [i.k, i.v, i.lv]; }), gc);
      if (s.type === 'bars') return bars(s.t, s.items.map(function (i) { return [i.l, i.pct, i.text, i.lv]; }), gc);
      if (s.type === 'temps') return temps(s.t, s.items.map(function (i) { return [i.l, i.t, i.warn, i.crit]; }), gc);
      if (s.type === 'list') { c = list(s.t, s.items, gc); c.btn = s.action; return c; }
      if (s.type === 'note') return { type: 'note', t: s.t, text: s.text, gc: full, bd: TONE[s.tone] || '#2A313C', btn: s.action };
      if (s.type === 'fans') return fans(s.t, s.items.map(function (i) { return [i.l, i.rpm]; }));
      if (s.type === 'chart') return chart(s);
      return { type: 'board', t: s.t, layout: s.layout, gc: full };
    };

    // ---------- object registry ----------
    var O = {};
    inv.objects.forEach(function (o) {
      var tabs = {};
      o.tabs.forEach(function (t) { tabs[t.name] = t.sections.map(present); });
      O[o.id] = Object.assign({}, o, { tabs: tabs, rel: o.rel.map(function (g) { return [g.label, g.items]; }) });
    });
    var stOf = function (k) { return ST[k]; };
    var noData = inv.objects.length === 0;

    // ---------- resolve references ----------
    var resolve = function (it) {
      if (it.ref) {
        var o = O[it.ref];
        if (!o) return { t: it.ref, s: it.s, r: it.r, rc: lv(it.rc) || MUTE, c: MUTE, hasGo: false, noGo: true };
        var c = stOf(o.st)[1];
        return { t: o.name, s: it.s || o.type, r: it.r || (o.st === 'ok' ? '' : stOf(o.st)[0]), rc: lv(it.rc) || (o.st === 'ok' ? MUTE : c), c: c, hasGo: true, noGo: false, go: go(it.ref) };
      }
      return { t: it.t, s: it.s, r: it.r, rc: lv(it.rc) || MUTE, c: lv(it.c) || OK, hasGo: false, noGo: true };
    };

    // ---------- alerts ----------
    var ALERTS = inv.alerts;
    var SEVC = { crit: CRIT, warn: WARN, info: INFO };
    var aState = function (a) { return a.state; };
    var openAlerts = ALERTS.filter(function (a) { return aState(a) === 'open' && a.sev !== 'info'; });
    var nCrit = openAlerts.filter(function (a) { return a.sev === 'crit'; }).length;
    var bell = { show: openAlerts.length > 0, n: String(openAlerts.length), c: nCrit ? CRIT : WARN };
    var goAlert = function (a) { return function () { self.setState({ route: 'obj', obj: a.obj, tab: a.tab || 'Overview', bell: false, palette: false }); }; };

    // ---------- drift ----------
    var DRIFT = inv.cmdb ? inv.cmdb.drift : [];
    var openDrift = DRIFT.filter(function (d) { return !d.accepted; });

    // ---------- scope filter ----------
    var inScope = function (o) { return scopeId === 'all' || o.site === scopeId; };

    // ---------- tables ----------
    var cell = function (t, c, mono) { return { t: t, c: c || '#C9D1DB', ff: mono ? "'JetBrains Mono', monospace" : 'inherit', fs: mono ? '12px' : '13px' }; };
    var btn = function (l, fn, primary) { return { l: l, fn: fn, bg: primary ? '#4C9AFF' : '#161B22', fg: primary ? '#0E1116' : TXT, bd: primary ? '#4C9AFF' : '#2A313C' }; };
    var table = function (title, cols, grid, rows, minW) {
      return { title: title || '', hasTitle: !!title, count: rows.length + ' items', cols: cols, grid: grid, rows: rows, empty: rows.length === 0, minW: minW || '640px', hasActions: rows.some(function (r) { return r.actions && r.actions.length; }) };
    };
    var row = function (id, cells, extra) {
      extra = extra || {};
      var o = O[id];
      return { name: extra.name || (o ? o.name : id), dot: extra.dot || (o ? stOf(o.st)[1] : MUTE), hasGo: !!o && !extra.noGo, noGo: !o || !!extra.noGo, go: o ? go(id) : function () {}, cells: cells, actions: extra.actions || [], op: extra.op || '1' };
    };
    var objsOf = function (types) { return Object.keys(O).filter(function (k) { return types.indexOf(O[k].type) >= 0 && inScope(O[k]); }); };
    var chipsFor = function (key, opts) { return opts.map(function (x) { var on = st[key] === x[0]; return { label: x[1], on: on, bg: on ? '#232B36' : 'transparent', fg: on ? TXT : MUTE, pick: function () { var s2 = {}; s2[key] = x[0]; self.setState(s2); } }; }); };

    var siteName = function (site) { var k = Object.keys(O).filter(function (id) { return O[id].type === 'Site' && O[id].site === site; })[0]; return k ? O[k].name : site; };
    var tileOf = function (t) { return { l: t.l, v: t.v, c: lv(t.lv), s: t.s }; };
    var PAGES = {
      sites: function () { return { title: 'Sites & WAN', desc: 'Every location and its uplinks', tables: [table('', ['Site', 'Gateway', 'Internet', 'Link to home', 'Status'], 'minmax(140px,1.2fr) 1fr 1.4fr 1fr 0.8fr',
        objsOf(['Site']).map(function (k) { var t = O[k].table; return row(k, [cell(t.gateway), cell(t.internet, lv(t.internetLv) || null), cell(t.link), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); }))] }; },
      hosts: function () { return { title: 'Hosts', desc: 'Physical machines across sites', tables: [table('', ['Host', 'Role', 'Site', 'Key metric', 'Status'], 'minmax(140px,1fr) 1.6fr 0.8fr 1.2fr 0.8fr',
        objsOf(['Host']).map(function (k) {
          var o = O[k], c0 = o.tabs.Overview[0], km = '—', kc = null;
          if (c0.type === 'bars') { var it = c0.items[c0.items.length > 1 ? 1 : 0]; km = it.l + ' · ' + it.v; kc = it.c === OK ? null : it.c; }
          return row(k, [cell(o.sub.split(' · ').slice(1, 3).join(' · ')), cell(siteName(o.site)), cell(km, kc, true), cell(stOf(o.st)[0], stOf(o.st)[1])], { op: o.st === 'plan' ? '0.6' : '1' });
        }))] }; },
      storage: function () { return { title: 'Storage', desc: 'Pools, volumes and where the data goes', tiles: inv.storage.tiles.map(tileOf),
        tables: [table('Pools & volumes', ['Pool', 'Host', 'Used', 'Status'], 'minmax(140px,1fr) 1fr 1fr 0.8fr', inv.storage.volumes.filter(function (v) { return scopeId === 'all' || v.site === scopeId; }).map(function (v) {
          return row(v.obj, [cell(v.host), cell(v.used, lv(v.usedLv) || null, true), cell(v.status, lv(v.statusLv))], v.name ? { name: v.name } : {});
        }))] }; },
      network: function () { return { title: 'Network', desc: 'Gateways, switches, VLANs and policy', tables: [
        table('Devices', ['Device', 'Role', 'Site', 'Status'], 'minmax(160px,1fr) 1.6fr 0.8fr 0.8fr', objsOf(['Network device']).map(function (k) { return row(k, [cell(O[k].sub), cell(siteName(O[k].site)), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); })),
        table('VLANs', ['VLAN', 'Subnet · zone', 'Members', 'Status'], 'minmax(180px,1.2fr) 1.4fr 0.6fr 0.8fr', objsOf(['VLAN']).map(function (k) { return row(k, [cell(O[k].sub, null, true), cell(String(O[k].tabs.Members[0].items.length)), cell(O[k].st === 'warn' ? 'Drift' : 'In sync', O[k].st === 'warn' ? WARN : OK)]); }))] }; },
      edge: function () { return { title: 'Edge & cloud', desc: 'Providers, their VPS, and where each tunnel lands', tables: [
        table('Providers', ['Provider', 'Details', 'Status'], 'minmax(160px,1fr) 2fr 0.8fr', objsOf(['Provider']).map(function (k) { return row(k, [cell(O[k].sub), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); })),
        table('VPS & tunnels', ['VPS', 'Provider', 'Role', 'Lands on', 'Status'], 'minmax(140px,1fr) 0.9fr 1.2fr 1.2fr 0.8fr', objsOf(['VPS']).map(function (k) { var o = O[k]; var p = o.sub.split(' · '); return row(k, [cell(O[o.prov].name), cell(p[1].split(' → ')[0]), cell(p[1].split(' → ')[1] || '', null, true), cell(stOf(o.st)[0], stOf(o.st)[1])]); }), '760px')] }; },
      services: function () { return { title: 'Services', desc: 'What you actually care about, built from its components', tables: [table('', ['Service', 'What it is', 'Components', 'Status'], 'minmax(150px,1fr) 2fr 0.7fr 0.8fr',
        objsOf(['Service']).map(function (k) { var o = O[k]; return row(k, [cell(o.sub), cell(String(o.tabs.Overview[0].items.length)), cell(stOf(o.st)[0], stOf(o.st)[1])]); }))] }; },
      guests: function () { return { title: 'VMs & LXCs', desc: 'Every guest across hosts', hasChips: true, chips: chipsFor('gk', [['all', 'All'], ['VM', 'VMs'], ['LXC', 'LXCs'], ['issues', 'Issues']]),
        tables: [table('', ['Name', 'Type', 'Host', 'Address', 'Role', 'Status'], 'minmax(130px,1fr) 0.5fr 0.9fr 1fr 1.4fr 0.8fr',
          objsOf(['VM', 'LXC']).filter(function (k) { return st.gk === 'all' || (st.gk === 'issues' ? O[k].st === 'warn' || O[k].st === 'crit' : O[k].type === st.gk); }).map(function (k) { var o = O[k]; return row(k, [cell(o.type), cell(O[o.host].name), cell(o.ip, null, true), cell(o.sub.split(' · ').pop()), cell(stOf(o.st)[0], stOf(o.st)[1])], { op: o.st === 'off' ? '0.6' : '1' }); }), '820px')] }; },
      containers: function () { return { title: 'Containers', desc: 'All containers in all guests', tables: [table('', ['Container', 'Image', 'In', 'State', 'Status'], 'minmax(140px,1fr) 1.6fr 0.8fr 1fr 0.8fr',
        objsOf(['Container']).map(function (k) { var o = O[k]; var ov = o.tabs.Overview[0].items; return row(k, [cell(ov[0].v, null, true), cell(o.sub.split(' in ')[1]), cell(ov[1].v, ov[1].c), cell(stOf(o.st)[0], stOf(o.st)[1])]); }), '780px')] }; },
      alerts: function () {
        var rows = ALERTS.filter(function (a) { var s = aState(a); return st.at === 'open' ? s === 'open' : (st.at === 'handled' ? s === 'acked' || s === 'silenced' : s === 'resolved'); }).map(function (a) {
          var s = aState(a);
          return { name: a.title, dot: SEVC[a.sev], hasGo: true, noGo: false, go: goAlert(a), op: s === 'open' ? '1' : '0.7',
            cells: [cell(a.where), cell(a.sev.toUpperCase(), SEVC[a.sev]), cell(s === 'resolved' ? 'resolved' : a.when, s === 'resolved' ? OK : null)],
            actions: s === 'resolved' ? [] : [btn(a.acked ? 'Unack' : 'Ack', toggle('acked', a.id)), btn(a.silenced ? 'Unsilence' : 'Silence 1 h', toggle('silenced', a.id))] };
        });
        return { title: 'Alerts', desc: 'Click an alert to open the affected object', hasChips: true, chips: chipsFor('at', [['open', 'Open'], ['handled', 'Acked / silenced'], ['resolved', 'Resolved']]),
          tables: [table('', ['Alert', 'Where', 'Severity', 'Since', ''], 'minmax(220px,1.6fr) 1.2fr 0.6fr 0.6fr 1.2fr', rows, '820px')] };
      },
      protection: function () {
        var B = inv.backups;
        return { title: 'Data protection', desc: 'Backups, snapshots and offsite copies', tiles: B.tiles.map(tileOf),
          hasProgress: !!B.progress, progLabel: B.progress ? B.progress.label : '', progPct: (B.progress ? B.progress.pct : 0) + '%',
          tables: [table('Jobs & flows', ['Job', 'Target', 'Schedule', 'Last run', ''], 'minmax(200px,1.4fr) 1.4fr 0.8fr 1fr 0.8fr', B.jobs.map(function (j) {
            return { name: j.name, dot: OK, hasGo: !!O[j.obj], noGo: !O[j.obj], go: go(j.obj), cells: [cell(j.target), cell(j.schedule), cell(j.last, OK)], actions: j.action ? [btn(B.running ? 'Running…' : 'Run now', act(j.action), true)] : [], op: '1' };
          }), '860px')] };
      },
      drift: function () {
        return { title: 'Drift & CMDB', desc: 'Where reality differs from NetBox', tiles: [{ l: 'Objects in NetBox', v: inv.cmdb ? inv.cmdb.objectCount : '—', c: TXT, s: inv.cmdb ? inv.cmdb.synced : 'not connected' }, { l: 'Differences', v: String(openDrift.length), c: openDrift.length ? WARN : OK, s: openDrift.length ? 'review below' : 'all in sync' }],
          tables: [table('', ['Object', 'Field', 'NetBox', 'Observed', ''], 'minmax(120px,0.8fr) 1.4fr 0.8fr 1fr 1.2fr', DRIFT.map(function (d) {
            var done = d.accepted;
            return row(d.obj, [cell(d.field), cell(done ? d.observed : d.declared, null, true), cell(d.observed, done ? OK : WARN, true)], { dot: done ? OK : WARN, actions: done ? [] : [btn('Accept observed', act('accept:' + d.obj), true)], op: done ? '0.6' : '1' });
          }), '820px')] };
      },
      updates: function () {
        return { title: 'Updates & maintenance', desc: 'Pending updates and maintenance windows', tables: [table('', ['Object', 'Update', 'Source', ''], 'minmax(130px,0.8fr) 1.6fr 0.8fr 1.4fr', inv.updates.filter(function (u) { return inScope(O[u.obj]); }).map(function (u) {
          return row(u.obj, [cell(u.what), cell(u.source)], { actions: [btn(u.scheduled ? 'Scheduled · Sun 03:00' : 'Schedule for Sun 03:00', toggle('sched', u.obj), !u.scheduled)] });
        }), '720px')] };
      },
      sources: function () {
        var DOT = { ok: OK, warn: WARN, error: CRIT, disconnected: MUTE };
        return { title: 'Data sources', desc: 'Everything Pantheon reads from', tables: [table('', ['Source', 'Covers', 'Polls every', 'Data', 'Last poll', ''], 'minmax(170px,1fr) 1.5fr 0.6fr 0.5fr 1.7fr 1fr', inv.sources.map(function (s) {
          var live = s.mode === 'live', bad = s.health === 'error' || s.health === 'warn';
          return { name: s.name, dot: s.paused ? MUTE : DOT[s.health], hasGo: false, noGo: true, go: function () {}, op: s.paused ? '0.55' : '1',
            cells: [cell(s.covers, !live && s.health === 'warn' ? WARN : null), cell(s.paused ? 'paused' : s.sync), cell(live ? 'Live' : 'Mock'),
              cell(s.detail || '—', live && bad ? DOT[s.health] : (s.detail ? null : MUTE))],
            actions: (s.canSync ? [btn('Sync now', function () { self.sync(s.id); }, s.health !== 'ok')] : []).concat([btn(s.paused ? 'Resume' : 'Pause', toggle('off', s.id))]) };
        }), '1040px')] };
      },
      notifications: function () {
        return { title: 'Notifications', desc: 'Where alerts go', tables: [table('', ['Channel', 'Sends', ''], 'minmax(200px,1.4fr) 1fr 0.8fr', inv.notifications.map(function (n) {
          return { name: n.name, dot: n.on ? OK : MUTE, hasGo: false, noGo: true, go: function () {}, op: n.on ? '1' : '0.6', cells: [cell(n.sends)],
            actions: [btn(n.on ? 'On' : 'Off', toggle('notif', n.id), n.on)] };
        }), '600px')] };
      }
    };
    var PAGE_LABEL = { home: 'Home', topology: 'Topology', sites: 'Sites & WAN', hosts: 'Hosts', power: 'Power', storage: 'Storage', network: 'Network', edge: 'Edge & cloud', services: 'Services', guests: 'VMs & LXCs', containers: 'Containers', alerts: 'Alerts', protection: 'Data protection', drift: 'Drift & CMDB', updates: 'Updates', sources: 'Data sources', notifications: 'Notifications' };
    var SECTION = { Site: 'sites', Host: 'hosts', 'Network device': 'network', VLAN: 'network', Pool: 'storage', VM: 'guests', LXC: 'guests', Container: 'containers', Provider: 'edge', VPS: 'edge', Service: 'services', UPS: 'power' };

    // ---------- current object ----------
    var route = st.route;
    var oVals = { tabs: [], cards: [], actions: [], rel: [], noRel: true };
    var crumbs = [{ t: 'Home', go: to('home') }];
    if (route === 'obj' && O[st.obj]) {
      var ob = O[st.obj];
      var tabNames = Object.keys(ob.tabs || {}).filter(function (t) { return ob.tabs[t] && ob.tabs[t].length; });
      var tab = tabNames.indexOf(st.tab) >= 0 ? st.tab : tabNames[0];
      var cards = (ob.tabs[tab] || []).map(function (c) {
        var o = Object.assign({ gc: one, bd: '#2A313C' }, c);
        o.hasTitle = !!c.t; o.isKv = c.type === 'kv'; o.isBars = c.type === 'bars'; o.isList = c.type === 'list'; o.isChart = c.type === 'chart'; o.isNote = c.type === 'note'; o.isFans = c.type === 'fans';
        if (o.isList) o.items = c.items.map(resolve);
        o.isBoard = c.type === 'board';
        if (o.isBoard) {
          var L = c.layout;
          var selK = st.hwSel || L.default;
          var heat = function (t, w, thr) { return t >= thr ? CRIT : (t >= w ? WARN : (t / w < 0.68 ? '#2E7DD1' : OK)); };
          o.chassis = L.chassis;
          o.comps = L.comps.map(function (p) {
            var on = selK === p.k;
            var r = { label: p.label, x: p.x, y: p.y, pick: function () { self.setState({ hwSel: p.k }); } };
            if (p.kind === 'fan') {
              r.isFan = true; r.isBlock = false; r.s = p.s; r.ly = p.y + p.s + 2; r.val = p.s < 40 ? '' : p.rpm + ' rpm';
              r.dur = Math.max(0.12, 900 / p.rpm * 0.35).toFixed(2) + 's'; r.ring = on ? '#4C9AFF' : '#2A313C';
            } else {
              var col = heat(p.t, p.warn, p.thr);
              r.isFan = false; r.isBlock = true; r.w = p.w; r.h = p.h; r.val = p.t + '°';
              r.fill = col + '2E'; r.border = on ? '#E6EAF0' : col + 'AA'; r.vc = col === '#2E7DD1' ? '#9CC4F2' : col;
              r.glow = on ? '0 0 0 3px #E6EAF055' : (col === CRIT ? '0 0 14px ' + CRIT + '66' : 'none');
              r.dir = p.vert ? 'column' : (p.h >= 60 ? 'column' : 'row'); r.align = p.vert ? 'center' : (p.h >= 60 ? 'flex-start' : 'center');
            }
            return r;
          });
          var cp = L.comps.filter(function (p) { return p.k === selK; })[0] || L.comps[0];
          if (cp.kind === 'fan') {
            o.sel = { label: cp.label, val: cp.rpm + ' rpm', c: '#7DB4FF', meta: cp.sensor + ' · max ' + cp.max + ' rpm', w: Math.round(cp.rpm / cp.max * 100) + '%', hasNote: false, note: '' };
          } else {
            var cc = heat(cp.t, cp.warn, cp.thr);
            o.sel = { label: cp.label, val: cp.t + ' °C', c: cc === '#2E7DD1' ? '#7DB4FF' : cc, meta: cp.sensor + ' · warn ' + cp.warn + ' · critical ' + cp.thr + ' °C', w: Math.min(100, Math.round(cp.t / cp.thr * 100)) + '%', hasNote: !!cp.note, note: cp.note || '' };
          }
        }
        o.hasBtn = !!c.btn; if (c.btn) { o.btnL = c.btn[0]; o.btnFn = act(c.btn[1]); }
        return o;
      });
      var sc = stOf(ob.st);
      var actions = [];
      if (ob.type === 'Host' && ob.tabs.Hardware && ob.tabs.Hardware.length) actions.push(btn('Hardware', function () { self.setState({ tab: 'Hardware' }); }));
      if (ob.needsDiag) actions.push(btn('Diagnose', function () { self.setState({ tab: 'Diagnostics' }); }, true));
      ob.actions.forEach(function (a) { actions.push(btn(a.label, act(a.key), a.primary)); });
      if (ob.type === 'VM' || ob.type === 'LXC') actions.push(btn('Console', function () {}));
      if (SECTION[ob.type] === 'hosts' || ob.type === 'Site') actions.push(btn('Show on map', to('topology')));
      oVals = {
        name: ob.name, type: ob.type, ab: ob.ab, sub: ob.sub, status: sc[0], sc: sc[1], stint: sc[1] + '22',
        tabs: tabNames.map(function (t) { var on = t === tab; return { label: t, on: on, fg: on ? TXT : MUTE, line: on ? '#4C9AFF' : 'transparent', pick: function () { self.setState({ tab: t }); } }; }),
        cards: cards, actions: actions,
        rel: (ob.rel || []).map(function (g) { return { l: g[0], items: g[1].map(resolve) }; }), noRel: !(ob.rel && ob.rel.length)
      };
      var sec = SECTION[ob.type];
      crumbs.push({ t: PAGE_LABEL[sec], go: to(sec) });
      var chain = [];
      var p = ob.host ? O[ob.host] : (ob.prov ? O[ob.prov] : null);
      if (ob.type === 'Container' && p && p.host) chain.push(O[p.host]);
      if (p) chain.push(p);
      chain.forEach(function (c) { crumbs.push({ t: c.name, go: go(c.id) }); });
      crumbs.push({ t: ob.name });
    } else if (route !== 'home') {
      crumbs.push({ t: PAGE_LABEL[route] });
    } else { crumbs = [{ t: 'Home' }]; }
    crumbs = crumbs.map(function (c, i) { var last = i === crumbs.length - 1; return { t: c.t, go: c.go || function () {}, link: !last, last: last, sep: !last }; });

    var page = { title: '', desc: '', tables: [], tiles: [], chips: [] };
    if (PAGES[route]) { page = PAGES[route](); page.hasChips = !!page.chips; page.hasTiles = !!(page.tiles && page.tiles.length); page.hasProgress = !!page.hasProgress; page.tiles = page.tiles || []; page.chips = page.chips || []; }

    // ---------- power ----------
    var SERIES = ['#4C9AFF', '#F0883E', '#3FC4B0'];
    var CHIP = { ok: '#3FB95022', warn: '#E3B34122', info: '#4C9AFF22', mute: '#232B36' };
    var P = inv.power[scopeId];
    var pw = {
      price: st.price === null ? inv.settings.price : st.price,
      onPrice: function (e) { self.setState({ price: e.target.value }); self.setPrice(e.target.value); },
      banner: P.banner,
      tiles: P.tiles.map(tileOf),
      stack: P.stack.map(function (x) { return { t: x.t, w: x.w, c: SERIES[x.series] }; }),
      branches: P.branches.map(function (b) {
        return { t: b.t, sub: b.sub, c: SERIES[b.series], total: b.total, tc: b.alarm ? CRIT : TXT, hasGo: !!O[b.obj], noGo: !O[b.obj], go: O[b.obj] ? go(b.obj) : function () {},
          rows: b.rows.map(function (r) {
            var o = O[r.obj];
            return { name: r.name, hasGo: !!o, noGo: !o, go: o ? go(r.obj) : function () {}, dot: r.off ? CRIT : (o ? stOf(o.st)[1] : MUTE), share: r.share, wTxt: r.w, wc: r.off ? CRIT : (r.loss ? MUTE : TXT),
              src: r.src, srcBg: CHIP[r.srcLv], srcC: lv(r.srcLv), op: r.off ? '0.6' : '1' };
          }) };
      }),
      legend: P.legend.map(function (l) { return { label: l.label, c: SERIES[l.series] }; }),
      bars: P.bars, peak: P.peak, from: P.since,
      insights: P.insights.map(function (i) {
        var a = i.action, primary = !!a && a.primary;
        return { t: i.t, bd: TONE[i.tone] || '#2A313C', text: i.text, hasBtn: !!a, btn: a ? a.label : '', fn: !a ? function () {} : (a.key ? act(a.key) : to(a.route)),
          bg: primary ? '#4C9AFF' : '#161B22', fg: primary ? '#0E1116' : TXT, bdb: primary ? '#4C9AFF' : '#2A313C' };
      }),
      methods: P.methods.map(function (m) { return { t: m.t, d: m.d, acc: m.acc, c: lv(m.lv), bg: CHIP[m.lv] }; })
    };

    // ---------- home ----------
    var OV = inv.overview[scopeId];
    var attention = ALERTS.filter(function (a) { return aState(a) === 'open' && inScope(O[a.obj]); }).map(function (a) { return { c: SEVC[a.sev], title: a.title, domain: a.domain, where: a.where, when: a.when, action: a.action, go: goAlert(a) }; })
      .concat(OV.notices.map(function (n) { return { c: lv(n.lv), title: n.title, domain: n.domain, where: n.where, when: n.when, action: n.action, go: n.obj ? go(n.obj) : to(n.route) }; }));
    var scopedCrit = attention.filter(function (a) { return a.c === CRIT; }).length, scopedWarn = attention.filter(function (a) { return a.c === WARN; }).length;
    var overall = scopedCrit ? { label: 'Degraded · ' + scopedCrit + ' critical', c: CRIT } : (scopedWarn ? { label: scopedWarn + ' warning' + (scopedWarn > 1 ? 's' : ''), c: WARN } : { label: 'All healthy', c: OK });
    overall.tint = overall.c + '22';
    var worstOf = function (ids) { var w = 'ok'; ids.forEach(function (k) { if (!O[k] || !inScope(O[k])) return; var s = O[k].st; if (s === 'crit') w = 'crit'; else if (s === 'warn' && w !== 'crit') w = 'warn'; }); return w; };
    var guestIds = objsOf(['VM', 'LXC']), ctrIds = objsOf(['Container']);
    var domains = OV.domains.map(function (d) { return { t: d.t, c: lv(d.lv), s: d.s, v1: d.v1, l1: d.l1, v2: d.v2, l2: d.l2, note: d.note, go: to(d.route) }; });
    var changes = inv.changes.map(function (c) { return { t: c.t, k: c.k, x: c.x, c: lv(c.lv) || TXT }; });

    // ---------- topology ----------
    var TP = inv.topology[scopeId];
    var LINE = { tunnel: TUN, sitemagic: SM, flow: FLOW, planned: '#4A5361' };
    var PILL = { plain: [MUTE, '#2A313C'], tunnel: ['#7DB4FF', '#2A3D57'], sitemagic: ['#C9A8FF', '#3D2C5C'], flow: [FLOW, '#1F4A44'] };
    var tLines = TP.lines.map(function (l) {
      if (l.kind === 'solid') return { x: l.x, y: l.y, w: l.w, h: l.h, bg: LINK, bt: 'none', bl: 'none' };
      var dash = '2px dashed ' + LINE[l.kind];
      return { x: l.x, y: l.y, w: l.w, h: l.h, bg: 'transparent', bt: l.w ? dash : 'none', bl: l.w ? 'none' : dash };
    });
    var tPills = TP.pills.map(function (p) { return { x: p.x, y: p.y, t: p.t, c: PILL[p.kind][0], b: PILL[p.kind][1] }; });
    var topoNodes = TP.nodes.filter(function (n) { return O[n.id]; }).map(function (n) {
      var s = O[n.id].st, vis = st.layer === 'all' || n.layer === st.layer;
      var r = { x: n.x, y: n.y, w: n.w, h: n.h, name: n.name, sub: n.sub, dot: s === 'plan' ? 'transparent' : stOf(s)[1], dotB: s === 'plan' ? '1.5px solid #9AA4B2' : 'none',
        isBtn: n.kind !== 'group', isGroup: n.kind === 'group', go: go(n.id), jc: n.kind === 'host' ? 'flex-start' : 'center',
        bars: n.bars.map(function (b) { var c = barColor(b.pct); return { l: b.l, w: Math.min(100, b.pct) + '%', v: b.text || b.pct + '%', c: c, tc: c === OK ? TXT : c }; }),
        bs: s === 'plan' ? 'dashed' : 'solid', bg: s === 'crit' ? '#1F1416' : (s === 'plan' ? '#12161C' : '#161B22'), op: vis ? '1' : '0.22' };
      if (n.kind === 'group') r.vps = n.vps.filter(function (v) { return O[v]; }).map(function (v) { var vo = O[v]; return { n: vo.name, t: '→ ' + (vo.sub.split(' → ')[1] || '—'), c: stOf(vo.st)[1], go: go(v) }; });
      return r;
    });

    // ---------- sidebar ----------
    var G = [
      ['ov', 'Overview', [['home', 'Home', 'HM'], ['topology', 'Topology', 'MAP'], ['sites', 'Sites & WAN', 'ST']]],
      ['in', 'Infrastructure', [['hosts', 'Hosts', 'HS'], ['power', 'Power', 'PWR'], ['storage', 'Storage', 'SG'], ['network', 'Network', 'NW'], ['edge', 'Edge & cloud', 'ED']]],
      ['wl', 'Workloads', [['services', 'Services', 'SV'], ['guests', 'VMs & LXCs', 'VM'], ['containers', 'Containers', 'CT']]],
      ['op', 'Operations', [['alerts', 'Alerts', 'AL'], ['protection', 'Data protection', 'DP'], ['drift', 'Drift & CMDB', 'DR'], ['updates', 'Updates', 'UP']]],
      ['se', 'Settings', [['sources', 'Data sources', 'DS'], ['notifications', 'Notifications', 'NT']]]
    ];
    var activeSec = route === 'obj' && O[st.obj] ? SECTION[O[st.obj].type] : route;
    // Sources that are connected, not paused and healthy
    var srcUp = inv.sources.filter(function (x) { return !x.paused && x.health === 'ok'; }).length;
    var srcDot = srcUp === inv.sources.length ? OK : (srcUp ? WARN : MUTE);
    var dotFor = {
      hosts: stOf(worstOf(objsOf(['Host'])))[1], power: stOf(worstOf(objsOf(['UPS'])))[1], storage: stOf(worstOf(inv.storage.volumes.map(function (v) { return v.obj; })))[1], network: stOf(worstOf(objsOf(['VLAN'])))[1],
      edge: stOf(worstOf(objsOf(['VPS'])))[1], services: stOf(worstOf(objsOf(['Service'])))[1], guests: stOf(worstOf(guestIds))[1], containers: stOf(worstOf(ctrIds))[1],
      drift: OV.notices.some(function (n) { return n.route === 'drift'; }) ? INFO : null, sources: srcDot === OK ? null : srcDot
    };
    var side = st.side;
    var groups = G.map(function (g) {
      var open = side ? !st.closed[g[0]] : true;
      return { t: g[1], open: open, chev: open ? '▾' : '▸', showHead: side,
        toggle: function () { var c = Object.assign({}, self.state.closed); c[g[0]] = !c[g[0]]; self.setState({ closed: c }); },
        items: g[2].map(function (i) {
          var on = activeSec === i[0];
          var d = dotFor[i[0]];
          var showDot = !!d && d !== OK && i[0] !== 'alerts';
          return { t: i[1], ab: i[2], go: to(i[0]), cur: on ? 'page' : 'false', showLabel: side,
            bg: on ? '#1C2533' : 'transparent', fg: on ? TXT : '#C9D1DB', fw: on ? '600' : '400',
            hasBadge: i[0] === 'alerts' && bell.show, badge: bell.n, bc: bell.c, hasDot: showDot, dot: d || 'transparent' };
        }) };
    });

    // ---------- palette ----------
    var pq = (st.pq || '').trim().toLowerCase();
    var results = Object.keys(O).filter(function (k) { var o = O[k]; return !pq || (o.type + ' ' + o.name + ' ' + o.sub + ' ' + (o.ip || '')).toLowerCase().indexOf(pq) >= 0; })
      .slice(0, 9).map(function (k) { var o = O[k]; return { type: o.type, n: o.name, s: o.sub, c: stOf(o.st)[1], go: go(k) }; });
    var pages = Object.keys(PAGE_LABEL).filter(function (k) { return pq && PAGE_LABEL[k].toLowerCase().indexOf(pq) >= 0; }).map(function (k) { return { type: 'Page', n: PAGE_LABEL[k], s: 'Go to section', c: INFO, go: to(k) }; });
    results = pages.concat(results).slice(0, 10);

    var seg = function (cur, key, arr) { return arr.map(function (x) { var on = cur === x[0]; return { label: x[1], dot: x[2], on: on, bg: on ? '#232B36' : 'transparent', fg: on ? TXT : MUTE, pick: function () { var o = {}; o[key] = x[0]; self.setState(o); } }; }); };
    return {
      scopes: seg(scopeId, 'scope', inv.scopes.map(function (s) { return [s.id, s.label, s.obj ? (O[s.obj] ? stOf(O[s.obj].st)[1] : MUTE) : (noData ? MUTE : overall.c)]; })),
      ranges: seg(st.range, 'range', [['live', 'Live'], ['1 h', '1 h'], ['24 h', '24 h'], ['7 d', '7 d']]),
      rangeLabel: st.range === 'live' ? 'live' : 'last ' + st.range,
      srcLabel: srcUp + ' / ' + inv.sources.length + ' sources', srcDot: srcDot,
      noData: noData, goSources: to('sources'),
      bell: bell, bellOpen: st.bell, bellEmpty: openAlerts.length === 0,
      bellItems: openAlerts.map(function (a) { return { title: a.title, where: a.where, when: a.when, c: SEVC[a.sev], go: goAlert(a) }; }),
      toggleBell: function () { self.setState({ bell: !self.state.bell, palette: false }); }, goAlerts: to('alerts'), goHome: to('home'),
      groups: groups, sideW: side ? '232px' : '64px', toggleSide: function () { self.setState({ side: !self.state.side }); },
      crumbs: crumbs,
      isHome: route === 'home', isTopo: route === 'topology', isPower: route === 'power', pw: pw, isList: !!PAGES[route], isObj: route === 'obj' && !!O[st.obj],
      scopeLine: inv.scopes.filter(function (s) { return s.id === scopeId; })[0].line,
      overall: overall, attention: attention, attentionN: String(attention.length), noAttention: attention.length === 0, domains: domains, changes: changes,
      topo: { h: TP.h, nodes: topoNodes, lines: tLines, pills: tPills, sub: TP.sub },
      layers: seg(st.layer, 'layer', [['all', 'All'], ['compute', 'Compute'], ['network', 'Network'], ['external', 'External']]),
      page: page, o: oVals,
      paletteOpen: st.palette, openPalette: function () { self.setState({ palette: true, bell: false }); },
      closePalette: function () { self.setState({ palette: false, pq: '' }); },
      pq: st.pq, onPq: function (e) { self.setState({ pq: e.target.value }); }, results: results, noResults: results.length === 0
    };
}
