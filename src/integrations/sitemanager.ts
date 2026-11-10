import { item, ref, type Entry, type Fact, type Integration, type Lv, type Meter, type Note, type Rel, type Sim, type SiteId, type SourceData, type Status } from './types';

export interface Site {
  id: string; ab: string; name: string; site: SiteId; status: Status; sub: string;
  health: Meter[]; facts: Fact[]; notes?: Note[]; uplinks: Entry[]; devicesTitle: string; devices: Entry[]; rel: Rel[];
  /** Row on the Sites & WAN page. */
  table: { gateway: string; internet: string; internetLv?: Lv; link: string };
}
export interface SiteManagerData extends SourceData { sites: Site[] }

function mock(sim: Sim): SiteManagerData {
  const M = sim.memFixed;
  return {
    sites: [
      {
        id: 'home', ab: 'HOME', name: 'Home lab', site: 'home', status: sim.onBatt ? 'crit' : (M && sim.k2soFixed ? 'ok' : 'warn'),
        sub: 'olympus-cluster · UDM Pro Max · DIGI XGS-PON + 5G',
        health: [['Hosts healthy', M ? 60 : 40, M ? '3 / 5' : '2 / 5', M ? 'ok' : 'warn'], ['WAN usage', 38, '3.8 / 10 Gbps'], ['Site Magic latency', 18, '18 ms', 'ok']],
        facts: [['Gateway', 'UDM Pro Max'], ['VLANs', '1 · 10 · 30 · 70 · 80 · 95'], ['Clients', '63'], ['Rack', '16U · basement']],
        uplinks: [item('DIGI · XGS-PON 10G', 'PPPoE · LuLeey SFP stick', 'ACTIVE · 4 ms', 'ok', 'ok'), item('5G SIM', '€5/month · tested Sun', 'STANDBY', 'mute')],
        devicesTitle: 'Infrastructure',
        devices: [ref('udm'), ref('agg'), ref('access'), ref('olympus'), ref('prometheus'), ref('kronos'), ref('delphi'), ref('alexandria'), ref('hyperion')],
        rel: [['Linked sites', [ref('siteb', 'Site Magic · 18 ms')]], ['Edge providers', [ref('ovh'), ref('quicksrv'), ref('scaleway'), ref('cloudflare')]]],
        table: { gateway: 'UDM Pro Max', internet: 'DIGI 10G + 5G backup', link: '—' },
      },
      {
        id: 'siteb', ab: 'B', name: 'Site B', site: 'b', status: 'ok', sub: 'UDM Pro SE · Mobile Vikings FTTH · 10.200.0.0/24',
        health: [['Synology volume', 61], ['Site Magic latency', 18, '18 ms', 'ok'], ['WAN usage', 22, '220 Mbps']],
        facts: [['Gateway', 'UDM Pro SE'], ['Uplink', 'Mobile Vikings · single', 'warn'], ['VLAN', '200'], ['Clients', '3']],
        notes: [{ t: 'Single uplink', tone: 'warn', text: 'Site B has no failover. If Mobile Vikings drops, the nightly Atlas → Synology replication fails until it is back.' }],
        uplinks: [item('Mobile Vikings · FTTH', 'single uplink', 'ACTIVE · 7 ms', 'ok', 'ok')],
        devicesTitle: 'Devices',
        devices: [ref('udmse'), ref('synology'), ref('vlan200')],
        rel: [['Linked sites', [ref('home', 'Site Magic · 18 ms')]], ['Data flows in', [ref('atlas', 'rsync nightly → atlas-offsite')]]],
        table: { gateway: 'UDM Pro SE', internet: 'Mobile Vikings · single', internetLv: 'warn', link: 'Site Magic · 18 ms' },
      },
    ],
  };
}

export const sitemanager: Integration<SiteManagerData> = { id: 'sitemanager', name: 'UniFi Site Manager', covers: '2 sites · Site Magic · WAN failover', sync: '20 s', mock };
