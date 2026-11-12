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


synology = Integration("synology", "Synology DSM · Site B", "volumes · shares · snapshots", "30 s", mock)
