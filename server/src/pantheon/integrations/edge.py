"""Hosting providers and the edge VPS they run for the lab."""

import asyncio
import hashlib
import time

from ..http import client, get, need, slug
from .base import Integration, item, note, ref


def _billing():
    return [("Monthly", "[AMOUNT]"), ("Renewal", "[DATE]")]


def _site():
    return [("Site", [ref("home")])]


def _demo(v: dict) -> dict:
    """Fill in what every demo VPS has: a WireGuard tunnel home, light load, a quiet event log."""
    down = v["status"] == "crit"
    v["facts"] = [("Type", v.get("link", "WireGuard")), ("Last handshake", "14 min ago" if down else "2 s ago", "crit" if down else None), ("Lands on", v["lands"]), ("RTT to home", "—" if down else "11 ms")]
    v.setdefault("cpu", 6)
    v.setdefault("mem", 38)
    v.setdefault("events", [item("Handshake OK", "WireGuard", "continuous", "ok")])
    return v


def _ovh(sim):
    return {
        "provider": {"id": "ovh", "ab": "OVH", "name": "OVH", "status": "ok", "sub": "Gravelines · 3 edge VPS", "billing": _billing(), "rel": _site()},
        "vps": [_demo(v) for v in (
            {"id": "r2d2", "role": "public ingress", "lands": "VLAN 95 · caddy", "targets": [ref("vlan95"), ref("caddy")], "status": "ok", "rel": [("Service", [ref("svc-ingress")])]},
            {"id": "c3po", "role": "Plex relay", "lands": "apollo", "targets": [ref("apollo", "tcp 32400")], "status": "ok", "cpu": 12, "rel": [("Service", [ref("svc-media")])]},
            {"id": "bb8", "role": "mail & webhooks", "lands": "hermes-tools", "targets": [ref("hermes-tools", "VPS ↔ VPS")], "status": "ok", "link": "WireGuard VPS ↔ VPS", "rel": [("Service", [ref("svc-wellmade")])]},
        )],
    }


def _quicksrv(sim):
    K = sim.k2so_fixed
    return {
        "provider": {"id": "quicksrv", "ab": "QS", "name": "Quicksrv.io", "status": "ok" if K else "crit", "sub": "2 edge VPS", "billing": _billing(), "rel": _site()},
        "vps": [_demo(v) for v in (
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
        )],
        "changes": [{"t": "10:28", "k": "Edge", "x": "Quicksrv.io rebooted k2so (provider maintenance)"}],
    }


