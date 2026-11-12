"""Page models that need more than the inventory: the power breakdown and the overview."""

from __future__ import annotations

import math
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .inventory import RANGE_SPEED, Inventory


def _round(x: float) -> int:
    """Round half up, the way the figures were designed (Python's round() goes to even)."""
    return math.floor(x + 0.5)


def _fixed(x: float, digits: int = 1) -> str:
    return str(Decimal(x).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def parse_price(raw: str) -> float:
    m = re.match(r"\s*[-+]?(\d+\.?\d*|\.\d+)", str(raw).replace(",", "."))
    return float(m.group(0)) if m else 0.0


# How each reading was obtained: (label, confidence level)
SOURCES = {"plug": ("Smart plug · HA", "ok"), "ipmi": ("IPMI", "ok"), "gpu": ("Plug + DCGM", "ok"), "dsm": ("DSM API", "ok"), "poe": ("UniFi PoE budget", "warn"), "est": ("Estimate · spec", "mute")}
# The circuits the lab is split into. `series` picks the colour; `over` is the UPS conversion loss in watts.
BRANCHES = {
    "ups": {"t": "ups-rack · on UPS", "sub": "Home lab · protected", "series": 0, "obj": "ups-home", "over": 14},
    "wall": {"t": "Wall circuit", "sub": "Home lab · not protected", "series": 1, "obj": None, "over": 0},
    "siteb": {"t": "ups-siteb · on UPS", "sub": "Site B · protected", "series": 2, "obj": "ups-b", "over": 4},
}
METHODS = [
    ("Smart plug · HA", "Plugs read through Home Assistant: olympus, prometheus, kronos, delphi", "±1–2%", "ok"),
    ("IPMI / Redfish", "Server boards report input watts and rail voltages: alexandria", "±5%", "ok"),
    ("GPU telemetry", "Per-GPU board power from DCGM: delphi, kronos", "GPU only", "ok"),
    ("CPU RAPL", "Package power reported by the CPU itself: every Intel host", "CPU only", "info"),
    ("UPS · NUT", "Output load, battery and runtime: ups-rack, ups-siteb", "±5–10%", "ok"),
    ("UniFi PoE budget", "Per-port PoE draw from the switches", "PoE only", "warn"),
    ("Estimate · spec", "Datasheet typical draw when nothing is measured", "rough", "mute"),
]
GPU_CAP_SAVING_KWH = 86


def live_power(inv: Inventory, scope: str, price_raw: str) -> dict:
    """The power breakdown from whatever the sources measure: one branch per UPS, one for everything else."""
    O = inv.objects
    price = parse_price(price_raw)
    branches_def = [{"key": u["id"], "t": f"{u['name']} · on UPS", "sub": "protected", "obj": u["id"], "site": u["site"], "ups": u} for u in inv.ups if u["id"] in O]
    branches_def.append({"key": "wall", "t": "Not on a UPS", "sub": "not protected", "obj": None, "site": None, "ups": None})
    readings = [{**r, "b": inv.ups_of.get(r.get("id"), "wall")} for r in inv.feed("power") if not r.get("id") or r["id"] in O]
    in_scope = [r for r in readings if scope == "all" or (O[r["id"]]["site"] if r.get("id") else "home") == scope]
    total = sum(r["w"] for r in in_scope)
    max_w = max([r["w"] for r in in_scope] + [1])

    def name_of(r):
        return O[r["id"]]["name"] if r.get("id") else r["name"]

    branches, stack = [], []
    for i, br in enumerate(branches_def):
        rs = sorted((r for r in in_scope if r["b"] == br["key"]), key=lambda r: -r["w"])
        if not rs:
            continue
        u = br["ups"]
        branches.append({"key": br["key"], "t": br["t"], "sub": br["sub"] + (" · " + ("ON BATTERY" if u["on_battery"] else "on mains") if u else ""), "series": i % 3,
                         "total": f"{sum(r['w'] for r in rs)} W", "alarm": bool(u and u["on_battery"]), "obj": br["obj"],
                         "rows": [{"obj": r.get("id"), "name": name_of(r), "share": f"{_round(r['w'] / max_w * 100)}%", "w": f"{r['w']} W", "off": False,
                                   "src": SOURCES[r["src"]][0], "srcLv": SOURCES[r["src"]][1], "loss": False} for r in rs]})
        stack += [{"t": f"{name_of(r)} · {r['w']} W", "w": _fixed(r["w"] / total * 100) + "%", "series": i % 3} for r in rs if r["w"] > 0]

    guessed = [r for r in in_scope if r["src"] in ("est", "poe")]
    coverage = _round((total - sum(r["w"] for r in guessed)) / total * 100) if total else 100
    month_kwh = _round(total * 0.72)
    tiles = [{"l": "Drawing now", "v": f"{total} W", "lv": "text", "s": f"{len(in_scope)} readings"},
             {"l": "Month at this rate", "v": f"€ {_round(month_kwh * price)}", "lv": "text", "s": f"{month_kwh} kWh × € {_fixed(price, 2)}"}]
    for u in inv.ups:
        if scope in ("all", u["site"]):
            tiles.append({"l": u["name"], "v": f"ON BATTERY · {u['batt']}%" if u["on_battery"] else f"{u['batt']}% · {u['runtime']} min", "lv": "crit" if u["on_battery"] else "ok", "s": f"{u['load_w']} W load"})
    if in_scope:
        tiles.append({"l": "Measured, not estimated", "v": f"{coverage}%", "lv": "warn" if coverage < 90 else "ok", "s": f"{len(guessed)} devices estimated"})
    on_battery = [u for u in inv.ups if u["on_battery"] and scope in ("all", u["site"])]
    used = {SOURCES[r["src"]][0] for r in in_scope}
    return {
        "total": total, "onBattery": bool(on_battery),
        "banner": " ".join(f"{u['name']} carries {u['load_w']} W · {u['runtime']} min left." for u in on_battery) or None,
        "tiles": tiles, "stack": stack, "branches": branches, "legend": [], "bars": [], "peak": "", "since": "",
        "insights": [],
        "methods": [{"t": t, "d": d.split(":")[0], "acc": acc, "lv": lv} for t, d, acc, lv in METHODS if t in used],
    }


def live_overview(inv: Inventory, scope: str, open_drift: int, power_total: int) -> dict:
    """Health by domain, counted from the inventory. Domains with nothing in them are left out."""
    O, nb = inv.objects, inv.data.get("netbox")

    def of(*types):
        return inv.of_types(*types, scope=scope)

    def dom(t, ids, v1, l1, v2, l2, route):
        w = inv.worst(ids, scope)
        n = sum(1 for k in ids if O[k]["st"] == w)
        return {"t": t, "lv": w, "s": "OK" if w == "ok" else f"{n} {'down' if w == 'crit' else 'warn'}", "v1": str(v1), "l1": l1, "v2": str(v2), "l2": l2, "note": "", "route": route}

    sites, hosts, devices, ctrs, vlans, ups, pools, vps, provs = (of(t) for t in ("Site", "Host", "Network device", "Container", "VLAN", "UPS", "Pool", "VPS", "Provider"))
    guests = of("VM", "LXC")
    candidates = [
        (sites, dom("Sites & WAN", sites, len(sites), "sites", len(devices), "network devices", "sites")),
        (hosts, dom("Hosts", hosts, len(hosts), "physical", len(guests), "guests", "hosts")),
        (ups or power_total, dom("Power", ups, power_total, "W now", len(ups), "UPS", "power")),
        (guests + ctrs, dom("Workloads", guests + ctrs, len(guests), "VMs & LXCs", len(ctrs), "containers", "guests")),
        (pools, dom("Storage", pools, len(pools), "pools", sum(1 for k in pools if O[k]["st"] != "ok"), "need attention", "storage")),
        (vlans + devices, dom("Network", vlans + devices, len(vlans), "VLANs", len(devices), "devices", "network")),
        (vps + provs, dom("Edge & cloud", vps + provs, len(vps), "VPS", len(provs), "providers", "edge")),
    ]
    domains = [d for present, d in candidates if present]
    notices = []
    if nb:
        domains.append({"t": "Drift & CMDB", "lv": "info" if open_drift else "ok", "s": f"{open_drift} diffs" if open_drift else "in sync", "v1": nb["object_count"], "l1": "objects in NetBox",
                        "v2": str(open_drift), "l2": "differ", "note": "", "route": "drift"})
        if open_drift:
            notices.append({"lv": "info", "title": f"{open_drift} differences with NetBox", "domain": "Drift & CMDB", "where": " · ".join(dict.fromkeys(O[d[0]]["name"] if d[0] in O else d[0] for d in inv.drift)),
                            "when": "now", "action": "Review", "route": "drift", "obj": None})
    return {"notices": notices, "domains": domains}


def power(inv: Inventory, world: Any, scope: str, range_: str, price_raw: str) -> dict:
    """The demo lab's power page: fixed circuits, a synthetic history and written-out insights."""
    O = inv.objects
    price = parse_price(price_raw)
    speed = RANGE_SPEED[range_]
    home = inv.ups_named("ups-home")
    on_batt = bool(home and home["on_battery"])
    batt, runtime = (home["batt"], home["runtime"]) if home else (100, 18)
    delphi_w = next((p["w"] for p in inv.feed("power") if p.get("id") == "delphi"), 0)

    # Each reading sits on the branch of the UPS that feeds it; everything else is on the wall circuit.
    def branch_of(r):
        u = inv.ups_of.get(r.get("id"))
        return "ups" if u == "ups-home" else ("siteb" if u == "ups-b" else "wall")

    readings = [{**r, "b": branch_of(r)} for r in inv.feed("power") if not r.get("id") or r["id"] in O]
    # Grouped by branch; inside a branch hosts first, then other devices, then unnamed loads.
    order = list(O)
    readings.sort(key=lambda r: (BRANCHES[r["b"]]["series"], 2 if r.get("id") not in O else (0 if O[r["id"]]["type"] == "Host" else 1), order.index(r["id"]) if r.get("id") in O else 0))

    keys = {"b": ["siteb"], "home": ["ups", "wall"]}.get(scope, ["ups", "wall", "siteb"])
    keys = [k for k in keys if k == "wall" or BRANCHES[k]["obj"] in O] or ["wall"]
    rows = [r for r in readings if r["b"] in keys]
    total = sum(r["w"] for r in rows) + sum(BRANCHES[k]["over"] for k in keys)
    max_w = max([r["w"] for r in rows] + [1])

    def name_of(r):
        return O[r["id"]]["name"] if r.get("id") else r["name"]

    branches = []
    for k in keys:
        br = BRANCHES[k]
        rs = [r for r in readings if r["b"] == k]
        out = [{"obj": r.get("id"), "name": name_of(r), "share": f"{_round(r['w'] / max_w * 100)}%", "w": "off" if r["w"] == 0 else f"{r['w']} W", "off": r["w"] == 0,
                "src": SOURCES[r["src"]][0], "srcLv": SOURCES[r["src"]][1], "loss": False} for r in rs]
        if br["over"]:
            out.append({"obj": None, "name": "UPS conversion loss", "share": f"{_round(br['over'] / max_w * 100)}%", "w": f"{br['over']} W", "off": False, "src": SOURCES["est"][0], "srcLv": "mute", "loss": True})
        branches.append({"key": k, "t": br["t"], "sub": br["sub"] + (" · " + ("ON BATTERY" if on_batt else "on mains") if k == "ups" else ""), "series": br["series"],
                         "total": f"{sum(r['w'] for r in rs) + br['over']} W", "alarm": k == "ups" and on_batt, "obj": br["obj"], "rows": out})

    stack = [{"t": f"{name_of(r)} · {r['w']} W", "w": _fixed(r["w"] / total * 100) + "%", "series": BRANCHES[r["b"]]["series"]} for r in rows if r["w"] > 0]

    # Consumption history, one bar per period, stacked by branch
    series, peak = [], 0
    for i in range(24):
        last = i == 23
        u = (420 if last else 405 + (i * 7) % 22) if "ups" in keys else 0
        wall = 0
        if "wall" in keys:
            wall = delphi_w + (0 if on_batt else 182) if last else 182 + _round((380 if world.cap else 470) + (230 if world.cap else 320) * math.sin(i * speed * 0.9))
        sb = 60 + (i % 3) * 3 if "siteb" in keys else 0
        peak = max(peak, u + wall + sb)
        series.append((u, wall, sb))
    scale = max(peak, 200) * 1.08

    def pct(v):
        return _fixed(v / scale * 100) + "%"

    guessed = [r for r in rows if r["src"] in ("est", "poe")]
    measured = sum(r["w"] for r in rows)
    coverage = _round((measured - sum(r["w"] for r in guessed)) / measured * 100) if measured else 100
    month_kwh = _round(total * 0.72)

    def euro(v):
        return f"€ {_round(v)}"

    tiles = [
        {"l": "Drawing now", "v": f"{total} W", "lv": "crit" if on_batt else "text", "s": " + ".join(BRANCHES[k]["t"].split(" · ")[0] for k in keys) if len(keys) > 1 else BRANCHES[keys[0]]["t"]},
        {"l": "Today so far", "v": _fixed(total * 11 / 1000) + " kWh", "lv": "text", "s": "since midnight"},
        {"l": "Month at this rate", "v": euro(month_kwh * price), "lv": "text", "s": f"{month_kwh} kWh × € {_fixed(price, 2)}"},
    ]
    if scope == "b":
        if "ups-b" in O:
            tiles.append({"l": "ups-siteb", "v": "100% · 42 min", "lv": "ok", "s": "62 W / 360 W"})
    elif home:
        tiles.append({"l": "ups-rack", "v": f"ON BATTERY · {batt}%" if on_batt else f"{batt}% · {runtime} min", "lv": "crit" if on_batt else "ok", "s": "420 / 1000 W · runtime at this load"})
    tiles.append({"l": "Measured, not estimated", "v": f"{coverage}%", "lv": "warn" if coverage < 90 else "ok", "s": f"{len(guessed)} devices estimated"})

    insights = []
    if "wall" in keys:
        saving = f"~{GPU_CAP_SAVING_KWH} kWh/month (≈ {euro(GPU_CAP_SAVING_KWH * price)})"
        text = ("Delphi lost power with the mains: it is not on the UPS." if on_batt
                else f"Both 3090s are capped at 300 W. Saving {saving} for a few % fewer tokens/s." if world.cap
                else f"Capping both 3090s at 300 W usually costs under 5% tokens/s and saves {saving}. It also cools GPU 1 memory.")
        insights.append({"t": f"Delphi is {_round(delphi_w / max(total, 1) * 100)}% of the draw", "tone": "warn", "text": text,
                         "action": None if on_batt else {"label": "Remove cap" if world.cap else "Apply 300 W GPU cap", "key": "cap", "route": None, "primary": not world.cap}})
    if scope != "b" and home:
        insights.append({
            "t": "Running on battery" if on_batt else "UPS headroom", "tone": "crit" if on_batt else None,
            "text": f"ups-rack carries the core at {batt}%: ~{runtime} min left. Shutdown steps trigger at 50% and at 5 minutes." if on_batt
            else "ups-rack is 42% loaded: 18 min of runtime for the core. Delphi alone would overload it, so GPU boxes stay on the wall.",
            "action": {"label": "Restore mains" if on_batt else "Simulate power cut", "key": "powercut", "route": None, "primary": on_batt}})
    insights.append({"t": "Close the measurement gaps", "tone": None,
                     "text": "The UDM, the aggregation switch and the Pis are estimated from datasheets. Two smart plugs, or one metered PDU strip in the rack, would make the whole lab measured.",
                     "action": {"label": "Add a source", "key": None, "route": "sources", "primary": False}})

    return {
        "total": total, "onBattery": on_batt,
        "banner": f"The UPS carries {home['load_w']} W · {runtime} min left. Wall-powered machines (Delphi, Kronos) stopped hard." if on_batt else None,
        "tiles": tiles, "stack": stack, "branches": branches,
        "legend": [{"series": 0, "label": "On UPS"}, {"series": 1, "label": "Wall"}, {"series": 2, "label": "Site B"}],
        "bars": [{"u": pct(u), "w": pct(w), "s": pct(s)} for u, w, s in series], "peak": f"{peak} W",
        "since": {"live": "24 min ago", "1 h": "1 h ago", "7 d": "7 d ago"}.get(range_, "24 h ago"),
        "insights": insights,
        "methods": [{"t": t, "d": d, "acc": acc, "lv": lv} for t, d, acc, lv in METHODS],
    }


def overview(inv: Inventory, world: Any, scope: str, open_drift: int, power_total: int) -> dict:
    """The demo lab's overview: health by domain with hand-written notes, plus the notices that are not alerts."""
    O, D = inv.objects, inv.data
    nb = D.get("netbox") or {}
    if not O:
        return {"notices": [], "domains": []}
    home = inv.ups_named("ups-home")

    def of(*types):
        return inv.of_types(*types, scope=scope)

    def dom(t, ids, v1, l1, v2, l2, note, route):
        w = inv.worst(ids, scope)
        n = sum(1 for k in ids if k in O and scope in ("all", O[k]["site"]) and O[k]["st"] == w)
        return {"t": t, "lv": w, "s": "OK" if w == "ok" else f"{n} {'down' if w == 'crit' else 'warn'}", "v1": str(v1), "l1": l1, "v2": str(v2), "l2": l2, "note": note, "route": route}

    hosts, devices, guests, ctrs, vlans, ups = of("Host"), of("Network device"), of("VM", "LXC"), of("Container"), of("VLAN"), of("UPS")
    b = scope == "b"
    domains = [
        dom("Sites & WAN", ["home", "siteb"], 2 if scope == "all" else 1, "sites", 1 if b else (2 if scope == "home" else 3), "uplinks", "Site Magic 18 ms", "sites"),
        dom("Hosts", hosts, len(hosts), "physical", len(devices), "network devices", "delphi thermals" if world.mem_fixed else "olympus memory · delphi thermals", "hosts"),
        dom("Power", ups, power_total, "W now", len(ups), "UPS", f"ON BATTERY · {home['runtime']} min left" if home and home["on_battery"] else "mains OK · UPS 42% loaded", "power"),
        dom("Workloads", guests + ctrs, len(guests), "VMs & LXCs", len(ctrs), "containers", "all containers healthy" if world.sonarr_fixed else "sonarr restarting", "guests"),
        dom("Storage", ["synology"] if b else ["atlas"], "61%" if b else "82%", "Synology" if b else "Atlas used", 2 if scope == "all" else 1, "pools", "offsite replication OK", "storage"),
        dom("Network", vlans + devices, len(vlans), "VLANs", len(devices), "devices", "VLAN 5 & 666 still planned", "network"),
    ]
    if not b:
        domains.append(dom("Edge & cloud", ["k2so", "chopper", "r2d2", "c3po", "bb8"], len(of("VPS")), "VPS", len(of("Provider")), "providers", "all tunnels up" if world.k2so_fixed else "k2so tunnel stale", "edge"))
    if D.get("proxmox"):
        domains.append({"t": "Data protection", "lv": "ok", "s": "OK", "v1": "27/27", "l1": "backed up", "v2": "3-2-1", "l2": "for 24 guests", "note": "offsite " + ("just now" if world.rep == "done" else "02:47"), "route": "protection"})
    if not b and nb:
        domains.append({"t": "Drift & CMDB", "lv": "info" if open_drift else "ok", "s": f"{open_drift} diffs" if open_drift else "in sync", "v1": nb["object_count"], "l1": "objects in NetBox",
                        "v2": str(open_drift), "l2": "differ", "note": "NetBox ↔ observed", "route": "drift"})

    notices = []
    if open_drift and not b:
        notices.append({"lv": "info", "title": f"{open_drift} differences with NetBox", "domain": "Drift & CMDB", "where": nb["drift_summary"], "when": "today", "action": "Review", "route": "drift", "obj": None})
    if scope != "home" and "siteb" in O:
        notices.append({"lv": "info", "title": "Site B has a single uplink", "domain": "Network", "where": "Mobile Vikings", "when": "ongoing", "action": "Open site", "route": None, "obj": "siteb"})
    return {"notices": notices, "domains": domains}


def changes(inv: Inventory, world: Any) -> list[dict]:
    """What Pantheon did just now, then what the sources reported, newest first."""
    out = []
    if world.k2so_fixed:
        out.append({"t": "now", "k": "Edge", "x": "k2so peer endpoint updated · tunnel restored", "lv": "ok"})
    if world.mem_fixed:
        out.append({"t": "now", "k": "Hosts", "x": "icarus live-migrated olympus → prometheus", "lv": "ok"})
    if world.sonarr_fixed:
        out.append({"t": "now", "k": "Workloads", "x": "sonarr limit raised to 1.5 GB · restarted", "lv": "ok"})
    return out + [{**c, "lv": None} for c in sorted(inv.feed("changes"), key=lambda c: c["t"], reverse=True)]
