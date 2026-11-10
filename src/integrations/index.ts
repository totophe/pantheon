import { llm, pihole, tailscale, uptimekuma } from './apps';
import { docker } from './docker';
import { cloudflare, ovh, quicksrv, scaleway } from './edge';
import { netbox } from './netbox';
import { homeassistant, ipmi, nut } from './power';
import { proxmox } from './proxmox';
import { sitemanager } from './sitemanager';
import { synology } from './synology';
import { truenas } from './truenas';
import type { Sim } from './types';
import { unifi } from './unifi';
import { victoriametrics } from './victoriametrics';

/**
 * Every planned integration. The order is the order of the Data sources page,
 * and the order in which their alerts, updates and power readings are merged.
 */
export const INTEGRATIONS = [
  proxmox, victoriametrics, truenas, nut, unifi, sitemanager, docker, netbox, synology,
  homeassistant, ipmi, ovh, quicksrv, scaleway, cloudflare, tailscale, llm, pihole, uptimekuma,
] as const;

type Any = (typeof INTEGRATIONS)[number];
/** One dataset per integration id; null while that source has delivered nothing. */
export type Datasets = { [I in Any as I['id']]: ReturnType<I['mock']> | null };

export type DataMode = 'mock' | 'live';

const each = (fn: (i: Any) => unknown) => Object.fromEntries(INTEGRATIONS.map((i) => [i.id, fn(i)])) as Datasets;

/** The demo home lab, as each integration would report it. */
export const mockData = (sim: Sim): Datasets => each((i) => i.mock(sim));

/** What live mode starts from: nothing, until an integration's client fetches something. */
export const emptyData = (): Datasets => each(() => null);

const KEY = 'pantheon.dataMode';

/** Stored choice first, then VITE_DATA_MODE, then mock (there is no live backend yet). */
export function initialDataMode(): DataMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'mock' || saved === 'live') return saved;
  } catch { /* storage unavailable */ }
  return import.meta.env.VITE_DATA_MODE === 'live' ? 'live' : 'mock';
}

export function saveDataMode(mode: DataMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* storage unavailable */ }
}
