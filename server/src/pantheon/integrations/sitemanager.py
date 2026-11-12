from ..http import client, get, need, slug
from .base import Integration, item, note, ref


def mock(sim):
    M = sim.mem_fixed
    return {
        "sites": [
            {
                "id": "home", "ab": "HOME", "name": "Home lab", "site": "home", "status": "crit" if sim.on_batt else ("ok" if M and sim.k2so_fixed else "warn"),
                "sub": "olympus-cluster · UDM Pro Max · DIGI XGS-PON + 5G",
                "health": [("Hosts healthy", 60 if M else 40, "3 / 5" if M else "2 / 5", "ok" if M else "warn"), ("WAN usage", 38, "3.8 / 10 Gbps"), ("Site Magic latency", 18, "18 ms", "ok")],
                "facts": [("Gateway", "UDM Pro Max"), ("VLANs", "1 · 10 · 30 · 70 · 80 · 95"), ("Clients", "63"), ("Rack", "16U · basement")],
                "uplinks": [item("DIGI · XGS-PON 10G", "PPPoE · LuLeey SFP stick", "ACTIVE · 4 ms", "ok", "ok"), item("5G SIM", "€5/month · tested Sun", "STANDBY", "mute")],
                "devices_title": "Infrastructure",
                "devices": [ref("udm"), ref("agg"), ref("access"), ref("olympus"), ref("prometheus"), ref("kronos"), ref("delphi"), ref("alexandria"), ref("hyperion")],
                "rel": [("Linked sites", [ref("siteb", "Site Magic · 18 ms")]), ("Edge providers", [ref("ovh"), ref("quicksrv"), ref("scaleway"), ref("cloudflare")])],
                # Row on the Sites & WAN page.
                "table": {"gateway": "UDM Pro Max", "internet": "DIGI 10G + 5G backup", "internet_lv": None, "link": "—"},
            },
            {
                "id": "siteb", "ab": "B", "name": "Site B", "site": "b", "status": "ok", "sub": "UDM Pro SE · Mobile Vikings FTTH · 10.200.0.0/24",
                "health": [("Synology volume", 61), ("Site Magic latency", 18, "18 ms", "ok"), ("WAN usage", 22, "220 Mbps")],
                "facts": [("Gateway", "UDM Pro SE"), ("Uplink", "Mobile Vikings · single", "warn"), ("VLAN", "200"), ("Clients", "3")],
                "notes": [note("Single uplink", "Site B has no failover. If Mobile Vikings drops, the nightly Atlas → Synology replication fails until it is back.", "warn")],
                "uplinks": [item("Mobile Vikings · FTTH", "single uplink", "ACTIVE · 7 ms", "ok", "ok")],
                "devices_title": "Devices",
                "devices": [ref("udmse"), ref("synology"), ref("vlan200")],
                "rel": [("Linked sites", [ref("home", "Site Magic · 18 ms")]), ("Data flows in", [ref("atlas", "rsync nightly → atlas-offsite")])],
                "table": {"gateway": "UDM Pro SE", "internet": "Mobile Vikings · single", "internet_lv": "warn", "link": "Site Magic · 18 ms"},
            },
        ],
    }


# ---------- live ----------


async def fetch(cfg: dict) -> dict:
    """UniFi Site Manager (api.ui.com) with an API key from unifi.ui.com.

    [sitemanager]  api_key, url = "https://api.ui.com", [sitemanager.sites] "<site name>" = "<site id>"

    Site ids are what the other integrations put in their ``site`` setting ("home", "b"…).
    """
    need(cfg, "api_key")
    ids = cfg.get("sites", {})
    async with client(cfg, cfg.get("url", "https://api.ui.com"), headers={"X-API-Key": cfg["api_key"], "Accept": "application/json"}) as c:
        raw = (await get(c, "/v1/sites")).get("data", [])
    sites = []
    for s in raw:
        meta, stats = s.get("meta") or {}, s.get("statistics") or {}
        counts, isp = stats.get("counts") or {}, (stats.get("ispInfo") or {}).get("name")
        name = meta.get("desc") or meta.get("name") or s.get("siteId", "site")
        sid = ids.get(name) or ids.get(meta.get("name", "")) or slug(name)
        offline, uptime_pct = counts.get("offlineDevice", 0), (stats.get("percentages") or {}).get("wanUptime")
        sites.append({
            "id": sid if sid != "all" else "site-all", "ab": name[:4].upper(), "name": name, "site": sid, "status": "warn" if offline else "ok",
            "sub": " · ".join(x for x in (isp, meta.get("timezone")) if x) or "UniFi site",
            "health": [("WAN uptime", round(uptime_pct), f"{uptime_pct}%", "ok" if uptime_pct >= 99 else "warn")] if uptime_pct is not None else [],
            "facts": [("Devices", str(counts["totalDevice"]) if "totalDevice" in counts else None), ("Offline devices", str(offline), "warn" if offline else None),
                      ("Clients", str(counts.get("wifiClient", 0) + counts.get("wiredClient", 0)) if counts else None), ("ISP", isp)],
            "uplinks": [item(isp, "", f"{uptime_pct}% uptime" if uptime_pct is not None else "", "ok")] if isp else [],
            "table": {"gateway": meta.get("gatewayMac", ""), "internet": isp or "", "internet_lv": None, "link": "—"},
        })
    return {"sites": sites}


sitemanager = Integration("sitemanager", "UniFi Site Manager", "2 sites · Site Magic · WAN failover", "20 s", mock, fetch=fetch)
