"""The API contract. The frontend's TypeScript types are generated from these models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

Level = Literal["ok", "warn", "crit", "info", "mute", "text"]
Status = Literal["ok", "warn", "crit", "plan", "off"]
Tone = Literal["warn", "crit", "ok"]
Range = Literal["live", "1 h", "24 h", "7 d"]


class Entry(BaseModel):
    """A list row: a reference to another object (`ref`) or free text (`t`)."""

    ref: str | None
    t: str | None
    s: str
    r: str
    c: Level | None
    rc: Level | None


#: (button label, action key)
Action = tuple[str, str]


class Fact(BaseModel):
    k: str
    v: str
    lv: Level | None


class Meter(BaseModel):
    l: str  # noqa: E741
    pct: float
    text: str | None
    lv: Level | None


class Temp(BaseModel):
    l: str  # noqa: E741
    t: float
    warn: float
    crit: float


class Fan(BaseModel):
    l: str  # noqa: E741
    rpm: int


class ThermalPart(BaseModel):
    k: str
    kind: Literal["temp", "fan"]
    label: str
    x: int
    y: int
    sensor: str
    w: int | None = None
    h: int | None = None
    t: float | None = None
    warn: float | None = None
    thr: float | None = None
    vert: bool = False
    note: str | None = None
    s: int | None = None
    rpm: int | None = None
    max: int | None = None


class ThermalLayout(BaseModel):
    chassis: str
    default: str
    comps: list[ThermalPart]


class _Section(BaseModel):
    t: str
    wide: bool


class KvSection(_Section):
    type: Literal["kv"]
    items: list[Fact]


class BarsSection(_Section):
    type: Literal["bars"]
    items: list[Meter]


class TempsSection(_Section):
    type: Literal["temps"]
    items: list[Temp]


class ListSection(_Section):
    type: Literal["list"]
    items: list[Entry]
    action: Action | None


class NoteSection(_Section):
    type: Literal["note"]
    text: str
    tone: Tone | None
    action: Action | None


class FansSection(_Section):
    type: Literal["fans"]
    items: list[Fan]


class ChartSection(_Section):
    type: Literal["chart"]
    value: float
    unit: str
    warn: float | None
    max: float
    values: list[float]


class BoardSection(_Section):
    type: Literal["board"]
    layout: ThermalLayout


Section = Annotated[KvSection | BarsSection | TempsSection | ListSection | NoteSection | FansSection | ChartSection | BoardSection, Field(discriminator="type")]


class Tab(BaseModel):
    name: str
    sections: list[Section]


class RelGroup(BaseModel):
    label: str
    items: list[Entry]


class ObjectAction(BaseModel):
    label: str
    key: str
    primary: bool


class SiteRow(BaseModel):
    gateway: str
    internet: str
    internetLv: Level | None
    link: str


class Object(BaseModel):
    id: str
    type: str
    ab: str
    name: str
    site: str
    st: Status
    sub: str
    host: str | None
    prov: str | None
    ip: str | None
    needsDiag: bool
    table: SiteRow | None
    actions: list[ObjectAction]
    tabs: list[Tab]
    rel: list[RelGroup]


class Scope(BaseModel):
    id: str
    label: str
    line: str
    obj: str | None


class Source(BaseModel):
    id: str
    name: str
    covers: str
    sync: str
    mode: Literal["mock", "live"]
    #: "disconnected" = live mode, and nothing has been received from it.
    health: Literal["ok", "warn", "disconnected"]
    paused: bool


class Alert(BaseModel):
    id: str
    sev: Literal["crit", "warn", "info"]
    title: str
    where: str
    when: str
    obj: str
    domain: str
    action: str
    tab: str | None
    state: Literal["open", "acked", "silenced", "resolved"]
    acked: bool
    silenced: bool


class DriftItem(BaseModel):
    obj: str
    field: str
    declared: str
    observed: str
    accepted: bool


class Cmdb(BaseModel):
    objectCount: str
    synced: str
    drift: list[DriftItem]


class Update(BaseModel):
    obj: str
    what: str
    source: str
    scheduled: bool


class Tile(BaseModel):
    l: str  # noqa: E741
    v: str
    lv: Level
    s: str


class Volume(BaseModel):
    obj: str
    name: str | None
    site: str
    host: str
    used: str
    usedLv: Level | None
    status: str
    statusLv: Level


class Storage(BaseModel):
    tiles: list[Tile]
    volumes: list[Volume]


class BackupJob(BaseModel):
    name: str
    obj: str
    target: str
    schedule: str
    last: str
    action: str | None


class Progress(BaseModel):
    label: str
    pct: int


class Backups(BaseModel):
    tiles: list[Tile]
    jobs: list[BackupJob]
    running: bool
    progress: Progress | None


class Channel(BaseModel):
    id: str
    name: str
    sends: str
    on: bool


class Change(BaseModel):
    t: str
    k: str
    x: str
    lv: Level | None


class Notice(BaseModel):
    lv: Level
    title: str
    domain: str
    where: str
    when: str
    action: str
    route: str | None
    obj: str | None


class Domain(BaseModel):
    t: str
    lv: Level
    s: str
    v1: str
    l1: str
    v2: str
    l2: str
    note: str
    route: str


class Overview(BaseModel):
    notices: list[Notice]
    domains: list[Domain]


class TopoBar(BaseModel):
    l: str  # noqa: E741
    pct: float
    text: str | None


class TopoNode(BaseModel):
    id: str
    kind: Literal["net", "host", "group"]
    x: int
    y: int
    w: int
    h: int
    name: str
    sub: str
    bars: list[TopoBar]
    vps: list[str]
    layer: Literal["compute", "network", "external"]


class TopoLine(BaseModel):
    kind: Literal["solid", "tunnel", "sitemagic", "flow", "planned"]
    x: int
    y: int
    w: int
    h: int


class TopoPill(BaseModel):
    x: int
    y: int
    t: str
    kind: Literal["plain", "tunnel", "sitemagic", "flow"]


class Topology(BaseModel):
    h: int
    sub: str
    nodes: list[TopoNode]
    lines: list[TopoLine]
    pills: list[TopoPill]


class PowerRow(BaseModel):
    obj: str | None
    name: str
    share: str
    w: str
    off: bool
    src: str
    srcLv: Level
    loss: bool


class PowerBranch(BaseModel):
    key: str
    t: str
    sub: str
    series: int
    total: str
    alarm: bool
    obj: str | None
    rows: list[PowerRow]


class StackPart(BaseModel):
    t: str
    w: str
    series: int


class Legend(BaseModel):
    series: int
    label: str


class PowerBar(BaseModel):
    u: str
    w: str
    s: str


class InsightAction(BaseModel):
    label: str
    key: str | None
    route: str | None
    primary: bool


class Insight(BaseModel):
    t: str
    tone: Tone | None
    text: str
    action: InsightAction | None


class Method(BaseModel):
    t: str
    d: str
    acc: str
    lv: Level


class Power(BaseModel):
    total: int
    onBattery: bool
    banner: str | None
    tiles: list[Tile]
    stack: list[StackPart]
    branches: list[PowerBranch]
    legend: list[Legend]
    bars: list[PowerBar]
    peak: str
    since: str
    insights: list[Insight]
    methods: list[Method]


class Settings(BaseModel):
    price: str


class Snapshot(BaseModel):
    """Everything the UI shows, for one time range. Page models that depend on the site scope are keyed by scope id."""

    version: int
    range: Range
    scopes: list[Scope]
    sources: list[Source]
    objects: list[Object]
    alerts: list[Alert]
    cmdb: Cmdb | None
    updates: list[Update]
    storage: Storage
    backups: Backups
    notifications: list[Channel]
    changes: list[Change]
    overview: dict[str, Overview]
    topology: dict[str, Topology]
    power: dict[str, Power]
    settings: Settings


class PriceIn(BaseModel):
    value: str = Field(max_length=16)
