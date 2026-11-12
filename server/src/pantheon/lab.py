"""What is specific to this lab rather than read from a source.

The topology is a hand-placed layout: positions, labels and the lines between
nodes. Scope captions are here for the same reason. Nodes whose object is
missing from the inventory are left out.
"""

from __future__ import annotations

from typing import Any

from .inventory import Inventory

SCOPE_LINES = {"all": "All sites · Home lab and Site B", "home": "Home lab · olympus-cluster", "b": "Site B · offsite"}
LAYERS = {"Host": "compute", "Network device": "network", "Site": "network", "VLAN": "network", "Provider": "external", "VPS": "external"}


def scopes(inv: Inventory) -> list[dict]:
    sites = [o for o in inv.objects.values() if o["type"] == "Site"]
    if not sites:
        return [{"id": "all", "label": "All sites", "line": "All sites", "obj": None}]
    return [{"id": "all", "label": "All sites", "line": SCOPE_LINES["all"], "obj": None}] + [
        {"id": o["site"], "label": o["name"], "line": SCOPE_LINES.get(o["site"], o["name"]), "obj": o["id"]} for o in sites]


def _node(id, kind, x, y, name, sub, w=152, h=136, bars=(), vps=()):
    return {"id": id, "kind": kind, "x": x, "y": y, "w": w, "h": h, "name": name, "sub": sub,
            "bars": [{"l": b[0], "pct": b[1], "text": b[2] if len(b) > 2 else None} for b in bars], "vps": list(vps)}


def _solid(x, y, w, h):
    return {"kind": "solid", "x": x, "y": y, "w": w, "h": h}


def _dash(kind, x, y, length, vert=False):
    return {"kind": kind, "x": x, "y": y, "w": 0 if vert else length, "h": length if vert else 0}


def _pill(x, y, t, kind="plain"):
    return {"x": x, "y": y, "t": t, "kind": kind}


def topology(inv: Inventory, world: Any, site_b: bool) -> dict:
    M = world.mem_fixed
    if site_b:
        nodes = [
            _node("siteb", "net", 436, 24, "Internet", "Mobile Vikings · FTTH", 168, 72),
            _node("udmse", "net", 436, 184, "UDM Pro SE", "Gateway · 16-port PoE", 168, 72),
            _node("home", "net", 776, 184, "Home lab", "via Site Magic", 240, 72),
            _node("synology", "host", 360, 328, "Synology NAS", "DSM · SHR-2", bars=[("Vol", 61), ("CPU", 8)]),
            _node("vlan200", "net", 560, 328, "Clients · VLAN 200", "3 devices", 200, 72),
        ]
        lines = [_solid(519, 96, 2, 88), _dash("sitemagic", 604, 219, 172), _solid(519, 256, 2, 44), _solid(436, 299, 225, 2), _solid(435, 299, 2, 29), _solid(659, 299, 2, 29),
                 _dash("flow", 512, 440, 386), _dash("flow", 897, 256, 185, True)]
        pills = [_pill(530, 120, "FTTH · single uplink"), _pill(640, 228, "Site Magic · 18 ms", "sitemagic"), _pill(690, 448, "rsync from Atlas · nightly", "flow")]
    else:
        nodes = [
            _node("ovh", "group", 24, 24, "OVH", "3 VPS", 196, 120, vps=["r2d2", "c3po", "bb8"]),
            _node("quicksrv", "group", 232, 24, "Quicksrv.io", "2 VPS", 192, 94, vps=["k2so", "chopper"]),
            _node("home", "net", 436, 24, "Internet", "DIGI ● · 5G ○", 168, 72),
            _node("cloudflare", "net", 660, 24, "Cloudflare", "3 tunnels · DNS", 168, 72),
            _node("scaleway", "net", 848, 24, "Scaleway", "Wellmade · 4 VPS", 168, 72),
            _node("udm", "net", 436, 184, "UDM Pro Max", "Gateway · 6 VLANs", 168, 72),
            _node("access", "net", 40, 328, "Access switch", "Sparta · Pis · +11", 200, 72),
            _node("agg", "net", 436, 328, "USW-Aggregation", "8× SFP+ · 5 up", 168, 72),
            _node("siteb", "net", 776, 328, "Site B", "UDM Pro SE · Synology · Vikings", 240, 72),
            _node("olympus", "host", 24, 448, "Olympus", "Proxmox · MS-01", bars=[("CPU", 38), ("RAM", 73 if M else 91)]),
            _node("prometheus", "host", 192, 448, "Prometheus", "Proxmox · A2000", bars=[("CPU", 22), ("RAM", 76 if M else 58)]),
            _node("hyperion", "host", 360, 448, "Hyperion", "Planned"),
            _node("kronos", "host", 528, 448, "Kronos", "Ollama · 2 GPU", bars=[("CPU", 9), ("GPU", 31)]),
            _node("delphi", "host", 696, 448, "Delphi", "vLLM · 2× 3090", bars=[("GPU", 94), ("Temp", 83, "83°")]),
            _node("alexandria", "host", 864, 448, "Alexandria", "TrueNAS · Atlas", bars=[("Pool", 82), ("ARC", 96)]),
        ]
        lines = [_dash("tunnel", 121, 144, 12, True), _dash("tunnel", 327, 118, 38, True), _dash("tunnel", 743, 96, 60, True), _dash("tunnel", 931, 96, 60, True), _dash("tunnel", 122, 155, 810),
                 _solid(519, 96, 2, 88), _solid(519, 256, 2, 72), _solid(140, 291, 380, 2), _solid(139, 291, 2, 37), _dash("sitemagic", 604, 219, 292), _dash("sitemagic", 895, 219, 109, True),
                 _solid(519, 400, 2, 24), _solid(100, 423, 841, 2), _solid(99, 423, 2, 25), _solid(267, 423, 2, 25), _dash("planned", 435, 423, 25, True), _solid(603, 423, 2, 25), _solid(771, 423, 2, 25),
                 _solid(939, 423, 2, 25), _dash("flow", 989, 400, 48, True)]
        pills = [_pill(150, 164, "Edge tunnels · WireGuard", "tunnel"), _pill(530, 112, "XGS-PON · 10G"), _pill(530, 296, "10 GbE"), _pill(260, 270, "1 GbE"), _pill(690, 228, "Site Magic · 18 ms", "sitemagic"), _pill(994, 412, "rsync", "flow")]

    # The other site appears as an external neighbour on each map.
    other = "home" if site_b else "siteb"
    present = []
    for n in nodes:
        o = inv.objects.get(n["id"])
        if not o:
            continue
        n["layer"] = "external" if n["id"] == other else LAYERS.get(o["type"], "network")
        n["vps"] = [v for v in n["vps"] if v in inv.objects]
        present.append(n)
    if not present:
        lines, pills = [], []
    return {"h": 500 if site_b else 616, "sub": "Site B" if site_b else "Home lab · switch site in the top bar for Site B", "nodes": present, "lines": lines, "pills": pills}
