"""Assemble the snapshot the UI renders from."""

from __future__ import annotations

from . import lab, views
from .integrations import INTEGRATIONS, Datasets
from .inventory import build
from .state import CHANNELS, Prefs, World

_SEVERITY = {"crit": 0, "warn": 1, "info": 2}


def _tile(t: dict) -> dict:
    return {"l": t["l"], "v": t["v"], "lv": t["lv"], "s": t["s"]}


def snapshot(data: Datasets, mock_ids: set[str], world: World, prefs: Prefs, range_: str, version: int = 0) -> dict:
    accepted, acked, silenced, off = (prefs.group(g) for g in ("accepted", "acked", "silenced", "off"))
    inv = build(data, world, accepted, range_)
    O = inv.objects
    nb = data.get("netbox")

    alerts = []
    for a in sorted((a for a in inv.feed("alerts") if a["obj"] in O), key=lambda a: _SEVERITY[a["sev"]]):  # stable: sources keep their order within a severity
        is_acked, is_silenced = bool(acked.get(a["id"])), bool(silenced.get(a["id"]))
        state = "resolved" if a["resolved"] else ("silenced" if is_silenced else ("acked" if is_acked else "open"))
        alerts.append({**{k: a[k] for k in ("id", "sev", "title", "where", "when", "obj", "domain", "action")}, "tab": a.get("tab"), "state": state, "acked": is_acked, "silenced": is_silenced})

    drift = [{"obj": d[0], "field": d[1], "declared": d[2], "observed": d[3], "accepted": bool(accepted.get(d[0]))} for d in (nb or {}).get("drift", [])]
    open_drift = sum(1 for d in drift if not d["accepted"])

    jobs = inv.feed("backup_jobs")
    running_job = next((j for j in jobs if j.get("action")), None) if world.rep == "running" else None

    scopes = lab.scopes(inv)
    power = {s["id"]: views.power(inv, world, s["id"], range_, prefs.price) for s in scopes}

    return {
        "version": version,
        "range": range_,
        "scopes": scopes,
        "sources": [{"id": i.id, "name": i.name, "covers": i.covers, "sync": i.sync, "mode": "mock" if i.id in mock_ids else "live",
                     "health": i.health if i.id in mock_ids else ("ok" if data.get(i.id) else "disconnected"), "paused": bool(off.get(i.id))} for i in INTEGRATIONS],
        "objects": list(O.values()),
        "alerts": alerts,
        "cmdb": {"objectCount": nb["object_count"], "synced": nb["synced"], "drift": drift} if nb else None,
        "updates": [{"obj": u[0], "what": u[1], "source": u[2], "scheduled": bool(prefs.group("sched").get(u[0]))} for u in inv.feed("updates") if u[0] in O],
        "storage": {"tiles": [_tile(t) for t in inv.feed("storage_tiles")],
                    "volumes": [{"obj": v["obj"], "name": v["name"], "site": v["site"], "host": v["host"], "used": v["used"], "usedLv": v["used_lv"], "status": v["status"], "statusLv": v["status_lv"]} for v in inv.feed("volumes")]},
        "backups": {"tiles": [_tile(t) for t in inv.feed("backup_tiles")],
                    "jobs": [{"name": j["name"], "obj": j["obj"], "target": j["target"], "schedule": j["schedule"], "last": j["last"], "action": j.get("action")} for j in jobs],
                    "running": world.rep == "running",
                    "progress": {"label": running_job["progress_label"], "pct": world.pct} if running_job else None},
        "notifications": [{"id": id, "name": name, "sends": sends, "on": bool(prefs.group("notif").get(id))} for id, name, sends in CHANNELS],
        "changes": views.changes(inv, world),
        "overview": {s["id"]: views.overview(inv, world, s["id"], open_drift, power[s["id"]]["total"]) for s in scopes},
        "topology": {s["id"]: lab.topology(inv, world, site_b=s["id"] == "b") for s in scopes},
        "power": power,
        "settings": {"price": prefs.price},
    }
