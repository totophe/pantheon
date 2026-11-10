import { item, ref, type Entry, type Fact, type HostRecord, type Integration, type Meter, type Rel, type Sim, type SourceData, type Status } from './types';

export interface Guest {
  id: string;
  name?: string;
  kind: 'VM' | 'LXC';
  node: string;
  ip: string;
  role: string;
  status: Status;
  meters: Meter[];
  cfg: Fact[];
  vlan: string;
  mac: string;
  fw: Entry[];
  copies: Entry[];
  runs: Entry[];
  events: Entry[];
  /** systemd services and the like; Docker containers come from the Docker agents. */
  services?: Entry[];
  rel?: Rel[];
}
export interface ProxmoxData extends SourceData {
  cluster: string;
  nodes: HostRecord[];
  guests: Guest[];
}

type Extra = Partial<Pick<Guest, 'name' | 'vlan' | 'fw' | 'copies' | 'events' | 'services' | 'rel'>>;

function guest(id: string, kind: Guest['kind'], node: string, ip: string, role: string, status: Status, meters: Meter[], cfg: Fact[], x: Extra = {}): Guest {
  return {
    id, kind, node, ip, role, status, meters, cfg,
    name: x.name,
    vlan: x.vlan ?? '30',
    mac: `BC:24:11:${(id.length * 7) % 90 + 10}:0F:${id.length * 3 + 10}`,
    fw: x.fw ?? [item('ALLOW in tcp 22 from VLAN 1', '', '', 'ok'), item('DROP in * (policy)', '', '', 'crit')],
    copies: x.copies ?? [item('Production', 'local-nvme', '✓'), item('Nightly vzdump', 'alexandria · nexus/backups · 03:00', '✓'), item('Offsite', 'Synology · via Atlas → Synology', '✓')],
    runs: [item('vzdump · snapshot', 'today 03:12', 'OK'), item('vzdump · snapshot', 'yesterday 03:11', 'OK')],
    events: x.events ?? [item('Started', 'Proxmox', '23 d ago', 'mute')],
    services: x.services,
    rel: x.rel,
  };
}

