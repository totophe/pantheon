import { item, ref, type Fact, type Integration, type Provider, type Sim, type SourceData, type Vps } from './types';

/** A hosting provider and the edge VPS it runs for the lab. */
export interface ProviderData extends SourceData { provider: Provider; vps: Vps[] }

const billing = (): Fact[] => [['Monthly', '[AMOUNT]'], ['Renewal', '[DATE]']];
const site = (): Provider['rel'] => [['Site', [ref('home')]]];

export const ovh: Integration<ProviderData> = {
  id: 'ovh', name: 'OVH', covers: '3 VPS · IPs · bandwidth', sync: '1 min',
  mock: () => ({
    provider: { id: 'ovh', ab: 'OVH', name: 'OVH', status: 'ok', sub: 'Gravelines · 3 edge VPS', billing: billing(), rel: site() },
    vps: [
      { id: 'r2d2', role: 'public ingress', lands: 'VLAN 95 · caddy', targets: [ref('vlan95'), ref('caddy')], status: 'ok', rel: [['Service', [ref('svc-ingress')]]] },
      { id: 'c3po', role: 'Plex relay', lands: 'apollo', targets: [ref('apollo', 'tcp 32400')], status: 'ok', cpu: 12, rel: [['Service', [ref('svc-media')]]] },
      { id: 'bb8', role: 'mail & webhooks', lands: 'hermes-tools', targets: [ref('hermes-tools', 'VPS ↔ VPS')], status: 'ok', link: 'WireGuard VPS ↔ VPS', rel: [['Service', [ref('svc-wellmade')]]] },
    ],
  }),
};

export const quicksrv: Integration<ProviderData> = {
  id: 'quicksrv', name: 'Quicksrv.io', covers: '2 VPS · via SSH + node_exporter', sync: '1 min',
  mock: (sim: Sim) => {
    const K = sim.k2soFixed;
    return {
      provider: { id: 'quicksrv', ab: 'QS', name: 'Quicksrv.io', status: K ? 'ok' : 'crit', sub: '2 edge VPS', billing: billing(), rel: site() },
      vps: [
        {
          id: 'k2so', role: 'lab access edge', lands: 'VLAN 30', targets: [ref('vlan30')], status: K ? 'ok' : 'crit', cpu: 3, mem: 28,
          notes: K ? [] : [{ t: 'Tunnel down', tone: 'crit', text: 'Public probes succeed, but the WireGuard handshake to the home lab is 14 minutes stale. Open Diagnostics to find out why.' }],
          events: K
            ? [item('Handshake restored', 'Pantheon action', 'just now', 'ok'), item('Provider maintenance reboot', 'Quicksrv.io', '10:28', 'warn')]
            : [item('Handshake stale > 5 min', 'alert fired', '10:31', 'crit'), item('Provider maintenance reboot', 'Quicksrv.io', '10:28', 'warn')],
          diagnostics: {
            fixed: K,
            steps: [
              ['Public HTTPS reachability (3 probes)', '200 · 38 ms', 'ok'], ['ICMP from r2d2 (OVH)', '22 ms', 'ok'], ['WireGuard peer on UDM', 'qsrv-01 · enabled', 'ok'],
              ['Peer endpoint vs DNS', '203.0.113.7 ≠ .12', 'warn', '203.0.113.12 ✓'], ['UDP 51820 to endpoint', 'no reply', 'crit', 'handshake OK'],
            ],
            cause: { t: 'Likely cause: new public IP', tone: 'crit', action: ['Update peer endpoint & re-handshake', 'fixk2so'], text: 'The provider rebooted k2so and reassigned its address. DNS returns 203.0.113.12, the UDM peer still points to 203.0.113.7.' },
            outcome: { t: 'Resolved', tone: 'ok', text: 'Endpoint updated to 203.0.113.12; handshake OK; alert auto-resolved. Tip: use a DNS name as peer endpoint so the next IP change heals itself.' },
          },
        },
        { id: 'chopper', role: 'client previews', lands: 'VLAN 70', targets: [ref('vlan70'), ref('hephaestus', 'devcontainers')], status: 'ok', rel: [['Service', [ref('svc-dev')]]] },
      ],
      changes: [{ t: '10:28', k: 'Edge', x: 'Quicksrv.io rebooted k2so (provider maintenance)' }],
    };
  },
};

export const scaleway: Integration<ProviderData> = {
  id: 'scaleway', name: 'Scaleway', covers: '4 instances · managed PostgreSQL', sync: '1 min',
  mock: () => ({
    provider: { id: 'scaleway', ab: 'SCW', name: 'Scaleway', status: 'ok', sub: 'fr-par · Wellmade fleet · 4 VPS', billing: billing(), rel: site() },
    vps: ['umami', 'crm', 'tools', 'monitor'].map((n): Vps => ({
      id: 'hermes-' + n, role: 'Wellmade ' + n, lands: 'Cloudflare tunnel', targets: [ref('cloudflare')], status: 'ok', link: 'Cloudflare tunnel', rel: [['Service', [ref('svc-wellmade')]]],
    })),
  }),
};

export const cloudflare: Integration<ProviderData> = {
  id: 'cloudflare', name: 'Cloudflare', covers: '4 zones · tunnels · DNS · requests', sync: '1 min',
  mock: () => ({
    provider: {
      id: 'cloudflare', ab: 'CF', name: 'Cloudflare', status: 'ok', sub: '3 tunnels · 4 zones',
      tunnels: [item('olympus', 'cloudflared on caddy', 'up'), item('hermes-crm', 'Scaleway', 'up'), item('hermes-tools', 'Scaleway', 'up')],
      dns: [['Zones', '4'], ['Requests (24 h)', '41.2 k']],
      rel: [['Used by', [ref('hermes-crm'), ref('hermes-tools')]]],
    },
    vps: [],
  }),
};
