import type { ChangeEvent } from 'react';
import type { Range, Snapshot } from '../api/client';

export type Fn = () => void;
export type InputHandler = (e: ChangeEvent<HTMLInputElement>) => void;

/** UI state. It lives in the browser; everything about the lab comes from the server's snapshot. */
export interface AppState {
  route: string;
  obj: string | null;
  tab: string;
  /** Site scope: 'all' or a site id from the snapshot. */
  scope: string;
  range: Range;
  side: boolean;
  closed: Record<string, boolean>;
  bell: boolean;
  palette: boolean;
  pq: string;
  layer: string;
  gk: string;
  at: string;
  hwSel: string | null;
  /** Tariff as being typed; null until the user edits it (the saved one is in the snapshot). */
  price: string | null;
}

/** What buildView() needs from the store. */
export interface StoreLike {
  state: AppState;
  snapshot: Snapshot;
  setState(patch: Partial<AppState>): void;
  nav(route: string, id?: string): void;
  act(key: string): void;
  toggle(group: string, key: string): void;
  setPrice(value: string): void;
}

export interface Seg {
  label: string;
  dot?: string;
  on: boolean;
  pick: Fn;
}

export interface Tile {
  l: string;
  v: string;
  c: string;
  s: string;
}

export interface ActionBtn {
  l: string;
  fn: Fn;
  bg: string;
  fg: string;
  bd: string;
}

export interface AlertItem {
  title: string;
  where: string;
  when: string;
  c: string;
  go: Fn;
}

export interface NavItem {
  t: string;
  ab: string;
  go: Fn;
  cur: 'page' | 'false';
  hasBadge: boolean;
  badge: string;
  bc: string;
  hasDot: boolean;
  dot: string;
}

export interface NavGroup {
  t: string;
  open: boolean;
  chev: string;
  showHead: boolean;
  toggle: Fn;
  items: NavItem[];
}

export interface Crumb {
  t: string;
  go: Fn;
  link: boolean;
  last: boolean;
}

export interface Attention extends AlertItem {
  domain: string;
  action: string;
}

export interface Domain {
  t: string;
  c: string;
  s: string;
  v1: string;
  l1: string;
  v2: string;
  l2: string;
  note: string;
  go: Fn;
}

export interface Change {
  t: string;
  k: string;
  x: string;
  c: string;
}

export interface TopoLine {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  bt: string;
  bl: string;
}

export interface TopoPill {
  x: number;
  y: number;
  t: string;
  c: string;
  b: string;
}

export interface MiniBar {
  l: string;
  w: string;
  v: string;
  c: string;
  tc: string;
}

export interface TopoNode {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  sub: string;
  dot: string;
  dotB: string;
  isBtn: boolean;
  isGroup: boolean;
  go: Fn;
  bars: MiniBar[];
  jc: string;
  bs: string;
  bg: string;
  op: string;
  vps?: { n: string; t: string; c: string; go: Fn }[];
}

export interface PowerRow {
  name: string;
  hasGo: boolean;
  go: Fn;
  dot: string;
  share: string;
  wTxt: string;
  wc: string;
  src: string;
  srcBg: string;
  srcC: string;
  op: string;
}

export interface PowerBranch {
  t: string;
  sub: string;
  c: string;
  total: string;
  tc: string;
  hasGo: boolean;
  go: Fn;
  rows: PowerRow[];
}

export interface Insight {
  t: string;
  bd: string;
  text: string;
  hasBtn: boolean;
  btn: string;
  fn: Fn;
  bg: string;
  fg: string;
  bdb: string;
}

export interface PowerVM {
  price: string;
  onPrice: InputHandler;
  /** Shown when the lab runs on battery. */
  banner: string | null;
  legend: { label: string; c: string }[];
  tiles: Tile[];
  stack: { t: string; w: string; c: string }[];
  branches: PowerBranch[];
  insights: Insight[];
  methods: { t: string; d: string; acc: string; c: string; bg: string }[];
  bars: { u: string; w: string; s: string }[];
  peak: string;
  from: string;
}

