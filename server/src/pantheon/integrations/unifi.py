import ipaddress

from ..http import client, get, need, slug, uptime
from .base import Integration, item, ref


def _firmware():
    return [item("Firmware check", "up to date", "Sun", "ok")]


def mock(sim):
    return {
        "devices": [
            {"id": "udm", "name": "UDM Pro Max", "site": "home", "sub": "Home gateway · firewall · 10.1.0.1", "events": _firmware(),
             "facts": [("VLANs", "6 active · 2 planned"), ("Clients", "63"), ("IDS events (24 h)", "2"), ("Site Magic", "Site B · up")],
             "meters": [("CPU", 24), ("Memory", 61), ("WAN", 51, "5.1 / 10 Gbps")],
             "rel": [("Site", [ref("home")]), ("Downstream", [ref("agg"), ref("access")])]},
            {"id": "agg", "name": "USW-Aggregation", "site": "home", "sub": "10 GbE core · 8× SFP+", "events": _firmware(),
             "facts": [("Ports up", "5 / 8"), ("Errors (24 h)", "0"), ("Temp", "48 °C")],
             "meters": [("Peak port load", 34)],
             "rel": [("Upstream", [ref("udm")]), ("Connected", [ref("olympus", "port 3"), ref("prometheus", "port 4"), ref("kronos", "port 5"), ref("delphi", "port 6"), ref("alexandria", "port 7")])]},
            {"id": "access", "name": "Access switch", "site": "home", "sub": "1 GbE · PoE · clients & Pis", "events": _firmware(),
             "facts": [("Sparta", "online"), ("hestia-rpi", "Pi-hole secondary"), ("office-hifi", "AirPlay · idle"), ("Other clients", "11")],
             "meters": [("PoE budget", 22, "22 / 100 W")],
             "rel": [("Upstream", [ref("udm")])]},
            {"id": "udmse", "name": "UDM Pro SE", "site": "b", "sub": "Site B gateway · 16-port PoE", "events": _firmware(),
             "facts": [("VLAN", "200"), ("Clients", "3"), ("Site Magic", "Home lab · 18 ms")],
             "meters": [("CPU", 11), ("Memory", 47), ("PoE budget", 8, "15 / 180 W")],
             "rel": [("Site", [ref("siteb")]), ("Connected", [ref("synology")])]},
        ],
        "vlans": [
            {"vid": 1, "name": "Mgmt", "site": "home", "gateway": "udm", "subnet": "10.1.0.0/24", "zone": "Internal", "members": [ref("udm"), ref("agg"), ref("access"), ref("tailscale")]},
            {"vid": 10, "name": "Home", "site": "home", "gateway": "udm", "subnet": "10.10.0.0/24", "zone": "Trusted", "dhcp": ".50–.250",
             "members": [item("Sparta", ".20"), item("office-hifi", ".31"), item("hestia-rpi", ".53"), item("+38 clients", "phones, TVs, IoT", "", "mute")],
             "policy": [item("Servers · VLAN 30", "tcp 443, 32400, 53", "ports", "warn"), item("DMZ · VLAN 95", "tcp 443", "ports", "warn")]},
            {"vid": 30, "name": "Servers", "site": "home", "gateway": "udm", "subnet": "10.30.0.0/24", "zone": "Servers",
             "members": [ref("olympus"), ref("prometheus"), ref("kronos"), ref("delphi"), ref("alexandria"), ref("apollo"), ref("hermes"), ref("pihole"), ref("caddy")],
             "policy": [item("DMZ · VLAN 95", "allow", "allow", "ok"), item("Site B · VLAN 200", "rsync 873 · ssh 22", "ports", "warn")]},
            {"vid": 70, "name": "Customers", "site": "home", "gateway": "udm", "subnet": "10.70.0.0/24", "zone": "Isolated",
             "members": [ref("hephaestus", "4 devcontainers"), ref("chopper", "edge tunnel")],
             "policy": [item("Servers · VLAN 30", "gitea 443 · postgres 5432", "ports", "warn")]},
            {"vid": 95, "name": "DMZ", "site": "home", "gateway": "udm", "subnet": "10.95.0.0/24", "zone": "DMZ",
             "members": [ref("caddy", "eth1 · .10"), ref("r2d2", "edge tunnel")],
             "policy": [item("Servers · VLAN 30", "caddy → upstream ports", "ports", "warn")]},
            {"vid": 200, "name": "Site B LAN", "site": "b", "gateway": "udmse", "subnet": "10.200.0.0/24", "zone": "Remote", "dhcp": ".100–.199",
             "members": [ref("synology", ".10"), ref("udmse", ".1"), item("1 client", "", "", "ok")]},
        ],
        # The WireGuard peers terminate on the UDM, so the stale-handshake alert comes from here.
        "alerts": [{"id": "a1", "sev": "crit", "title": "k2so WireGuard handshake stale", "where": "k2so · Quicksrv.io", "when": "14 min", "obj": "k2so", "resolved": sim.k2so_fixed, "domain": "Edge & cloud", "action": "Diagnose"}],
        "updates": [("udm", "UniFi OS firmware", "UniFi")],
        "power": [{"id": "access", "w": 0 if sim.on_batt else 30, "src": "poe"}],
    }


