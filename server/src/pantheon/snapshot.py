"""Assemble the snapshot the UI renders from."""

from __future__ import annotations

import time

from . import lab, views
from .integrations import INTEGRATIONS, Datasets, Integration
from .inventory import build
from .poller import Poller
from .state import CHANNELS, Prefs, World

_SEVERITY = {"crit": 0, "warn": 1, "info": 2}


def _tile(t: dict) -> dict:
    return {"l": t["l"], "v": t["v"], "lv": t["lv"], "s": t["s"]}


def _ago(at: float) -> str:
    s = max(0, round(time.time() - at))
    return f"{s} s ago" if s < 90 else (f"{s // 60} min ago" if s < 5400 else f"{s // 3600} h ago")


def _source(i: Integration, mock: bool, paused: bool, poller: Poller | None) -> dict:
    """One row of the Data sources page: where the data comes from and how the last poll went."""
    out = {"id": i.id, "name": i.name, "covers": i.covers, "sync": i.sync, "mode": "mock" if mock else "live", "paused": paused, "canSync": False, "detail": None}
    if mock:
        return {**out, "health": i.health}
    if not i.fetch:
        return {**out, "health": "disconnected", "detail": "No live client for this source yet"}
    if not poller or not poller.can_poll(i.id):
        return {**out, "health": "disconnected", "detail": f"Not configured: add a [{i.id}] section to pantheon.toml"}
    st = poller.status.get(i.id)
    if not st:
        return {**out, "canSync": True, "health": "disconnected", "detail": "Waiting for the first poll"}
    if not st.ok:
        return {**out, "canSync": True, "health": "error", "detail": f"{st.message} · {_ago(st.at)}"}
    return {**out, "canSync": True, "health": "warn" if st.message else "ok", "detail": f"Synced {_ago(st.at)} in {st.ms} ms" + (f" · {st.message}" if st.message else "")}


def snapshot(data: Datasets, mock_ids: set[str], world: World, prefs: Prefs, range_: str, version: int = 0, poller: Poller | None = None) -> dict:
    #: With every integration mocked this is the demo lab, which has hand-made page models. Real data gets computed ones.
    demo = mock_ids == {i.id for i in INTEGRATIONS}
    accepted, acked, silenced, off = (prefs.group(g) for g in ("accepted", "acked", "silenced", "off"))
    inv = build(data, world, accepted, range_)
    O = inv.objects
    nb = data.get("netbox")

    alerts = []
    for a in sorted((a for a in inv.feed("alerts") if a["obj"] in O), key=lambda a: _SEVERITY[a["sev"]]):  # stable: sources keep their order within a severity
        is_acked, is_silenced = bool(acked.get(a["id"])), bool(silenced.get(a["id"]))
        state = "resolved" if a["resolved"] else ("silenced" if is_silenced else ("acked" if is_acked else "open"))
        alerts.append({**{k: a[k] for k in ("id", "sev", "title", "where", "when", "obj", "domain", "action")}, "tab": a.get("tab"), "state": state, "acked": is_acked, "silenced": is_silenced})

    drift = [{"obj": d[0], "field": d[1], "declared": d[2], "observed": d[3], "accepted": bool(accepted.get(d[0]))} for d in inv.drift]
    open_drift = sum(1 for d in drift if not d["accepted"])

    jobs = inv.feed("backup_jobs")
    running_job = next((j for j in jobs if j.get("action")), None) if world.rep == "running" else None

    scopes = lab.scopes(inv, demo)
    ids = [s["id"] for s in scopes]
    if demo:
        power = {s: views.power(inv, world, s, range_, prefs.price) for s in ids}
        overview = {s: views.overview(inv, world, s, open_drift, power[s]["total"]) for s in ids}
        topology = {s: lab.topology(inv, world, site_b=s == "b") for s in ids}
    else:
        power = {s: views.live_power(inv, s, prefs.price) for s in ids}
        overview = {s: views.live_overview(inv, s, open_drift, power[s]["total"]) for s in ids}
        topology = {s: lab.auto_topology(inv, s) for s in ids}

    return {
        "version": version,
        "range": range_,
        "scopes": scopes,
        "sources": [_source(i, i.id in mock_ids, bool(off.get(i.id)), poller) for i in INTEGRATIONS],
        "objects": list(O.values()),
        "alerts": alerts,
        "cmdb": {"objectCount": nb["object_count"], "synced": nb.get("synced", ""), "drift": drift} if nb else None,
        "updates": [{"obj": u[0], "what": u[1], "source": u[2], "scheduled": bool(prefs.group("sched").get(u[0]))} for u in inv.feed("updates") if u[0] in O],
        "storage": {"tiles": [_tile(t) for t in inv.feed("storage_tiles")],
                    "volumes": [{"obj": v["obj"], "name": v["name"], "site": v["site"], "host": v["host"], "used": v["used"], "usedLv": v["used_lv"], "status": v["status"], "statusLv": v["status_lv"]} for v in inv.feed("volumes")]},
        "backups": {"tiles": [_tile(t) for t in inv.feed("backup_tiles")],
                    "jobs": [{"name": j["name"], "obj": j["obj"], "target": j["target"], "schedule": j["schedule"], "last": j["last"], "action": j.get("action")} for j in jobs],
                    "running": world.rep == "running",
                    "progress": {"label": running_job["progress_label"], "pct": world.pct} if running_job else None},
        "notifications": [{"id": id, "name": name, "sends": sends, "on": bool(prefs.group("notif").get(id))} for id, name, sends in CHANNELS],
        "changes": views.changes(inv, world),
        "overview": overview,
        "topology": topology,
        "power": power,
        "settings": {"price": prefs.price},
    }
