import asyncio

from ..http import client, gb, get, need, pct, slug, uptime
from .base import Integration, item, note, ref


def _guest(id, kind, node, ip, role, status, meters, cfg, *, name=None, vlan="30", fw=None, copies=None, events=None, services=None, rel=None):
    return {
        "id": id, "name": name, "kind": kind, "node": node, "ip": ip, "role": role, "status": status, "meters": meters, "cfg": cfg,
        "vlan": vlan, "nic": "virtio · vmbr0",
        "mac": f"BC:24:11:{(len(id) * 7) % 90 + 10}:0F:{len(id) * 3 + 10}",
        "fw": fw or [item("ALLOW in tcp 22 from VLAN 1", "", "", "ok"), item("DROP in * (policy)", "", "", "crit")],
        "copies": copies or [item("Production", "local-nvme", "✓"), item("Nightly vzdump", "alexandria · nexus/backups · 03:00", "✓"), item("Offsite", "Synology · via Atlas → Synology", "✓")],
        "runs": [item("vzdump · snapshot", "today 03:12", "OK"), item("vzdump · snapshot", "yesterday 03:11", "OK")],
        "events": events or [item("Started", "Proxmox", "23 d ago", "mute")],
        # systemd services and the like; Docker containers come from the Docker agents.
        "services": services or [],
        "rel": rel or [],
    }