# ---------- live ----------

_GATEWAYS = ("ugw", "udm", "uxg")


async def fetch(cfg: dict) -> dict:
    """UniFi Network on a UniFi OS console, with an API key created in the console's settings.

    [unifi]  url, api_key, unifi_site = "default", site = "home", verify_tls = true
    """
    need(cfg, "url", "api_key")
    site = cfg.get("site", "home")
    base = f"{cfg['url'].rstrip('/')}/proxy/network/api/s/{cfg.get('unifi_site', 'default')}"
    async with client(cfg, base, headers={"X-API-KEY": cfg["api_key"], "Accept": "application/json"}) as c:
        raw_devices = (await get(c, "/stat/device"))["data"]
        networks = (await get(c, "/rest/networkconf"))["data"]
        try:
            clients = (await get(c, "/stat/sta"))["data"]
        except Exception:
            clients = []

    devices, updates, power = [], [], []
    for d in raw_devices:
        did = slug(d.get("name") or d.get("mac", "device"))
        up = d.get("state") == 1
        stats = d.get("system-stats") or {}
        ports = d.get("port_table") or []
        poe = sum(float(p.get("poe_power") or 0) for p in ports)
        devices.append({
            "id": did, "name": d.get("name") or d.get("model", "device"), "site": site, "status": "ok" if up else "crit",
            "sub": " · ".join(x for x in (d.get("model"), d.get("ip")) if x),
            "meters": [*([("CPU", round(float(stats["cpu"])))] if stats.get("cpu") else []), *([("Memory", round(float(stats["mem"])))] if stats.get("mem") else [])],
            "facts": [("Model", d.get("model")), ("Address", d.get("ip")), ("Firmware", d.get("version")), ("Clients", str(d["num_sta"]) if "num_sta" in d else None),
                      ("Ports up", f"{sum(1 for p in ports if p.get('up'))} / {len(ports)}" if ports else None), ("PoE draw", f"{poe:.0f} W" if poe else None),
                      ("Temperature", f"{d['general_temperature']} °C" if d.get("general_temperature") else None), ("Uptime", uptime(d["uptime"]) if d.get("uptime") else None)],
            "events": [item("Connected" if up else "Offline", "UniFi", "", "ok" if up else "crit")],
            "rel": [],
        })
        if d.get("upgradable"):
            updates.append((did, f"Firmware {d.get('upgrade_to_firmware', 'update')}", "UniFi"))
        if poe >= 1:
            power.append({"id": did, "w": round(poe), "src": "poe"})

    gateway = next((slug(d.get("name") or d.get("mac", "")) for d in raw_devices if d.get("type") in _GATEWAYS), None)
    per_network: dict[str, int] = {}
    for cl in clients:
        per_network[cl.get("network", "")] = per_network.get(cl.get("network", ""), 0) + 1
    vlans = []
    for n in networks:
        if n.get("purpose") == "wan" or not n.get("ip_subnet"):
            continue
        iface = ipaddress.ip_interface(n["ip_subnet"])
        count = per_network.get(n.get("name", ""), 0)
        vlans.append({
            "vid": int(n.get("vlan") or 1), "name": n.get("name", ""), "site": site, "gateway": gateway, "subnet": str(iface.network), "gw": str(iface.ip), "zone": n.get("purpose", ""),
            "dhcp": f"{n.get('dhcpd_start', '')}–{n.get('dhcpd_stop', '')}" if n.get("dhcpd_enabled") else "off",
            "members": [item(f"{count} client{'s' if count != 1 else ''}", "connected now", "", "mute")] if count else [],
            "policy": [],
        })
    return {"devices": devices, "vlans": sorted(vlans, key=lambda v: v["vid"]), "updates": updates, "power": power}


unifi = Integration("unifi", "UniFi Network", "topology · ports · clients · VLANs · WAN", "5 s", mock, fetch=fetch)
