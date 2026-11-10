/**
 * View model for the Pantheon UI.
 *
 * Ported from the design prototype. It assembles one inventory (sites, hosts,
 * guests, containers, VLANs, VPS, UPS…) from the per-integration datasets in
 * `self.data` and turns it, with the UI state, into everything the React
 * components render. Colours for status-driven values are computed here;
 * static theme colours live in src/styles.css.
 *
 * `self` is the store (src/model/store.ts): `self.state`, `self.setState()`,
 * `self.nav()`, `self.data`, `self.integrations`, plus timer slots (`t`, `iv`, `ivU`).
 */
export function buildView(self) {
    var st = self.state;
    var OK = '#3FB950', WARN = '#E3B341', CRIT = '#F85149', MUTE = '#9AA4B2', INFO = '#7DB4FF', TXT = '#E6EAF0';
    var LINK = '#3A4350', TUN = '#3E6CA8', SM = '#A371F7', FLOW = '#3FC4B0';
    var ST = { ok: ['Healthy', OK], warn: ['Warning', WARN], crit: ['Critical', CRIT], plan: ['Planned', MUTE], off: ['Stopped', MUTE], info: ['Info', INFO] };
    var K = st.k2soFixed, M = st.memFixed, S = st.sonarrFixed;
    var rv = { live: 0.4, '1 h': 0.7, '24 h': 1.4, '7 d': 2.4 }[st.range];
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
    var R = function (id, s, r, rc) { return { ref: id, s: s || '', r: r || '', rc: rc }; };
    var I = function (t, s, r, c, rc) { return { t: t, s: s || '', r: r || '', c: lv(c) || OK, rc: lv(rc) }; };
    var note = function (t, text, c) { return { type: 'note', t: t, text: text, gc: full, bd: (c || '#2A313C') }; };
    var chart = function (t, base, amp, unit, warn, seed) {
      var lo = 0, hi = Math.max(warn || 0, base + amp * 2) * 1.15 || 100;
      var y = function (v) { return (80 - (v - lo) / (hi - lo) * 76).toFixed(1); };
      var pts = [];
      for (var i = 0; i <= 30; i++) { var v = base + Math.sin(i * rv + (seed || 0)) * amp + ((i * 13 + (seed || 0)) % 7 - 3) * amp * 0.15; if (i === 30) v = base; pts.push((i * 10) + ',' + y(v)); }
      var c = warn && base >= warn ? WARN : '#7DB4FF';
      return { type: 'chart', t: t, v: base + unit, vc: c === WARN ? WARN : TXT, lc: c, pts: pts.join(' '), area: '0,80 ' + pts.join(' ') + ' 300,80', thrY: warn ? y(warn) : 0, thrOp: warn ? '1' : '0', gc: one };
    };
    var fans = function (t, arr) { return { type: 'fans', t: t, gc: one, items: arr.map(function (f) { return { l: f[0], v: f[1] + ' rpm', dur: (Math.max(0.12, 300 / f[1])).toFixed(2) + 's' }; }) }; };

    // ---------- data ----------
    // One dataset per integration (src/integrations), or null while that source has delivered nothing.
    var D = self.data || {};
    var feed = function (key) { var out = []; Object.keys(D).forEach(function (k) { if (D[k] && D[k][key]) out = out.concat(D[k][key]); }); return out; };
    var noteOf = function (n) { return { type: 'note', t: n.t, text: n.text, gc: full, bd: TONE[n.tone] || '#2A313C', btn: n.action }; };
    var nb = D.netbox || {};

    // ---------- object registry ----------
    var O = {};
    var add = function (id, o) { o.id = id; O[id] = o; return o; };
    var stOf = function (k) { return ST[k]; };

    // Power wiring (NUT): which UPS feeds what
    var upsList = D.nut ? D.nut.ups : [];
    var upsOf = {}, poweredBy = {}, powerPath = {};
    upsList.forEach(function (u) {
      Object.keys(u.poweredBy).forEach(function (k) { upsOf[k] = u.id; poweredBy[k] = [['Powered by', [R(u.id, u.poweredBy[k])]]]; });
      Object.keys(u.powerPath).forEach(function (k) { powerPath[k] = R(u.id, u.powerPath[k]); });
    });
    var withPower = function (id, rel) { return (rel || []).concat(poweredBy[id] || []); };
    var upsHome = upsList.filter(function (u) { return u.id === 'ups-home'; })[0];
    var batt = upsHome ? upsHome.batt : 100, runtime = upsHome ? upsHome.runtime : 18;

    // Power readings and PSU facts, from whichever source measures them
    var PWD = feed('power'), watts = {}, PSU = {};
    PWD.forEach(function (p) { if (p.id) watts[p.id] = p; });
    Object.keys(D).forEach(function (k) { if (D[k] && D[k].psu) Object.assign(PSU, D[k].psu); });

    // Sites · UniFi Site Manager
    (D.sitemanager ? D.sitemanager.sites : []).forEach(function (s) {
      add(s.id, { type: 'Site', ab: s.ab, name: s.name, site: s.site, st: s.status, sub: s.sub, table: s.table,
        tabs: { Overview: [bars('Site health', s.health), kv('Facts', s.facts)].concat((s.notes || []).map(noteOf)),
          Uplinks: [list('Internet uplinks', s.uplinks, full)], Devices: [list(s.devicesTitle, s.devices, full)] },
        rel: s.rel });
    });

    // Network devices · UniFi Network
    (D.unifi ? D.unifi.devices : []).forEach(function (d) {
      add(d.id, { type: 'Network device', ab: 'NET', name: d.name, site: d.site, st: 'ok', sub: d.sub,
        tabs: { Overview: [bars('Load', d.meters), kv('Facts', d.facts)], Events: [list('Events', d.events, full)] }, rel: withPower(d.id, d.rel) });
    });

    // Hosts · owned by Proxmox, TrueNAS, NetBox (planned) or Synology; enriched by metrics, power, LLM engines and the CMDB
    var HWL = {};
    var telemetry = D.metrics ? D.metrics.hosts : {};
    var host = function (h) {
      var t = Object.assign({}, h.hardware, telemetry[h.id]);
      var cm = (nb.hosts && nb.hosts[h.id]) || {};
      var facts = (h.facts || []).concat((D.llm && D.llm.hosts[h.id]) || []);
      var plug = watts[h.id];
      if (plug && (plug.src === 'plug' || plug.src === 'gpu')) facts.push(['Power', plug.w + ' W']);
      var ov = (h.meters ? [bars('Resources', h.meters)] : []).concat([kv(h.factsTitle || 'Facts', facts, h.factsWide ? full : one)]).concat((h.notes || []).concat(t.notes || []).map(noteOf));
      var hw = [];
      if (t.layout) { HWL[h.id] = t.layout; hw.push({ type: 'board', layout: h.id, t: 'Physical layout · thermal map', gc: full }); }
      if (t.temps) hw.push(temps('Temperatures', t.temps, t.tempsWide ? full : one));
      if (t.fans) hw.push(fans(t.fansTitle || 'Fans', t.fans));
      if (t.drives) hw.push(list('Drives · SMART', t.drives));
      if (PSU[h.id]) hw.push(kv('Power supply', PSU[h.id]));
      if (hw.length && D.nut) hw.push(powerPath[h.id] ? list('Power path', [powerPath[h.id]]) : note('Power path · not on UPS', h.name + ' runs on wall power by design: at its draw it would empty the UPS in minutes. A power cut means a hard stop, so keep nothing stateful on it.', '#5A4A1F'));
      add(h.id, { type: 'Host', ab: 'HOST', name: h.name, site: h.site, st: h.status, sub: h.sub,
        tabs: { Overview: ov, Metrics: (t.charts || []).map(function (c) { return chart.apply(null, c); }), Hardware: hw,
          Guests: h.guests ? [list('Guests', h.guests, full)] : [], Network: h.interfaces ? [list('Interfaces', h.interfaces, full)] : [],
          Events: h.events ? [list('Events', h.events, full)] : [],
          'Asset & CMDB': (cm.cmdb ? [kv('CMDB record (NetBox)', cm.cmdb)] : []).concat(cm.asset ? [kv('Physical asset (ITAM)', cm.asset)] : []) },
        rel: withPower(h.id, h.rel) });
    };
    (D.proxmox ? D.proxmox.nodes : []).forEach(host);
    if (D.truenas) host(D.truenas.host);
    (nb.planned || []).forEach(host);
    if (D.synology) host(D.synology.host);

    // Pools · TrueNAS
    (D.truenas ? D.truenas.pools : []).forEach(function (p) {
      add(p.id, { type: 'Pool', ab: 'POOL', name: p.name, site: p.site, st: p.status, sub: p.sub,
        tabs: { Overview: [bars('Capacity', p.capacity), kv('Health', p.health)], Datasets: [list('Datasets', p.datasets, full)], Protection: [list('Copies', p.copies, full)] }, rel: p.rel });
    });

    // Guests · Proxmox, with containers from the Docker agents and the declared record from NetBox
    var containers = D.docker ? D.docker.containers : [];
    (D.proxmox ? D.proxmox.guests : []).forEach(function (g) {
      var id = g.id, isVm = g.kind === 'VM', hostO = O[g.node];
      var ts = D.tailscale && D.tailscale.routers[id];
      var meters = g.meters.concat(D.pihole && D.pihole.guest === id ? D.pihole.meters : []);
      var ctrs = (g.services || []).concat(containers.filter(function (c) { return c.guest === id; }).map(function (c) { return R(c.id); }));
      var tabs = { Overview: [bars('Resources', meters), kv('Configuration', g.cfg.concat(ts ? ts.facts : []))] };
      var ctrTab = isVm ? 'Containers' : 'Services';
      if (ctrs.length) tabs[ctrTab] = [list(isVm ? 'Docker containers' : 'Containers / services', ctrs, full)];
      else if (D.docker) tabs[ctrTab] = [note('No containers', 'No Docker runtime in this guest. Metrics come from the Proxmox API and node_exporter.')];
      tabs.Network = [kv('Interface', [['net0', 'virtio · vmbr0'], ['VLAN', g.vlan], ['Address', g.ip], ['MAC', g.mac]]), list('Firewall', g.fw)];
      tabs.Backups = [list('3-2-1', g.copies), list('Runs', g.runs)];
      if (nb.guests) {
        var rec = nb.guests[id] || {}, diff = rec.diff || [], accepted = st.accepted[id];
        tabs['Asset & CMDB'] = [list('Declared (NetBox) vs observed', diff.length ? diff.map(function (d) { return I(d[0], 'NetBox: ' + (accepted ? d[2] : d[1]), 'observed: ' + d[2] + (accepted ? ' ✓' : ' ≠'), accepted ? OK : WARN, accepted ? OK : WARN); }) : [I('All fields match', 'site · host · VLAN · IP · vCPU · memory', '✓')], full),
          kv('CMDB record', [['Role', g.role], ['Owner', nb.owner], ['Lifecycle', isVm && g.status === 'off' ? 'Test' : 'Production'], ['Criticality', rec.crit || 'Low']])];
        if (diff.length && !accepted) tabs['Asset & CMDB'][0].btn = ['Accept observed → update NetBox', 'accept:' + id];
      }
      tabs.Events = [list('Events', g.events, full)];
      add(id, { type: g.kind, ab: isVm ? 'VM' : 'LXC', name: g.name || id, site: hostO ? hostO.site : 'home', st: g.status,
        sub: g.kind + ' · on ' + (hostO ? hostO.name : g.node) + ' · ' + g.ip + ' · ' + g.role,
        host: g.node, ip: g.ip, tabs: tabs, rel: [['Runs on', [R(g.node)]]].concat(g.rel || []).concat(ts ? ts.rel : []) });
    });

    // Containers · Docker agents
    containers.forEach(function (c) {
      add(c.id, { type: 'Container', ab: 'CTR', name: c.name, site: 'home', st: c.status, sub: c.image + ' · in ' + c.guest, host: c.guest,
        tabs: { Overview: [kv('Container', [['Image', c.image], ['State', c.up, c.status === 'warn' ? WARN : TXT], ['Memory', c.mem], ['Restart policy', 'unless-stopped']]), bars('Usage', [['CPU', c.cpu || 3], ['Memory vs limit', c.memp || 40, c.memt]])].concat((c.notes || []).map(noteOf)),
          Logs: [list('Recent events', c.events || [I('Healthy', 'healthcheck', '1 min ago', OK)], full)] },
        rel: [['Runs in', [R(c.guest)]]].concat(c.rel || []) });
    });

    // Providers and their edge VPS · OVH, Quicksrv.io, Scaleway, Cloudflare
    var provs = ['ovh', 'quicksrv', 'scaleway', 'cloudflare'].map(function (k) { return D[k]; }).filter(Boolean);
    provs.forEach(function (P) { var p = P.provider; add(p.id, { type: 'Provider', ab: p.ab, name: p.name, site: 'home', st: p.status, sub: p.sub, rel: p.rel }); });
    provs.forEach(function (P) {
      P.vps.forEach(function (v) {
        var crit = v.status === 'crit';
        var tabs = { Overview: [kv('Tunnel', [['Type', v.link || 'WireGuard'], ['Last handshake', crit ? '14 min ago' : '2 s ago', crit ? CRIT : TXT], ['Lands on', v.lands], ['RTT to home', crit ? '—' : '11 ms']]), bars('Resources', [['CPU', v.cpu || 6], ['Memory', v.mem || 38]])].concat((v.notes || []).map(noteOf)),
          Events: [list('Events', v.events || [I('Handshake OK', 'WireGuard', 'continuous', OK)], full)] };
        var dg = v.diagnostics;
        if (dg) {
          var card = list('Guided diagnostics', dg.steps.map(function (s, i) {
            if (dg.fixed) return I(s[0], '', s[3] || s[1], OK, OK);
            var done = st.diag !== 'idle' && i < st.step, running = st.diag === 'running' && i === st.step;
            return I((i + 1) + '. ' + s[0], running ? 'checking…' : '', done ? s[1] : (running ? '…' : '—'), done ? s[2] : MUTE, done ? s[2] : MUTE);
          }), full);
          if (!dg.fixed) card.btn = st.diag === 'running' ? null : [st.diag === 'done' ? 'Run again' : 'Run diagnostics', 'diag'];
          tabs.Diagnostics = [card];
          if (!dg.fixed && st.diag === 'done') tabs.Diagnostics.push(noteOf(dg.cause));
          if (dg.fixed) tabs.Diagnostics.push(noteOf(dg.outcome));
        }
        add(v.id, { type: 'VPS', ab: 'VPS', name: v.id, site: 'home', st: v.status, sub: P.provider.name + ' · ' + v.role + ' → ' + v.lands, prov: P.provider.id,
          needsDiag: !!dg && !dg.fixed, tabs: tabs, rel: [['Provider', [R(P.provider.id)]], ['Tunnels into', v.targets]].concat(v.rel || []) });
      });
    });
    provs.forEach(function (P) {
      var p = P.provider;
      if (p.tunnels) { O[p.id].tabs = { Overview: [list('Tunnels', p.tunnels, full), kv('DNS', p.dns)] }; return; }
      var kids = Object.keys(O).filter(function (k) { return O[k].prov === p.id; });
      O[p.id].tabs = { Overview: [list('VPS', kids.map(function (k) { return R(k, O[k].sub.split(' · ').slice(1).join(' · ')); }), full)], Billing: [kv('Account', p.billing)] };
    });

    // VLANs · UniFi Network, with drift against NetBox
    (D.unifi ? D.unifi.vlans : []).forEach(function (v) {
      var dr = nb.vlanDrift && nb.vlanDrift[v.vid];
      add('vlan' + v.vid, { type: 'VLAN', ab: 'V' + v.vid, name: 'VLAN ' + v.vid + ' · ' + v.name, site: v.site, st: dr ? 'warn' : 'ok', sub: v.subnet + ' · zone ' + v.zone,
        tabs: { Overview: [kv('Network', [['Subnet', v.subnet], ['Gateway', v.gw || v.subnet.replace('0/24', '1')], ['DHCP', v.dhcp || 'static only'], ['Zone', v.zone]])].concat(dr ? [noteOf(dr.note)] : []),
          Members: [list('Members', v.members.concat(dr ? [dr.member] : []), full)], Policy: [list('Allowed to reach', v.policy || [I('default deny', 'between zones', '', MUTE)], full)] },
        rel: [['Gateway', [R(v.site === 'b' ? 'udmse' : 'udm')]]] });
    });

    // Services · declared in NetBox, health from their components
    (nb.services || []).forEach(function (s) {
      var worst = s.comps.reduce(function (w, c) { var cs = O[c.ref] ? O[c.ref].st : 'ok'; return cs === 'crit' ? 'crit' : (cs === 'warn' && w !== 'crit' ? 'warn' : w); }, 'ok');
      add(s.id, { type: 'Service', ab: 'SVC', name: s.name, site: 'home', st: worst, sub: s.desc,
        tabs: { Overview: [list('Components', s.comps, full)], 'Dependency path': [list('If this breaks…', s.comps.map(function (c) { return R(c.ref, 'part of ' + s.name); }), full)] }, rel: [] });
    });

    // UPS · NUT
    upsList.forEach(function (u) {
      var ov = [bars('Battery & load', u.meters), kv('Status', u.facts), list('Protected devices', u.protects)];
      if (u.policy) ov.push(list('Shutdown policy (NUT + Proxmox)', u.policy));
      var tabs = { Overview: ov };
      if (u.events) tabs.Events = [list('Events', u.events, full)];
      add(u.id, { type: 'UPS', ab: 'UPS', name: u.name, site: u.site, st: u.status, sub: u.sub, tabs: tabs, rel: u.rel });
    });
    var noData = Object.keys(O).length === 0;

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

    // ---------- actions ----------
    var act = function (key) {
      if (key === 'migrate') return function () { self.setState({ memFixed: true }); };
      if (key === 'sonarr') return function () { self.setState({ sonarrFixed: true }); };
      if (key === 'fixk2so') return function () { self.setState({ k2soFixed: true }); };
      if (key === 'diag') return function () {
        clearTimeout(self.t);
        var adv = function (i) { self.setState({ diag: i < 5 ? 'running' : 'done', step: i }); if (i < 5) self.t = setTimeout(function () { adv(i + 1); }, 650); };
        adv(0);
      };
      if (key === 'powercut') return function () {
        clearInterval(self.ivU);
        if (self.state.onBatt) { self.setState({ onBatt: false, batt: 100 }); return; }
        self.setState({ onBatt: true, batt: 100 });
        self.ivU = setInterval(function () { var b = self.state.batt - 2; if (b <= 24) { clearInterval(self.ivU); b = 24; } self.setState({ batt: b }); }, 500);
      };
      if (key.indexOf('accept:') === 0) { var gid = key.slice(7); return function () { var a = Object.assign({}, self.state.accepted); a[gid] = true; self.setState({ accepted: a }); }; }
      return function () {};
    };

    // ---------- alerts ----------
    var RANK = { crit: 0, warn: 1, info: 2 };
    var ALERTS = feed('alerts').filter(function (a) { return O[a.obj]; }).map(function (a, i) { return [a, i]; })
      .sort(function (x, y) { return RANK[x[0].sev] - RANK[y[0].sev] || x[1] - y[1]; }).map(function (x) { return x[0]; });
    var SEVC = { crit: CRIT, warn: WARN, info: INFO };
    var aState = function (a) { return a.resolved ? 'resolved' : (st.silenced[a.id] ? 'silenced' : (st.acked[a.id] ? 'acked' : 'open')); };
    var openAlerts = ALERTS.filter(function (a) { return aState(a) === 'open' && a.sev !== 'info'; });
    var nCrit = openAlerts.filter(function (a) { return a.sev === 'crit'; }).length;
    var bell = { show: openAlerts.length > 0, n: String(openAlerts.length), c: nCrit ? CRIT : WARN };
    var goAlert = function (a) { return function () { self.setState({ route: 'obj', obj: a.obj, tab: a.tab || 'Overview', bell: false, palette: false }); }; };

    // ---------- drift ----------
    var DRIFT = nb.drift || [];
    var openDrift = DRIFT.filter(function (d) { return !st.accepted[d[0]]; });

    // ---------- scope filter ----------
    var inScope = function (o) { return st.scope === 'all' || o.site === st.scope; };

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

    var mock = st.dataMode !== 'live';
    var SOURCES = self.integrations || [];
    var setMode = function (mode) {
      if (mode === self.state.dataMode) return;
      // Objects only exist in one mode, so leave an object page when switching.
      var onObj = self.state.route === 'obj';
      self.setState({ dataMode: mode, route: onObj ? 'home' : self.state.route, obj: onObj ? null : self.state.obj, bell: false });
    };
    var siteName = function (site) { var o = O[site === 'b' ? 'siteb' : 'home']; return o ? o.name : (site === 'b' ? 'Site B' : 'Home lab'); };
    var tileOf = function (t) { return { l: t.l, v: t.v, c: lv(t.c), s: t.s }; };
    var PAGES = {
      sites: function () { return { title: 'Sites & WAN', desc: 'Every location and its uplinks', tables: [table('', ['Site', 'Gateway', 'Internet', 'Link to home', 'Status'], 'minmax(140px,1.2fr) 1fr 1.4fr 1fr 0.8fr',
        objsOf(['Site']).map(function (k) { var t = O[k].table; return row(k, [cell(t.gateway), cell(t.internet, lv(t.internetLv) || null), cell(t.link), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); }))] }; },
      hosts: function () { return { title: 'Hosts', desc: 'Physical machines across sites', tables: [table('', ['Host', 'Role', 'Site', 'Key metric', 'Status'], 'minmax(140px,1fr) 1.6fr 0.8fr 1.2fr 0.8fr',
        objsOf(['Host']).map(function (k) {
          var o = O[k], c0 = o.tabs.Overview[0], km = '—', kc = null;
          if (c0.type === 'bars') { var it = c0.items[c0.items.length > 1 ? 1 : 0]; km = it.l + ' · ' + it.v; kc = it.c === OK ? null : it.c; }
          return row(k, [cell(o.sub.split(' · ').slice(1, 3).join(' · ')), cell(siteName(o.site)), cell(km, kc, true), cell(stOf(o.st)[0], stOf(o.st)[1])], { op: o.st === 'plan' ? '0.6' : '1' });
        }))] }; },
      storage: function () { return { title: 'Storage', desc: 'Pools, volumes and where the data goes', tiles: feed('storageTiles').map(tileOf),
        tables: [table('Pools & volumes', ['Pool', 'Host', 'Used', 'Status'], 'minmax(140px,1fr) 1fr 1fr 0.8fr', feed('volumes').filter(function (v) { return st.scope === 'all' || v.site === st.scope; }).map(function (v) {
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
          var tog = function (key) { return function () { var m = Object.assign({}, self.state[key]); m[a.id] = !m[a.id]; var o = {}; o[key] = m; self.setState(o); }; };
          return { name: a.title, dot: SEVC[a.sev], hasGo: true, noGo: false, go: goAlert(a), op: s === 'open' ? '1' : '0.7',
            cells: [cell(a.where), cell(a.sev.toUpperCase(), SEVC[a.sev]), cell(s === 'resolved' ? 'resolved' : a.when, s === 'resolved' ? OK : null)],
            actions: s === 'resolved' ? [] : [btn(st.acked[a.id] ? 'Unack' : 'Ack', tog('acked')), btn(st.silenced[a.id] ? 'Unsilence' : 'Silence 1 h', tog('silenced'))] };
        });
        return { title: 'Alerts', desc: 'Click an alert to open the affected object', hasChips: true, chips: chipsFor('at', [['open', 'Open'], ['handled', 'Acked / silenced'], ['resolved', 'Resolved']]),
          tables: [table('', ['Alert', 'Where', 'Severity', 'Since', ''], 'minmax(220px,1.6fr) 1.2fr 0.6fr 0.6fr 1.2fr', rows, '820px')] };
      },
      protection: function () {
        var running = st.rep === 'running';
        var run = function () { if (self.state.rep === 'running') return; self.setState({ rep: 'running', pct: 0 }); clearInterval(self.iv); self.iv = setInterval(function () { var p = self.state.pct + 5; if (p >= 100) { clearInterval(self.iv); self.setState({ rep: 'done', pct: 100 }); } else { self.setState({ pct: p }); } }, 140); };
        var jobs = feed('backupJobs'), live = jobs.filter(function (j) { return j.runnable; })[0];
        return { title: 'Data protection', desc: 'Backups, snapshots and offsite copies', tiles: feed('backupTiles').map(tileOf),
          hasProgress: running && !!live, progLabel: live ? live.progressLabel : '', progPct: st.pct + '%',
          tables: [table('Jobs & flows', ['Job', 'Target', 'Schedule', 'Last run', ''], 'minmax(200px,1.4fr) 1.4fr 0.8fr 1fr 0.8fr', jobs.map(function (j) {
            return { name: j.name, dot: OK, hasGo: !!O[j.obj], noGo: !O[j.obj], go: go(j.obj), cells: [cell(j.target), cell(j.schedule), cell(j.last, OK)], actions: j.runnable ? [btn(running ? 'Running…' : 'Run now', run, true)] : [], op: '1' };
          }), '860px')] };
      },
      drift: function () {
        return { title: 'Drift & CMDB', desc: 'Where reality differs from NetBox', tiles: [{ l: 'Objects in NetBox', v: nb.objectCount || '—', c: TXT, s: nb.synced || 'not connected' }, { l: 'Differences', v: String(openDrift.length), c: openDrift.length ? WARN : OK, s: openDrift.length ? 'review below' : 'all in sync' }],
          tables: [table('', ['Object', 'Field', 'NetBox', 'Observed', ''], 'minmax(120px,0.8fr) 1.4fr 0.8fr 1fr 1.2fr', DRIFT.map(function (d) {
            var done = st.accepted[d[0]];
            return row(d[0], [cell(d[1]), cell(done ? d[3] : d[2], null, true), cell(d[3], done ? OK : WARN, true)], { dot: done ? OK : WARN, actions: done ? [] : [btn('Accept observed', act('accept:' + d[0]), true)], op: done ? '0.6' : '1' });
          }), '820px')] };
      },
      updates: function () {
        var U = feed('updates').filter(function (u) { return O[u[0]]; });
        return { title: 'Updates & maintenance', desc: 'Pending updates and maintenance windows', tables: [table('', ['Object', 'Update', 'Source', ''], 'minmax(130px,0.8fr) 1.6fr 0.8fr 1.4fr', U.filter(function (u) { return inScope(O[u[0]]); }).map(function (u) {
          var on = st.sched[u[0]];
          return row(u[0], [cell(u[1]), cell(u[2])], { actions: [btn(on ? 'Scheduled · Sun 03:00' : 'Schedule for Sun 03:00', function () { var m = Object.assign({}, self.state.sched); m[u[0]] = !m[u[0]]; self.setState({ sched: m }); }, !on)] });
        }), '720px')] };
      },
      sources: function () {
        return { title: 'Data sources', desc: mock ? 'Everything Pantheon reads from · showing mock data for every integration' : 'Everything Pantheon reads from · live mode, no integration is connected yet',
          chips: [['mock', 'Mock data'], ['live', 'Live data']].map(function (x) { var on = st.dataMode === x[0]; return { label: x[1], on: on, bg: on ? '#232B36' : 'transparent', fg: on ? TXT : MUTE, pick: function () { setMode(x[0]); } }; }),
          tables: [table('', ['Source', 'Covers', mock ? 'Polls every' : 'Status', ''], 'minmax(170px,1.2fr) 2fr 0.8fr 0.8fr', SOURCES.map(function (s) {
            var off = st.off[s.id], warn = mock && s.health === 'warn' && !off;
            return { name: s.name, dot: !mock || off ? MUTE : (warn ? WARN : OK), hasGo: false, noGo: true, go: function () {}, op: off ? '0.55' : '1', cells: [cell(s.covers, warn ? WARN : null), cell(off ? 'paused' : (mock ? s.sync : 'not connected'))],
              actions: mock ? [btn(off ? 'Resume' : 'Pause', function () { var m = Object.assign({}, self.state.off); m[s.id] = !m[s.id]; self.setState({ off: m }); })] : [] };
          }), '760px')] };
      },
      notifications: function () {
        var N = [['ntfy', 'ntfy · phone push', 'critical + warning'], ['email', 'Email · daily digest', 'all'], ['quiet', 'Quiet hours 23:00–07:00', 'critical still pushes'], ['slack', 'Slack · #homelab', 'critical only']];
        return { title: 'Notifications', desc: 'Where alerts go', tables: [table('', ['Channel', 'Sends', ''], 'minmax(200px,1.4fr) 1fr 0.8fr', N.map(function (n) {
          var on = st.notif[n[0]];
          return { name: n[1], dot: on ? OK : MUTE, hasGo: false, noGo: true, go: function () {}, op: on ? '1' : '0.6', cells: [cell(n[2])],
            actions: [btn(on ? 'On' : 'Off', function () { var m = Object.assign({}, self.state.notif); m[n[0]] = !m[n[0]]; self.setState({ notif: m }); }, on)] };
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
          var L = HWL[c.layout];
          var selK = st.hwSel || L.def;
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
      if (st.obj === 'ups-home') actions.push(btn(st.onBatt ? 'Restore mains' : 'Simulate power cut', act('powercut'), !st.onBatt));
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
    var price = parseFloat(String(st.price).replace(',', '.')) || 0;
    var ob = st.onBatt;
    var dW = ob ? 0 : (st.cap ? 642 : 762);
    // Each reading sits on the branch of the UPS that feeds it; everything else is on the wall circuit.
    PWD = PWD.filter(function (r) { return !r.id || O[r.id]; }).map(function (r) {
      var u = upsOf[r.id];
      return Object.assign({ b: u === 'ups-home' ? 'ups' : (u === 'ups-b' ? 'siteb' : 'wall') }, r);
    });
    // Grouped by branch; inside a branch hosts first, then other devices, then unnamed loads.
    var regIdx = Object.keys(O), brRank = { ups: 0, wall: 1, siteb: 2 };
    var pKey = function (r) { var o = O[r.id]; return brRank[r.b] * 1e6 + (!o ? 2 : (o.type === 'Host' ? 0 : 1)) * 1e4 + (o ? regIdx.indexOf(r.id) : 0); };
    PWD.sort(function (x, y) { return pKey(x) - pKey(y); });
    var SRCM = { plug: ['Smart plug · HA', '#3FB95022', OK], ipmi: ['IPMI', '#3FB95022', OK], gpu: ['Plug + DCGM', '#3FB95022', OK], dsm: ['DSM API', '#3FB95022', OK], poe: ['UniFi PoE budget', '#E3B34122', WARN], est: ['Estimate · spec', '#232B36', MUTE] };
    var BR = { ups: { t: 'ups-rack · on UPS', sub: 'Home lab · protected', c: '#4C9AFF', go: 'ups-home', over: 14 }, wall: { t: 'Wall circuit', sub: 'Home lab · not protected', c: '#F0883E' }, siteb: { t: 'ups-siteb · on UPS', sub: 'Site B · protected', c: '#3FC4B0', go: 'ups-b', over: 4 } };
    var brKeys = (st.scope === 'b' ? ['siteb'] : (st.scope === 'home' ? ['ups', 'wall'] : ['ups', 'wall', 'siteb'])).filter(function (k) { return k === 'wall' || O[BR[k].go]; });
    if (!brKeys.length) brKeys = ['wall'];
    var pRows = PWD.filter(function (r) { return brKeys.indexOf(r.b) >= 0; });
    var pwTotal = pRows.reduce(function (a, r) { return a + r.w; }, 0) + brKeys.reduce(function (a, k) { return a + (BR[k].over || 0); }, 0);
    var maxW = Math.max.apply(null, pRows.map(function (r) { return r.w; }).concat([1]));
    var branches = brKeys.map(function (k) {
      var br = BR[k], rs = PWD.filter(function (r) { return r.b === k; });
      var tot = rs.reduce(function (a, r) { return a + r.w; }, 0) + (br.over || 0);
      var rows = rs.map(function (r) {
        var o = r.id ? O[r.id] : null, s = SRCM[r.src], off = r.w === 0;
        return { name: o ? o.name : r.name, hasGo: !!o, noGo: !o, go: o ? go(r.id) : function () {}, dot: off ? CRIT : (o ? stOf(o.st)[1] : MUTE), share: Math.round(r.w / maxW * 100) + '%', wTxt: off ? 'off' : r.w + ' W', wc: off ? CRIT : TXT, src: s[0], srcBg: s[1], srcC: s[2], op: off ? '0.6' : '1' };
      });
      if (br.over) rows.push({ name: 'UPS conversion loss', hasGo: false, noGo: true, go: function () {}, dot: MUTE, share: Math.round(br.over / maxW * 100) + '%', wTxt: br.over + ' W', wc: MUTE, src: SRCM.est[0], srcBg: SRCM.est[1], srcC: SRCM.est[2], op: '1' });
      return { t: br.t, sub: br.sub + (k === 'ups' ? ' · ' + (ob ? 'ON BATTERY' : 'on mains') : ''), c: br.c, total: tot + ' W', tc: k === 'ups' && ob ? CRIT : TXT, hasGo: !!br.go, noGo: !br.go, go: br.go ? go(br.go) : function () {}, rows: rows };
    });
    var stack = pRows.filter(function (r) { return r.w > 0; }).map(function (r) { return { t: (r.id ? O[r.id].name : r.name) + ' · ' + r.w + ' W', w: (r.w / pwTotal * 100).toFixed(1) + '%', c: BR[r.b].c }; });
    var pBars = [], peak = 0, nB = 24;
    for (var bi = 0; bi < nB; bi++) {
      var last = bi === nB - 1;
      var u = brKeys.indexOf('ups') >= 0 ? (last ? 420 : 405 + (bi * 7) % 22) : 0;
      var wl = brKeys.indexOf('wall') >= 0 ? (last ? dW + (ob ? 0 : 182) : 182 + Math.round((st.cap ? 380 : 470) + (st.cap ? 230 : 320) * Math.sin(bi * rv * 0.9))) : 0;
      var sb = brKeys.indexOf('siteb') >= 0 ? 60 + (bi % 3) * 3 : 0;
      peak = Math.max(peak, u + wl + sb);
      pBars.push([u, wl, sb]);
    }
    var scl = Math.max(peak, 200) * 1.08;
    var pct = function (v) { return (v / scl * 100).toFixed(1) + '%'; };
    var estW = pRows.filter(function (r) { return r.src === 'est' || r.src === 'poe'; }).reduce(function (a, r) { return a + r.w; }, 0);
    var measW = pRows.reduce(function (a, r) { return a + r.w; }, 0);
    var cov = measW ? Math.round((measW - estW) / measW * 100) : 100;
    var estN = pRows.filter(function (r) { return r.src === 'est' || r.src === 'poe'; }).length;
    var monthKwh = Math.round(pwTotal * 0.72);
    var capSave = 86;
    var euro = function (v) { return '€ ' + Math.round(v); };
    var pwTiles = [
      { l: 'Drawing now', v: pwTotal + ' W', c: ob ? CRIT : TXT, s: brKeys.length > 1 ? brKeys.map(function (k) { return BR[k].t.split(' · ')[0]; }).join(' + ') : BR[brKeys[0]].t },
      { l: 'Today so far', v: (pwTotal * 11 / 1000).toFixed(1) + ' kWh', c: TXT, s: 'since midnight' },
      { l: 'Month at this rate', v: euro(monthKwh * price), c: TXT, s: monthKwh + ' kWh × € ' + price.toFixed(2) },
    ].concat(st.scope === 'b' ? (O['ups-b'] ? [{ l: 'ups-siteb', v: '100% · 42 min', c: OK, s: '62 W / 360 W' }] : []) : (upsHome ? [{ l: 'ups-rack', v: ob ? 'ON BATTERY · ' + batt + '%' : batt + '% · ' + runtime + ' min', c: ob ? CRIT : OK, s: '420 / 1000 W · runtime at this load' }] : [])).concat([
      { l: 'Measured, not estimated', v: cov + '%', c: cov < 90 ? WARN : OK, s: estN + ' devices estimated' }
    ]);
    var insights = [];
    if (brKeys.indexOf('wall') >= 0) insights.push({ t: 'Delphi is ' + Math.round(dW / Math.max(pwTotal, 1) * 100) + '% of the draw', bd: '#5A4A1F',
      text: ob ? 'Delphi lost power with the mains: it is not on the UPS.' : (st.cap ? 'Both 3090s are capped at 300 W. Saving ~' + capSave + ' kWh/month (≈ ' + euro(capSave * price) + ') for a few % fewer tokens/s.' : 'Capping both 3090s at 300 W usually costs under 5% tokens/s and saves ~' + capSave + ' kWh/month (≈ ' + euro(capSave * price) + '). It also cools GPU 1 memory.'),
      hasBtn: !ob, btn: st.cap ? 'Remove cap' : 'Apply 300 W GPU cap', fn: function () { self.setState({ cap: !self.state.cap }); }, bg: st.cap ? '#161B22' : '#4C9AFF', fg: st.cap ? TXT : '#0E1116', bdb: st.cap ? '#2A313C' : '#4C9AFF' });
    if (st.scope !== 'b' && upsHome) insights.push({ t: ob ? 'Running on battery' : 'UPS headroom', bd: ob ? '#6B2A2A' : '#2A313C',
      text: ob ? 'ups-rack carries the core at ' + batt + '%: ~' + runtime + ' min left. Shutdown steps trigger at 50% and at 5 minutes.' : 'ups-rack is 42% loaded: 18 min of runtime for the core. Delphi alone would overload it, so GPU boxes stay on the wall.',
      hasBtn: true, btn: ob ? 'Restore mains' : 'Simulate power cut', fn: act('powercut'), bg: ob ? '#4C9AFF' : '#161B22', fg: ob ? '#0E1116' : TXT, bdb: ob ? '#4C9AFF' : '#2A313C' });
    insights.push({ t: 'Close the measurement gaps', bd: '#2A313C', text: 'The UDM, the aggregation switch and the Pis are estimated from datasheets. Two smart plugs, or one metered PDU strip in the rack, would make the whole lab measured.',
      hasBtn: true, btn: 'Add a source', fn: to('sources'), bg: '#161B22', fg: TXT, bdb: '#2A313C' });
    var methods = [
      ['Smart plug · HA', 'Plugs read through Home Assistant: olympus, prometheus, kronos, delphi', '±1–2%', OK, '#3FB95022'],
      ['IPMI / Redfish', 'Server boards report input watts and rail voltages: alexandria', '±5%', OK, '#3FB95022'],
      ['GPU telemetry', 'Per-GPU board power from DCGM: delphi, kronos', 'GPU only', OK, '#3FB95022'],
      ['CPU RAPL', 'Package power reported by the CPU itself: every Intel host', 'CPU only', INFO, '#4C9AFF22'],
      ['UPS · NUT', 'Output load, battery and runtime: ups-rack, ups-siteb', '±5–10%', OK, '#3FB95022'],
      ['UniFi PoE budget', 'Per-port PoE draw from the switches', 'PoE only', WARN, '#E3B34122'],
      ['Estimate · spec', 'Datasheet typical draw when nothing is measured', 'rough', MUTE, '#232B36']
    ].map(function (m) { return { t: m[0], d: m[1], acc: m[2], c: m[3], bg: m[4] }; });
    var pw = {
      price: st.price, onPrice: function (e) { self.setState({ price: e.target.value }); }, onBatt: ob, upsW: 420, runtime: runtime,
      tiles: pwTiles, stack: stack, branches: branches, insights: insights, methods: methods,
      bars: pBars.map(function (b) { return { u: pct(b[0]), w: pct(b[1]), s: pct(b[2]) }; }), peak: peak + ' W',
      from: st.range === 'live' ? '24 min ago' : (st.range === '1 h' ? '1 h ago' : (st.range === '7 d' ? '7 d ago' : '24 h ago'))
    };

    // ---------- home ----------
    var attention = ALERTS.filter(function (a) { return aState(a) === 'open' && inScope(O[a.obj]); }).map(function (a) { return { c: SEVC[a.sev], title: a.title, domain: a.domain, where: a.where, when: a.when, action: a.action, go: goAlert(a) }; });
    if (openDrift.length && st.scope !== 'b') attention.push({ c: INFO, title: openDrift.length + ' differences with NetBox', domain: 'Drift & CMDB', where: nb.driftSummary, when: 'today', action: 'Review', go: to('drift') });
    if (st.scope !== 'home' && O.siteb) attention.push({ c: INFO, title: 'Site B has a single uplink', domain: 'Network', where: 'Mobile Vikings', when: 'ongoing', action: 'Open site', go: go('siteb') });
    var scopedCrit = attention.filter(function (a) { return a.c === CRIT; }).length, scopedWarn = attention.filter(function (a) { return a.c === WARN; }).length;
    var overall = scopedCrit ? { label: 'Degraded · ' + scopedCrit + ' critical', c: CRIT } : (scopedWarn ? { label: scopedWarn + ' warning' + (scopedWarn > 1 ? 's' : ''), c: WARN } : { label: 'All healthy', c: OK });
    overall.tint = overall.c + '22';
    var worstOf = function (ids) { var w = 'ok'; ids.forEach(function (k) { if (!O[k] || !inScope(O[k])) return; var s = O[k].st; if (s === 'crit') w = 'crit'; else if (s === 'warn' && w !== 'crit') w = 'warn'; }); return w; };
    var dom = function (t, ids, v1, l1, v2, l2, n, r) { var w = worstOf(ids); var cnt = ids.filter(function (k) { return O[k] && inScope(O[k]) && O[k].st === w; }).length; return { t: t, c: stOf(w)[1], s: w === 'ok' ? 'OK' : cnt + ' ' + (w === 'crit' ? 'down' : 'warn'), v1: v1, l1: l1, v2: v2, l2: l2, note: n, go: to(r) }; };
    var guestIds = objsOf(['VM', 'LXC']), ctrIds = objsOf(['Container']);
    var domains = [
      dom('Sites & WAN', ['home', 'siteb'], st.scope === 'all' ? '2' : '1', 'sites', st.scope === 'b' ? '1' : (st.scope === 'home' ? '2' : '3'), 'uplinks', 'Site Magic 18 ms', 'sites'),
      dom('Hosts', objsOf(['Host']), String(objsOf(['Host']).length), 'physical', String(objsOf(['Network device']).length), 'network devices', M ? 'delphi thermals' : 'olympus memory · delphi thermals', 'hosts'),
      dom('Power', objsOf(['UPS']), String(pwTotal), 'W now', String(objsOf(['UPS']).length), 'UPS', st.onBatt ? 'ON BATTERY · ' + runtime + ' min left' : 'mains OK · UPS 42% loaded', 'power'),
      dom('Workloads', guestIds.concat(ctrIds), String(guestIds.length), 'VMs & LXCs', String(ctrIds.length), 'containers', S ? 'all containers healthy' : 'sonarr restarting', 'guests'),
      dom('Storage', st.scope === 'b' ? ['synology'] : ['atlas'], st.scope === 'b' ? '61%' : '82%', st.scope === 'b' ? 'Synology' : 'Atlas used', st.scope === 'all' ? '2' : '1', 'pools', 'offsite replication OK', 'storage'),
      dom('Network', objsOf(['VLAN']).concat(objsOf(['Network device'])), String(objsOf(['VLAN']).length), 'VLANs', String(objsOf(['Network device']).length), 'devices', 'VLAN 5 & 666 still planned', 'network')
    ];
    if (st.scope !== 'b') domains.push(dom('Edge & cloud', ['k2so', 'chopper', 'r2d2', 'c3po', 'bb8'], String(objsOf(['VPS']).length), 'VPS', String(objsOf(['Provider']).length), 'providers', K ? 'all tunnels up' : 'k2so tunnel stale', 'edge'));
    if (D.proxmox) domains.push({ t: 'Data protection', c: OK, s: 'OK', v1: '27/27', l1: 'backed up', v2: '3-2-1', l2: 'for 24 guests', note: 'offsite ' + (st.rep === 'done' ? 'just now' : '02:47'), go: to('protection') });
    if (st.scope !== 'b' && D.netbox) domains.push({ t: 'Drift & CMDB', c: openDrift.length ? INFO : OK, s: openDrift.length ? openDrift.length + ' diffs' : 'in sync', v1: nb.objectCount, l1: 'objects in NetBox', v2: String(openDrift.length), l2: 'differ', note: 'NetBox ↔ observed', go: to('drift') });
    var changes = [];
    if (K) changes.push({ t: 'now', k: 'Edge', x: 'k2so peer endpoint updated · tunnel restored', c: OK });
    if (M) changes.push({ t: 'now', k: 'Hosts', x: 'icarus live-migrated olympus → prometheus', c: OK });
    if (S) changes.push({ t: 'now', k: 'Workloads', x: 'sonarr limit raised to 1.5 GB · restarted', c: OK });
    changes = changes.concat(feed('changes').slice().sort(function (x, y) { return x.t < y.t ? 1 : -1; }).map(function (c) { return { t: c.t, k: c.k, x: c.x, c: TXT }; }));

    // ---------- topology ----------
    var D = function (x, y, len, vert, color) { return vert ? { x: x, y: y, w: 0, h: len, bg: 'transparent', bt: 'none', bl: '2px dashed ' + color } : { x: x, y: y, w: len, h: 0, bg: 'transparent', bt: '2px dashed ' + color, bl: 'none' }; };
    var Sl = function (x, y, w, h) { return { x: x, y: y, w: w, h: h, bg: LINK, bt: 'none', bl: 'none' }; };
    var P = function (x, y, t, c, b) { return { x: x, y: y, t: t, c: c || MUTE, b: b || '#2A313C' }; };
    var hb = function (l, p, v) { var c = barColor(p); return { l: l, w: Math.min(100, p) + '%', v: v || p + '%', c: c, tc: c === OK ? TXT : c }; };
    var isB = st.scope === 'b';
    var tNodes = isB ? [
      { id: 'siteb', type: 'net', x: 436, y: 24, w: 168, h: 72, name: 'Internet', sub: 'Mobile Vikings · FTTH' },
      { id: 'udmse', type: 'net', x: 436, y: 184, w: 168, h: 72, name: 'UDM Pro SE', sub: 'Gateway · 16-port PoE' },
      { id: 'home', type: 'net', x: 776, y: 184, w: 240, h: 72, name: 'Home lab', sub: 'via Site Magic' },
      { id: 'synology', type: 'host', x: 360, y: 328, w: 152, h: 136, name: 'Synology NAS', sub: 'DSM · SHR-2', bars: [hb('Vol', 61), hb('CPU', 8)] },
      { id: 'vlan200', type: 'net', x: 560, y: 328, w: 200, h: 72, name: 'Clients · VLAN 200', sub: '3 devices' }
    ] : [
      { id: 'ovh', type: 'group', x: 24, y: 24, w: 196, h: 120, name: 'OVH', sub: '3 VPS', vps: ['r2d2', 'c3po', 'bb8'] },
      { id: 'quicksrv', type: 'group', x: 232, y: 24, w: 192, h: 94, name: 'Quicksrv.io', sub: '2 VPS', vps: ['k2so', 'chopper'] },
      { id: 'home', type: 'net', x: 436, y: 24, w: 168, h: 72, name: 'Internet', sub: 'DIGI ● · 5G ○' },
      { id: 'cloudflare', type: 'net', x: 660, y: 24, w: 168, h: 72, name: 'Cloudflare', sub: '3 tunnels · DNS' },
      { id: 'scaleway', type: 'net', x: 848, y: 24, w: 168, h: 72, name: 'Scaleway', sub: 'Wellmade · 4 VPS' },
      { id: 'udm', type: 'net', x: 436, y: 184, w: 168, h: 72, name: 'UDM Pro Max', sub: 'Gateway · 6 VLANs' },
      { id: 'access', type: 'net', x: 40, y: 328, w: 200, h: 72, name: 'Access switch', sub: 'Sparta · Pis · +11' },
      { id: 'agg', type: 'net', x: 436, y: 328, w: 168, h: 72, name: 'USW-Aggregation', sub: '8× SFP+ · 5 up' },
      { id: 'siteb', type: 'net', x: 776, y: 328, w: 240, h: 72, name: 'Site B', sub: 'UDM Pro SE · Synology · Vikings' },
      { id: 'olympus', type: 'host', x: 24, y: 448, name: 'Olympus', sub: 'Proxmox · MS-01', bars: [hb('CPU', 38), hb('RAM', M ? 73 : 91)] },
      { id: 'prometheus', type: 'host', x: 192, y: 448, name: 'Prometheus', sub: 'Proxmox · A2000', bars: [hb('CPU', 22), hb('RAM', M ? 76 : 58)] },
      { id: 'hyperion', type: 'host', x: 360, y: 448, name: 'Hyperion', sub: 'Planned', bars: [] },
      { id: 'kronos', type: 'host', x: 528, y: 448, name: 'Kronos', sub: 'Ollama · 2 GPU', bars: [hb('CPU', 9), hb('GPU', 31)] },
      { id: 'delphi', type: 'host', x: 696, y: 448, name: 'Delphi', sub: 'vLLM · 2× 3090', bars: [hb('GPU', 94), hb('Temp', 83, '83°')] },
      { id: 'alexandria', type: 'host', x: 864, y: 448, name: 'Alexandria', sub: 'TrueNAS · Atlas', bars: [hb('Pool', 82), hb('ARC', 96)] }
    ];
    var tLines = isB ? [Sl(519, 96, 2, 88), D(604, 219, 172, false, SM), Sl(519, 256, 2, 44), Sl(436, 299, 225, 2), Sl(435, 299, 2, 29), Sl(659, 299, 2, 29), D(512, 440, 386, false, FLOW), D(897, 256, 185, true, FLOW)] :
      [D(121, 144, 12, true, TUN), D(327, 118, 38, true, TUN), D(743, 96, 60, true, TUN), D(931, 96, 60, true, TUN), D(122, 155, 810, false, TUN), Sl(519, 96, 2, 88), Sl(519, 256, 2, 72), Sl(140, 291, 380, 2), Sl(139, 291, 2, 37), D(604, 219, 292, false, SM), D(895, 219, 109, true, SM),
        Sl(519, 400, 2, 24), Sl(100, 423, 841, 2), Sl(99, 423, 2, 25), Sl(267, 423, 2, 25), D(435, 423, 25, true, '#4A5361'), Sl(603, 423, 2, 25), Sl(771, 423, 2, 25), Sl(939, 423, 2, 25), D(989, 400, 48, true, FLOW)];
    var tPills = isB ? [P(530, 120, 'FTTH · single uplink'), P(640, 228, 'Site Magic · 18 ms', '#C9A8FF', '#3D2C5C'), P(690, 448, 'rsync from Atlas · nightly', FLOW, '#1F4A44')] :
      [P(150, 164, 'Edge tunnels · WireGuard', '#7DB4FF', '#2A3D57'), P(530, 112, 'XGS-PON · 10G'), P(530, 296, '10 GbE'), P(260, 270, '1 GbE'), P(690, 228, 'Site Magic · 18 ms', '#C9A8FF', '#3D2C5C'), P(994, 412, 'rsync', FLOW, '#1F4A44')];
    var LAYER = { Host: 'compute', 'Network device': 'network', Site: 'network', VLAN: 'network', Provider: 'external', VPS: 'external' };
    var topoNodes = tNodes.filter(function (n) { return O[n.id]; }).map(function (n) {
      var o = O[n.id];
      var s = o ? o.st : 'ok';
      var lay = o ? (n.id === 'siteb' && !isB ? 'external' : (n.id === 'home' && isB ? 'external' : LAYER[o.type])) : 'network';
      var vis = st.layer === 'all' || lay === st.layer;
      var r = { x: n.x, y: n.y, w: n.w || 152, h: n.h || 136, name: n.name, sub: n.sub, dot: s === 'plan' ? 'transparent' : stOf(s)[1], dotB: s === 'plan' ? '1.5px solid #9AA4B2' : 'none',
        isBtn: n.type !== 'group', isGroup: n.type === 'group', go: go(n.id), bars: n.bars || [], jc: n.type === 'host' ? 'flex-start' : 'center',
        bs: s === 'plan' ? 'dashed' : 'solid', bg: s === 'crit' ? '#1F1416' : (s === 'plan' ? '#12161C' : '#161B22'), op: vis ? '1' : '0.22' };
      if (n.vps) r.vps = n.vps.filter(function (v) { return O[v]; }).map(function (v) { var vo = O[v]; return { n: v, t: '→ ' + vo.sub.split(' → ')[1], c: stOf(vo.st)[1], go: go(v) }; });
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
    var srcUp = mock ? SOURCES.filter(function (x) { return !st.off[x.id] && x.health !== 'warn'; }).length : 0;
    var srcDot = !mock ? MUTE : (srcUp < SOURCES.length ? WARN : OK);
    var dotFor = {
      hosts: stOf(worstOf(objsOf(['Host'])))[1], power: stOf(worstOf(objsOf(['UPS'])))[1], storage: stOf(worstOf(['atlas', 'synology']))[1], network: stOf(worstOf(objsOf(['VLAN'])))[1],
      edge: stOf(worstOf(objsOf(['VPS'])))[1], services: stOf(worstOf(objsOf(['Service'])))[1], guests: stOf(worstOf(guestIds))[1], containers: stOf(worstOf(ctrIds))[1],
      drift: openDrift.length && st.scope !== 'b' ? INFO : null, sources: srcDot === OK ? null : srcDot
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
      scopes: seg(st.scope, 'scope', [['all', 'All sites', noData ? MUTE : overall.c], ['home', 'Home lab', O.home ? stOf(O.home.st)[1] : MUTE], ['b', 'Site B', O.siteb ? stOf(O.siteb.st)[1] : MUTE]]),
      ranges: seg(st.range, 'range', [['live', 'Live'], ['1 h', '1 h'], ['24 h', '24 h'], ['7 d', '7 d']]),
      rangeLabel: st.range === 'live' ? 'live' : 'last ' + st.range,
      srcLabel: srcUp + ' / ' + SOURCES.length + ' sources', srcDot: srcDot,
      noData: noData, mock: { on: mock, toggle: function () { setMode(mock ? 'live' : 'mock'); } }, goSources: to('sources'),
      bell: bell, bellOpen: st.bell, bellEmpty: openAlerts.length === 0,
      bellItems: openAlerts.map(function (a) { return { title: a.title, where: a.where, when: a.when, c: SEVC[a.sev], go: goAlert(a) }; }),
      toggleBell: function () { self.setState({ bell: !self.state.bell, palette: false }); }, goAlerts: to('alerts'), goHome: to('home'),
      groups: groups, sideW: side ? '232px' : '64px', toggleSide: function () { self.setState({ side: !self.state.side }); },
      crumbs: crumbs,
      isHome: route === 'home', isTopo: route === 'topology', isPower: route === 'power', pw: pw, isList: !!PAGES[route], isObj: route === 'obj' && !!O[st.obj],
      scopeLine: { all: 'All sites · Home lab and Site B', home: 'Home lab · olympus-cluster', b: 'Site B · offsite' }[st.scope],
      overall: overall, attention: attention, attentionN: String(attention.length), noAttention: attention.length === 0, domains: domains, changes: changes,
      topo: { h: isB ? 500 : 616, nodes: topoNodes, lines: tLines, pills: tPills, sub: isB ? 'Site B' : 'Home lab · switch site in the top bar for Site B' },
      layers: seg(st.layer, 'layer', [['all', 'All'], ['compute', 'Compute'], ['network', 'Network'], ['external', 'External']]),
      page: page, o: oVals,
      paletteOpen: st.palette, openPalette: function () { self.setState({ palette: true, bell: false }); },
      closePalette: function () { self.setState({ palette: false, pq: '' }); },
      pq: st.pq, onPq: function (e) { self.setState({ pq: e.target.value }); }, results: results, noResults: results.length === 0
    };
}
