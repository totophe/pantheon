import { ref, type Fact, type Integration, type Meter, type Rel, type SourceData } from './types';

/* ---------- Ollama / vLLM: inference engines ---------- */

export interface LlmData extends SourceData {
  /** Engine facts per host. */
  hosts: Record<string, Fact[]>;
  engines: { id: string; host: string; kind: 'ollama' | 'vllm'; models: string[]; tokensPerSecond?: number }[];
}
export const llm: Integration<LlmData> = {
  id: 'llm', name: 'Ollama / vLLM', covers: '3 engines · loaded models · tokens/s', sync: '15 s',
  mock: () => ({
    hosts: {
      kronos: [['Ollama', '2 instances'], ['Models', 'qwen3 · nomic-embed']],
      delphi: [['Engine', 'vLLM tensor-parallel'], ['Throughput', '38 tok/s']],
    },
    engines: [
      { id: 'ollama-a', host: 'kronos', kind: 'ollama', models: ['qwen3'] },
      { id: 'ollama-b', host: 'kronos', kind: 'ollama', models: ['nomic-embed'] },
      { id: 'vllm-server', host: 'delphi', kind: 'vllm', models: ['Qwen3 32B · AWQ'], tokensPerSecond: 38 },
    ],
  }),
};

/* ---------- Pi-hole: DNS ---------- */

export interface PiholeData extends SourceData {
  /** The guest that runs Pi-hole, and the meters it adds there. */
  guest: string;
  meters: Meter[];
  queriesPerHour: number;
  blockedPct: number;
}
export const pihole: Integration<PiholeData> = {
  id: 'pihole', name: 'Pi-hole', covers: 'DNS queries · local records', sync: '30 s',
  mock: () => ({ guest: 'pihole', meters: [['Queries', 18, '4.2 k/h', 'ok']], queriesPerHour: 4200, blockedPct: 18 }),
};

/* ---------- Tailscale: tailnet ---------- */

export interface TailscaleData extends SourceData {
  /** Subnet routers, by the guest they run in. */
  routers: Record<string, { facts: Fact[]; rel: Rel[] }>;
  devices: number;
  tokenExpiresInDays: number;
}
export const tailscale: Integration<TailscaleData> = {
  id: 'tailscale', name: 'Tailscale', covers: 'devices · subnet routes · API token expires in 6 days', sync: '1 min', health: 'warn',
  mock: () => ({
    routers: { tailscale: { facts: [['Advertises', 'VLAN 1 · VLAN 30']], rel: [['Network', [ref('vlan1'), ref('vlan30')]]] } },
    devices: 9,
    tokenExpiresInDays: 6,
  }),
};

/* ---------- Uptime Kuma: probes ---------- */

export interface UptimeKumaData extends SourceData {
  /** Not rendered yet: no screen in the design shows probes on their own. */
  probes: { name: string; target: string; up: boolean; ms: number }[];
}
export const uptimekuma: Integration<UptimeKumaData> = {
  id: 'uptimekuma', name: 'Uptime Kuma', covers: '22 probes · external sites', sync: '30 s',
  mock: () => ({
    probes: [
      { name: 'plex.home.lan', target: 'apollo', up: true, ms: 12 },
      { name: 'git.home.lan', target: 'gitea', up: true, ms: 9 },
      { name: 'status.home.lan', target: 'monitoring', up: true, ms: 7 },
      { name: 'k2so public HTTPS', target: 'k2so', up: true, ms: 38 },
      { name: 'r2d2 public HTTPS', target: 'r2d2', up: true, ms: 31 },
      { name: 'Wellmade CRM', target: 'hermes-crm', up: true, ms: 54 },
    ],
  }),
};