export interface Cell {
  t: string;
  c: string;
  ff: string;
  fs: string;
}

export interface Row {
  name: string;
  dot: string;
  hasGo: boolean;
  go: Fn;
  cells: Cell[];
  actions: ActionBtn[];
  op: string;
}

export interface Table {
  title: string;
  hasTitle: boolean;
  count: string;
  cols: string[];
  grid: string;
  rows: Row[];
  empty: boolean;
  minW: string;
  hasActions: boolean;
}

export interface ListPageVM {
  title: string;
  desc: string;
  hasChips: boolean;
  chips: Seg[];
  hasTiles: boolean;
  tiles: Tile[];
  hasProgress: boolean;
  progLabel?: string;
  progPct?: string;
  tables: Table[];
}

/** A resolved list / relationship entry. */
export interface RefItem {
  t: string;
  s: string;
  r: string;
  rc: string;
  c: string;
  hasGo: boolean;
  go?: Fn;
}

export interface BoardPart {
  label: string;
  x: number;
  y: number;
  pick: Fn;
  isFan: boolean;
  val: string;
  // fans
  s?: number;
  ly?: number;
  dur?: string;
  ring?: string;
  // temperature blocks
  w?: number;
  h?: number;
  fill?: string;
  border?: string;
  vc?: string;
  glow?: string;
  dir?: 'row' | 'column';
  align?: string;
}

export interface Card {
  type: 'kv' | 'bars' | 'list' | 'chart' | 'note' | 'fans' | 'board';
  t?: string;
  gc: string;
  bd: string;
  hasTitle: boolean;
  hasBtn: boolean;
  btnL?: string;
  btnFn?: Fn;
  /** Shape depends on `type`; see the card renderers in ObjectPage. */
  items?: any[];
  // chart
  v?: string;
  vc?: string;
  lc?: string;
  pts?: string;
  area?: string;
  thrY?: string | number;
  thrOp?: string;
  // note
  text?: string;
  // board
  chassis?: string;
  comps?: BoardPart[];
  sel?: { label: string; val: string; c: string; meta: string; w: string; hasNote: boolean; note: string };
}

export interface ObjectVM {
  name?: string;
  type?: string;
  ab?: string;
  sub?: string;
  status?: string;
  sc?: string;
  stint?: string;
  tabs: { label: string; on: boolean; pick: Fn }[];
  cards: Card[];
  actions: ActionBtn[];
  rel: { l: string; items: RefItem[] }[];
  noRel: boolean;
}

export interface ViewModel {
  scopes: Seg[];
  ranges: Seg[];
  rangeLabel: string;
  srcLabel: string;
  srcDot: string;
  /** No source has delivered anything: there is no inventory to show. */
  noData: boolean;
  goSources: Fn;
  bell: { show: boolean; n: string; c: string };
  bellOpen: boolean;
  bellEmpty: boolean;
  bellItems: AlertItem[];
  toggleBell: Fn;
  goAlerts: Fn;
  goHome: Fn;
  groups: NavGroup[];
  sideW: string;
  toggleSide: Fn;
  crumbs: Crumb[];
  isHome: boolean;
  isTopo: boolean;
  isPower: boolean;
  isList: boolean;
  isObj: boolean;
  pw: PowerVM;
  scopeLine: string;
  overall: { label: string; c: string; tint: string };
  attention: Attention[];
  attentionN: string;
  noAttention: boolean;
  domains: Domain[];
  changes: Change[];
  topo: { h: number; nodes: TopoNode[]; lines: TopoLine[]; pills: TopoPill[]; sub: string };
  layers: Seg[];
  page: ListPageVM;
  o: ObjectVM;
  paletteOpen: boolean;
  openPalette: Fn;
  closePalette: Fn;
  pq: string;
  onPq: InputHandler;
  results: { type: string; n: string; s: string; c: string; go: Fn }[];
  noResults: boolean;
}
