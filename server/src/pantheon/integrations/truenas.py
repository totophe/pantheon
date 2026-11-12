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


truenas = Integration("truenas", "TrueNAS · Alexandria", "pools · datasets · SMART · shares", "10 s", mock)
