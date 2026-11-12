from ..http import client, gb, need, pct, slug, uptime
from .base import Integration, ref


def mock(sim):
    offsite = "just now" if sim.rep == "done" else "02:47"
    return {
        "host": {
            "id": "synology", "name": "Synology NAS", "site": "b", "status": "ok", "sub": "Site B · DSM · SHR-2 · 10.200.0.10",
            "meters": [("Volume", 61), ("CPU", 8), ("Memory", 34)],
            "facts": [("Share", "/volume1/atlas-offsite"), ("Snapshots", "30 d retention"), ("Last replication", "today 02:47 · OK", "ok")],
            "rel": [("Site", [ref("siteb")]), ("Receives from", [ref("atlas", "rsync nightly")])],
            # DSM reports its own sensors; the other hosts get theirs from VictoriaMetrics.
            "hardware": {
                "temps": [("Disk 1", 34, 45, 55), ("Disk 2", 35, 45, 55), ("Disk 3", 35, 45, 55), ("Disk 4", 34, 45, 55), ("System", 41, 60, 70)],
                "fans": [("System", 1050)],
            },
        },
        "updates": [("synology", "DSM update", "Synology")],
        "power": [{"id": "synology", "w": 38, "src": "dsm"}],
        "psu": {"synology": [("Supply", "Internal PSU"), ("Load", "38 W"), ("Telemetry", "DSM")]},
        "storage_tiles": [
            {"l": "Synology (Site B)", "v": "61%", "lv": "text", "s": "SHR-2 · offsite"},
            {"l": "Offsite replication", "v": offsite, "lv": "ok", "s": "Atlas → Synology"},
        ],
        "volumes": [{"obj": "synology", "name": "Synology volume1", "site": "b", "host": "Site B", "used": "61%", "used_lv": None, "status": "Healthy", "status_lv": "ok"}],
        "backup_tiles": [{"l": "Offsite", "v": offsite, "lv": "ok", "s": "Atlas → Synology · Site B"}],
        "backup_jobs": [{"name": "Synology snapshots", "obj": "synology", "target": "Site B", "schedule": "daily", "last": "today 04:00 · OK"}],
    }


# ---------- live ----------


async def fetch(cfg: dict) -> dict:
    """Synology DSM over its Web API, with an account limited to read access.

    [synology]  url, username, password, site = "home", id (default: the NAS name), verify_tls = true
    """
    need(cfg, "url", "username", "password")
    site = cfg.get("site", "home")
    async with client(cfg, cfg["url"].rstrip("/") + "/webapi") as c:
        async def call(api: str, method: str, version: int, **params):
            res = await c.post("/entry.cgi", data={"api": api, "method": method, "version": version, **params})
            res.raise_for_status()
            body = res.json()
            if not body.get("success"):
                raise RuntimeError(f"DSM refused {api}.{method}: error {(body.get('error') or {}).get('code')}")
            return body.get("data") or {}

        sid = (await call("SYNO.API.Auth", "login", 6, account=cfg["username"], passwd=cfg["password"], session="Pantheon", format="sid"))["sid"]
        try:
            info = await call("SYNO.Core.System", "info", 1, _sid=sid)
            load = await call("SYNO.Core.System.Utilization", "get", 1, _sid=sid)
            storage = await call("SYNO.Storage.CGI.Storage", "load_info", 1, _sid=sid)
        finally:
            try:
                await call("SYNO.API.Auth", "logout", 6, session="Pantheon", _sid=sid)
            except Exception:
                pass

    host_id = cfg.get("id") or slug(info.get("model", "synology"))
    cpu, mem = load.get("cpu") or {}, load.get("memory") or {}
    meters, volumes, tiles = [], [], []
    for v in storage.get("volumes", []):
        size = v.get("size") or {}
        total, used = float(size.get("total") or 0), float(size.get("used") or 0)
        full, ok = pct(used, total), v.get("status") in ("normal", "attention")
        label = (v.get("vol_path") or v.get("id") or "volume").lstrip("/")
        meters.append((label, full, f"{gb(used)} / {gb(total)}"))
        volumes.append({"obj": host_id, "name": f"{info.get('model', 'Synology')} {label}", "site": site, "host": info.get("model", ""), "used": f"{full}%", "used_lv": "warn" if full >= 80 else None,
                        "status": "Healthy" if ok else str(v.get("status")), "status_lv": "ok" if ok else "crit"})
        tiles.append({"l": f"{info.get('model', 'Synology')} {label}", "v": f"{full}%", "lv": "text" if ok and full < 80 else "warn", "s": f"{gb(used)} / {gb(total)}"})
    meters += [("CPU", int(cpu.get("user_load", 0)) + int(cpu.get("system_load", 0))), ("Memory", int(mem.get("real_usage", 0)))]
    disks = [(d.get("name") or d.get("id", "Disk"), int(d["temp"]), 45, 55) for d in storage.get("disks", []) if d.get("temp")]
    return {
        "host": {
            "id": host_id, "name": cfg.get("name") or info.get("model", "Synology"), "site": site, "status": "ok" if all(v["status_lv"] == "ok" for v in volumes) else "crit",
            "sub": " · ".join(x for x in ("Synology", info.get("model"), info.get("firmware_ver")) if x),
            "meters": meters,
            "facts": [("Model", info.get("model")), ("DSM", info.get("firmware_ver")), ("Memory", f"{info['ram_size']} MB" if info.get("ram_size") else None),
                      ("Uptime", uptime(_seconds(info["up_time"])) if info.get("up_time") else None)],
            "hardware": {"temps": disks + ([("System", int(info["sys_temp"]), 60, 70)] if info.get("sys_temp") else [])},
        },
        "volumes": volumes, "storage_tiles": tiles,
    }


def _seconds(up_time: str) -> int:
    """DSM reports uptime as "H:M:S"."""
    h, m, s = (int(x) for x in str(up_time).split(":"))
    return h * 3600 + m * 60 + s


synology = Integration("synology", "Synology DSM · Site B", "volumes · shares · snapshots", "30 s", mock, fetch=fetch)
