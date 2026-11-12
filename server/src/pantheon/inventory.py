"""Merge the integrations' datasets into one inventory of objects.

Every object (site, host, guest, container, VLAN, VPS, UPS, service…) has an
owner integration and may be enriched by others: VictoriaMetrics adds sensors
to hosts, NetBox the CMDB record, NUT the power path. A dataset that is
``None`` simply leaves its part out.

Objects carry *sections* grouped in tabs. Sections are semantic (facts,
meters, lists, series…); the frontend decides how they look.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from .integrations import Datasets
from .integrations.base import item, ref

RANGE_SPEED = {"live": 0.4, "1 h": 0.7, "24 h": 1.4, "7 d": 2.4}
PROVIDERS = ("ovh", "quicksrv", "scaleway", "cloudflare")

# ---------- sections ----------


def _at(seq, i):
    return seq[i] if len(seq) > i else None


def kv(t, pairs, wide=False):
    """Facts. A pair whose value is None is unknown to the source and left out."""
    return {"type": "kv", "t": t, "wide": wide, "items": [{"k": p[0], "v": str(p[1]), "lv": _at(p, 2)} for p in pairs if p[1] is not None]}


def bars(t, meters):
    return {"type": "bars", "t": t, "wide": False, "items": [{"l": m[0], "pct": m[1], "text": _at(m, 2), "lv": _at(m, 3)} for m in meters]}


def temps(t, rows, wide=False):
    return {"type": "temps", "t": t, "wide": wide, "items": [{"l": r[0], "t": r[1], "warn": r[2], "crit": r[3]} for r in rows]}


def lst(t, items, wide=False, action=None):
    return {"type": "list", "t": t, "wide": wide, "items": items, "action": action}


def note(n):
    return {"type": "note", "t": n["t"], "wide": True, "text": n["text"], "tone": n["tone"], "action": n["action"]}


def fans(t, rows):
    return {"type": "fans", "t": t, "wide": False, "items": [{"l": r[0], "rpm": r[1]} for r in rows]}


def chart(c, speed):
    """A series. Live sources deliver real samples; the mock shapes 31 points from a base value."""
    if isinstance(c, dict):
        values, warn = c["values"], c.get("warn")
        return {"type": "chart", "t": c["t"], "wide": False, "value": round(values[-1], 1), "unit": c["unit"], "warn": warn, "max": max(warn or 0, max(values)) * 1.15 or 100, "values": values}
    t, base, amp, unit, warn, seed = c
    values = [base + math.sin(i * speed + seed) * amp + ((i * 13 + seed) % 7 - 3) * amp * 0.15 for i in range(30)] + [base]
    return {"type": "chart", "t": t, "wide": False, "value": base, "unit": unit, "warn": warn or None, "max": max(warn or 0, base + amp * 2) * 1.15 or 100, "values": values}


def board(layout):
    return {"type": "board", "t": "Physical layout · thermal map", "wide": True, "layout": layout}


# ---------- inventory ----------


@dataclass
class Inventory:
    data: Datasets
    objects: dict[str, dict] = field(default_factory=dict)
    #: object id → id of the UPS that feeds it
    ups_of: dict[str, str] = field(default_factory=dict)
    #: Declared-vs-observed differences: (object id, field, declared, observed)
    drift: list[tuple] = field(default_factory=list)

    def feed(self, key: str) -> list:
        """Concatenate one cross-cutting feed (alerts, updates, power…) over every dataset."""
        out: list = []
        for ds in self.data.values():
            if ds and ds.get(key):
                out.extend(ds[key])
        return out

    def of_types(self, *types: str, scope: str = "all") -> list[str]:
        return [k for k, o in self.objects.items() if o["type"] in types and scope in ("all", o["site"])]

    def worst(self, ids, scope: str = "all") -> str:
        w = "ok"
        for k in ids:
            o = self.objects.get(k)
            if not o or scope not in ("all", o["site"]):
                continue
            if o["st"] == "crit":
                w = "crit"
            elif o["st"] == "warn" and w != "crit":
                w = "warn"
        return w

    @property
    def ups(self) -> list[dict]:
        return (self.data.get("nut") or {}).get("ups", [])

    def ups_named(self, id: str) -> dict | None:
        return next((u for u in self.ups if u["id"] == id), None)


def _obj(inv: Inventory, id, type, ab, name, site, st, sub, tabs, rel, **extra) -> dict:
    o = {
        "id": id, "type": type, "ab": ab, "name": name, "site": site, "st": st, "sub": sub,
        "host": None, "prov": None, "ip": None, "needsDiag": False, "table": None, "actions": [],
        "tabs": _tabs(tabs),
        "rel": [{"label": label, "items": items} for label, items in rel or [] if items],
    }
    o.update(extra)
    while o["id"] in inv.objects:  # two sources named different things alike: keep both visible
        o["id"] += "~"
    inv.objects[o["id"]] = o
    return o


def _tabs(tabs: dict[str, list]) -> list[dict]:
    """Tabs in order, without sections that have nothing in them and without tabs left empty."""
    out = []
    for name, sections in tabs.items():
        sections = [s for s in sections if s.get("items", True)]
        if sections:
            out.append({"name": name, "sections": sections})
    return out


def build(data: Datasets, world: Any, accepted: dict[str, bool], range_: str) -> Inventory:
    inv = Inventory(data)
    D = data
    nb = D.get("netbox") or {}
    speed = RANGE_SPEED[range_]
    inv.drift = list(nb.get("drift", []))

    # Power wiring (NUT): which UPS feeds what
    powered_by: dict[str, list] = {}
    power_path: dict[str, dict] = {}
    for u in inv.ups:
        for k, label in u["powered_by"].items():
            inv.ups_of[k] = u["id"]
            powered_by[k] = [("Powered by", [ref(u["id"], label)])]
        for k, label in u["power_path"].items():
            power_path[k] = ref(u["id"], label)

    def with_power(id, rel):
        return list(rel or []) + powered_by.get(id, [])

    # Power readings and PSU facts, from whichever source measures them
    watts = {p["id"]: p for p in inv.feed("power") if p.get("id")}
    psu: dict[str, list] = {}
    for ds in D.values():
        if ds and ds.get("psu"):
            psu.update(ds["psu"])

    # Sites · UniFi Site Manager
    for s in (D.get("sitemanager") or {}).get("sites", []):
        t = s["table"]
        _obj(inv, s["id"], "Site", s["ab"], s["name"], s["site"], s["status"], s["sub"], {
            "Overview": [bars("Site health", s.get("health", [])), kv("Facts", s.get("facts", [])), *map(note, s.get("notes", []))],
            "Uplinks": [lst("Internet uplinks", s.get("uplinks", []), True)],
            "Devices": [lst(s.get("devices_title", "Devices"), s.get("devices", []), True)],
        }, s.get("rel"), table={"gateway": t["gateway"], "internet": t["internet"], "internetLv": t["internet_lv"], "link": t["link"]})

    # Network devices · UniFi Network
    unifi = D.get("unifi") or {}
    for d in unifi.get("devices", []):
        _obj(inv, d["id"], "Network device", "NET", d["name"], d["site"], d.get("status", "ok"), d["sub"], {
            "Overview": [bars("Load", d.get("meters", [])), kv("Facts", d.get("facts", []))],
            "Events": [lst("Events", d.get("events", []), True)],
        }, with_power(d["id"], d.get("rel")))

    # Hosts · owned by Proxmox, TrueNAS, NetBox (planned) or Synology;
    # enriched by metrics, power, LLM engines and the CMDB
    telemetry: dict[str, dict] = {}
    for ds in D.values():  # VictoriaMetrics for most hosts, a BMC for some
        for id, hw in ((ds or {}).get("hosts_hardware") or {}).items():
            telemetry.setdefault(id, {}).update(hw)
    llm_hosts = (D.get("llm") or {}).get("hosts", {})

    def host(h):
        id = h["id"]
        t = {**h.get("hardware", {}), **telemetry.get(id, {})}
        cm = nb.get("hosts", {}).get(id, {})
        facts = list(h.get("facts", [])) + llm_hosts.get(id, [])
        plug = watts.get(id)
        if plug and plug["src"] in ("plug", "gpu"):
            facts.append(("Power", f"{plug['w']} W"))
        ov = [*([bars("Resources", h["meters"])] if h.get("meters") else []), kv(h.get("facts_title", "Facts"), facts, h.get("facts_wide", False)),
              *map(note, h.get("notes", []) + t.get("notes", []))]
        hw = []
        if t.get("layout"):
            hw.append(board(t["layout"]))
        if t.get("temps"):
            hw.append(temps("Temperatures", t["temps"], t.get("temps_wide", False)))
        if t.get("fans"):
            hw.append(fans(t.get("fans_title", "Fans"), t["fans"]))
        if t.get("drives"):
            hw.append(lst("Drives · SMART", t["drives"]))
        if id in psu:
            hw.append(kv("Power supply", psu[id]))
        if hw and D.get("nut"):
            hw.append(lst("Power path", [power_path[id]]) if id in power_path else note({
                "t": "Power path · not on UPS", "tone": "warn", "action": None,
                "text": h["name"] + " runs on wall power by design: at its draw it would empty the UPS in minutes. A power cut means a hard stop, so keep nothing stateful on it."}))
        _obj(inv, id, "Host", "HOST", h["name"], h["site"], h["status"], h["sub"], {
            "Overview": ov,
            "Metrics": [chart(c, speed) for c in _charts(t.get("charts"), range_)],
            "Hardware": hw,
            "Guests": [lst("Guests", h["guests"], True)] if h.get("guests") else [],
            "Network": [lst("Interfaces", h["interfaces"], True)] if h.get("interfaces") else [],
            "Events": [lst("Events", h["events"], True)] if h.get("events") else [],
            "Asset & CMDB": [*([kv("CMDB record (NetBox)", cm["cmdb"])] if cm.get("cmdb") else []), *([kv("Physical asset (ITAM)", cm["asset"])] if cm.get("asset") else [])],
        }, with_power(id, h.get("rel")))

    proxmox = D.get("proxmox") or {}
    for h in proxmox.get("nodes", []):
        host(h)
    if D.get("truenas"):
        host(D["truenas"]["host"])
    for h in nb.get("planned", []):
        host(h)
    if D.get("synology"):
        host(D["synology"]["host"])

    # Pools · TrueNAS
    for p in (D.get("truenas") or {}).get("pools", []):
        _obj(inv, p["id"], "Pool", "POOL", p["name"], p["site"], p["status"], p["sub"], {
            "Overview": [bars("Capacity", p["capacity"]), kv("Health", p["health"])],
            "Datasets": [lst("Datasets", p.get("datasets", []), True)],
            "Protection": [lst("Copies", p.get("copies", []), True)],
        }, p.get("rel"))

    # Guests · Proxmox, with containers from the Docker agents and the declared record from NetBox
    containers = (D.get("docker") or {}).get("containers", [])
    routers = (D.get("tailscale") or {}).get("routers", {})
    pihole = D.get("pihole") or {}
    for g in proxmox.get("guests", []):
        id, is_vm, host_o = g["id"], g["kind"] == "VM", inv.objects.get(g["node"])
        ts = routers.get(id)
        meters = g["meters"] + (pihole["meters"] if pihole.get("guest") == id else [])
        ctrs = g.get("services", []) + [ref(c["id"]) for c in containers if c["guest"] == id]
        tabs = {"Overview": [bars("Resources", meters), kv("Configuration", g["cfg"] + (ts["facts"] if ts else []))]}
        ctr_tab = "Containers" if is_vm else "Services"
        if ctrs:
            tabs[ctr_tab] = [lst("Docker containers" if is_vm else "Containers / services", ctrs, True)]
        elif D.get("docker"):
            tabs[ctr_tab] = [note({"t": "No containers", "tone": None, "action": None, "text": "No Docker runtime in this guest. Metrics come from the Proxmox API and node_exporter."})]
        tabs["Network"] = [kv("Interface", [("net0", g.get("nic")), ("VLAN", g.get("vlan")), ("Address", g.get("ip")), ("MAC", g.get("mac"))]), lst("Firewall", g.get("fw", []))]
        tabs["Backups"] = [lst("3-2-1", g.get("copies", [])), lst("Runs", g.get("runs", []))]
        if "guests" in nb:
            rec = nb["guests"].get(id, {})
            diff, ok = rec.get("diff") or _declared_diff(nb.get("declared", {}).get(id), g.get("observed")), bool(accepted.get(id))
            if "diff" not in rec:
                inv.drift.extend((id, *d) for d in diff)
            lv = "ok" if ok else "warn"
            rows = [item(d[0], "NetBox: " + (d[2] if ok else d[1]), "observed: " + d[2] + (" ✓" if ok else " ≠"), lv, lv) for d in diff] \
                or [item("All fields match", "site · host · VLAN · IP · vCPU · memory", "✓")]
            tabs["Asset & CMDB"] = [
                lst("Declared (NetBox) vs observed", rows, True, ("Accept observed → update NetBox", "accept:" + id) if diff and not ok else None),
                kv("CMDB record", [("Role", rec.get("role") or g["role"] or None), ("Owner", nb.get("owner")), ("Lifecycle", rec.get("lifecycle", "Test" if is_vm and g["status"] == "off" else "Production")), ("Criticality", rec.get("crit", "Low" if "owner" in nb else None))]),
            ]
        tabs["Events"] = [lst("Events", g.get("events", []), True)]
        _obj(inv, id, g["kind"], "VM" if is_vm else "LXC", g.get("name") or id, host_o["site"] if host_o else "home", g["status"],
             " · ".join(x for x in (g["kind"], f"on {host_o['name'] if host_o else g['node']}", g.get("ip"), g.get("role")) if x), tabs,
             [("Runs on", [ref(g["node"])]), *g.get("rel", []), *(ts["rel"] if ts else [])], host=g["node"], ip=g.get("ip"))

    # Containers · Docker agents
    for c in containers:
        _obj(inv, c["id"], "Container", "CTR", c["name"], "home", c["status"], f"{c['image']} · in {c['guest']}", {
            "Overview": [kv("Container", [("Image", c["image"]), ("State", c["up"], "warn" if c["status"] == "warn" else None), ("Memory", c.get("mem")), ("Restart policy", c.get("restart"))]),
                         bars("Usage", [*([("CPU", c["cpu"])] if "cpu" in c else []), *([("Memory vs limit", c["memp"], c.get("memt"))] if "memp" in c else [])]), *map(note, c.get("notes", []))],
            "Logs": [lst("Recent events", c.get("events", []), True)],
        }, [("Runs in", [ref(c["guest"])]), *c.get("rel", [])], host=c["guest"])

    # Providers and their edge VPS · OVH, Quicksrv.io, Scaleway, Cloudflare
    provs = [D[k] for k in PROVIDERS if D.get(k)]
    for P in provs:
        p = P["provider"]
        _obj(inv, p["id"], "Provider", p["ab"], p["name"], "home", p["status"], p["sub"], {}, p["rel"])
    for P in provs:
        p = P["provider"]
        for v in P["vps"]:
            tabs = {
                "Overview": [kv(v.get("facts_title", "Tunnel"), v.get("facts", [])),
                             bars("Resources", [*([("CPU", v["cpu"])] if "cpu" in v else []), *([("Memory", v["mem"])] if "mem" in v else [])]), *map(note, v.get("notes", []))],
                "Events": [lst("Events", v.get("events", []), True)],
            }
            dg = v.get("diagnostics")
            if dg:
                tabs["Diagnostics"] = _diagnostics(dg, world)
            _obj(inv, v["id"], "VPS", "VPS", v.get("name", v["id"]), "home", v["status"], f"{p['name']} · {v['role']} → {v['lands']}", tabs,
                 [("Provider", [ref(p["id"])]), ("Tunnels into", v.get("targets", [])), *v.get("rel", [])], prov=p["id"], needsDiag=bool(dg) and not dg["fixed"])
    for P in provs:
        p = P["provider"]
        if p.get("tunnels"):
            tabs = {"Overview": [lst("Tunnels", p["tunnels"], True), kv("DNS", p.get("dns", []))]}
        else:
            kids = [k for k, o in inv.objects.items() if o["prov"] == p["id"]]
            tabs = {"Overview": [lst("VPS", [ref(k, " · ".join(inv.objects[k]["sub"].split(" · ")[1:])) for k in kids], True)], "Billing": [kv("Account", p.get("billing", []))]}
        inv.objects[p["id"]]["tabs"] = _tabs(tabs)

    # VLANs · UniFi Network, with drift against NetBox
    for v in unifi.get("vlans", []):
        dr = nb.get("vlan_drift", {}).get(v["vid"])
        _obj(inv, f"vlan{v['vid']}", "VLAN", f"V{v['vid']}", f"VLAN {v['vid']} · {v['name']}", v["site"], "warn" if dr else "ok", f"{v['subnet']} · zone {v['zone']}", {
            "Overview": [kv("Network", [("Subnet", v["subnet"]), ("Gateway", v.get("gw") or v["subnet"].replace("0/24", "1")), ("DHCP", v.get("dhcp", "static only")), ("Zone", v["zone"])]),
                         *([note(dr["note"])] if dr else [])],
            "Members": [lst("Members", v["members"] + ([dr["member"]] if dr else []), True)],
            "Policy": [lst("Allowed to reach", v["policy"] if "policy" in v else [item("default deny", "between zones", "", "mute")], True)],
        }, [("Gateway", [ref(v["gateway"])] if v.get("gateway") else [])])

    # Services · declared in NetBox, health from their components
    for s in nb.get("services", []):
        _obj(inv, s["id"], "Service", "SVC", s["name"], "home", inv.worst(c["ref"] for c in s["comps"] if c["ref"]), s["desc"], {
            "Overview": [lst("Components", s["comps"], True)],
            "Dependency path": [lst("If this breaks…", [ref(c["ref"] or c["t"], "part of " + s["name"]) for c in s["comps"]], True)],
        }, [])

    # UPS · NUT
    for u in inv.ups:
        ov = [bars("Battery & load", u["meters"]), kv("Status", u["facts"]), lst("Protected devices", u.get("protects", []))]
        if u.get("policy"):
            ov.append(lst("Shutdown policy (NUT + Proxmox)", u["policy"]))
        on = u["on_battery"]
        _obj(inv, u["id"], "UPS", "UPS", u["name"], u["site"], u["status"], u["sub"], {"Overview": ov, "Events": [lst("Events", u["events"], True)] if u.get("events") else []}, u["rel"],
             actions=[{"label": lit if on else idle, "key": key, "primary": not on} for idle, lit, key in u.get("actions", [])])

    return inv


def _charts(charts, range_: str) -> list:
    """Live sources keep one set of series per time range; the mock has one recipe for all of them."""
    if isinstance(charts, dict):
        return charts.get(range_, [])
    return charts or []


def _declared_diff(declared: dict | None, observed: dict | None) -> list[tuple]:
    """Compare what the CMDB declares for a guest with what the hypervisor reports: (field, declared, observed)."""
    if not declared or not observed:
        return []
    labels = {"memory_mb": ("Memory", "{} MB"), "vcpus": ("vCPU", "{}")}
    return [(label, fmt.format(declared[k]), fmt.format(observed[k])) for k, (label, fmt) in labels.items()
            if declared.get(k) is not None and observed.get(k) is not None and float(declared[k]) != float(observed[k])]


def _diagnostics(dg: dict, world: Any) -> list[dict]:
    """Guided diagnostics for a VPS: the checks, how far the current run got, and what it found."""
    fixed = dg["fixed"]
    rows = []
    for i, (check, result, lv, fixed_result) in enumerate(dg["steps"]):
        if fixed:
            rows.append(item(check, "", fixed_result or result, "ok", "ok"))
            continue
        done = world.diag != "idle" and i < world.step
        running = world.diag == "running" and i == world.step
        rows.append(item(f"{i + 1}. {check}", "checking…" if running else "", result if done else ("…" if running else "—"), lv if done else "mute", lv if done else "mute"))
    action = None if fixed or world.diag == "running" else ("Run again" if world.diag == "done" else "Run diagnostics", "diag")
    out = [lst("Guided diagnostics", rows, True, action)]
    if not fixed and world.diag == "done":
        out.append(note(dg["cause"]))
    if fixed:
        out.append(note(dg["outcome"]))
    return out
