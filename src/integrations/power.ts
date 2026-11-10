import { item, ref, type Entry, type Fact, type Integration, type Meter, type Rel, type Sim, type SiteId, type SourceData, type Status } from './types';

/* ---------- Home Assistant: smart plugs ---------- */

export const homeassistant: Integration<SourceData> = {
  id: 'homeassistant', name: 'Home Assistant', covers: 'smart plugs · power · rack temperature', sync: '10 s',
  mock: (sim: Sim) => ({
    power: [
      { id: 'olympus', w: sim.memFixed ? 60 : 72, src: 'plug' },
      { id: 'prometheus', w: sim.memFixed ? 118 : 96, src: 'plug' },
      { id: 'delphi', w: sim.onBatt ? 0 : (sim.cap ? 642 : 762), src: 'gpu' },
      { id: 'kronos', w: sim.onBatt ? 0 : 142, src: 'plug' },
    ],
    psu: {
      olympus: [['Supply', 'External 280 W adapter'], ['Telemetry', 'none · no PMBus', 'mute'], ['At the wall', '72 W · Home Assistant plug'], ['Headroom', '~74%']],
      delphi: [['PSU', 'ATX · [MODEL] · 1600 W'], ['Load', '762 W · 48%'], ['Peak (7 d)', '1 140 W · 71%', 'warn'], ['Transients', 'each 3090 spikes to ~650 W'], ['Efficiency (est.)', '~92%']],
      prometheus: [['PSU', 'ATX · [MODEL] · 550 W'], ['Load', '96 W · 17%'], ['Telemetry', 'smart plug only', 'mute']],
      kronos: [['PSU', 'Dell 685 W (OEM)'], ['Load', '142 W · 21%'], ['Telemetry', 'iDRAC-less · smart plug', 'mute']],
    },
  }),
};

/* ---------- IPMI / Redfish: server BMCs ---------- */

export const ipmi: Integration<SourceData> = {
  id: 'ipmi', name: 'IPMI / Redfish', covers: 'alexandria BMC · fans · PSU · rails', sync: '30 s',
  mock: () => ({
    power: [{ id: 'alexandria', w: 168, src: 'ipmi' }],
    psu: { alexandria: [['PSU', 'ATX · [MODEL] · 650 W'], ['Load', '168 W · 26%'], ['Temperature', '38 °C (IPMI)'], ['Rails 12 / 5 / 3.3 V', '12.06 / 5.02 / 3.31 V'], ['Efficiency (est.)', '~90%']] },
  }),
};

/* ---------- NUT: UPS units ---------- */

export interface Ups {
  id: string; name: string; site: SiteId; status: Status; sub: string;
  batt: number;
  /** Minutes left at the current load. */
  runtime: number;
  meters: Meter[]; facts: Fact[]; protects: Entry[]; policy?: Entry[]; events?: Entry[]; rel: Rel[];
  /** Label of the link from each powered object back to this UPS. */
  poweredBy: Record<string, string>;
  /** Shutdown group shown on each protected host's Hardware tab. */
  powerPath: Record<string, string>;
}
export interface NutData extends SourceData { ups: Ups[] }

export const nut: Integration<NutData> = {
  id: 'nut', name: 'NUT · UPS', covers: '2 UPS · load · battery · runtime', sync: '5 s',
  mock: (sim: Sim): NutData => {
    const on = sim.onBatt;
    const batt = on ? sim.batt : 100;
    const runtime = Math.max(1, Math.round(18 * batt / 100));
    const trig50 = on && batt <= 50, trig5 = on && runtime <= 5;
    return {
      ups: [
        {
          id: 'ups-home', name: 'ups-rack', site: 'home', status: on ? 'crit' : 'ok', sub: 'Home lab · [MODEL] 1500 VA / 1000 W · NUT on alexandria', batt, runtime,
          meters: [['Battery', batt, batt + '%', batt <= 50 ? 'crit' : (batt <= 80 ? 'warn' : 'ok')], ['Load', 42, '420 / 1000 W'], ['Runtime at this load', Math.round(runtime / 18 * 100), runtime + ' min', runtime <= 5 ? 'crit' : (runtime <= 10 ? 'warn' : 'ok')]],
          facts: [['State', on ? 'ON BATTERY' : 'On line', on ? 'crit' : 'ok'], ['Input', on ? '0 V · mains lost' : '231 V · 50 Hz', on ? 'crit' : 'text'], ['Output', '230 V'], ['Last self-test', 'Sun 03:30 · passed'], ['Battery installed', '[DATE]'], ['Driver', 'NUT usbhid-ups']],
          protects: [ref('udm', 'group 1 · stays up to the end'), ref('agg', 'group 1 · stays up to the end'), ref('prometheus', 'group 2 · off at 50%'), ref('olympus', 'group 2 · off at 5 min left'), ref('alexandria', 'group 3 · last, at 3 min left')],
          policy: [
            item('At 50% battery', 'prometheus: guests stop, then host powers off', trig50 ? 'triggered' : 'armed', trig50 ? 'warn' : 'ok', trig50 ? 'warn' : 'mute'),
            item('5 min of runtime left', 'olympus: guests shut down in order, then host', trig5 ? 'triggered' : 'armed', trig5 ? 'crit' : 'ok', trig5 ? 'crit' : 'mute'),
            item('3 min of runtime left', 'alexandria: NFS clients gone, pool export, power off', 'armed', 'ok', 'mute'),
            item('Mains back', 'BIOS "restore on AC" + Proxmox start-at-boot order', 'armed', 'ok', 'mute'),
          ],
          events: [...(on ? [item('Mains lost · on battery', 'NUT', 'just now', 'crit')] : []), item('Self-test passed', 'NUT', 'Sun 03:30', 'ok'), item('Brownout · 2 s on battery', 'NUT', '12 Oct', 'warn')],
          rel: [['Site', [ref('home')]], ['Monitored by', [ref('alexandria', 'NUT server · USB')]], ['Not protected', [ref('delphi', 'wall power'), ref('kronos', 'wall power')]]],
          poweredBy: { olympus: 'group 2', alexandria: 'group 3 · NUT server', prometheus: 'group 2', udm: 'group 1', agg: 'group 1' },
          powerPath: { olympus: 'group 2 · off at 5 min left', alexandria: 'group 3 · last off · NUT server', prometheus: 'group 2 · off at 50%' },
        },
        {
          id: 'ups-b', name: 'ups-siteb', site: 'b', status: 'ok', sub: 'Site B · [MODEL] 600 VA · USB to Synology', batt: 100, runtime: 42,
          meters: [['Battery', 100], ['Load', 18, '62 W'], ['Runtime at this load', 100, '42 min', 'ok']],
          facts: [['State', 'On line', 'ok'], ['Input', '229 V · 50 Hz'], ['Driver', 'Synology DSM UPS server']],
          protects: [ref('synology', 'safe mode at 10% battery'), ref('udmse', 'stays up')],
          rel: [['Site', [ref('siteb')]]],
          poweredBy: { synology: 'USB', udmse: '' },
          powerPath: { synology: 'USB · DSM safe mode at 10%' },
        },
      ],
      alerts: on ? [{ id: 'a0', sev: 'crit', title: `Home lab on battery · ${batt}% · ${runtime} min left`, where: 'ups-rack', when: 'just now', obj: 'ups-home', resolved: false, domain: 'Power', action: 'Open UPS' }] : [],
    };
  },
};
