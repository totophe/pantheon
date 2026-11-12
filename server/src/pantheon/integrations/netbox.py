from ..http import client, get, need, slug
from .base import Integration, item, note, ref


def _asset(model):
    return [("Model", model), ("Serial", "[SERIAL]"), ("Purchased", "[DATE] · [SUPPLIER]"), ("Warranty until", "[DATE]"), ("Location", "Home lab · rack U[?]")]


def mock(sim):
    return {
        "object_count": "312",
        "synced": "synced 5 min ago",
        "owner": "Totophe",
        # CMDB record and physical asset per host.
        "hosts": {
            "olympus": {"cmdb": [("Role", "Proxmox node"), ("Cluster", "olympus-cluster"), ("Primary IP", "10.30.0.11"), ("Mgmt IP", "10.1.0.21 (should be VLAN 5)", "warn")], "asset": _asset("Minisforum MS-01")},
            "prometheus": {"asset": _asset("Custom · i5-13500")},
            "kronos": {"asset": _asset("Dell Precision T5610")},
            "delphi": {"asset": _asset("Custom · 2× RTX 3090")},
            "alexandria": {"asset": _asset("Supermicro X9SRI-F · Thermaltake")},
            "synology": {"asset": _asset("Synology")},
        },
        # Hosts that are declared but not built yet.
        "planned": [{
            "id": "hyperion", "name": "Hyperion", "site": "home", "status": "plan", "sub": "srv-prox-03 · planned · shared dev platform",
            "facts_title": "Declared in NetBox", "facts_wide": True,
            "facts": [("CPU", "i5-13500"), ("Board", "B760M DS3H DDR4 · to order"), ("Memory", "2 × 32 GB (from Sparta)"), ("NIC", "82599ES dual SFP+"), ("Role", "PostgreSQL · Garage · dev services")],
            "rel": [("Will connect to", [ref("agg")]), ("Services", [ref("svc-dev")])],
        }],
        # Declared-vs-observed differences per guest: (field, declared, observed).
        "guests": {
            "apollo": {"diff": [("Memory", "12 GB", "16 GB"), ("PCI passthrough", "none", "Iris Xe")], "crit": "Medium"},
            "hermes": {"diff": [("Memory", "6 GB", "8 GB")]},
            "pihole": {"crit": "High"},
        },
        # (object id, field, declared, observed)
        "drift": [("hermes", "Memory", "6 GB", "8 GB"), ("apollo", "Memory", "12 GB", "16 GB"), ("apollo", "PCI passthrough", "none", "Iris Xe"), ("vlan1", "olympus mgmt IP on VLAN 1", "VLAN 5", "VLAN 1"), ("vlan30", "Undeclared IPs", "—", ".87 · .88 · .91")],
        "drift_summary": "apollo · hermes · VLAN 1 · VLAN 30",
        "vlan_drift": {
            1: {"member": item("olympus mgmt", "10.1.0.21 · should be VLAN 5", "", "warn"), "note": note("Remediation", "Proxmox management interfaces and IPMI still live here. NetBox declares them on VLAN 5.", "warn")},
            30: {"member": item("3 undeclared IPs", ".87 · .88 · .91 (lab-k3s?)", "", "warn"), "note": note("Drift", "3 IPs answer on VLAN 30 that NetBox does not know about.", "warn")},
        },
        "services": [
            {"id": "svc-media", "name": "Media", "desc": "Plex, ARR stack, libraries and remote access", "comps": [ref("apollo", "Plex & readers"), ref("hermes", "ARR stack"), ref("sonarr", "TV automation"), ref("atlas", "libraries"), ref("c3po", "remote relay")]},
            {"id": "svc-dns", "name": "DNS", "desc": "Resolution and ad-blocking for every VLAN", "comps": [ref("pihole", "primary"), item("hestia-rpi", "secondary", "", "ok")]},
            {"id": "svc-ingress", "name": "Edge ingress", "desc": "Public traffic into the home lab", "comps": [ref("r2d2", "OVH ingress"), ref("caddy", "reverse proxy"), ref("vlan95", "DMZ")]},
            {"id": "svc-dev", "name": "Dev platform", "desc": "Customer devcontainers, git, previews", "comps": [ref("hephaestus"), ref("gitea"), ref("chopper", "client previews"), ref("vlan70"), ref("hyperion", "planned")]},
            {"id": "svc-ai", "name": "AI inference", "desc": "Local models for agents and apps", "comps": [ref("kronos", "Ollama"), ref("delphi", "vLLM"), ref("aurora", "light inference")]},
            {"id": "svc-wellmade", "name": "Wellmade apps", "desc": "Client-facing apps on Scaleway", "comps": [ref("hermes-umami"), ref("hermes-crm"), ref("hermes-tools"), ref("hermes-monitor"), ref("bb8", "mail relay"), ref("cloudflare")]},
        ],
        # Typical draw from the device type, used where nothing measures the real one.
        "power": [{"id": "udm", "w": 48, "src": "est"}, {"id": "agg", "w": 22, "src": "est"}, {"name": "Pis & office hifi", "w": 0 if sim.on_batt else 10, "src": "est"}, {"id": "udmse", "w": 25, "src": "est"}],
    }