def mock(sim):
    M, S = sim.mem_fixed, sim.sonarr_fixed
    nodes = [
        {
            "id": "olympus", "name": "Olympus", "site": "home", "status": "ok" if M else "warn", "sub": "srv-prox-01 · 10.30.0.11 · Minisforum MS-01 · cluster master",
            "meters": [("CPU", 38), ("Memory", 73 if M else 91, "73% · 46.7 / 64 GB" if M else "91% · 58.2 / 64 GB"), ("local-nvme", 64)],
            "facts": [("CPU", "i9-13900H · 20 threads"), ("Memory", "64 GB DDR5"), ("Proxmox", "VE 8 · quorum 4 / 4"), ("Uptime", "23 d 4 h")],
            "notes": [] if M else [note(
                "Memory pressure · 118% allocated",
                "Guests are configured for 75.5 GB on a 64 GB host. Ballooning is reclaiming RAM from apollo. Prometheus has 26 GB free: moving icarus there brings Olympus back to ~73%.",
                "warn", ("Live-migrate icarus → Prometheus", "migrate"))],
            "guests": [ref("apollo"), ref("hermes"), *([] if M else [ref("icarus")]), ref("labk3s"), ref("pihole"), ref("gitea"), ref("tailscale"), ref("caddy"), ref("monitoring")],
            "interfaces": [item("vmbr0 · X710 port 1", "trunk · VLAN 1, 30, 70, 95", "10 GbE · 1.8 Gbps"), item("vmbr1 · 2.5 GbE", "corosync ring", "2.5 GbE")],
            "events": [item("Memory crossed 90%", "Proxmox API", "10:24", "mute" if M else "warn"), item("vzdump · 11 guests · OK", "backup", "03:12"), item("Kernel 6.8 installed · reboot pending", "apt", "Mon", "info")],
            "rel": [("Connected to", [ref("agg", "port 3 · 10 GbE")]), ("Depends on", [ref("atlas", "NFS nexus · chronicles")]), ("Edge tunnels in", [ref("r2d2"), ref("c3po"), ref("k2so")]), ("Services", [ref("svc-media"), ref("svc-dns"), ref("svc-ingress")])],
        },
        {
            "id": "prometheus", "name": "Prometheus", "site": "home", "status": "ok", "sub": "srv-prox-02 · 10.30.0.12 · i5-13500 · RTX A2000",
            "meters": [("CPU", 22), ("Memory", 76 if M else 58, "76% · +12 GB icarus" if M else "58%"), ("GPU · A2000", 41)],
            "facts": [("CPU", "i5-13500 · turbo off"), ("Memory", "64 GB DDR4"), ("GPU", "RTX A2000 6 GB")],
            "guests": [ref("aurora"), ref("hephaestus"), ref("ocr"), *([ref("icarus", "migrated just now")] if M else [])],
            "events": [item("3 container image updates", "registry check", "Mon", "info")],
            "rel": [("Connected to", [ref("agg", "port 4")]), ("Services", [ref("svc-dev"), ref("svc-ai")]), ("Edge tunnels in", [ref("chopper", "VLAN 70")])],
        },
        {
            "id": "kronos", "name": "Kronos", "site": "home", "status": "crit" if sim.on_batt else "ok", "sub": "Dell Precision T5610 · 2× Xeon · RTX 5060 Ti + A2000",
            "meters": [("CPU", 9), ("Memory", 34), ("GPU · 5060 Ti", 31)],
            "facts": [],
            "guests": [ref("ollama-a"), ref("ollama-b")],
            "rel": [("Connected to", [ref("agg", "port 5")]), ("Services", [ref("svc-ai")])],
        },
        {
            "id": "delphi", "name": "Delphi", "site": "home", "status": "crit" if sim.on_batt else "warn", "sub": "Inference · i5-13500T · 2× RTX 3090",
            "meters": [("GPU 0 load", 94, "94%", "ok"), ("VRAM", 88, "42 / 48 GB"), ("CPU", 18)],
            "facts": [],
            "guests": [ref("vllm")],
            "rel": [("Connected to", [ref("agg", "port 6")]), ("Services", [ref("svc-ai")])],
        },
    ]
    guests = [
        _guest("apollo", "VM", "olympus", "10.30.0.101", "Media server", "ok" if M else "warn",
               [("CPU · 6 vCPU", 14), ("Memory · 16 GB", 88 if M else 100, "14.1 GB" if M else "16.0 GB · ballooning"), ("Disk · 128 GB", 47)],
               [("vCPU", "6"), ("Memory", "16 GB · balloon min 8"), ("hostpci0", "Iris Xe · Quick Sync"), ("OS", "Ubuntu 24.04")],
               rel=[("Depends on", [ref("atlas", "chronicles · melodies (ro)"), ref("hermes", "imports")]), ("Exposed by", [ref("c3po", "Plex relay"), ref("caddy", "plex.home.lan")]), ("Service", [ref("svc-media")])],
               copies=[item("Production", "local-nvme", "✓"), item("Nightly vzdump", "config only", "✓"), item("Offsite", "media excluded by design", "—", "mute")]),
        _guest("hermes", "VM", "olympus", "10.30.0.102", "ARR stack", "ok" if S else "warn",
               [("CPU · 4 vCPU", 19), ("Memory · 8 GB", 89, "7.1 GB"), ("Disk · 64 GB", 58)],
               [("vCPU", "4"), ("Memory", "8 GB · balloon min 6"), ("Disk", "local-nvme · 64 GB"), ("OS", "Debian 12")],
               rel=[("Depends on", [ref("atlas", "forge · chronicles (rw)"), ref("pihole", "DNS")]), ("Used by", [ref("apollo", "library imports")]), ("Service", [ref("svc-media")])],
               events=[item("Watchtower updated 4 images", "docker", "09:58", "info"), item("sonarr OOM-killed ×3", "docker", "10:42", "mute" if S else "warn")]),
        _guest("icarus", "VM", "prometheus" if M else "olympus", "10.30.0.103", "Always-on desktop", "ok",
               [("CPU · 4 vCPU", 6), ("Memory · 12 GB", 95, "11.4 GB", "ok"), ("Disk", 31)],
               [("vCPU", "4"), ("Memory", "12 GB"), ("Display", "SPICE · virtio-gpu")],
               events=[item("Live-migrated to Prometheus", "Pantheon action", "just now", "ok")] if M else None),
        _guest("labk3s", "VM", "olympus", "10.30.0.104", "k3s test cluster", "off",
               [("CPU", 0, "stopped", "mute"), ("Memory", 0, "0 / 8 GB", "mute")], [("vCPU", "4"), ("Memory", "8 GB")]),
        _guest("pihole", "LXC", "olympus", "10.30.0.110", "DNS / ad-blocking", "ok",
               [("CPU", 2), ("Memory · 1 GB", 40, "410 MB")],
               [("Cores", "1"), ("Unprivileged", "yes"), ("rootfs", "8 GB"), ("Protection", "on")],
               services=[item("pihole-FTL", "systemd · 96 MB", "active"), item("lighttpd", "admin UI", "active"), item("cron", "gravity Sun 03:00", "active")],
               fw=[item("ALLOW udp,tcp 53 from all VLANs", "", "", "ok"), item("ALLOW tcp 80 from caddy", "", "", "ok"), item("DROP * (policy)", "", "", "crit")],
               rel=[("Used by", [ref("hermes", "DNS"), ref("apollo", "DNS"), item("All VLANs", "primary resolver", "", "ok")]), ("Pair", [item("hestia-rpi", "secondary · Gravity Sync", "", "ok")]), ("Service", [ref("svc-dns")])]),
        _guest("gitea", "LXC", "olympus", "10.30.0.111", "Git mirror", "ok", [("CPU", 1), ("Memory · 2 GB", 45, "0.9 GB")], [("Cores", "2"), ("rootfs", "32 GB")],
               rel=[("Service", [ref("svc-dev")])]),
        _guest("tailscale", "LXC", "olympus", "10.1.0.30", "Subnet router", "ok", [("CPU", 1), ("Memory", 40, "0.2 GB")], [], name="tailscale-sr", vlan="1"),
        _guest("caddy", "LXC", "olympus", "10.30.0.112", "Reverse proxy", "ok", [("CPU", 3), ("Memory", 30, "0.3 GB")], [("Routes", "18"), ("NICs", "VLAN 30 + VLAN 95")],
               vlan="30 · 95", rel=[("Ingress from", [ref("r2d2", "VLAN 95")]), ("Service", [ref("svc-ingress")])]),
        _guest("monitoring", "LXC", "olympus", "10.30.0.113", "Metrics & probes", "ok", [("CPU", 7), ("Memory · 4 GB", 65, "2.6 GB")], [("Cores", "2"), ("Disk", "64 GB")]),
        _guest("aurora", "VM", "prometheus", "10.30.0.61", "Light inference · A2000", "ok", [("CPU", 12), ("GPU", 41)], [("GPU", "RTX A2000 passthrough")],
               rel=[("Service", [ref("svc-ai")])]),
        _guest("hephaestus", "VM", "prometheus", "10.30.0.60", "Dev server", "ok", [("CPU", 18), ("Memory", 62)], [("Devcontainers", "4 · VLAN 70")],
               rel=[("Service", [ref("svc-dev")])]),
        _guest("ocr", "LXC", "prometheus", "10.30.0.62", "Document OCR", "ok", [("CPU", 4), ("Memory", 38)], [("App", "paperless-ngx · tika")]),
        _guest("vllm", "VM", "delphi", "10.30.0.70", "vLLM tensor-parallel", "warn", [("GPU 0", 94, "94%", "ok"), ("GPU 1 temp", 83, "83 °C", "warn")],
               [("GPUs", "2× RTX 3090 passthrough"), ("Model", "Qwen3 32B · AWQ")], rel=[("Service", [ref("svc-ai")])]),
    ]
    return {
        "cluster": "olympus-cluster",
        "nodes": nodes,
        "guests": guests,
        "alerts": [{"id": "a2", "sev": "warn", "title": "Olympus memory at 91%", "where": "olympus", "when": "18 min", "obj": "olympus", "resolved": M, "domain": "Hosts", "action": "Rebalance"}],
        "updates": [("olympus", "Kernel 6.8 · reboot pending", "Proxmox")],
        "changes": [{"t": "03:12", "k": "Backups", "x": "vzdump: 11 guests on olympus · OK"}],
        "backup_tiles": [
            {"l": "Guests backed up", "v": "27 / 27", "lv": "ok", "s": "last night · all OK"},
            {"l": "3-2-1 complete", "v": "24 / 27", "lv": "text", "s": "apollo media excluded by design"},
        ],
        "backup_jobs": [
            {"name": "vzdump · olympus", "obj": "olympus", "target": "alexandria · nexus/backups", "schedule": "03:00", "last": "today · 11 guests OK"},
            {"name": "vzdump · prometheus", "obj": "prometheus", "target": "alexandria · nexus/backups", "schedule": "03:30", "last": "today · 5 guests OK"},
        ],
    }


