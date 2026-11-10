import { item, ref, type Entry, type Fact, type HostRecord, type Integration, type Note, type PowerReading, type Sim, type SourceData } from './types';

export interface NetBoxData extends SourceData {
  objectCount: string;
  synced: string;
  owner: string;
  /** CMDB record and physical asset per host. */
  hosts: Record<string, { cmdb?: Fact[]; asset: Fact[] }>;
  /** Hosts that are declared but not built yet. */
  planned: HostRecord[];
  /** Declared-vs-observed differences per guest: [field, declared, observed]. */
  guests: Record<string, { diff?: [string, string, string][]; crit?: string }>;
  /** [object id, field, declared, observed] */
  drift: [string, string, string, string][];
  driftSummary: string;
  vlanDrift: Record<number, { member: Entry; note: Note }>;
  services: { id: string; name: string; desc: string; comps: Entry[] }[];
}

const asset = (model: string): Fact[] => [['Model', model], ['Serial', '[SERIAL]'], ['Purchased', '[DATE] · [SUPPLIER]'], ['Warranty until', '[DATE]'], ['Location', 'Home lab · rack U[?]']];

function mock(sim: Sim): NetBoxData {
  // Typical draw from the device type, used where nothing measures the real one.
  const power: PowerReading[] = [{ id: 'udm', w: 48, src: 'est' }, { id: 'agg', w: 22, src: 'est' }, { name: 'Pis & office hifi', w: sim.onBatt ? 0 : 10, src: 'est' }, { id: 'udmse', w: 25, src: 'est' }];
  return {
    objectCount: '312',
    synced: 'synced 5 min ago',
    owner: 'Totophe',
    hosts: {
      olympus: { cmdb: [['Role', 'Proxmox node'], ['Cluster', 'olympus-cluster'], ['Primary IP', '10.30.0.11'], ['Mgmt IP', '10.1.0.21 (should be VLAN 5)', 'warn']], asset: asset('Minisforum MS-01') },
      prometheus: { asset: asset('Custom · i5-13500') },
      kronos: { asset: asset('Dell Precision T5610') },
      delphi: { asset: asset('Custom · 2× RTX 3090') },
      alexandria: { asset: asset('Supermicro X9SRI-F · Thermaltake') },
      synology: { asset: asset('Synology') },
    },
    planned: [{
      id: 'hyperion', name: 'Hyperion', site: 'home', status: 'plan', sub: 'srv-prox-03 · planned · shared dev platform',
      factsTitle: 'Declared in NetBox', factsWide: true,
      facts: [['CPU', 'i5-13500'], ['Board', 'B760M DS3H DDR4 · to order'], ['Memory', '2 × 32 GB (from Sparta)'], ['NIC', '82599ES dual SFP+'], ['Role', 'PostgreSQL · Garage · dev services']],
      rel: [['Will connect to', [ref('agg')]], ['Services', [ref('svc-dev')]]],
    }],
    guests: {
      apollo: { diff: [['Memory', '12 GB', '16 GB'], ['PCI passthrough', 'none', 'Iris Xe']], crit: 'Medium' },
      hermes: { diff: [['Memory', '6 GB', '8 GB']] },
      pihole: { crit: 'High' },
    },
    drift: [['hermes', 'Memory', '6 GB', '8 GB'], ['apollo', 'Memory', '12 GB', '16 GB'], ['apollo', 'PCI passthrough', 'none', 'Iris Xe'], ['vlan1', 'olympus mgmt IP on VLAN 1', 'VLAN 5', 'VLAN 1'], ['vlan30', 'Undeclared IPs', '—', '.87 · .88 · .91']],
    driftSummary: 'apollo · hermes · VLAN 1 · VLAN 30',
    vlanDrift: {
      1: { member: item('olympus mgmt', '10.1.0.21 · should be VLAN 5', '', 'warn'), note: { t: 'Remediation', tone: 'warn', text: 'Proxmox management interfaces and IPMI still live here. NetBox declares them on VLAN 5.' } },
      30: { member: item('3 undeclared IPs', '.87 · .88 · .91 (lab-k3s?)', '', 'warn'), note: { t: 'Drift', tone: 'warn', text: '3 IPs answer on VLAN 30 that NetBox does not know about.' } },
    },
    services: [
      { id: 'svc-media', name: 'Media', desc: 'Plex, ARR stack, libraries and remote access', comps: [ref('apollo', 'Plex & readers'), ref('hermes', 'ARR stack'), ref('sonarr', 'TV automation'), ref('atlas', 'libraries'), ref('c3po', 'remote relay')] },
      { id: 'svc-dns', name: 'DNS', desc: 'Resolution and ad-blocking for every VLAN', comps: [ref('pihole', 'primary'), item('hestia-rpi', 'secondary', '', 'ok')] },
      { id: 'svc-ingress', name: 'Edge ingress', desc: 'Public traffic into the home lab', comps: [ref('r2d2', 'OVH ingress'), ref('caddy', 'reverse proxy'), ref('vlan95', 'DMZ')] },
      { id: 'svc-dev', name: 'Dev platform', desc: 'Customer devcontainers, git, previews', comps: [ref('hephaestus'), ref('gitea'), ref('chopper', 'client previews'), ref('vlan70'), ref('hyperion', 'planned')] },
      { id: 'svc-ai', name: 'AI inference', desc: 'Local models for agents and apps', comps: [ref('kronos', 'Ollama'), ref('delphi', 'vLLM'), ref('aurora', 'light inference')] },
      { id: 'svc-wellmade', name: 'Wellmade apps', desc: 'Client-facing apps on Scaleway', comps: [ref('hermes-umami'), ref('hermes-crm'), ref('hermes-tools'), ref('hermes-monitor'), ref('bb8', 'mail relay'), ref('cloudflare')] },
    ],
    power,
  };
}

export const netbox: Integration<NetBoxData> = { id: 'netbox', name: 'NetBox · CMDB / IPAM', covers: 'sites · VLANs · prefixes · declared VMs · assets', sync: '5 min', mock };
