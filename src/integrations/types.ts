import type { AppState } from '../model/types';

/**
 * Mock datasets are functions of the UI state so the simulated actions
 * (live-migrate, fix a tunnel, power cut…) are reflected in the data.
 */
export type Sim = AppState;

/** Severity / emphasis of a value. The view model maps it to a colour. */
export type Lv = 'ok' | 'warn' | 'crit' | 'info' | 'mute' | 'text';
export type Status = 'ok' | 'warn' | 'crit' | 'plan' | 'off';
export type SiteId = 'home' | 'b';

/** [label, percent, display text, level] */
export type Meter = [string, number, string?, Lv?];
/** [key, value, level] */
export type Fact = [string, string, Lv?];
/** [label, °C, warn threshold, critical threshold] */
export type Temp = [string, number, number, number];
/** [label, rpm] */
export type Fan = [string, number];
/** [title, base value, amplitude, unit, warn threshold (0 = none), seed] */
export type Chart = [string, number, number, string, number, number];

/** A row in a list: either a reference to another object or free text. */
export interface Entry {
  ref?: string;
  t?: string;
  s: string;
  r: string;
  c?: Lv;
  rc?: Lv;
}
export const ref = (id: string, s = '', r = '', rc?: Lv): Entry => ({ ref: id, s, r, rc });
export const item = (t: string, s = '', r = '', c?: Lv, rc?: Lv): Entry => ({ t, s, r, c, rc });

/** [group label, entries] */
export type Rel = [string, Entry[]];

export interface Note {
  t: string;
  text: string;
  tone?: 'warn' | 'crit' | 'ok';
  /** [button label, action key] */
  action?: [string, string];
}

export interface Alert {
  id: string;
  sev: 'crit' | 'warn' | 'info';
  title: string;
  where: string;
  when: string;
  obj: string;
  resolved: boolean;
  domain: string;
  action: string;
  tab?: string;
}

export interface PowerReading {
  id?: string;
  name?: string;
  w: number;
  src: 'plug' | 'ipmi' | 'gpu' | 'dsm' | 'poe' | 'est';
}

export interface Tile { l: string; v: string; c: Lv; s: string }
export interface Volume { obj: string; name?: string; site: SiteId; host: string; used: string; usedLv?: Lv; status: string; statusLv: Lv }
export interface BackupJob { name: string; obj: string; target: string; schedule: string; last: string; runnable?: boolean; progressLabel?: string }
export interface Change { t: string; k: string; x: string }
/** [object id, what, source] */
export type Update = [string, string, string];

export interface ThermalPart {
  k: string;
  kind: 'temp' | 'fan';
  label: string;
  x: number;
  y: number;
  sensor: string;
  w?: number; h?: number; t?: number; warn?: number; thr?: number; vert?: boolean; note?: string;
  s?: number; rpm?: number; max?: number;
}
export interface Hardware {
  charts?: Chart[];
  temps?: Temp[];
  tempsWide?: boolean;
  fans?: Fan[];
  fansTitle?: string;
  drives?: Entry[];
  notes?: Note[];
  layout?: { chassis: string; def: string; comps: ThermalPart[] };
}

export interface HostRecord {
  id: string;
  name: string;
  site: SiteId;
  status: Status;
  sub: string;
  meters?: Meter[];
  facts: Fact[];
  factsTitle?: string;
  factsWide?: boolean;
  notes?: Note[];
  guests?: Entry[];
  interfaces?: Entry[];
  events?: Entry[];
  rel?: Rel[];
  /** Hardware telemetry the source reports itself (otherwise it comes from VictoriaMetrics). */
  hardware?: Hardware;
}

export interface Vps {
  id: string;
  role: string;
  lands: string;
  targets: Entry[];
  status: Status;
  link?: string;
  cpu?: number;
  mem?: number;
  notes?: Note[];
  events?: Entry[];
  rel?: Rel[];
  diagnostics?: {
    fixed: boolean;
    /** [check, result, level, result once fixed] */
    steps: [string, string, Lv, string?][];
    cause: Note;
    outcome: Note;
  };
}
export interface Provider {
  id: string;
  ab: string;
  name: string;
  status: Status;
  sub: string;
  billing?: Fact[];
  tunnels?: Entry[];
  dns?: Fact[];
  rel: Rel[];
}

/** Cross-cutting feeds any integration may contribute to. */
export interface SourceData {
  alerts?: Alert[];
  updates?: Update[];
  changes?: Change[];
  power?: PowerReading[];
  psu?: Record<string, Fact[]>;
  storageTiles?: Tile[];
  volumes?: Volume[];
  backupTiles?: Tile[];
  backupJobs?: BackupJob[];
}

export interface Integration<T extends SourceData = SourceData> {
  id: string;
  name: string;
  /** What it covers, shown on the Data sources page. */
  covers: string;
  /** Polling interval. */
  sync: string;
  /** Health of the mock connection. */
  health?: 'ok' | 'warn';
  mock(sim: Sim): T;
  /** Live client. Not implemented yet for any integration. */
  fetch?(): Promise<T>;
}