# ---------- live ----------


def _net0(conf: dict) -> dict:
    """Parse a guest's first NIC: "virtio=BC:24:..,bridge=vmbr0,tag=30" (VM) or "name=eth0,hwaddr=..,ip=10.0.0.5/24,tag=30" (LXC)."""
    parts = dict(p.split("=", 1) for p in str(conf.get("net0", "")).split(",") if "=" in p)
    model = next((k for k in ("virtio", "e1000", "vmxnet3", "rtl8139") if k in parts), None)
    ip = parts.get("ip", "")
    return {
        "nic": " · ".join(x for x in (model or parts.get("type"), parts.get("bridge")) if x) or None,
        "vlan": parts.get("tag"),
        "mac": parts.get(model) if model else parts.get("hwaddr"),
        "ip": ip.split("/")[0] if ip and ip not in ("dhcp", "manual") else None,
    }


async def fetch(cfg: dict) -> dict:
    """Proxmox VE over its REST API with an API token (PVEAuditor role is enough).

    [proxmox]  url, token_id ("user@realm!name"), token_secret, site = "home", verify_tls = true
    """
    need(cfg, "url", "token_id", "token_secret")
    site = cfg.get("site", "home")
    auth = {"Authorization": f"PVEAPIToken={cfg['token_id']}={cfg['token_secret']}"}
    async with client(cfg, cfg["url"].rstrip("/") + "/api2/json", headers=auth) as c:
        resources = (await get(c, "/cluster/resources"))["data"]
        cluster = next((x for x in (await get(c, "/cluster/status"))["data"] if x.get("type") == "cluster"), {})
        raw_nodes = [r for r in resources if r["type"] == "node"]
        raw_guests = [r for r in resources if r["type"] in ("qemu", "lxc") and not r.get("template")]

        async def node_status(n):
            try:
                return (await get(c, f"/nodes/{n['node']}/status"))["data"]
            except Exception:
                return {}

        async def guest_config(g):
            try:
                return (await get(c, f"/nodes/{g['node']}/{g['type']}/{g['vmid']}/config"))["data"]
            except Exception:
                return {}

        statuses = await asyncio.gather(*map(node_status, raw_nodes))
        configs = await asyncio.gather(*map(guest_config, raw_guests))
        try:
            jobs = (await get(c, "/cluster/backup"))["data"]
        except Exception:
            jobs = []

    def gid(g):
        return slug(g.get("name") or f"{g['type']}{g['vmid']}")

    guests = []
    for g, conf in zip(raw_guests, configs, strict=True):
        running, is_vm = g.get("status") == "running", g["type"] == "qemu"
        net = _net0(conf)
        mem_mb = round(g.get("maxmem", 0) / 1024**2)
        guests.append({
            "id": gid(g), "name": g.get("name"), "kind": "VM" if is_vm else "LXC", "node": slug(g["node"]), "status": "ok" if running else "off",
            "ip": net["ip"], "role": conf.get("description", "").strip().splitlines()[0][:60] if conf.get("description") else "", "vlan": net["vlan"], "mac": net["mac"], "nic": net["nic"],
            "meters": [("CPU", round(g.get("cpu", 0) * 100)), ("Memory", pct(g.get("mem", 0), g.get("maxmem", 0)), f"{gb(g.get('mem', 0))} / {gb(g.get('maxmem', 0))}"),
                       *([("Disk", pct(g.get("disk", 0), g.get("maxdisk", 0)))] if g.get("disk") else [])] if running else [("CPU", 0, "stopped", "mute")],
            "cfg": [("VMID", str(g["vmid"])), ("vCPU" if is_vm else "Cores", str(g.get("maxcpu", ""))), ("Memory", gb(g.get("maxmem", 0))), ("Disk", gb(g.get("maxdisk", 0))),
                    ("OS", conf.get("ostype")), ("Start at boot", "yes" if conf.get("onboot") else "no"), ("Tags", g.get("tags"))],
            "events": [item("Running" if running else "Stopped", "Proxmox", uptime(g["uptime"]) if g.get("uptime") else "", "ok" if running else "mute")],
            # What the hypervisor really gives the guest, to compare with what the CMDB declares.
            "observed": {"memory_mb": mem_mb, "vcpus": g.get("maxcpu")},
        })

    nodes = []
    quorate = cluster.get("quorate")
    for n, st in zip(raw_nodes, statuses, strict=True):
        online = n.get("status") == "online"
        mem = pct(n.get("mem", 0), n.get("maxmem", 0))
        nid = slug(n["node"])
        nodes.append({
            "id": nid, "name": n["node"], "site": site, "status": "crit" if not online else ("warn" if mem >= 90 else "ok"),
            "sub": " · ".join(x for x in (st.get("cpuinfo", {}).get("model"), cluster.get("name")) if x) or "Proxmox node",
            "meters": [("CPU", round(n.get("cpu", 0) * 100)), ("Memory", mem, f"{mem}% · {gb(n.get('mem', 0))} / {gb(n.get('maxmem', 0))}"), ("Root disk", pct(n.get("disk", 0), n.get("maxdisk", 0)))] if online else [],
            "facts": [("CPU", f"{st['cpuinfo']['model']} · {st['cpuinfo'].get('cpus', '?')} threads" if st.get("cpuinfo") else None), ("Memory", gb(n.get("maxmem", 0))),
                      ("Proxmox", st.get("pveversion")), ("Kernel", st.get("kversion", "").split(" #")[0] or None), ("Cluster", f"{cluster['name']} · {'quorate' if quorate else 'NO QUORUM'}" if cluster else None),
                      ("Uptime", uptime(n["uptime"]) if n.get("uptime") else None)],
            "guests": [ref(g["id"]) for g in guests if g["node"] == nid],
        })

    return {
        "cluster": cluster.get("name", ""),
        "nodes": nodes,
        "guests": guests,
        "backup_jobs": [{"name": f"vzdump · {j.get('id', 'job')}", "obj": slug(j["node"]) if j.get("node") else (nodes[0]["id"] if nodes else ""), "target": j.get("storage", ""), "schedule": j.get("schedule", ""),
                         "last": "enabled" if j.get("enabled", 1) else "disabled"} for j in jobs],
    }


proxmox = Integration("proxmox", "Proxmox VE", "4 nodes · 11 VMs · 16 LXCs · cluster quorum", "2 s", mock, fetch=fetch)
