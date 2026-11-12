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


netbox = Integration("netbox", "NetBox · CMDB / IPAM", "sites · VLANs · prefixes · declared VMs · assets", "5 min", mock)