# ---------- live ----------


async def fetch(cfg: dict) -> dict:
    """NetBox over its REST API with a read-only token.

    [netbox]  url, token, owner (optional), [netbox.sites] "<NetBox site slug>" = "<site id>"
    """
    need(cfg, "url", "token")
    sites = cfg.get("sites", {})
    async with client(cfg, cfg["url"].rstrip("/") + "/api", headers={"Authorization": f"Token {cfg['token']}", "Accept": "application/json"}) as c:
        devices = await get(c, "/dcim/devices/", limit=1000)
        vms = await get(c, "/virtualization/virtual-machines/", limit=1000)
        extra = 0
        for path in ("/ipam/vlans/", "/ipam/prefixes/", "/ipam/ip-addresses/"):
            try:
                extra += (await get(c, path, limit=1, brief=1)).get("count", 0)
            except Exception:
                pass

    def val(x, key="name"):
        return (x or {}).get(key)

    hosts, planned = {}, []
    for d in devices.get("results", []):
        if not d.get("name"):
            continue
        hid, kind = slug(d["name"]), d.get("device_type") or {}
        role = val(d.get("role") or d.get("device_role"))
        ip = val(d.get("primary_ip"), "address")
        location = " · ".join(x for x in (val(d.get("site")), f"rack {val(d.get('rack'))}" if d.get("rack") else None, f"U{d['position']:g}" if d.get("position") else None) if x)
        model = " ".join(x for x in (val(kind.get("manufacturer")), kind.get("model")) if x)
        hosts[hid] = {"cmdb": [("Role", role), ("Site", val(d.get("site"))), ("Primary IP", ip), ("Status", val(d.get("status"), "label"))],
                      "asset": [("Model", model or None), ("Serial", d.get("serial") or None), ("Asset tag", d.get("asset_tag")), ("Location", location or None)]}
        if val(d.get("status"), "value") == "planned":
            planned.append({"id": hid, "name": d["name"], "site": sites.get(val(d.get("site"), "slug") or "", "home"), "status": "plan", "sub": " · ".join(x for x in (role, "planned") if x),
                            "facts_title": "Declared in NetBox", "facts_wide": True, "facts": [("Model", model or None), ("Role", role), ("Location", location or None)]})

    declared, guests = {}, {}
    for v in vms.get("results", []):
        if not v.get("name"):
            continue
        gid = slug(v["name"])
        declared[gid] = {"memory_mb": v.get("memory"), "vcpus": v.get("vcpus")}
        guests[gid] = {"role": val(v.get("role")), "lifecycle": val(v.get("status"), "label")}

    return {
        "object_count": str(devices.get("count", 0) + vms.get("count", 0) + extra), "synced": "",
        **({"owner": cfg["owner"]} if cfg.get("owner") else {}),
        "hosts": hosts, "planned": planned, "guests": guests, "declared": declared,
    }


netbox = Integration("netbox", "NetBox · CMDB / IPAM", "sites · VLANs · prefixes · declared VMs · assets", "5 min", mock, fetch=fetch)