function mock(sim: Sim): ProxmoxData {
  const M = sim.memFixed, S = sim.sonarrFixed;
  const nodes: HostRecord[] = [
    {
      id: 'olympus', name: 'Olympus', site: 'home', status: M ? 'ok' : 'warn', sub: 'srv-prox-01 · 10.30.0.11 · Minisforum MS-01 · cluster master',
      meters: [['CPU', 38], ['Memory', M ? 73 : 91, M ? '73% · 46.7 / 64 GB' : '91% · 58.2 / 64 GB'], ['local-nvme', 64]],
      facts: [['CPU', 'i9-13900H · 20 threads'], ['Memory', '64 GB DDR5'], ['Proxmox', 'VE 8 · quorum 4 / 4'], ['Uptime', '23 d 4 h']],
      notes: M ? [] : [{
        t: 'Memory pressure · 118% allocated', tone: 'warn', action: ['Live-migrate icarus → Prometheus', 'migrate'],
        text: 'Guests are configured for 75.5 GB on a 64 GB host. Ballooning is reclaiming RAM from apollo. Prometheus has 26 GB free: moving icarus there brings Olympus back to ~73%.',
      }],
      guests: [ref('apollo'), ref('hermes'), ...(M ? [] : [ref('icarus')]), ref('labk3s'), ref('pihole'), ref('gitea'), ref('tailscale'), ref('caddy'), ref('monitoring')],
      interfaces: [item('vmbr0 · X710 port 1', 'trunk · VLAN 1, 30, 70, 95', '10 GbE · 1.8 Gbps'), item('vmbr1 · 2.5 GbE', 'corosync ring', '2.5 GbE')],
      events: [item('Memory crossed 90%', 'Proxmox API', '10:24', M ? 'mute' : 'warn'), item('vzdump · 11 guests · OK', 'backup', '03:12'), item('Kernel 6.8 installed · reboot pending', 'apt', 'Mon', 'info')],
      rel: [['Connected to', [ref('agg', 'port 3 · 10 GbE')]], ['Depends on', [ref('atlas', 'NFS nexus · chronicles')]], ['Edge tunnels in', [ref('r2d2'), ref('c3po'), ref('k2so')]], ['Services', [ref('svc-media'), ref('svc-dns'), ref('svc-ingress')]]],
    },
    {
      id: 'prometheus', name: 'Prometheus', site: 'home', status: 'ok', sub: 'srv-prox-02 · 10.30.0.12 · i5-13500 · RTX A2000',
      meters: [['CPU', 22], ['Memory', M ? 76 : 58, M ? '76% · +12 GB icarus' : '58%'], ['GPU · A2000', 41]],
      facts: [['CPU', 'i5-13500 · turbo off'], ['Memory', '64 GB DDR4'], ['GPU', 'RTX A2000 6 GB']],
      guests: [ref('aurora'), ref('hephaestus'), ref('ocr'), ...(M ? [ref('icarus', 'migrated just now')] : [])],
      events: [item('3 container image updates', 'registry check', 'Mon', 'info')],
      rel: [['Connected to', [ref('agg', 'port 4')]], ['Services', [ref('svc-dev'), ref('svc-ai')]], ['Edge tunnels in', [ref('chopper', 'VLAN 70')]]],
    },
    {
      id: 'kronos', name: 'Kronos', site: 'home', status: sim.onBatt ? 'crit' : 'ok', sub: 'Dell Precision T5610 · 2× Xeon · RTX 5060 Ti + A2000',
      meters: [['CPU', 9], ['Memory', 34], ['GPU · 5060 Ti', 31]],
      facts: [],
      guests: [ref('ollama-a'), ref('ollama-b')],
      rel: [['Connected to', [ref('agg', 'port 5')]], ['Services', [ref('svc-ai')]]],
    },
    {
      id: 'delphi', name: 'Delphi', site: 'home', status: sim.onBatt ? 'crit' : 'warn', sub: 'Inference · i5-13500T · 2× RTX 3090',
      meters: [['GPU 0 load', 94, '94%', 'ok'], ['VRAM', 88, '42 / 48 GB'], ['CPU', 18]],
      facts: [],
      guests: [ref('vllm')],
      rel: [['Connected to', [ref('agg', 'port 6')]], ['Services', [ref('svc-ai')]]],
    },
  ];

  const guests: Guest[] = [
    guest('apollo', 'VM', 'olympus', '10.30.0.101', 'Media server', M ? 'ok' : 'warn',
      [['CPU · 6 vCPU', 14], ['Memory · 16 GB', M ? 88 : 100, M ? '14.1 GB' : '16.0 GB · ballooning'], ['Disk · 128 GB', 47]],
      [['vCPU', '6'], ['Memory', '16 GB · balloon min 8'], ['hostpci0', 'Iris Xe · Quick Sync'], ['OS', 'Ubuntu 24.04']],
      {
        rel: [['Depends on', [ref('atlas', 'chronicles · melodies (ro)'), ref('hermes', 'imports')]], ['Exposed by', [ref('c3po', 'Plex relay'), ref('caddy', 'plex.home.lan')]], ['Service', [ref('svc-media')]]],
        copies: [item('Production', 'local-nvme', '✓'), item('Nightly vzdump', 'config only', '✓'), item('Offsite', 'media excluded by design', '—', 'mute')],
      }),
    guest('hermes', 'VM', 'olympus', '10.30.0.102', 'ARR stack', S ? 'ok' : 'warn',
      [['CPU · 4 vCPU', 19], ['Memory · 8 GB', 89, '7.1 GB'], ['Disk · 64 GB', 58]],
      [['vCPU', '4'], ['Memory', '8 GB · balloon min 6'], ['Disk', 'local-nvme · 64 GB'], ['OS', 'Debian 12']],
      {
        rel: [['Depends on', [ref('atlas', 'forge · chronicles (rw)'), ref('pihole', 'DNS')]], ['Used by', [ref('apollo', 'library imports')]], ['Service', [ref('svc-media')]]],
        events: [item('Watchtower updated 4 images', 'docker', '09:58', 'info'), item('sonarr OOM-killed ×3', 'docker', '10:42', S ? 'mute' : 'warn')],
      }),
    guest('icarus', 'VM', M ? 'prometheus' : 'olympus', '10.30.0.103', 'Always-on desktop', 'ok',
      [['CPU · 4 vCPU', 6], ['Memory · 12 GB', 95, '11.4 GB', 'ok'], ['Disk', 31]],
      [['vCPU', '4'], ['Memory', '12 GB'], ['Display', 'SPICE · virtio-gpu']],
      { events: M ? [item('Live-migrated to Prometheus', 'Pantheon action', 'just now', 'ok')] : undefined }),
    guest('labk3s', 'VM', 'olympus', '10.30.0.104', 'k3s test cluster', 'off',
      [['CPU', 0, 'stopped', 'mute'], ['Memory', 0, '0 / 8 GB', 'mute']], [['vCPU', '4'], ['Memory', '8 GB']]),
    guest('pihole', 'LXC', 'olympus', '10.30.0.110', 'DNS / ad-blocking', 'ok',
      [['CPU', 2], ['Memory · 1 GB', 40, '410 MB']],
      [['Cores', '1'], ['Unprivileged', 'yes'], ['rootfs', '8 GB'], ['Protection', 'on']],
      {
        services: [item('pihole-FTL', 'systemd · 96 MB', 'active'), item('lighttpd', 'admin UI', 'active'), item('cron', 'gravity Sun 03:00', 'active')],
        fw: [item('ALLOW udp,tcp 53 from all VLANs', '', '', 'ok'), item('ALLOW tcp 80 from caddy', '', '', 'ok'), item('DROP * (policy)', '', '', 'crit')],
        rel: [['Used by', [ref('hermes', 'DNS'), ref('apollo', 'DNS'), item('All VLANs', 'primary resolver', '', 'ok')]], ['Pair', [item('hestia-rpi', 'secondary · Gravity Sync', '', 'ok')]], ['Service', [ref('svc-dns')]]],
      }),
    guest('gitea', 'LXC', 'olympus', '10.30.0.111', 'Git mirror', 'ok', [['CPU', 1], ['Memory · 2 GB', 45, '0.9 GB']], [['Cores', '2'], ['rootfs', '32 GB']],
      { rel: [['Service', [ref('svc-dev')]]] }),
    guest('tailscale', 'LXC', 'olympus', '10.1.0.30', 'Subnet router', 'ok', [['CPU', 1], ['Memory', 40, '0.2 GB']], [],
      { name: 'tailscale-sr', vlan: '1' }),
    guest('caddy', 'LXC', 'olympus', '10.30.0.112', 'Reverse proxy', 'ok', [['CPU', 3], ['Memory', 30, '0.3 GB']], [['Routes', '18'], ['NICs', 'VLAN 30 + VLAN 95']],
      { vlan: '30 · 95', rel: [['Ingress from', [ref('r2d2', 'VLAN 95')]], ['Service', [ref('svc-ingress')]]] }),
    guest('monitoring', 'LXC', 'olympus', '10.30.0.113', 'Metrics & probes', 'ok', [['CPU', 7], ['Memory · 4 GB', 65, '2.6 GB']], [['Cores', '2'], ['Disk', '64 GB']]),
    guest('aurora', 'VM', 'prometheus', '10.30.0.61', 'Light inference · A2000', 'ok', [['CPU', 12], ['GPU', 41]], [['GPU', 'RTX A2000 passthrough']],
      { rel: [['Service', [ref('svc-ai')]]] }),
    guest('hephaestus', 'VM', 'prometheus', '10.30.0.60', 'Dev server', 'ok', [['CPU', 18], ['Memory', 62]], [['Devcontainers', '4 · VLAN 70']],
      { rel: [['Service', [ref('svc-dev')]]] }),
    guest('ocr', 'LXC', 'prometheus', '10.30.0.62', 'Document OCR', 'ok', [['CPU', 4], ['Memory', 38]], [['App', 'paperless-ngx · tika']]),
    guest('vllm', 'VM', 'delphi', '10.30.0.70', 'vLLM tensor-parallel', 'warn', [['GPU 0', 94, '94%', 'ok'], ['GPU 1 temp', 83, '83 °C', 'warn']],
      [['GPUs', '2× RTX 3090 passthrough'], ['Model', 'Qwen3 32B · AWQ']], { rel: [['Service', [ref('svc-ai')]]] }),
  ];

  return {
    cluster: 'olympus-cluster',
    nodes,
    guests,
    alerts: [{ id: 'a2', sev: 'warn', title: 'Olympus memory at 91%', where: 'olympus', when: '18 min', obj: 'olympus', resolved: M, domain: 'Hosts', action: 'Rebalance' }],
    updates: [['olympus', 'Kernel 6.8 · reboot pending', 'Proxmox']],
    changes: [{ t: '03:12', k: 'Backups', x: 'vzdump: 11 guests on olympus · OK' }],
    backupTiles: [
      { l: 'Guests backed up', v: '27 / 27', c: 'ok', s: 'last night · all OK' },
      { l: '3-2-1 complete', v: '24 / 27', c: 'text', s: 'apollo media excluded by design' },
    ],
    backupJobs: [
      { name: 'vzdump · olympus', obj: 'olympus', target: 'alexandria · nexus/backups', schedule: '03:00', last: 'today · 11 guests OK' },
      { name: 'vzdump · prometheus', obj: 'prometheus', target: 'alexandria · nexus/backups', schedule: '03:30', last: 'today · 5 guests OK' },
    ],
  };
}

export const proxmox: Integration<ProxmoxData> = { id: 'proxmox', name: 'Proxmox VE', covers: '4 nodes · 11 VMs · 16 LXCs · cluster quorum', sync: '2 s', mock };
