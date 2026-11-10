import { item, ref, type Entry, type Fact, type Integration, type Meter, type Rel, type Sim, type SiteId, type SourceData } from './types';

export interface NetDevice { id: string; name: string; site: SiteId; sub: string; facts: Fact[]; meters: Meter[]; events: Entry[]; rel: Rel[] }
export interface Vlan { vid: number; name: string; site: SiteId; subnet: string; zone: string; members: Entry[]; gw?: string; dhcp?: string; policy?: Entry[] }
export interface UnifiData extends SourceData { devices: NetDevice[]; vlans: Vlan[] }

const firmware = (): Entry[] => [item('Firmware check', 'up to date', 'Sun', 'ok')];

function mock(sim: Sim): UnifiData {
  return {
    devices: [
      { id: 'udm', name: 'UDM Pro Max', site: 'home', sub: 'Home gateway · firewall · 10.1.0.1', events: firmware(),
        facts: [['VLANs', '6 active · 2 planned'], ['Clients', '63'], ['IDS events (24 h)', '2'], ['Site Magic', 'Site B · up']],
        meters: [['CPU', 24], ['Memory', 61], ['WAN', 51, '5.1 / 10 Gbps']],
        rel: [['Site', [ref('home')]], ['Downstream', [ref('agg'), ref('access')]]] },
      { id: 'agg', name: 'USW-Aggregation', site: 'home', sub: '10 GbE core · 8× SFP+', events: firmware(),
        facts: [['Ports up', '5 / 8'], ['Errors (24 h)', '0'], ['Temp', '48 °C']],
        meters: [['Peak port load', 34]],
        rel: [['Upstream', [ref('udm')]], ['Connected', [ref('olympus', 'port 3'), ref('prometheus', 'port 4'), ref('kronos', 'port 5'), ref('delphi', 'port 6'), ref('alexandria', 'port 7')]]] },
      { id: 'access', name: 'Access switch', site: 'home', sub: '1 GbE · PoE · clients & Pis', events: firmware(),
        facts: [['Sparta', 'online'], ['hestia-rpi', 'Pi-hole secondary'], ['office-hifi', 'AirPlay · idle'], ['Other clients', '11']],
        meters: [['PoE budget', 22, '22 / 100 W']],
        rel: [['Upstream', [ref('udm')]]] },
      { id: 'udmse', name: 'UDM Pro SE', site: 'b', sub: 'Site B gateway · 16-port PoE', events: firmware(),
        facts: [['VLAN', '200'], ['Clients', '3'], ['Site Magic', 'Home lab · 18 ms']],
        meters: [['CPU', 11], ['Memory', 47], ['PoE budget', 8, '15 / 180 W']],
        rel: [['Site', [ref('siteb')]], ['Connected', [ref('synology')]]] },
    ],
    vlans: [
      { vid: 1, name: 'Mgmt', site: 'home', subnet: '10.1.0.0/24', zone: 'Internal', members: [ref('udm'), ref('agg'), ref('access'), ref('tailscale')] },
      { vid: 10, name: 'Home', site: 'home', subnet: '10.10.0.0/24', zone: 'Trusted', dhcp: '.50–.250',
        members: [item('Sparta', '.20'), item('office-hifi', '.31'), item('hestia-rpi', '.53'), item('+38 clients', 'phones, TVs, IoT', '', 'mute')],
        policy: [item('Servers · VLAN 30', 'tcp 443, 32400, 53', 'ports', 'warn'), item('DMZ · VLAN 95', 'tcp 443', 'ports', 'warn')] },
      { vid: 30, name: 'Servers', site: 'home', subnet: '10.30.0.0/24', zone: 'Servers',
        members: [ref('olympus'), ref('prometheus'), ref('kronos'), ref('delphi'), ref('alexandria'), ref('apollo'), ref('hermes'), ref('pihole'), ref('caddy')],
        policy: [item('DMZ · VLAN 95', 'allow', 'allow', 'ok'), item('Site B · VLAN 200', 'rsync 873 · ssh 22', 'ports', 'warn')] },
      { vid: 70, name: 'Customers', site: 'home', subnet: '10.70.0.0/24', zone: 'Isolated',
        members: [ref('hephaestus', '4 devcontainers'), ref('chopper', 'edge tunnel')],
        policy: [item('Servers · VLAN 30', 'gitea 443 · postgres 5432', 'ports', 'warn')] },
      { vid: 95, name: 'DMZ', site: 'home', subnet: '10.95.0.0/24', zone: 'DMZ',
        members: [ref('caddy', 'eth1 · .10'), ref('r2d2', 'edge tunnel')],
        policy: [item('Servers · VLAN 30', 'caddy → upstream ports', 'ports', 'warn')] },
      { vid: 200, name: 'Site B LAN', site: 'b', subnet: '10.200.0.0/24', zone: 'Remote', dhcp: '.100–.199',
        members: [ref('synology', '.10'), ref('udmse', '.1'), item('1 client', '', '', 'ok')] },
    ],
    // The WireGuard peers terminate on the UDM, so the stale-handshake alert comes from here.
    alerts: [{ id: 'a1', sev: 'crit', title: 'k2so WireGuard handshake stale', where: 'k2so · Quicksrv.io', when: '14 min', obj: 'k2so', resolved: sim.k2soFixed, domain: 'Edge & cloud', action: 'Diagnose' }],
    updates: [['udm', 'UniFi OS firmware', 'UniFi']],
    power: [{ id: 'access', w: sim.onBatt ? 0 : 30, src: 'poe' }],
  };
}

export const unifi: Integration<UnifiData> = { id: 'unifi', name: 'UniFi Network', covers: 'topology · ports · clients · VLANs · WAN', sync: '5 s', mock };
