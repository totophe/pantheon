"""Hosting providers and the edge VPS they run for the lab."""

from .base import Integration, item, note, ref


def _billing():
    return [("Monthly", "[AMOUNT]"), ("Renewal", "[DATE]")]


def _site():
    return [("Site", [ref("home")])]


def _ovh(sim):
    return {
        "provider": {"id": "ovh", "ab": "OVH", "name": "OVH", "status": "ok", "sub": "Gravelines · 3 edge VPS", "billing": _billing(), "rel": _site()},
        "vps": [
            {"id": "r2d2", "role": "public ingress", "lands": "VLAN 95 · caddy", "targets": [ref("vlan95"), ref("caddy")], "status": "ok", "rel": [("Service", [ref("svc-ingress")])]},
            {"id": "c3po", "role": "Plex relay", "lands": "apollo", "targets": [ref("apollo", "tcp 32400")], "status": "ok", "cpu": 12, "rel": [("Service", [ref("svc-media")])]},
            {"id": "bb8", "role": "mail & webhooks", "lands": "hermes-tools", "targets": [ref("hermes-tools", "VPS ↔ VPS")], "status": "ok", "link": "WireGuard VPS ↔ VPS", "rel": [("Service", [ref("svc-wellmade")])]},
        ],
    }


def _quicksrv(sim):
    K = sim.k2so_fixed
    return {
        "provider": {"id": "quicksrv", "ab": "QS", "name": "Quicksrv.io", "status": "ok" if K else "crit", "sub": "2 edge VPS", "billing": _billing(), "rel": _site()},
        "vps": [
            {
                "id": "k2so", "role": "lab access edge", "lands": "VLAN 30", "targets": [ref("vlan30")], "status": "ok" if K else "crit", "cpu": 3, "mem": 28,
                "notes": [] if K else [note("Tunnel down", "Public probes succeed, but the WireGuard handshake to the home lab is 14 minutes stale. Open Diagnostics to find out why.", "crit")],
                "events": [item("Handshake restored", "Pantheon action", "just now", "ok"), item("Provider maintenance reboot", "Quicksrv.io", "10:28", "warn")] if K
                else [item("Handshake stale > 5 min", "alert fired", "10:31", "crit"), item("Provider maintenance reboot", "Quicksrv.io", "10:28", "warn")],
                "diagnostics": {
                    "fixed": K,
                    # (check, result, level, result once fixed)
                    "steps": [
                        ("Public HTTPS reachability (3 probes)", "200 · 38 ms", "ok", None), ("ICMP from r2d2 (OVH)", "22 ms", "ok", None), ("WireGuard peer on UDM", "qsrv-01 · enabled", "ok", None),
                        ("Peer endpoint vs DNS", "203.0.113.7 ≠ .12", "warn", "203.0.113.12 ✓"), ("UDP 51820 to endpoint", "no reply", "crit", "handshake OK"),
                    ],
                    "cause": note("Likely cause: new public IP", "The provider rebooted k2so and reassigned its address. DNS returns 203.0.113.12, the UDM peer still points to 203.0.113.7.", "crit", ("Update peer endpoint & re-handshake", "fixk2so")),
                    "outcome": note("Resolved", "Endpoint updated to 203.0.113.12; handshake OK; alert auto-resolved. Tip: use a DNS name as peer endpoint so the next IP change heals itself.", "ok"),
                },
            },
            {"id": "chopper", "role": "client previews", "lands": "VLAN 70", "targets": [ref("vlan70"), ref("hephaestus", "devcontainers")], "status": "ok", "rel": [("Service", [ref("svc-dev")])]},
        ],
        "changes": [{"t": "10:28", "k": "Edge", "x": "Quicksrv.io rebooted k2so (provider maintenance)"}],
    }


def _scaleway(sim):
    return {
        "provider": {"id": "scaleway", "ab": "SCW", "name": "Scaleway", "status": "ok", "sub": "fr-par · Wellmade fleet · 4 VPS", "billing": _billing(), "rel": _site()},
        "vps": [
            {"id": "hermes-" + n, "role": "Wellmade " + n, "lands": "Cloudflare tunnel", "targets": [ref("cloudflare")], "status": "ok", "link": "Cloudflare tunnel", "rel": [("Service", [ref("svc-wellmade")])]}
            for n in ("umami", "crm", "tools", "monitor")
        ],
    }


def _cloudflare(sim):
    return {
        "provider": {
            "id": "cloudflare", "ab": "CF", "name": "Cloudflare", "status": "ok", "sub": "3 tunnels · 4 zones",
            "tunnels": [item("olympus", "cloudflared on caddy", "up"), item("hermes-crm", "Scaleway", "up"), item("hermes-tools", "Scaleway", "up")],
            "dns": [("Zones", "4"), ("Requests (24 h)", "41.2 k")],
            "rel": [("Used by", [ref("hermes-crm"), ref("hermes-tools")])],
        },
        "vps": [],
    }


ovh = Integration("ovh", "OVH", "3 VPS · IPs · bandwidth", "1 min", _ovh)
quicksrv = Integration("quicksrv", "Quicksrv.io", "2 VPS · via SSH + node_exporter", "1 min", _quicksrv)
scaleway = Integration("scaleway", "Scaleway", "4 instances · managed PostgreSQL", "1 min", _scaleway)
cloudflare = Integration("cloudflare", "Cloudflare", "4 zones · tunnels · DNS · requests", "1 min", _cloudflare)