def _scaleway(sim):
    return {
        "provider": {"id": "scaleway", "ab": "SCW", "name": "Scaleway", "status": "ok", "sub": "fr-par · Wellmade fleet · 4 VPS", "billing": _billing(), "rel": _site()},
        "vps": [
            _demo({"id": "hermes-" + n, "role": "Wellmade " + n, "lands": "Cloudflare tunnel", "targets": [ref("cloudflare")], "status": "ok", "link": "Cloudflare tunnel", "rel": [("Service", [ref("svc-wellmade")])]})
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


# ---------- live ----------
# A provider's API knows the machines, not what they are for: role and tunnel details stay empty
# until something that knows them (WireGuard peers on the gateway, the CMDB) is wired in.


def _provider(id: str, ab: str, name: str, vps: list[dict], sub: str) -> dict:
    down = [v for v in vps if v["status"] != "ok"]
    return {"id": id, "ab": ab, "name": name, "status": "warn" if down else "ok", "sub": sub, "billing": [], "rel": []}


async def _fetch_ovh(cfg: dict) -> dict:
    """OVHcloud API with an application key, application secret and consumer key (GET /vps* rights).

    [ovh]  app_key, app_secret, consumer_key, url = "https://eu.api.ovh.com/1.0"
    """
    need(cfg, "app_key", "app_secret", "consumer_key")
    base = cfg.get("url", "https://eu.api.ovh.com/1.0").rstrip("/")
    async with client(cfg, base) as c:
        skew = int((await c.get("/auth/time")).raise_for_status().text) - int(time.time())

        async def signed(path: str):
            now = str(int(time.time()) + skew)
            digest = hashlib.sha1("+".join((cfg["app_secret"], cfg["consumer_key"], "GET", base + path, "", now)).encode()).hexdigest()
            res = await c.get(path, headers={"X-Ovh-Application": cfg["app_key"], "X-Ovh-Consumer": cfg["consumer_key"], "X-Ovh-Timestamp": now, "X-Ovh-Signature": "$1$" + digest})
            return res.raise_for_status().json()

        details = await asyncio.gather(*(signed(f"/vps/{name}") for name in await signed("/vps")))
    vps = []
    for d in details:
        model = d.get("model") or {}
        vps.append({"id": slug(d.get("displayName") or d["name"]), "name": d.get("displayName") or d["name"], "role": model.get("name") or "VPS", "lands": d.get("zone") or "—",
                    "status": "ok" if d.get("state") == "running" else "crit", "facts_title": "Instance",
                    "facts": [("Service name", d.get("name")), ("State", d.get("state"), None if d.get("state") == "running" else "crit"), ("Model", model.get("name")), ("vCores", str(d.get("vcore") or model.get("vcore") or "") or None),
                              ("Memory", f"{d['memoryLimit']} MB" if d.get("memoryLimit") else None), ("Zone", d.get("zone"))]})
    return {"provider": _provider("ovh", "OVH", "OVH", vps, f"{len(vps)} VPS"), "vps": vps}


async def _fetch_scaleway(cfg: dict) -> dict:
    """Scaleway Instances API with a secret key.

    [scaleway]  secret_key, zones = ["fr-par-1"]
    """
    need(cfg, "secret_key")
    zones = cfg.get("zones") or ["fr-par-1"]
    async with client(cfg, cfg.get("url", "https://api.scaleway.com"), headers={"X-Auth-Token": cfg["secret_key"]}) as c:
        pages = await asyncio.gather(*(get(c, f"/instance/v1/zones/{z}/servers", per_page=100) for z in zones))
    vps = []
    for zone, page in zip(zones, pages, strict=True):
        for s in page.get("servers", []):
            ip = (s.get("public_ip") or {}).get("address")
            vps.append({"id": slug(s["name"]), "name": s["name"], "role": s.get("commercial_type") or "instance", "lands": zone, "status": "ok" if s.get("state") == "running" else "crit", "facts_title": "Instance",
                        "facts": [("State", s.get("state"), None if s.get("state") == "running" else "crit"), ("Type", s.get("commercial_type")), ("Zone", zone), ("Public IP", ip), ("Private IP", s.get("private_ip"))]})
    return {"provider": _provider("scaleway", "SCW", "Scaleway", vps, f"{' · '.join(zones)} · {len(vps)} instances"), "vps": vps}


async def _fetch_cloudflare(cfg: dict) -> dict:
    """Cloudflare API with a token that can read zones and, for tunnels, Cloudflare Tunnel on the account.

    [cloudflare]  api_token, account_id (optional: without it tunnels are not listed)
    """
    need(cfg, "api_token")
    async with client(cfg, cfg.get("url", "https://api.cloudflare.com/client/v4"), headers={"Authorization": f"Bearer {cfg['api_token']}"}) as c:
        zones = await get(c, "/zones", per_page=50)
        tunnels = (await get(c, f"/accounts/{cfg['account_id']}/cfd_tunnel", is_deleted="false")).get("result", []) if cfg.get("account_id") else []
    names = [z["name"] for z in zones.get("result", [])]
    total = (zones.get("result_info") or {}).get("total_count", len(names))
    bad = [t for t in tunnels if t.get("status") not in ("healthy", "inactive")]
    return {
        "provider": {"id": "cloudflare", "ab": "CF", "name": "Cloudflare", "status": "warn" if bad else "ok", "sub": f"{len(tunnels)} tunnels · {total} zones",
                     "tunnels": [item(t.get("name", "tunnel"), "", t.get("status", ""), "ok" if t.get("status") == "healthy" else ("mute" if t.get("status") == "inactive" else "warn")) for t in tunnels]
                     or [item("No tunnel listed", "set account_id to list them" if not cfg.get("account_id") else "", "", "mute")],
                     "dns": [("Zones", str(total)), ("Names", " · ".join(names[:6]) or None)], "rel": []},
        "vps": [],
    }


ovh = Integration("ovh", "OVH", "3 VPS · IPs · bandwidth", "1 min", _ovh, fetch=_fetch_ovh)
quicksrv = Integration("quicksrv", "Quicksrv.io", "2 VPS · via SSH + node_exporter", "1 min", _quicksrv)
scaleway = Integration("scaleway", "Scaleway", "4 instances · managed PostgreSQL", "1 min", _scaleway, fetch=_fetch_scaleway)
cloudflare = Integration("cloudflare", "Cloudflare", "4 zones · tunnels · DNS · requests", "1 min", _cloudflare, fetch=_fetch_cloudflare)
