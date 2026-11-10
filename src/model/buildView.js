/**
 * View model for the Pantheon UI.
 *
 * Ported from the design prototype: it holds the demo inventory (sites, hosts,
 * guests, containers, VLANs, VPS, UPS…) and turns the UI state into everything
 * the React components render. Colours for status-driven values are computed
 * here; static theme colours live in src/styles.css.
 *
 * `self` is the store (src/model/store.ts): `self.state`, `self.setState()`,
 * `self.nav()`, plus timer slots (`t`, `iv`, `ivU`).
 *
 * Replace the registry below with real data sources when the backend exists.
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

    // ---------- card builders ----------
    var barColor = function (p, w, c) { return p >= (c || 95) ? CRIT : (p >= (w || 80) ? WARN : OK); };
    var kv = function (t, pairs, gc) { return { type: 'kv', t: t, gc: gc || one, items: pairs.map(function (p) { return { k: p[0], v: p[1], c: p[2] || TXT }; }) }; };
    var bars = function (t, arr, gc) { return { type: 'bars', t: t, gc: gc || one, items: arr.map(function (b) { var c = b[3] || barColor(b[1]); return { l: b[0], w: Math.min(100, b[1]) + '%', v: b[2] || (b[1] + '%'), c: c, tc: c === OK ? TXT : c }; }) }; };
    var temps = function (t, arr, gc) { return { type: 'bars', t: t, gc: gc || one, items: arr.map(function (b) { var c = b[1] >= b[3] ? CRIT : (b[1] >= b[2] ? WARN : (b[1] / b[2] < 0.68 ? '#2E7DD1' : OK)); return { l: b[0], w: Math.min(100, Math.round(b[1] / b[3] * 100)) + '%', v: b[1] + ' °C', c: c, tc: c === WARN || c === CRIT ? c : TXT }; }) }; };
    var list = function (t, items, gc) { return { type: 'list', t: t, gc: gc || one, items: items }; };
    var R = function (id, s, r, rc) { return { ref: id, s: s || '', r: r || '', rc: rc }; };
    var I = function (t, s, r, c, rc) { return { t: t, s: s || '', r: r || '', c: c || OK, rc: rc }; };
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

    // ---------- object registry ----------
    var O = {};
    var add = function (id, o) { o.id = id; O[id] = o; return o; };
    var stOf = function (k) { return ST[k]; };

    // Sites
    add('home', { type: 'Site', ab: 'HOME', name: 'Home lab', site: 'home', st: st.onBatt ? 'crit' : (M && K ? 'ok' : 'warn'), sub: 'olympus-cluster · UDM Pro Max · DIGI XGS-PON + 5G',
      tabs: {
        Overview: [bars('Site health', [['Hosts healthy', M ? 60 : 40, M ? '3 / 5' : '2 / 5', M ? OK : WARN], ['WAN usage', 38, '3.8 / 10 Gbps'], ['Site Magic latency', 18, '18 ms', OK]]),
          kv('Facts', [['Gateway', 'UDM Pro Max'], ['VLANs', '1 · 10 · 30 · 70 · 80 · 95'], ['Clients', '63'], ['Rack', '16U · basement']])],
        Uplinks: [list('Internet uplinks', [I('DIGI · XGS-PON 10G', 'PPPoE · LuLeey SFP stick', 'ACTIVE · 4 ms', OK, OK), I('5G SIM', '€5/month · tested Sun', 'STANDBY', MUTE)], full)],
        Devices: [list('Infrastructure', [R('udm'), R('agg'), R('access'), R('olympus'), R('prometheus'), R('kronos'), R('delphi'), R('alexandria'), R('hyperion')], full)]
      },
      rel: [['Linked sites', [R('siteb', 'Site Magic · 18 ms')]], ['Edge providers', [R('ovh'), R('quicksrv'), R('scaleway'), R('cloudflare')]]] });
    add('siteb', { type: 'Site', ab: 'B', name: 'Site B', site: 'b', st: 'ok', sub: 'UDM Pro SE · Mobile Vikings FTTH · 10.200.0.0/24',
      tabs: {
        Overview: [bars('Site health', [['Synology volume', 61], ['Site Magic latency', 18, '18 ms', OK], ['WAN usage', 22, '220 Mbps']]),
          kv('Facts', [['Gateway', 'UDM Pro SE'], ['Uplink', 'Mobile Vikings · single', WARN], ['VLAN', '200'], ['Clients', '3']]),
          note('Single uplink', 'Site B has no failover. If Mobile Vikings drops, the nightly Atlas → Synology replication fails until it is back.', '#5A4A1F')],
        Uplinks: [list('Internet uplinks', [I('Mobile Vikings · FTTH', 'single uplink', 'ACTIVE · 7 ms', OK, OK)], full)],
        Devices: [list('Devices', [R('udmse'), R('synology'), R('vlan200')], full)]
      },
      rel: [['Linked sites', [R('home', 'Site Magic · 18 ms')]], ['Data flows in', [R('atlas', 'rsync nightly → atlas-offsite')]]] });

    // Network devices
    var netdev = function (id, name, site, sub, facts, metrics, rel) {
      return add(id, { type: 'Network device', ab: 'NET', name: name, site: site, st: 'ok', sub: sub,
        tabs: { Overview: [bars('Load', metrics), kv('Facts', facts)], Events: [list('Events', [I('Firmware check', 'up to date', 'Sun', OK)], full)] }, rel: rel });
    };
    netdev('udm', 'UDM Pro Max', 'home', 'Home gateway · firewall · 10.1.0.1', [['VLANs', '6 active · 2 planned'], ['Clients', '63'], ['IDS events (24 h)', '2'], ['Site Magic', 'Site B · up']], [['CPU', 24], ['Memory', 61], ['WAN', 51, '5.1 / 10 Gbps']], [['Site', [R('home')]], ['Downstream', [R('agg'), R('access')]]]);
    netdev('agg', 'USW-Aggregation', 'home', '10 GbE core · 8× SFP+', [['Ports up', '5 / 8'], ['Errors (24 h)', '0'], ['Temp', '48 °C']], [['Peak port load', 34]], [['Upstream', [R('udm')]], ['Connected', [R('olympus', 'port 3'), R('prometheus', 'port 4'), R('kronos', 'port 5'), R('delphi', 'port 6'), R('alexandria', 'port 7')]]]);
    netdev('access', 'Access switch', 'home', '1 GbE · PoE · clients & Pis', [['Sparta', 'online'], ['hestia-rpi', 'Pi-hole secondary'], ['office-hifi', 'AirPlay · idle'], ['Other clients', '11']], [['PoE budget', 22, '22 / 100 W']], [['Upstream', [R('udm')]]]);
    netdev('udmse', 'UDM Pro SE', 'b', 'Site B gateway · 16-port PoE', [['VLAN', '200'], ['Clients', '3'], ['Site Magic', 'Home lab · 18 ms']], [['CPU', 11], ['Memory', 47], ['PoE budget', 8, '15 / 180 W']], [['Site', [R('siteb')]], ['Connected', [R('synology')]]]);

    // Hosts
    var host = function (id, o) {
      o.type = o.type || 'Host'; o.ab = o.ab || 'HOST';
      o.tabs = { Overview: o.ov, Metrics: o.metrics || [], Hardware: o.hw || [], Guests: o.guests ? [list('Guests', o.guests, full)] : [], Network: o.net || [], Events: o.events || [], 'Asset & CMDB': o.asset || [] };
      return add(id, o);
    };
    var assetCard = function (model) { return kv('Physical asset (ITAM)', [['Model', model], ['Serial', '[SERIAL]'], ['Purchased', '[DATE] · [SUPPLIER]'], ['Warranty until', '[DATE]'], ['Location', 'Home lab · rack U[?]']]); };
    host('olympus', { name: 'Olympus', site: 'home', st: M ? 'ok' : 'warn', sub: 'srv-prox-01 · 10.30.0.11 · Minisforum MS-01 · cluster master',
      ov: [bars('Resources', [['CPU', 38], ['Memory', M ? 73 : 91, M ? '73% · 46.7 / 64 GB' : '91% · 58.2 / 64 GB'], ['local-nvme', 64]]),
        kv('Facts', [['CPU', 'i9-13900H · 20 threads'], ['Memory', '64 GB DDR5'], ['Proxmox', 'VE 8 · quorum 4 / 4'], ['Uptime', '23 d 4 h']])].concat(M ? [] : [{ type: 'note', t: 'Memory pressure · 118% allocated', text: 'Guests are configured for 75.5 GB on a 64 GB host. Ballooning is reclaiming RAM from apollo. Prometheus has 26 GB free: moving icarus there brings Olympus back to ~73%.', gc: full, bd: '#5A4A1F', btn: ['Live-migrate icarus → Prometheus', 'migrate'] }]),
      metrics: [chart('CPU', 38, 8, '%', 0, 1), chart('Memory', M ? 73 : 91, 1.5, '%', 90, 2), chart('Network', 1.8, 0.6, ' Gbps', 0, 3), chart('Package temp', 71, 3, ' °C', 90, 4)],
      hw: [temps('Temperatures', [['CPU package', 71, 90, 100], ['P-cores (hottest)', 78, 90, 100], ['E-cores', 66, 90, 100], ['DDR5 SO-DIMM', 54, 75, 85], ['NVMe 1 · local-nvme', 52, 65, 75], ['X710 SFP+', 58, 80, 90]]),
        fans('Fans', [['CPU blower', 3200], ['SSD fan', 2600]]), kv('Power', [['At the wall', '72 W'], ['CPU package', '38 W'], ['Source', 'Home Assistant plug']]),
        list('Drives · SMART', [I('NVMe 1 · local-nvme', '9 120 h', 'PASSED · 52 °C'), I('NVMe 2', '9 118 h', 'PASSED · 48 °C'), I('NVMe 3 · boot', '9 118 h', 'PASSED · 45 °C')])],
      guests: [R('apollo'), R('hermes')].concat(M ? [] : [R('icarus')]).concat([R('labk3s'), R('pihole'), R('gitea'), R('tailscale'), R('caddy'), R('monitoring')]),
      net: [list('Interfaces', [I('vmbr0 · X710 port 1', 'trunk · VLAN 1, 30, 70, 95', '10 GbE · 1.8 Gbps'), I('vmbr1 · 2.5 GbE', 'corosync ring', '2.5 GbE')], full)],
      events: [list('Events', [I('Memory crossed 90%', 'Proxmox API', '10:24', M ? MUTE : WARN), I('vzdump · 11 guests · OK', 'backup', '03:12'), I('Kernel 6.8 installed · reboot pending', 'apt', 'Mon', INFO)], full)],
      asset: [kv('CMDB record (NetBox)', [['Role', 'Proxmox node'], ['Cluster', 'olympus-cluster'], ['Primary IP', '10.30.0.11'], ['Mgmt IP', '10.1.0.21 (should be VLAN 5)', WARN]]), assetCard('Minisforum MS-01')],
      rel: [['Connected to', [R('agg', 'port 3 · 10 GbE')]], ['Depends on', [R('atlas', 'NFS nexus · chronicles')]], ['Edge tunnels in', [R('r2d2'), R('c3po'), R('k2so')]], ['Services', [R('svc-media'), R('svc-dns'), R('svc-ingress')]]] });
    host('prometheus', { name: 'Prometheus', site: 'home', st: 'ok', sub: 'srv-prox-02 · 10.30.0.12 · i5-13500 · RTX A2000',
      ov: [bars('Resources', [['CPU', 22], ['Memory', M ? 76 : 58, M ? '76% · +12 GB icarus' : '58%'], ['GPU · A2000', 41]]), kv('Facts', [['CPU', 'i5-13500 · turbo off'], ['Memory', '64 GB DDR4'], ['GPU', 'RTX A2000 6 GB']])],
      metrics: [chart('CPU', 22, 6, '%', 0, 5), chart('GPU', 41, 12, '%', 0, 6)],
      hw: [temps('Temperatures', [['CPU package', 54, 85, 100], ['RTX A2000', 61, 83, 90], ['NVMe', 44, 65, 75]]), fans('Fans', [['CPU', 1100], ['Case', 900]]), kv('Power', [['At the wall', '96 W']])],
      guests: [R('aurora'), R('hephaestus'), R('ocr')].concat(M ? [R('icarus', 'migrated just now')] : []),
      events: [list('Events', [I('3 container image updates', 'registry check', 'Mon', INFO)], full)],
      asset: [assetCard('Custom · i5-13500')], rel: [['Connected to', [R('agg', 'port 4')]], ['Services', [R('svc-dev'), R('svc-ai')]], ['Edge tunnels in', [R('chopper', 'VLAN 70')]]] });
    host('kronos', { name: 'Kronos', site: 'home', st: st.onBatt ? 'crit' : 'ok', sub: 'Dell Precision T5610 · 2× Xeon · RTX 5060 Ti + A2000',
      ov: [bars('Resources', [['CPU', 9], ['Memory', 34], ['GPU · 5060 Ti', 31]]), kv('Facts', [['Ollama', '2 instances'], ['Models', 'qwen3 · nomic-embed'], ['Power', '142 W']])],
      hw: [temps('Temperatures', [['CPU 0', 48, 80, 90], ['CPU 1', 51, 80, 90], ['RTX 5060 Ti', 58, 83, 90]]), fans('Fans', [['Front', 800], ['Rear', 850]])],
      guests: [R('ollama-a'), R('ollama-b')], asset: [assetCard('Dell Precision T5610')], rel: [['Connected to', [R('agg', 'port 5')]], ['Services', [R('svc-ai')]]] });
    host('delphi', { name: 'Delphi', site: 'home', st: st.onBatt ? 'crit' : 'warn', sub: 'Inference · i5-13500T · 2× RTX 3090',
      ov: [bars('Resources', [['GPU 0 load', 94, '94%', OK], ['VRAM', 88, '42 / 48 GB'], ['CPU', 18]]), kv('Facts', [['Engine', 'vLLM tensor-parallel'], ['Throughput', '38 tok/s'], ['Power', '762 W']]),
        { type: 'note', t: 'GPU 1 memory at 101 °C', text: 'GPU 1 breathes air already heated by GPU 0. GDDR6X throttles near 110 °C; sustained 100 °C+ shortens its life. A riser to space the cards or a 300 W power cap usually costs under 5% tokens/s.', gc: full, bd: '#5A4A1F' }],
      metrics: [chart('GPU 1 temp', 83, 2, ' °C', 83, 7), chart('Tokens/s', 38, 6, '', 0, 8)],
      hw: [temps('Temperatures', [['GPU 0 core', 76, 83, 90], ['GPU 0 VRAM junction', 92, 100, 110], ['GPU 1 core', 83, 83, 90], ['GPU 1 VRAM junction', 101, 100, 110], ['CPU', 58, 85, 100], ['NVMe', 49, 65, 75]], full),
        fans('Fans', [['GPU 0', 1950], ['GPU 1', 2400], ['Front', 1400], ['Rear', 1300]]), kv('Power', [['At the wall', '762 W'], ['GPU 0 / 1', '340 / 348 W'], ['Energy today', '9.4 kWh']])],
      guests: [R('vllm')], asset: [assetCard('Custom · 2× RTX 3090')], rel: [['Connected to', [R('agg', 'port 6')]], ['Services', [R('svc-ai')]]] });
    host('alexandria', { name: 'Alexandria', site: 'home', st: 'warn', sub: 'TrueNAS Scale · X9SRI-F · 128 GB ECC',
      ov: [bars('Resources', [['Pool Atlas', 82, '82% · 65 / 80 TB'], ['ARC hit rate', 96, '96%', OK], ['CPU', 12]]), kv('Facts', [['Pool', 'Atlas · RAIDZ-2 · 6 × 20 TB'], ['SLOG / L2ARC', 'Optane P4800X'], ['Last scrub', '6 d ago · 0 errors']])],
      metrics: [chart('Pool used', 82, 0.5, '%', 80, 9), chart('NFS throughput', 640, 180, ' MB/s', 0, 10)],
      hw: [temps('Temperatures', [['Exos bay 1', 36, 45, 55], ['Exos bay 2', 37, 45, 55], ['Exos bay 3', 39, 45, 55], ['Exos bay 4', 46, 45, 55], ['Exos bay 5', 38, 45, 55], ['Exos bay 6', 36, 45, 55], ['CPU', 52, 75, 85], ['HBA · LSI', 61, 70, 80], ['Optane', 44, 65, 70]], full),
        fans('Fans · IPMI Standard', [['FAN1 CPU', 1100], ['FAN2 front', 900], ['FAN3 front', 900], ['FAN4 rear', 1000]]), kv('Power (IPMI)', [['System', '168 W'], ['12 V', '12.06 V'], ['5 V', '5.02 V'], ['3.3 V', '3.31 V']])],
      guests: [R('atlas', 'pool'), I('garage', 'TrueNAS app · S3', 'running')],
      asset: [assetCard('Supermicro X9SRI-F · Thermaltake')], rel: [['Connected to', [R('agg', 'port 7 · 10 GbE')]], ['Pools', [R('atlas')]], ['Replicates to', [R('synology', 'Site B · nightly')]]] });
    host('hyperion', { name: 'Hyperion', site: 'home', st: 'plan', sub: 'srv-prox-03 · planned · shared dev platform',
      ov: [kv('Declared in NetBox', [['CPU', 'i5-13500'], ['Board', 'B760M DS3H DDR4 · to order'], ['Memory', '2 × 32 GB (from Sparta)'], ['NIC', '82599ES dual SFP+'], ['Role', 'PostgreSQL · Garage · dev services']], full)],
      rel: [['Will connect to', [R('agg')]], ['Services', [R('svc-dev')]]] });
    host('synology', { name: 'Synology NAS', site: 'b', st: 'ok', sub: 'Site B · DSM · SHR-2 · 10.200.0.10',
      ov: [bars('Resources', [['Volume', 61], ['CPU', 8], ['Memory', 34]]), kv('Facts', [['Share', '/volume1/atlas-offsite'], ['Snapshots', '30 d retention'], ['Last replication', 'today 02:47 · OK', OK]])],
      hw: [temps('Temperatures', [['Disk 1', 34, 45, 55], ['Disk 2', 35, 45, 55], ['Disk 3', 35, 45, 55], ['Disk 4', 34, 45, 55], ['System', 41, 60, 70]]), fans('Fans', [['System', 1050]])],
      asset: [assetCard('Synology')], rel: [['Site', [R('siteb')]], ['Receives from', [R('atlas', 'rsync nightly')]]] });

    // Pools
    add('atlas', { type: 'Pool', ab: 'POOL', name: 'Atlas', site: 'home', st: 'warn', sub: 'alexandria · ZFS RAIDZ-2 · 6 × 20 TB',
      tabs: { Overview: [bars('Capacity', [['Used', 82, '65 / 80 TB'], ['Projected at 85%', 30, 'in ~9 days', WARN]]), kv('Health', [['State', 'ONLINE'], ['Last scrub', '6 d · 0 errors'], ['SLOG', 'Optane P4800X'], ['Compression', 'lz4 · 1.31×']])],
        Datasets: [list('Datasets', [I('chronicles', 'movies & TV', '41.2 TB'), I('forge', 'downloads · +1.4 TB this week', '9.8 TB', WARN, WARN), I('nexus', 'service data · NFS', '3.1 TB'), I('vault', 'sensitive · encrypted', '1.4 TB'), I('melodies', 'music', '2.6 TB'), I('scrolls', 'documents', '0.4 TB'), I('limbo', 'staging', '6.5 TB')], full)],
        Protection: [list('Copies', [I('Snapshots', 'hourly · 48 h, daily · 30 d', 'OK'), I('Offsite · Synology Site B', 'vault · scrolls · nexus', 'today 02:47', OK)], full)] },
      rel: [['Host', [R('alexandria')]], ['Used by', [R('apollo', 'chronicles · melodies'), R('hermes', 'forge · chronicles'), R('olympus', 'nexus backups')]], ['Replicates to', [R('synology')]]] });

    // Guests
    var guest = function (id, kind, hostId, ip, role, s, res, cfg, ctrs, extra) {
      extra = extra || {};
      var ab = kind === 'VM' ? 'VM' : 'LXC';
      var tabs = { Overview: [bars('Resources', res), kv('Configuration', cfg)].concat(extra.notes || []) };
      tabs[kind === 'VM' ? 'Containers' : 'Services'] = ctrs.length ? [list(kind === 'VM' ? 'Docker containers' : 'Containers / services', ctrs, full)] : [note('No containers', 'No Docker runtime in this guest. Metrics come from the Proxmox API and node_exporter.')];
      tabs.Network = [kv('Interface', [['net0', 'virtio · vmbr0'], ['VLAN', extra.vlan || '30'], ['Address', ip], ['MAC', 'BC:24:11:' + (id.length * 7 % 90 + 10) + ':0F:' + (id.length * 3 + 10)]]), list('Firewall', extra.fw || [I('ALLOW in tcp 22 from VLAN 1', '', '', OK), I('DROP in * (policy)', '', '', CRIT)])];
      tabs.Backups = [list('3-2-1', extra.copies || [I('Production', 'local-nvme', '✓'), I('Nightly vzdump', 'alexandria · nexus/backups · 03:00', '✓'), I('Offsite', 'Synology · via Atlas → Synology', '✓')]), list('Runs', [I('vzdump · snapshot', 'today 03:12', 'OK'), I('vzdump · snapshot', 'yesterday 03:11', 'OK')])];
      var diff = extra.diff || [];
      var accepted = st.accepted[id];
      tabs['Asset & CMDB'] = [list('Declared (NetBox) vs observed', diff.length ? diff.map(function (d) { var same = accepted; return I(d[0], 'NetBox: ' + (same ? d[2] : d[1]), 'observed: ' + d[2] + (same ? ' ✓' : ' ≠'), same ? OK : WARN, same ? OK : WARN); }) : [I('All fields match', 'site · host · VLAN · IP · vCPU · memory', '✓')], full),
        kv('CMDB record', [['Role', role], ['Owner', 'Totophe'], ['Lifecycle', kind === 'VM' && s === 'off' ? 'Test' : 'Production'], ['Criticality', extra.crit || 'Low']])];
      if (diff.length && !accepted) tabs['Asset & CMDB'][0].btn = ['Accept observed → update NetBox', 'accept:' + id];
      tabs.Events = [list('Events', extra.events || [I('Started', 'Proxmox', '23 d ago', MUTE)], full)];
      return add(id, { type: kind, ab: ab, name: id === 'tailscale' ? 'tailscale-sr' : id, site: O[hostId] ? O[hostId].site : 'home', st: s, sub: kind + ' · on ' + (O[hostId] ? O[hostId].name : hostId) + ' · ' + ip + ' · ' + role,
        host: hostId, ip: ip, tabs: tabs, rel: [['Runs on', [R(hostId)]]].concat(extra.rel || []) });
    };
    guest('apollo', 'VM', 'olympus', '10.30.0.101', 'Media server', M ? 'ok' : 'warn', [['CPU · 6 vCPU', 14], ['Memory · 16 GB', M ? 88 : 100, M ? '14.1 GB' : '16.0 GB · ballooning'], ['Disk · 128 GB', 47]],
      [['vCPU', '6'], ['Memory', '16 GB · balloon min 8'], ['hostpci0', 'Iris Xe · Quick Sync'], ['OS', 'Ubuntu 24.04']], [R('plex'), R('tautulli'), R('audiobookshelf'), R('komga')],
      { diff: [['Memory', '12 GB', '16 GB'], ['PCI passthrough', 'none', 'Iris Xe']], crit: 'Medium', rel: [['Depends on', [R('atlas', 'chronicles · melodies (ro)'), R('hermes', 'imports')]], ['Exposed by', [R('c3po', 'Plex relay'), R('caddy', 'plex.home.lan')]], ['Service', [R('svc-media')]]],
        copies: [I('Production', 'local-nvme', '✓'), I('Nightly vzdump', 'config only', '✓'), I('Offsite', 'media excluded by design', '—', MUTE)] });
    guest('hermes', 'VM', 'olympus', '10.30.0.102', 'ARR stack', S ? 'ok' : 'warn', [['CPU · 4 vCPU', 19], ['Memory · 8 GB', 89, '7.1 GB'], ['Disk · 64 GB', 58]],
      [['vCPU', '4'], ['Memory', '8 GB · balloon min 6'], ['Disk', 'local-nvme · 64 GB'], ['OS', 'Debian 12']], [R('sonarr'), R('radarr'), R('lidarr'), R('prowlarr'), R('transmission'), R('overseerr')],
      { diff: [['Memory', '6 GB', '8 GB']], rel: [['Depends on', [R('atlas', 'forge · chronicles (rw)'), R('pihole', 'DNS')]], ['Used by', [R('apollo', 'library imports')]], ['Service', [R('svc-media')]]],
        events: [I('Watchtower updated 4 images', 'docker', '09:58', INFO), I('sonarr OOM-killed ×3', 'docker', '10:42', S ? MUTE : WARN)] });
    guest('icarus', 'VM', M ? 'prometheus' : 'olympus', '10.30.0.103', 'Always-on desktop', 'ok', [['CPU · 4 vCPU', 6], ['Memory · 12 GB', 95, '11.4 GB', OK], ['Disk', 31]], [['vCPU', '4'], ['Memory', '12 GB'], ['Display', 'SPICE · virtio-gpu']], [],
      { events: M ? [I('Live-migrated to Prometheus', 'Pantheon action', 'just now', OK)] : null });
    guest('labk3s', 'VM', 'olympus', '10.30.0.104', 'k3s test cluster', 'off', [['CPU', 0, 'stopped', MUTE], ['Memory', 0, '0 / 8 GB', MUTE]], [['vCPU', '4'], ['Memory', '8 GB']], [], {});
    guest('pihole', 'LXC', 'olympus', '10.30.0.110', 'DNS / ad-blocking', 'ok', [['CPU', 2], ['Memory · 1 GB', 40, '410 MB'], ['Queries', 18, '4.2 k/h', OK]],
      [['Cores', '1'], ['Unprivileged', 'yes'], ['rootfs', '8 GB'], ['Protection', 'on']], [I('pihole-FTL', 'systemd · 96 MB', 'active'), I('lighttpd', 'admin UI', 'active'), I('cron', 'gravity Sun 03:00', 'active')],
      { crit: 'High', fw: [I('ALLOW udp,tcp 53 from all VLANs', '', '', OK), I('ALLOW tcp 80 from caddy', '', '', OK), I('DROP * (policy)', '', '', CRIT)], rel: [['Used by', [R('hermes', 'DNS'), R('apollo', 'DNS'), I('All VLANs', 'primary resolver', '', OK)]], ['Pair', [I('hestia-rpi', 'secondary · Gravity Sync', '', OK)]], ['Service', [R('svc-dns')]]] });
    guest('gitea', 'LXC', 'olympus', '10.30.0.111', 'Git mirror', 'ok', [['CPU', 1], ['Memory · 2 GB', 45, '0.9 GB']], [['Cores', '2'], ['rootfs', '32 GB']], [R('gitea-app'), R('act-runner')], { rel: [['Service', [R('svc-dev')]]] });
    guest('tailscale', 'LXC', 'olympus', '10.1.0.30', 'Subnet router', 'ok', [['CPU', 1], ['Memory', 40, '0.2 GB']], [['Advertises', 'VLAN 1 · VLAN 30']], [], { vlan: '1', rel: [['Network', [R('vlan1'), R('vlan30')]]] });
    guest('caddy', 'LXC', 'olympus', '10.30.0.112', 'Reverse proxy', 'ok', [['CPU', 3], ['Memory', 30, '0.3 GB']], [['Routes', '18'], ['NICs', 'VLAN 30 + VLAN 95']], [R('caddy-proxy')], { vlan: '30 · 95', rel: [['Ingress from', [R('r2d2', 'VLAN 95')]], ['Service', [R('svc-ingress')]]] });
    guest('monitoring', 'LXC', 'olympus', '10.30.0.113', 'Metrics & probes', 'ok', [['CPU', 7], ['Memory · 4 GB', 65, '2.6 GB']], [['Cores', '2'], ['Disk', '64 GB']], [R('victoriametrics'), R('vmagent'), R('uptime-kuma'), R('pantheon')], {});
    guest('aurora', 'VM', 'prometheus', '10.30.0.61', 'Light inference · A2000', 'ok', [['CPU', 12], ['GPU', 41]], [['GPU', 'RTX A2000 passthrough']], [], { rel: [['Service', [R('svc-ai')]]] });
    guest('hephaestus', 'VM', 'prometheus', '10.30.0.60', 'Dev server', 'ok', [['CPU', 18], ['Memory', 62]], [['Devcontainers', '4 · VLAN 70']], [], { rel: [['Service', [R('svc-dev')]]] });
    guest('ocr', 'LXC', 'prometheus', '10.30.0.62', 'Document OCR', 'ok', [['CPU', 4], ['Memory', 38]], [['App', 'paperless-ngx · tika']], [], {});
    guest('vllm', 'VM', 'delphi', '10.30.0.70', 'vLLM tensor-parallel', 'warn', [['GPU 0', 94, '94%', OK], ['GPU 1 temp', 83, '83 °C', WARN]], [['GPUs', '2× RTX 3090 passthrough'], ['Model', 'Qwen3 32B · AWQ']], [R('vllm-server')], { rel: [['Service', [R('svc-ai')]]] });

    // Containers
    var ctr = function (id, name, guestId, image, s, mem, up, extra) {
      extra = extra || {};
      return add(id, { type: 'Container', ab: 'CTR', name: name, site: 'home', st: s, sub: image + ' · in ' + guestId, host: guestId,
        tabs: { Overview: [kv('Container', [['Image', image], ['State', up, s === 'warn' ? WARN : TXT], ['Memory', mem], ['Restart policy', 'unless-stopped']]), bars('Usage', [['CPU', extra.cpu || 3], ['Memory vs limit', extra.memp || 40, extra.memt]])].concat(extra.notes || []),
          Logs: [list('Recent events', extra.events || [I('Healthy', 'healthcheck', '1 min ago', OK)], full)] },
        rel: [['Runs in', [R(guestId)]]].concat(extra.rel || []) });
    };
    ctr('sonarr', 'sonarr', 'hermes', 'linuxserver/sonarr:4', S ? 'ok' : 'warn', S ? '820 MB / 1.5 GB' : '1.0 GB / 1 GB', S ? 'up 1 min' : 'restarting (OOM ×3)', {
      memp: S ? 55 : 100, memt: S ? '55%' : '100% · OOM',
      notes: S ? [] : [{ type: 'note', t: 'OOM-killed after update', text: 'Exit code 137 three times in an hour since Watchtower pulled a new image. The new version needs more than the 1 GB limit.', gc: full, bd: '#5A4A1F', btn: ['Raise limit to 1.5 GB & restart', 'sonarr'] }],
      events: S ? [I('Restarted with 1.5 GB limit', 'Pantheon action', 'just now', OK)] : [I('OOM-killed (137)', 'docker', '10:42', WARN), I('OOM-killed (137)', 'docker', '10:21', WARN), I('Image updated', 'watchtower', '09:58', INFO)],
      rel: [['Service', [R('svc-media')]]] });
    [['radarr', 'hermes', 'linuxserver/radarr', '612 MB'], ['lidarr', 'hermes', 'linuxserver/lidarr', '388 MB'], ['prowlarr', 'hermes', 'linuxserver/prowlarr', '201 MB'], ['transmission', 'hermes', 'linuxserver/transmission', '944 MB'], ['overseerr', 'hermes', 'sctx/overseerr', '256 MB'],
      ['plex', 'apollo', 'plexinc/pms-docker', '3.1 GB'], ['tautulli', 'apollo', 'tautulli/tautulli', '210 MB'], ['audiobookshelf', 'apollo', 'advplyr/audiobookshelf', '330 MB'], ['komga', 'apollo', 'gotson/komga', '640 MB'],
      ['gitea-app', 'gitea', 'gitea/gitea:1.22', '640 MB'], ['act-runner', 'gitea', 'gitea/act_runner', '120 MB'], ['caddy-proxy', 'caddy', 'lucaslorentz/caddy-docker-proxy', '90 MB'],
      ['victoriametrics', 'monitoring', 'victoriametrics/victoria-metrics', '1.4 GB'], ['vmagent', 'monitoring', 'victoriametrics/vmagent', '310 MB'], ['uptime-kuma', 'monitoring', 'louislam/uptime-kuma', '160 MB'], ['pantheon', 'monitoring', 'pantheon/server', '240 MB'],
      ['ollama-a', 'kronos', 'ollama/ollama', '6.2 GB'], ['ollama-b', 'kronos', 'ollama/ollama', '4.8 GB'], ['vllm-server', 'vllm', 'vllm/vllm-openai', '22 GB']
    ].forEach(function (c) { ctr(c[0], c[0].replace('-app', '').replace('caddy-proxy', 'caddy-docker-proxy'), c[1], c[2], 'ok', c[3], 'up ' + (c[1] === 'hermes' ? '6 d' : '23 d')); });

    // Providers & VPS
    var vps = function (id, prov, role, lands, targets, s, extra) {
      extra = extra || {};
      var tabs = { Overview: [kv('Tunnel', [['Type', extra.link || 'WireGuard'], ['Last handshake', s === 'crit' ? '14 min ago' : '2 s ago', s === 'crit' ? CRIT : TXT], ['Lands on', lands], ['RTT to home', s === 'crit' ? '—' : '11 ms']]), bars('Resources', [['CPU', extra.cpu || 6], ['Memory', extra.mem || 38]])].concat(extra.notes || []),
        Events: [list('Events', extra.events || [I('Handshake OK', 'WireGuard', 'continuous', OK)], full)] };
      if (extra.diag) tabs.Diagnostics = extra.diag;
      return add(id, { type: 'VPS', ab: 'VPS', name: id, site: 'home', st: s, sub: O[prov].name + ' · ' + role + ' → ' + lands, prov: prov,
        tabs: tabs, rel: [['Provider', [R(prov)]], ['Tunnels into', targets]].concat(extra.rel || []) });
    };
    add('ovh', { type: 'Provider', ab: 'OVH', name: 'OVH', site: 'home', st: 'ok', sub: 'Gravelines · 3 edge VPS' });
    add('quicksrv', { type: 'Provider', ab: 'QS', name: 'Quicksrv.io', site: 'home', st: K ? 'ok' : 'crit', sub: '2 edge VPS' });
    add('scaleway', { type: 'Provider', ab: 'SCW', name: 'Scaleway', site: 'home', st: 'ok', sub: 'fr-par · Wellmade fleet · 4 VPS' });
    add('cloudflare', { type: 'Provider', ab: 'CF', name: 'Cloudflare', site: 'home', st: 'ok', sub: '3 tunnels · 4 zones' });
    vps('r2d2', 'ovh', 'public ingress', 'VLAN 95 · caddy', [R('vlan95'), R('caddy')], 'ok', { rel: [['Service', [R('svc-ingress')]]] });
    vps('c3po', 'ovh', 'Plex relay', 'apollo', [R('apollo', 'tcp 32400')], 'ok', { cpu: 12, rel: [['Service', [R('svc-media')]]] });
    vps('bb8', 'ovh', 'mail & webhooks', 'hermes-tools', [R('hermes-tools', 'VPS ↔ VPS')], 'ok', { link: 'WireGuard VPS ↔ VPS', rel: [['Service', [R('svc-wellmade')]]] });
    var steps = [['Public HTTPS reachability (3 probes)', '200 · 38 ms', OK], ['ICMP from r2d2 (OVH)', '22 ms', OK], ['WireGuard peer on UDM', 'qsrv-01 · enabled', OK], ['Peer endpoint vs DNS', '203.0.113.7 ≠ .12', WARN], ['UDP 51820 to endpoint', 'no reply', CRIT]];
    var diagItems = steps.map(function (s, i) {
      if (K) return I(s[0], '', i < 3 ? s[1] : (i === 3 ? '203.0.113.12 ✓' : 'handshake OK'), OK, OK);
      var done = st.diag !== 'idle' && i < st.step, running = st.diag === 'running' && i === st.step;
      return I((i + 1) + '. ' + s[0], running ? 'checking…' : '', done ? s[1] : (running ? '…' : '—'), done ? s[2] : MUTE, done ? s[2] : MUTE);
    });
    var diagCard = list('Guided diagnostics', diagItems, full);
    if (!K) { diagCard.btn = st.diag === 'running' ? null : [st.diag === 'done' ? 'Run again' : 'Run diagnostics', 'diag']; }
    var diag = [diagCard];
    if (!K && st.diag === 'done') diag.push({ type: 'note', t: 'Likely cause: new public IP', text: 'The provider rebooted k2so and reassigned its address. DNS returns 203.0.113.12, the UDM peer still points to 203.0.113.7.', gc: full, bd: '#6B2A2A', btn: ['Update peer endpoint & re-handshake', 'fixk2so'] });
    if (K) diag.push({ type: 'note', t: 'Resolved', text: 'Endpoint updated to 203.0.113.12; handshake OK; alert auto-resolved. Tip: use a DNS name as peer endpoint so the next IP change heals itself.', gc: full, bd: '#2F5A3A' });
    vps('k2so', 'quicksrv', 'lab access edge', 'VLAN 30', [R('vlan30')], K ? 'ok' : 'crit', { cpu: 3, mem: 28, diag: diag,
      notes: K ? [] : [{ type: 'note', t: 'Tunnel down', text: 'Public probes succeed, but the WireGuard handshake to the home lab is 14 minutes stale. Open Diagnostics to find out why.', gc: full, bd: '#6B2A2A' }],
      events: K ? [I('Handshake restored', 'Pantheon action', 'just now', OK), I('Provider maintenance reboot', 'Quicksrv.io', '10:28', WARN)] : [I('Handshake stale > 5 min', 'alert fired', '10:31', CRIT), I('Provider maintenance reboot', 'Quicksrv.io', '10:28', WARN)] });
    vps('chopper', 'quicksrv', 'client previews', 'VLAN 70', [R('vlan70'), R('hephaestus', 'devcontainers')], 'ok', { rel: [['Service', [R('svc-dev')]]] });
    ['umami', 'crm', 'tools', 'monitor'].forEach(function (n) { vps('hermes-' + n, 'scaleway', 'Wellmade ' + n, 'Cloudflare tunnel', [R('cloudflare')], 'ok', { link: 'Cloudflare tunnel', rel: [['Service', [R('svc-wellmade')]]] }); });
    var provTabs = function (id) {
      var kids = Object.keys(O).filter(function (k) { return O[k].prov === id; });
      O[id].tabs = { Overview: [list('VPS', kids.map(function (k) { return R(k, O[k].sub.split(' · ').slice(1).join(' · ')); }), full)], Billing: [kv('Account', [['Monthly', '[AMOUNT]'], ['Renewal', '[DATE]']])] };
      O[id].rel = [['Site', [R('home')]]];
    };
    provTabs('ovh'); provTabs('quicksrv'); provTabs('scaleway');
    O.cloudflare.tabs = { Overview: [list('Tunnels', [I('olympus', 'cloudflared on caddy', 'up'), I('hermes-crm', 'Scaleway', 'up'), I('hermes-tools', 'Scaleway', 'up')], full), kv('DNS', [['Zones', '4'], ['Requests (24 h)', '41.2 k']])] };
    O.cloudflare.rel = [['Used by', [R('hermes-crm'), R('hermes-tools')]]];

    // VLANs
    var vlan = function (vid, name, site, subnet, zone, s, members, extra) {
      extra = extra || {};
      return add('vlan' + vid, { type: 'VLAN', ab: 'V' + vid, name: 'VLAN ' + vid + ' · ' + name, site: site, st: s, sub: subnet + ' · zone ' + zone,
        tabs: { Overview: [kv('Network', [['Subnet', subnet], ['Gateway', extra.gw || subnet.replace('0/24', '1')], ['DHCP', extra.dhcp || 'static only'], ['Zone', zone]])].concat(extra.notes || []),
          Members: [list('Members', members, full)], Policy: [list('Allowed to reach', extra.policy || [I('default deny', 'between zones', '', MUTE)], full)] },
        rel: [['Gateway', [R(site === 'b' ? 'udmse' : 'udm')]]] });
    };
    vlan(1, 'Mgmt', 'home', '10.1.0.0/24', 'Internal', 'warn', [R('udm'), R('agg'), R('access'), R('tailscale'), I('olympus mgmt', '10.1.0.21 · should be VLAN 5', '', WARN)], { notes: [note('Remediation', 'Proxmox management interfaces and IPMI still live here. NetBox declares them on VLAN 5.', '#5A4A1F')] });
    vlan(10, 'Home', 'home', '10.10.0.0/24', 'Trusted', 'ok', [I('Sparta', '.20'), I('office-hifi', '.31'), I('hestia-rpi', '.53'), I('+38 clients', 'phones, TVs, IoT', '', MUTE)], { dhcp: '.50–.250', policy: [I('Servers · VLAN 30', 'tcp 443, 32400, 53', 'ports', WARN), I('DMZ · VLAN 95', 'tcp 443', 'ports', WARN)] });
    vlan(30, 'Servers', 'home', '10.30.0.0/24', 'Servers', 'warn', [R('olympus'), R('prometheus'), R('kronos'), R('delphi'), R('alexandria'), R('apollo'), R('hermes'), R('pihole'), R('caddy'), I('3 undeclared IPs', '.87 · .88 · .91 (lab-k3s?)', '', WARN)],
      { notes: [note('Drift', '3 IPs answer on VLAN 30 that NetBox does not know about.', '#5A4A1F')], policy: [I('DMZ · VLAN 95', 'allow', 'allow', OK), I('Site B · VLAN 200', 'rsync 873 · ssh 22', 'ports', WARN)] });
    vlan(70, 'Customers', 'home', '10.70.0.0/24', 'Isolated', 'ok', [R('hephaestus', '4 devcontainers'), R('chopper', 'edge tunnel')], { policy: [I('Servers · VLAN 30', 'gitea 443 · postgres 5432', 'ports', WARN)] });
    vlan(95, 'DMZ', 'home', '10.95.0.0/24', 'DMZ', 'ok', [R('caddy', 'eth1 · .10'), R('r2d2', 'edge tunnel')], { policy: [I('Servers · VLAN 30', 'caddy → upstream ports', 'ports', WARN)] });
    vlan(200, 'Site B LAN', 'b', '10.200.0.0/24', 'Remote', 'ok', [R('synology', '.10'), R('udmse', '.1'), I('1 client', '', '', OK)], { dhcp: '.100–.199' });

    // Services
    var svc = function (id, name, desc, comps) {
      var worst = comps.reduce(function (w, c) { var s = O[c.ref] ? O[c.ref].st : 'ok'; return s === 'crit' ? 'crit' : (s === 'warn' && w !== 'crit' ? 'warn' : w); }, 'ok');
      return add(id, { type: 'Service', ab: 'SVC', name: name, site: 'home', st: worst, sub: desc,
        tabs: { Overview: [list('Components', comps, full)], 'Dependency path': [list('If this breaks…', comps.map(function (c) { return R(c.ref, 'part of ' + name); }), full)] }, rel: [] });
    };
    svc('svc-media', 'Media', 'Plex, ARR stack, libraries and remote access', [R('apollo', 'Plex & readers'), R('hermes', 'ARR stack'), R('sonarr', 'TV automation'), R('atlas', 'libraries'), R('c3po', 'remote relay')]);
    svc('svc-dns', 'DNS', 'Resolution and ad-blocking for every VLAN', [R('pihole', 'primary'), I('hestia-rpi', 'secondary', '', OK)]);
    svc('svc-ingress', 'Edge ingress', 'Public traffic into the home lab', [R('r2d2', 'OVH ingress'), R('caddy', 'reverse proxy'), R('vlan95', 'DMZ')]);
    svc('svc-dev', 'Dev platform', 'Customer devcontainers, git, previews', [R('hephaestus'), R('gitea'), R('chopper', 'client previews'), R('vlan70'), R('hyperion', 'planned')]);
    svc('svc-ai', 'AI inference', 'Local models for agents and apps', [R('kronos', 'Ollama'), R('delphi', 'vLLM'), R('aurora', 'light inference')]);
    svc('svc-wellmade', 'Wellmade apps', 'Client-facing apps on Scaleway', [R('hermes-umami'), R('hermes-crm'), R('hermes-tools'), R('hermes-monitor'), R('bb8', 'mail relay'), R('cloudflare')]);

    // ---------- UPS ----------
    var batt = st.onBatt ? st.batt : 100;
    var runtime = Math.max(1, Math.round(18 * batt / 100));
    var trig50 = st.onBatt && batt <= 50, trig5 = st.onBatt && runtime <= 5;
    add('ups-home', { type: 'UPS', ab: 'UPS', name: 'ups-rack', site: 'home', st: st.onBatt ? 'crit' : 'ok', sub: 'Home lab · [MODEL] 1500 VA / 1000 W · NUT on alexandria',
      tabs: {
        Overview: [bars('Battery & load', [['Battery', batt, batt + '%', batt <= 50 ? CRIT : (batt <= 80 ? WARN : OK)], ['Load', 42, '420 / 1000 W'], ['Runtime at this load', Math.round(runtime / 18 * 100), runtime + ' min', runtime <= 5 ? CRIT : (runtime <= 10 ? WARN : OK)]]),
          kv('Status', [['State', st.onBatt ? 'ON BATTERY' : 'On line', st.onBatt ? CRIT : OK], ['Input', st.onBatt ? '0 V · mains lost' : '231 V · 50 Hz', st.onBatt ? CRIT : TXT], ['Output', '230 V'], ['Last self-test', 'Sun 03:30 · passed'], ['Battery installed', '[DATE]'], ['Driver', 'NUT usbhid-ups']]),
          list('Protected devices', [R('udm', 'group 1 · stays up to the end'), R('agg', 'group 1 · stays up to the end'), R('prometheus', 'group 2 · off at 50%'), R('olympus', 'group 2 · off at 5 min left'), R('alexandria', 'group 3 · last, at 3 min left')]),
          list('Shutdown policy (NUT + Proxmox)', [
            I('At 50% battery', 'prometheus: guests stop, then host powers off', trig50 ? 'triggered' : 'armed', trig50 ? WARN : OK, trig50 ? WARN : MUTE),
            I('5 min of runtime left', 'olympus: guests shut down in order, then host', trig5 ? 'triggered' : 'armed', trig5 ? CRIT : OK, trig5 ? CRIT : MUTE),
            I('3 min of runtime left', 'alexandria: NFS clients gone, pool export, power off', 'armed', OK, MUTE),
            I('Mains back', 'BIOS "restore on AC" + Proxmox start-at-boot order', 'armed', OK, MUTE)])],
        Events: [list('Events', (st.onBatt ? [I('Mains lost · on battery', 'NUT', 'just now', CRIT)] : []).concat([I('Self-test passed', 'NUT', 'Sun 03:30', OK), I('Brownout · 2 s on battery', 'NUT', '12 Oct', WARN)]), full)]
      },
      rel: [['Site', [R('home')]], ['Monitored by', [R('alexandria', 'NUT server · USB')]], ['Not protected', [R('delphi', 'wall power'), R('kronos', 'wall power')]]] });
    add('ups-b', { type: 'UPS', ab: 'UPS', name: 'ups-siteb', site: 'b', st: 'ok', sub: 'Site B · [MODEL] 600 VA · USB to Synology',
      tabs: { Overview: [bars('Battery & load', [['Battery', 100], ['Load', 18, '62 W'], ['Runtime at this load', 100, '42 min', OK]]), kv('Status', [['State', 'On line', OK], ['Input', '229 V · 50 Hz'], ['Driver', 'Synology DSM UPS server']]),
        list('Protected devices', [R('synology', 'safe mode at 10% battery'), R('udmse', 'stays up')])] },
      rel: [['Site', [R('siteb')]]] });

    // ---------- physical layouts (thermal map) ----------
    var LT = function (k, label, x, y, w, h, t, warn, thr, sensor, ex) { return Object.assign({ k: k, kind: 'temp', label: label, x: x, y: y, w: w, h: h, t: t, warn: warn, thr: thr, sensor: sensor }, ex || {}); };
    var LF = function (k, label, x, y, s, rpm, max, sensor) { return { k: k, kind: 'fan', label: label, x: x, y: y, s: s, rpm: rpm, max: max, sensor: sensor }; };
    var HWL = {
      alexandria: { chassis: 'Thermaltake tower · X9SRI-F', def: 'd4', comps: [
        LF('fan2', 'FAN2 · front', 12, 70, 52, 900, 1800, 'IPMI FAN2'), LF('fan3', 'FAN3 · front', 12, 230, 52, 900, 1800, 'IPMI FAN3'),
        LT('d1', 'Exos · bay 1', 80, 24, 130, 46, 36, 45, 55, 'smartctl sda'), LT('d2', 'Exos · bay 2', 80, 76, 130, 46, 37, 45, 55, 'smartctl sdb'), LT('d3', 'Exos · bay 3', 80, 128, 130, 46, 39, 45, 55, 'smartctl sdc'),
        LT('d4', 'Exos · bay 4', 80, 180, 130, 46, 46, 45, 55, 'smartctl sdd', { note: 'Bay 4 sits in the dead zone between the two front fans and runs ~8 °C hotter than its neighbours. The planned CSE-836 fan wall fixes this.' }),
        LT('d5', 'Exos · bay 5', 80, 232, 130, 46, 38, 45, 55, 'smartctl sde'), LT('d6', 'Exos · bay 6', 80, 284, 130, 46, 36, 45, 55, 'smartctl sdf'),
        LT('psu', 'PSU · 168 W', 236, 18, 100, 56, 38, 50, 60, 'IPMI PSU temp'),
        LT('dimma', 'A', 352, 30, 28, 110, 41, 70, 80, 'IPMI DIMM A~D', { vert: true }), LT('cpu', 'CPU · E5-2650L v2', 388, 30, 130, 110, 52, 75, 85, 'IPMI CPU (PECI)'),
        LF('fan1', 'FAN1 · CPU', 462, 52, 46, 1100, 2200, 'IPMI FAN1'), LT('dimmb', 'B', 526, 30, 28, 110, 40, 70, 80, 'IPMI DIMM E~H', { vert: true }),
        LT('pch', 'PCH', 420, 162, 80, 46, 48, 80, 90, 'IPMI PCH'),
        LT('hba', 'PCIe 1 · HBA LSI SAS2308', 236, 236, 290, 30, 61, 70, 80, 'mpt temp', { note: 'HBAs have no fan and rely on case airflow. 61 °C is normal; keep it under 70.' }),
        LT('nic', 'PCIe 2 · 10GbE NIC', 236, 274, 290, 30, 55, 80, 90, 'ethtool -m'), LT('optane', 'PCIe 3 · Optane P4800X', 236, 312, 290, 30, 44, 65, 70, 'nvme smart-log'),
        LF('fan4', 'FAN4 · rear', 572, 60, 54, 1000, 2000, 'IPMI FAN4')] },
      olympus: { chassis: 'Minisforum MS-01', def: 'pcore', comps: [
        LF('fcpu', 'CPU blower', 60, 90, 76, 3200, 5200, 'it87 fan1'), LT('cpu', 'CPU package · i9-13900H', 190, 40, 170, 120, 71, 90, 100, 'coretemp Package'),
        LT('pcore', 'P-cores (hottest)', 190, 168, 82, 46, 78, 90, 100, 'coretemp Core 8', { note: 'P-cores burst to ~90 °C during builds; the MS-01 throttles at 100 °C.' }), LT('ecore', 'E-cores', 278, 168, 82, 46, 66, 90, 100, 'coretemp Core 16–23'),
        LT('ram', 'DDR5', 380, 40, 60, 174, 54, 75, 85, 'spd5118', { vert: true }), LT('vrm', 'VRM', 470, 40, 120, 50, 63, 90, 105, 'acpitz zone2'),
        LT('nvme1', 'M.2 1 · local-nvme', 40, 250, 150, 30, 52, 65, 75, 'nvme0'), LT('nvme2', 'M.2 2', 40, 288, 150, 30, 48, 65, 75, 'nvme1'), LT('nvme3', 'M.2 3 · boot', 40, 326, 150, 30, 45, 65, 75, 'nvme2'),
        LT('nic', 'X710 · 2× SFP+', 220, 262, 220, 40, 58, 80, 90, 'ethtool -m'), LF('fssd', 'SSD fan', 480, 260, 54, 2600, 4000, 'it87 fan2')] },
      delphi: { chassis: 'Tower · 2× RTX 3090', def: 'g1mem', comps: [
        LF('ff1', 'Front fan 1', 12, 70, 52, 1400, 2000, 'nct6798 fan2'), LF('ff2', 'Front fan 2', 12, 200, 52, 1400, 2000, 'nct6798 fan3'),
        LT('cpu', 'CPU · i5-13500T', 350, 22, 120, 80, 58, 85, 100, 'coretemp'), LT('ram', 'RAM', 480, 22, 40, 80, 46, 75, 85, 'spd5118', { vert: true }), LT('nvme', 'M.2', 350, 108, 120, 22, 49, 65, 75, 'nvme0'),
        LT('g0', 'PCIe 1 · GPU 0 · RTX 3090', 200, 140, 340, 64, 76, 83, 90, 'DCGM gpu0'), LT('g0mem', 'GPU 0 · VRAM junction', 200, 208, 340, 20, 92, 100, 110, 'DCGM MEMORY_TEMP gpu0'),
        LT('g1', 'PCIe 2 · GPU 1 · RTX 3090', 200, 246, 340, 64, 83, 83, 90, 'DCGM gpu1', { note: 'GPU 1 breathes air already heated by GPU 0. A riser to space the cards or a 300 W cap usually costs under 5% tokens/s.' }),
        LT('g1mem', 'GPU 1 · VRAM junction', 200, 314, 340, 20, 101, 100, 110, 'DCGM MEMORY_TEMP gpu1', { note: 'GDDR6X throttles near 110 °C; sustained 100 °C+ shortens its life. Repadding is the usual fix.' }),
        LT('psu', 'PSU · 762 W', 40, 300, 130, 56, 44, 55, 65, 'smart plug + PSU sensor'),
        LF('gf0', 'GPU 0 fans', 430, 157, 30, 1950, 3000, 'DCGM fan gpu0'), LF('gf1', 'GPU 1 fans', 430, 263, 30, 2400, 3000, 'DCGM fan gpu1'), LF('fr', 'Rear fan', 572, 40, 54, 1300, 2000, 'nct6798 fan1')] }
    };
    var PSU = {
      olympus: [['Supply', 'External 280 W adapter'], ['Telemetry', 'none · no PMBus', MUTE], ['At the wall', '72 W · Home Assistant plug'], ['Headroom', '~74%']],
      alexandria: [['PSU', 'ATX · [MODEL] · 650 W'], ['Load', '168 W · 26%'], ['Temperature', '38 °C (IPMI)'], ['Rails 12 / 5 / 3.3 V', '12.06 / 5.02 / 3.31 V'], ['Efficiency (est.)', '~90%']],
      delphi: [['PSU', 'ATX · [MODEL] · 1600 W'], ['Load', '762 W · 48%'], ['Peak (7 d)', '1 140 W · 71%', WARN], ['Transients', 'each 3090 spikes to ~650 W'], ['Efficiency (est.)', '~92%']],
      prometheus: [['PSU', 'ATX · [MODEL] · 550 W'], ['Load', '96 W · 17%'], ['Telemetry', 'smart plug only', MUTE]],
      kronos: [['PSU', 'Dell 685 W (OEM)'], ['Load', '142 W · 21%'], ['Telemetry', 'iDRAC-less · smart plug', MUTE]],
      synology: [['Supply', 'Internal PSU'], ['Load', '38 W'], ['Telemetry', 'DSM']]
    };
    var PWR = { olympus: R('ups-home', 'group 2 · off at 5 min left'), alexandria: R('ups-home', 'group 3 · last off · NUT server'), prometheus: R('ups-home', 'group 2 · off at 50%'), synology: R('ups-b', 'USB · DSM safe mode at 10%') };
    Object.keys(PSU).forEach(function (h) {
      var hw = (O[h].tabs.Hardware || []).filter(function (c) { return !(c.t && c.t.indexOf('Power') === 0); });
      var out = HWL[h] ? [{ type: 'board', layout: h, t: 'Physical layout · thermal map', gc: full }] : [];
      out = out.concat(hw);
      out.push(kv('Power supply', PSU[h]));
      out.push(PWR[h] ? list('Power path', [PWR[h]]) : note('Power path · not on UPS', O[h].name + ' runs on wall power by design: at its draw it would empty the UPS in minutes. A power cut means a hard stop, so keep nothing stateful on it.', '#5A4A1F'));
      O[h].tabs.Hardware = out;
    });
    [['olympus', 'group 2'], ['alexandria', 'group 3 · NUT server'], ['prometheus', 'group 2'], ['udm', 'group 1'], ['agg', 'group 1']].forEach(function (p) { O[p[0]].rel = (O[p[0]].rel || []).concat([['Powered by', [R('ups-home', p[1])]]]); });
    O.synology.rel = O.synology.rel.concat([['Powered by', [R('ups-b', 'USB')]]]);
    O.udmse.rel = (O.udmse.rel || []).concat([['Powered by', [R('ups-b')]]]);

    // ---------- resolve references ----------
    var resolve = function (it) {
      if (it.ref) {
        var o = O[it.ref];
        if (!o) return { t: it.ref, s: it.s, r: it.r, rc: it.rc || MUTE, c: MUTE, hasGo: false, noGo: true };
        var c = stOf(o.st)[1];
        return { t: o.name, s: it.s || o.type, r: it.r || (o.st === 'ok' ? '' : stOf(o.st)[0]), rc: it.rc || (o.st === 'ok' ? MUTE : c), c: c, hasGo: true, noGo: false, go: go(it.ref) };
      }
      return { t: it.t, s: it.s, r: it.r, rc: it.rc || MUTE, c: it.c || OK, hasGo: false, noGo: true };
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
    var ALERTS = [
      { id: 'a1', sev: 'crit', title: 'k2so WireGuard handshake stale', where: 'k2so · Quicksrv.io', when: '14 min', obj: 'k2so', resolved: K, domain: 'Edge & cloud', action: 'Diagnose' },
      { id: 'a2', sev: 'warn', title: 'Olympus memory at 91%', where: 'olympus', when: '18 min', obj: 'olympus', resolved: M, domain: 'Hosts', action: 'Rebalance' },
      { id: 'a3', sev: 'warn', title: 'Delphi GPU 1 VRAM at 101 °C', where: 'delphi', when: '6 min', obj: 'delphi', resolved: false, domain: 'Hardware', action: 'Sensors', tab: 'Hardware' },
      { id: 'a4', sev: 'warn', title: 'Atlas pool 82% full', where: 'alexandria · Atlas', when: '3 h', obj: 'atlas', resolved: false, domain: 'Storage', action: 'Open pool' },
      { id: 'a5', sev: 'warn', title: 'sonarr restarting (OOM)', where: 'hermes · sonarr', when: '40 min', obj: 'sonarr', resolved: S, domain: 'Workloads', action: 'Fix' },
      { id: 'a6', sev: 'info', title: '3 container image updates', where: 'prometheus', when: '1 d', obj: 'prometheus', resolved: false, domain: 'Updates', action: 'Review' }
    ];
    if (st.onBatt) ALERTS.unshift({ id: 'a0', sev: 'crit', title: 'Home lab on battery · ' + batt + '% · ' + runtime + ' min left', where: 'ups-rack', when: 'just now', obj: 'ups-home', resolved: false, domain: 'Power', action: 'Open UPS' });
    var SEVC = { crit: CRIT, warn: WARN, info: INFO };
    var aState = function (a) { return a.resolved ? 'resolved' : (st.silenced[a.id] ? 'silenced' : (st.acked[a.id] ? 'acked' : 'open')); };
    var openAlerts = ALERTS.filter(function (a) { return aState(a) === 'open' && a.sev !== 'info'; });
    var nCrit = openAlerts.filter(function (a) { return a.sev === 'crit'; }).length;
    var bell = { show: openAlerts.length > 0, n: String(openAlerts.length), c: nCrit ? CRIT : WARN };
    var goAlert = function (a) { return function () { self.setState({ route: 'obj', obj: a.obj, tab: a.tab || 'Overview', bell: false, palette: false }); }; };

    // ---------- drift ----------
    var DRIFT = [['hermes', 'Memory', '6 GB', '8 GB'], ['apollo', 'Memory', '12 GB', '16 GB'], ['apollo', 'PCI passthrough', 'none', 'Iris Xe'], ['vlan1', 'olympus mgmt IP on VLAN 1', 'VLAN 5', 'VLAN 1'], ['vlan30', 'Undeclared IPs', '—', '.87 · .88 · .91']];
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

    var PAGES = {
      sites: function () { return { title: 'Sites & WAN', desc: 'Every location and its uplinks', tables: [table('', ['Site', 'Gateway', 'Internet', 'Link to home', 'Status'], 'minmax(140px,1.2fr) 1fr 1.4fr 1fr 0.8fr',
        objsOf(['Site']).map(function (k) { var b = k === 'siteb'; return row(k, [cell(b ? 'UDM Pro SE' : 'UDM Pro Max'), cell(b ? 'Mobile Vikings · single' : 'DIGI 10G + 5G backup', b ? WARN : null), cell(b ? 'Site Magic · 18 ms' : '—'), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); }))] }; },
      hosts: function () { return { title: 'Hosts', desc: 'Physical machines across sites', tables: [table('', ['Host', 'Role', 'Site', 'Key metric', 'Status'], 'minmax(140px,1fr) 1.6fr 0.8fr 1.2fr 0.8fr',
        objsOf(['Host']).map(function (k) {
          var o = O[k], c0 = o.tabs.Overview[0], km = '—', kc = null;
          if (c0.type === 'bars') { var it = c0.items[c0.items.length > 1 ? 1 : 0]; km = it.l + ' · ' + it.v; kc = it.c === OK ? null : it.c; }
          return row(k, [cell(o.sub.split(' · ').slice(1, 3).join(' · ')), cell(O[o.site === 'b' ? 'siteb' : 'home'].name), cell(km, kc, true), cell(stOf(o.st)[0], stOf(o.st)[1])], { op: o.st === 'plan' ? '0.6' : '1' });
        }))] }; },
      storage: function () { return { title: 'Storage', desc: 'Pools, volumes and where the data goes', tiles: [{ l: 'Atlas', v: '82%', c: WARN, s: '65 / 80 TB · RAIDZ-2' }, { l: 'Synology (Site B)', v: '61%', c: TXT, s: 'SHR-2 · offsite' }, { l: 'Offsite replication', v: st.rep === 'done' ? 'just now' : '02:47', c: OK, s: 'Atlas → Synology' }],
        tables: [table('Pools & volumes', ['Pool', 'Host', 'Used', 'Status'], 'minmax(140px,1fr) 1fr 1fr 0.8fr', [row('atlas', [cell('alexandria'), cell('65 / 80 TB', WARN, true), cell('Warning', WARN)]), row('synology', [cell('Site B'), cell('61%', null, true), cell('Healthy', OK)], { name: 'Synology volume1' })].filter(function (r, i) { return st.scope === 'all' || (st.scope === 'b' ? i === 1 : i === 0); }))] }; },
      network: function () { return { title: 'Network', desc: 'Gateways, switches, VLANs and policy', tables: [
        table('Devices', ['Device', 'Role', 'Site', 'Status'], 'minmax(160px,1fr) 1.6fr 0.8fr 0.8fr', objsOf(['Network device']).map(function (k) { return row(k, [cell(O[k].sub), cell(O[k].site === 'b' ? 'Site B' : 'Home lab'), cell(stOf(O[k].st)[0], stOf(O[k].st)[1])]); })),
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
        return { title: 'Data protection', desc: 'Backups, snapshots and offsite copies', tiles: [{ l: 'Guests backed up', v: '27 / 27', c: OK, s: 'last night · all OK' }, { l: '3-2-1 complete', v: '24 / 27', c: TXT, s: 'apollo media excluded by design' }, { l: 'Offsite', v: st.rep === 'done' ? 'just now' : '02:47', c: OK, s: 'Atlas → Synology · Site B' }],
          hasProgress: running, progLabel: 'Atlas → Synology · syncing vault', progPct: st.pct + '%',
          tables: [table('Jobs & flows', ['Job', 'Target', 'Schedule', 'Last run', ''], 'minmax(200px,1.4fr) 1.4fr 0.8fr 1fr 0.8fr', [
            { name: 'vzdump · olympus', dot: OK, hasGo: true, noGo: false, go: go('olympus'), cells: [cell('alexandria · nexus/backups'), cell('03:00'), cell('today · 11 guests OK', OK)], actions: [], op: '1' },
            { name: 'vzdump · prometheus', dot: OK, hasGo: true, noGo: false, go: go('prometheus'), cells: [cell('alexandria · nexus/backups'), cell('03:30'), cell('today · 5 guests OK', OK)], actions: [], op: '1' },
            { name: 'Atlas → Synology (rsync)', dot: OK, hasGo: true, noGo: false, go: go('atlas'), cells: [cell('Site B · /volume1/atlas-offsite'), cell('02:00'), cell(st.rep === 'done' ? 'just now · 1.2 GB' : 'today 02:47 · 38 GB', OK)], actions: [btn(running ? 'Running…' : 'Run now', run, true)], op: '1' },
            { name: 'Atlas snapshots', dot: OK, hasGo: true, noGo: false, go: go('atlas'), cells: [cell('local'), cell('hourly'), cell('10:00 · OK', OK)], actions: [], op: '1' },
            { name: 'Synology snapshots', dot: OK, hasGo: true, noGo: false, go: go('synology'), cells: [cell('Site B'), cell('daily'), cell('today 04:00 · OK', OK)], actions: [], op: '1' }
          ], '860px')] };
      },
      drift: function () {
        return { title: 'Drift & CMDB', desc: 'Where reality differs from NetBox', tiles: [{ l: 'Objects in NetBox', v: '312', c: TXT, s: 'synced 5 min ago' }, { l: 'Differences', v: String(openDrift.length), c: openDrift.length ? WARN : OK, s: openDrift.length ? 'review below' : 'all in sync' }],
          tables: [table('', ['Object', 'Field', 'NetBox', 'Observed', ''], 'minmax(120px,0.8fr) 1.4fr 0.8fr 1fr 1.2fr', DRIFT.map(function (d) {
            var done = st.accepted[d[0]];
            return row(d[0], [cell(d[1]), cell(done ? d[3] : d[2], null, true), cell(d[3], done ? OK : WARN, true)], { dot: done ? OK : WARN, actions: done ? [] : [btn('Accept observed', act('accept:' + d[0]), true)], op: done ? '0.6' : '1' });
          }), '820px')] };
      },
      updates: function () {
        var U = [['olympus', 'Kernel 6.8 · reboot pending', 'Proxmox'], ['alexandria', 'TrueNAS Scale point release', 'TrueNAS'], ['udm', 'UniFi OS firmware', 'UniFi'], ['prometheus', '3 container images', 'Docker'], ['synology', 'DSM update', 'Synology']];
        return { title: 'Updates & maintenance', desc: 'Pending updates and maintenance windows', tables: [table('', ['Object', 'Update', 'Source', ''], 'minmax(130px,0.8fr) 1.6fr 0.8fr 1.4fr', U.filter(function (u) { return inScope(O[u[0]]); }).map(function (u) {
          var on = st.sched[u[0]];
          return row(u[0], [cell(u[1]), cell(u[2])], { actions: [btn(on ? 'Scheduled · Sun 03:00' : 'Schedule for Sun 03:00', function () { var m = Object.assign({}, self.state.sched); m[u[0]] = !m[u[0]]; self.setState({ sched: m }); }, !on)] });
        }), '720px')] };
      },
      sources: function () {
        var SRC = [['Proxmox VE API', '4 nodes', '2 s', OK], ['UniFi Network', '2 sites', '5 s', OK], ['TrueNAS API', 'alexandria', '10 s', OK], ['VictoriaMetrics', 'node_exporter · DCGM', '15 s', OK], ['Docker agents', '9 hosts', '15 s', OK], ['Uptime Kuma', '22 probes', '30 s', OK], ['Tailscale', 'token expires in 6 d', '1 min', WARN], ['Cloudflare', '4 zones', '1 min', OK], ['NetBox', 'CMDB / IPAM', '5 min', OK], ['Synology DSM', 'via Site Magic', '30 s', OK]];
        return { title: 'Data sources', desc: 'Everything Pantheon reads from', tables: [table('', ['Source', 'Covers', 'Last sync', ''], 'minmax(170px,1.2fr) 1.4fr 0.8fr 0.8fr', SRC.map(function (s) {
          var off = st.off[s[0]];
          return { name: s[0], dot: off ? MUTE : s[3], hasGo: false, noGo: true, go: function () {}, op: off ? '0.55' : '1', cells: [cell(s[1], s[3] === WARN && !off ? WARN : null), cell(off ? 'paused' : s[2])],
            actions: [btn(off ? 'Resume' : 'Pause', function () { var m = Object.assign({}, self.state.off); m[s[0]] = !m[s[0]]; self.setState({ off: m }); })] };
        }), '720px')] };
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
      if (st.obj === 'k2so' && !K) actions.push(btn('Diagnose', function () { self.setState({ tab: 'Diagnostics' }); }, true));
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
    var PWD = [
      { id: 'olympus', w: M ? 60 : 72, src: 'plug', b: 'ups' }, { id: 'alexandria', w: 168, src: 'ipmi', b: 'ups' }, { id: 'prometheus', w: M ? 118 : 96, src: 'plug', b: 'ups' },
      { id: 'udm', w: 48, src: 'est', b: 'ups' }, { id: 'agg', w: 22, src: 'est', b: 'ups' },
      { id: 'delphi', w: dW, src: 'gpu', b: 'wall' }, { id: 'kronos', w: ob ? 0 : 142, src: 'plug', b: 'wall' }, { id: 'access', w: ob ? 0 : 30, src: 'poe', b: 'wall' }, { name: 'Pis & office hifi', w: ob ? 0 : 10, src: 'est', b: 'wall' },
      { id: 'synology', w: 38, src: 'dsm', b: 'siteb' }, { id: 'udmse', w: 25, src: 'est', b: 'siteb' }
    ];
    var SRCM = { plug: ['Smart plug · HA', '#3FB95022', OK], ipmi: ['IPMI', '#3FB95022', OK], gpu: ['Plug + DCGM', '#3FB95022', OK], dsm: ['DSM API', '#3FB95022', OK], poe: ['UniFi PoE budget', '#E3B34122', WARN], est: ['Estimate · spec', '#232B36', MUTE] };
    var BR = { ups: { t: 'ups-rack · on UPS', sub: 'Home lab · protected', c: '#4C9AFF', go: 'ups-home', over: 14 }, wall: { t: 'Wall circuit', sub: 'Home lab · not protected', c: '#F0883E' }, siteb: { t: 'ups-siteb · on UPS', sub: 'Site B · protected', c: '#3FC4B0', go: 'ups-b', over: 4 } };
    var brKeys = st.scope === 'b' ? ['siteb'] : (st.scope === 'home' ? ['ups', 'wall'] : ['ups', 'wall', 'siteb']);
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
      st.scope === 'b' ? { l: 'ups-siteb', v: '100% · 42 min', c: OK, s: '62 W / 360 W' } : { l: 'ups-rack', v: ob ? 'ON BATTERY · ' + batt + '%' : batt + '% · ' + runtime + ' min', c: ob ? CRIT : OK, s: '420 / 1000 W · runtime at this load' },
      { l: 'Measured, not estimated', v: cov + '%', c: cov < 90 ? WARN : OK, s: estN + ' devices estimated' }
    ];
    var insights = [];
    if (brKeys.indexOf('wall') >= 0) insights.push({ t: 'Delphi is ' + Math.round(dW / Math.max(pwTotal, 1) * 100) + '% of the draw', bd: '#5A4A1F',
      text: ob ? 'Delphi lost power with the mains: it is not on the UPS.' : (st.cap ? 'Both 3090s are capped at 300 W. Saving ~' + capSave + ' kWh/month (≈ ' + euro(capSave * price) + ') for a few % fewer tokens/s.' : 'Capping both 3090s at 300 W usually costs under 5% tokens/s and saves ~' + capSave + ' kWh/month (≈ ' + euro(capSave * price) + '). It also cools GPU 1 memory.'),
      hasBtn: !ob, btn: st.cap ? 'Remove cap' : 'Apply 300 W GPU cap', fn: function () { self.setState({ cap: !self.state.cap }); }, bg: st.cap ? '#161B22' : '#4C9AFF', fg: st.cap ? TXT : '#0E1116', bdb: st.cap ? '#2A313C' : '#4C9AFF' });
    if (st.scope !== 'b') insights.push({ t: ob ? 'Running on battery' : 'UPS headroom', bd: ob ? '#6B2A2A' : '#2A313C',
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
    if (openDrift.length && st.scope !== 'b') attention.push({ c: INFO, title: openDrift.length + ' differences with NetBox', domain: 'Drift & CMDB', where: 'apollo · hermes · VLAN 1 · VLAN 30', when: 'today', action: 'Review', go: to('drift') });
    if (st.scope !== 'home') attention.push({ c: INFO, title: 'Site B has a single uplink', domain: 'Network', where: 'Mobile Vikings', when: 'ongoing', action: 'Open site', go: go('siteb') });
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
    if (st.scope !== 'b') domains.push(dom('Edge & cloud', ['k2so', 'chopper', 'r2d2', 'c3po', 'bb8'], '9', 'VPS', '4', 'providers', K ? 'all tunnels up' : 'k2so tunnel stale', 'edge'));
    domains.push({ t: 'Data protection', c: OK, s: 'OK', v1: '27/27', l1: 'backed up', v2: '3-2-1', l2: 'for 24 guests', note: 'offsite ' + (st.rep === 'done' ? 'just now' : '02:47'), go: to('protection') });
    if (st.scope !== 'b') domains.push({ t: 'Drift & CMDB', c: openDrift.length ? INFO : OK, s: openDrift.length ? openDrift.length + ' diffs' : 'in sync', v1: '312', l1: 'objects in NetBox', v2: String(openDrift.length), l2: 'differ', note: 'NetBox ↔ observed', go: to('drift') });
    var changes = [];
    if (K) changes.push({ t: 'now', k: 'Edge', x: 'k2so peer endpoint updated · tunnel restored', c: OK });
    if (M) changes.push({ t: 'now', k: 'Hosts', x: 'icarus live-migrated olympus → prometheus', c: OK });
    if (S) changes.push({ t: 'now', k: 'Workloads', x: 'sonarr limit raised to 1.5 GB · restarted', c: OK });
    changes = changes.concat([
      { t: '10:58', k: 'Workloads', x: 'Watchtower updated 4 images in hermes', c: TXT },
      { t: '10:28', k: 'Edge', x: 'Quicksrv.io rebooted k2so (provider maintenance)', c: TXT },
      { t: '03:12', k: 'Backups', x: 'vzdump: 11 guests on olympus · OK', c: TXT },
      { t: '02:47', k: 'Replication', x: 'Atlas → Synology finished · 38 GB', c: TXT }
    ]);

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
    var topoNodes = tNodes.map(function (n) {
      var o = O[n.id];
      var s = o ? o.st : 'ok';
      var lay = o ? (n.id === 'siteb' && !isB ? 'external' : (n.id === 'home' && isB ? 'external' : LAYER[o.type])) : 'network';
      var vis = st.layer === 'all' || lay === st.layer;
      var r = { x: n.x, y: n.y, w: n.w || 152, h: n.h || 136, name: n.name, sub: n.sub, dot: s === 'plan' ? 'transparent' : stOf(s)[1], dotB: s === 'plan' ? '1.5px solid #9AA4B2' : 'none',
        isBtn: n.type !== 'group', isGroup: n.type === 'group', go: go(n.id), bars: n.bars || [], jc: n.type === 'host' ? 'flex-start' : 'center',
        bs: s === 'plan' ? 'dashed' : 'solid', bg: s === 'crit' ? '#1F1416' : (s === 'plan' ? '#12161C' : '#161B22'), op: vis ? '1' : '0.22' };
      if (n.vps) r.vps = n.vps.map(function (v) { var vo = O[v]; return { n: v, t: '→ ' + vo.sub.split(' → ')[1], c: stOf(vo.st)[1], go: go(v) }; });
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
    var dotFor = {
      hosts: stOf(worstOf(objsOf(['Host'])))[1], power: stOf(worstOf(objsOf(['UPS'])))[1], storage: stOf(worstOf(['atlas', 'synology']))[1], network: stOf(worstOf(objsOf(['VLAN'])))[1],
      edge: stOf(worstOf(objsOf(['VPS'])))[1], services: stOf(worstOf(objsOf(['Service'])))[1], guests: stOf(worstOf(guestIds))[1], containers: stOf(worstOf(ctrIds))[1],
      drift: openDrift.length && st.scope !== 'b' ? INFO : null, sources: WARN
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
    var offN = Object.keys(st.off).filter(function (k) { return st.off[k]; }).length;
    return {
      scopes: seg(st.scope, 'scope', [['all', 'All sites', overall.c], ['home', 'Home lab', stOf(O.home.st)[1]], ['b', 'Site B', OK]]),
      ranges: seg(st.range, 'range', [['live', 'Live'], ['1 h', '1 h'], ['24 h', '24 h'], ['7 d', '7 d']]),
      rangeLabel: st.range === 'live' ? 'live' : 'last ' + st.range,
      srcLabel: (10 - offN - 1) + ' / 10 sources', srcDot: WARN, goSources: to('sources'),
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
