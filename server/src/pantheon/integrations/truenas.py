from ..http import client, gb, get, need, pct, slug, uptime
from .base import Integration, item, ref


def mock(sim):
    return {
        "host": {
            "id": "alexandria", "name": "Alexandria", "site": "home", "status": "warn", "sub": "TrueNAS Scale · X9SRI-F · 128 GB ECC",
            "meters": [("Pool Atlas", 82, "82% · 65 / 80 TB"), ("ARC hit rate", 96, "96%", "ok"), ("CPU", 12)],
            "facts": [("Pool", "Atlas · RAIDZ-2 · 6 × 20 TB"), ("SLOG / L2ARC", "Optane P4800X"), ("Last scrub", "6 d ago · 0 errors")],
            "guests": [ref("atlas", "pool"), item("garage", "TrueNAS app · S3", "running")],
            "rel": [("Connected to", [ref("agg", "port 7 · 10 GbE")]), ("Pools", [ref("atlas")]), ("Replicates to", [ref("synology", "Site B · nightly")])],
        },
        "pools": [{
            "id": "atlas", "name": "Atlas", "site": "home", "status": "warn", "sub": "alexandria · ZFS RAIDZ-2 · 6 × 20 TB",
            "capacity": [("Used", 82, "65 / 80 TB"), ("Projected at 85%", 30, "in ~9 days", "warn")],
            "health": [("State", "ONLINE"), ("Last scrub", "6 d · 0 errors"), ("SLOG", "Optane P4800X"), ("Compression", "lz4 · 1.31×")],
            "datasets": [item("chronicles", "movies & TV", "41.2 TB"), item("forge", "downloads · +1.4 TB this week", "9.8 TB", "warn", "warn"), item("nexus", "service data · NFS", "3.1 TB"), item("vault", "sensitive · encrypted", "1.4 TB"), item("melodies", "music", "2.6 TB"), item("scrolls", "documents", "0.4 TB"), item("limbo", "staging", "6.5 TB")],
            "copies": [item("Snapshots", "hourly · 48 h, daily · 30 d", "OK"), item("Offsite · Synology Site B", "vault · scrolls · nexus", "today 02:47", "ok")],
            "rel": [("Host", [ref("alexandria")]), ("Used by", [ref("apollo", "chronicles · melodies"), ref("hermes", "forge · chronicles"), ref("olympus", "nexus backups")]), ("Replicates to", [ref("synology")])],
        }],
        "alerts": [{"id": "a4", "sev": "warn", "title": "Atlas pool 82% full", "where": "alexandria · Atlas", "when": "3 h", "obj": "atlas", "resolved": False, "domain": "Storage", "action": "Open pool"}],
        "updates": [("alexandria", "TrueNAS Scale point release", "TrueNAS")],
        "changes": [{"t": "02:47", "k": "Replication", "x": "Atlas → Synology finished · 38 GB"}],
        "storage_tiles": [{"l": "Atlas", "v": "82%", "lv": "warn", "s": "65 / 80 TB · RAIDZ-2"}],
        "volumes": [{"obj": "atlas", "name": None, "site": "home", "host": "alexandria", "used": "65 / 80 TB", "used_lv": "warn", "status": "Warning", "status_lv": "warn"}],
        "backup_jobs": [
            {"name": "Atlas → Synology (rsync)", "obj": "atlas", "target": "Site B · /volume1/atlas-offsite", "schedule": "02:00",
             "last": "just now · 1.2 GB" if sim.rep == "done" else "today 02:47 · 38 GB", "action": "replicate", "progress_label": "Atlas → Synology · syncing vault"},
            {"name": "Atlas snapshots", "obj": "atlas", "target": "local", "schedule": "hourly", "last": "10:00 · OK"},
        ],
    }


# ---------- live ----------


async def fetch(cfg: dict) -> dict:
    """TrueNAS over its REST API (v2.0) with an API key.

    [truenas]  url, api_key, site = "home", id (default: the hostname), verify_tls = true
    """
    need(cfg, "url", "api_key")
    site = cfg.get("site", "home")
    async with client(cfg, cfg["url"].rstrip("/") + "/api/v2.0", headers={"Authorization": f"Bearer {cfg['api_key']}"}) as c:
        info = await get(c, "/system/info")
        raw_pools = await get(c, "/pool")
        try:
            datasets = await get(c, "/pool/dataset")
        except Exception:
            datasets = []
    host_id = cfg.get("id") or slug(info.get("hostname", "truenas").split(".")[0])
    children = {d["name"]: d.get("children", []) for d in datasets if "/" not in d.get("name", "")}

    def used(d):
        return (d.get("used") or {}).get("parsed") or 0

    pools, volumes, tiles = [], [], []
    for p in raw_pools:
        size, alloc = p.get("size") or 0, p.get("allocated") or 0
        full, healthy = pct(alloc, size), p.get("healthy", p.get("status") == "ONLINE")
        status = "crit" if not healthy else ("warn" if full >= 80 else "ok")
        scan = p.get("scan") or {}
        layout = " · ".join(f"{v.get('type', '')} × {len(v.get('children', []))}" for v in (p.get("topology") or {}).get("data", [])) or "ZFS"
        pid = slug(p["name"])
        pools.append({
            "id": pid, "name": p["name"], "site": site, "status": status, "sub": f"{info.get('hostname', host_id)} · {layout}",
            "capacity": [("Used", full, f"{gb(alloc)} / {gb(size)}")],
            "health": [("State", p.get("status"), None if healthy else "crit"), ("Last scrub", f"{scan.get('state', '').lower()} · {scan.get('errors', 0)} errors" if scan else None), ("Layout", layout)],
            "datasets": [item(d["name"].split("/", 1)[-1], d.get("type", "").lower(), gb(used(d))) for d in sorted(children.get(p["name"], []), key=used, reverse=True)],
            "rel": [("Host", [ref(host_id)])],
        })
        volumes.append({"obj": pid, "name": None, "site": site, "host": host_id, "used": f"{gb(alloc)} / {gb(size)}", "used_lv": "warn" if full >= 80 else None,
                        "status": "Healthy" if status == "ok" else ("Warning" if status == "warn" else "Degraded"), "status_lv": status})
        tiles.append({"l": p["name"], "v": f"{full}%", "lv": "text" if status == "ok" else status, "s": f"{gb(alloc)} / {gb(size)} · {layout}"})

    worst = "crit" if any(p["status"] == "crit" for p in pools) else ("warn" if any(p["status"] == "warn" for p in pools) else "ok")
    return {
        "host": {
            "id": host_id, "name": info.get("hostname", host_id).split(".")[0], "site": site, "status": worst, "sub": " · ".join(x for x in ("TrueNAS", info.get("version"), info.get("system_product")) if x),
            "meters": [(f"Pool {p['name']}", p["capacity"][0][1], p["capacity"][0][2]) for p in pools],
            "facts": [("Version", info.get("version")), ("CPU", f"{info['model']} · {info.get('cores', '?')} cores" if info.get("model") else None),
                      ("Memory", gb(info["physmem"]) if info.get("physmem") else None), ("Uptime", uptime(info["uptime_seconds"]) if info.get("uptime_seconds") else None)],
            "guests": [ref(p["id"], "pool") for p in pools],
            "rel": [("Pools", [ref(p["id"]) for p in pools])],
        },
        "pools": pools, "volumes": volumes, "storage_tiles": tiles,
    }


truenas = Integration("truenas", "TrueNAS · Alexandria", "pools · datasets · SMART · shares", "10 s", mock, fetch=fetch)
