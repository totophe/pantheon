"""The live clients, fed canned answers shaped like each system's API.

These catch mistakes in our code. They cannot prove the canned answers match what the
real systems send: that is what `python -m pantheon.probe <id>` against the lab is for.
"""

import asyncio
import json

import httpx
import pytest

from pantheon import http
from pantheon.config import Settings, load_sources
from pantheon.http import ConfigError, describe
from pantheon.integrations import INTEGRATIONS
from pantheon.poller import Poller
from pantheon.schema import Snapshot
from pantheon.snapshot import snapshot
from pantheon.state import Prefs, World

BY_ID = {i.id: i for i in INTEGRATIONS}
GIB = 1024**3

# ---------- canned answers, keyed by request path ----------

PROXMOX = {
    "/api2/json/cluster/resources": {"data": [
        {"type": "node", "node": "olympus", "status": "online", "cpu": 0.38, "maxcpu": 20, "mem": 58 * GIB, "maxmem": 64 * GIB, "disk": 10 * GIB, "maxdisk": 100 * GIB, "uptime": 2_000_000},
        {"type": "qemu", "vmid": 101, "name": "Hermes", "node": "olympus", "status": "running", "cpu": 0.19, "maxcpu": 4, "mem": 7 * GIB, "maxmem": 8 * GIB, "disk": 0, "maxdisk": 64 * GIB, "uptime": 500_000},
        {"type": "lxc", "vmid": 110, "name": "pihole", "node": "olympus", "status": "stopped", "maxcpu": 1, "maxmem": GIB, "maxdisk": 8 * GIB},
        {"type": "qemu", "vmid": 900, "name": "tmpl", "node": "olympus", "status": "stopped", "template": 1},
        {"type": "storage", "storage": "local", "node": "olympus"},
    ]},
    "/api2/json/cluster/status": {"data": [{"type": "cluster", "name": "olympus-cluster", "quorate": 1, "nodes": 1}, {"type": "node", "name": "olympus", "online": 1}]},
    "/api2/json/nodes/olympus/status": {"data": {"pveversion": "pve-manager/8.2.4", "kversion": "Linux 6.8.8-2-pve #1 SMP", "cpuinfo": {"model": "i9-13900H", "cpus": 20}}},
    "/api2/json/nodes/olympus/qemu/101/config": {"data": {"net0": "virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,tag=30", "ostype": "l26", "onboot": 1, "description": "ARR stack\nmore"}},
    "/api2/json/nodes/olympus/lxc/110/config": {"data": {"net0": "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:00:01,ip=10.30.0.110/24,tag=30,type=veth"}},
    "/api2/json/cluster/backup": {"data": [{"id": "backup-1", "storage": "nexus", "schedule": "03:00", "enabled": 1}]},
}

TRUENAS = {
    "/api/v2.0/system/info": {"hostname": "alexandria.home.lan", "version": "TrueNAS-SCALE-24.10", "model": "Xeon E5-2650L v2", "cores": 20, "physmem": 128 * GIB, "uptime_seconds": 600_000, "system_product": "X9SRI-F"},
    "/api/v2.0/pool": [{"name": "Atlas", "status": "ONLINE", "healthy": True, "size": 80 * 1024 * GIB, "allocated": 65 * 1024 * GIB, "free": 15 * 1024 * GIB,
                        "scan": {"state": "FINISHED", "errors": 0}, "topology": {"data": [{"type": "RAIDZ2", "children": [{}] * 6}]}}],
    "/api/v2.0/pool/dataset": [{"name": "Atlas", "children": [{"name": "Atlas/forge", "type": "FILESYSTEM", "used": {"parsed": 9 * 1024 * GIB}}, {"name": "Atlas/chronicles", "type": "FILESYSTEM", "used": {"parsed": 41 * 1024 * GIB}}]}],
}

UNIFI = {
    "/proxy/network/api/s/default/stat/device": {"data": [
        {"name": "UDM Pro Max", "model": "UDMPROMAX", "type": "udm", "ip": "10.1.0.1", "state": 1, "version": "4.1.13", "system-stats": {"cpu": "24.1", "mem": "61.0"}, "num_sta": 63, "uptime": 90000, "upgradable": True, "upgrade_to_firmware": "4.2.0"},
        {"name": "Access switch", "model": "USW16POE", "type": "usw", "ip": "10.1.0.3", "state": 1, "port_table": [{"up": True, "poe_power": "12.50"}, {"up": False, "poe_power": "0.00"}, {"up": True, "poe_power": "9.60"}]},
    ]},
    "/proxy/network/api/s/default/rest/networkconf": {"data": [
        {"name": "WAN", "purpose": "wan"},
        {"name": "Servers", "purpose": "corporate", "vlan": 30, "ip_subnet": "10.30.0.1/24", "dhcpd_enabled": False},
        {"name": "Default", "purpose": "corporate", "ip_subnet": "10.1.0.1/24", "dhcpd_enabled": True, "dhcpd_start": "10.1.0.50", "dhcpd_stop": "10.1.0.250"},
    ]},
    "/proxy/network/api/s/default/stat/sta": {"data": [{"network": "Servers"}, {"network": "Servers"}, {"network": "Default"}]},
}

SITEMANAGER = {"/v1/sites": {"data": [
    {"siteId": "s1", "meta": {"name": "default", "desc": "Home lab", "timezone": "Europe/Brussels"}, "statistics": {"counts": {"totalDevice": 5, "offlineDevice": 0, "wifiClient": 40, "wiredClient": 23}, "ispInfo": {"name": "DIGI"}, "percentages": {"wanUptime": 100}}},
    {"siteId": "s2", "meta": {"name": "siteb", "desc": "Site B"}, "statistics": {"counts": {"totalDevice": 2, "offlineDevice": 1}, "ispInfo": {"name": "Mobile Vikings"}, "percentages": {"wanUptime": 97.5}}},
]}}

DOCKER = {"/containers/json": [{"Id": "abc", "Names": ["/sonarr"], "Image": "linuxserver/sonarr:4", "State": "restarting", "Status": "Restarting (137) 5 seconds ago"},
                               {"Id": "def", "Names": ["/radarr"], "Image": "linuxserver/radarr", "State": "running", "Status": "Up 6 days"}]}

NETBOX = {
    "/api/dcim/devices/": {"count": 2, "results": [
        {"name": "Olympus", "status": {"value": "active", "label": "Active"}, "device_type": {"model": "MS-01", "manufacturer": {"name": "Minisforum"}}, "serial": "SN123", "site": {"name": "Home", "slug": "home"},
         "rack": {"name": "R1"}, "position": 4.0, "role": {"name": "Proxmox node"}, "primary_ip": {"address": "10.30.0.11/24"}, "asset_tag": None},
        {"name": "Hyperion", "status": {"value": "planned", "label": "Planned"}, "device_type": {"model": "Custom", "manufacturer": {"name": "Gigabyte"}}, "serial": "", "site": {"name": "Home", "slug": "home"}, "role": {"name": "Proxmox node"}},
    ]},
    "/api/virtualization/virtual-machines/": {"count": 2, "results": [
        {"name": "hermes", "status": {"value": "active", "label": "Active"}, "vcpus": 4.0, "memory": 6144, "role": {"name": "ARR stack"}},
        {"name": "pihole", "status": {"value": "active", "label": "Active"}, "vcpus": 1.0, "memory": 1024, "role": None},
    ]},
    "/api/ipam/vlans/": {"count": 6}, "/api/ipam/prefixes/": {"count": 7}, "/api/ipam/ip-addresses/": {"count": 40},
}

HOMEASSISTANT = {"/api/states": [{"entity_id": "sensor.olympus_plug_power", "state": "72.4", "attributes": {"unit_of_measurement": "W"}},
                                 {"entity_id": "sensor.delphi_plug_power", "state": "0.762", "attributes": {"unit_of_measurement": "kW"}},
                                 {"entity_id": "sensor.broken", "state": "unavailable", "attributes": {}}]}

REDFISH = {
    "/redfish/v1/Chassis": {"Members": [{"@odata.id": "/redfish/v1/Chassis/1"}]},
    "/redfish/v1/Chassis/1/Power": {"PowerControl": [{"PowerConsumedWatts": 168}], "PowerSupplies": [{"Name": "PS1", "PowerCapacityWatts": 650, "Status": {"Health": "OK"}}], "Voltages": [{"Name": "12V", "ReadingVolts": 12.06}]},
    "/redfish/v1/Chassis/1/Thermal": {"Temperatures": [{"Name": "CPU Temp", "ReadingCelsius": 52, "UpperThresholdNonCritical": 75, "UpperThresholdCritical": 85}, {"Name": "absent", "ReadingCelsius": None}],
                                      "Fans": [{"Name": "FAN1", "Reading": 1100}]},
}

OVH = {"/1.0/vps": ["vps-1.ovh.net"], "/1.0/vps/vps-1.ovh.net": {"name": "vps-1.ovh.net", "displayName": "r2d2", "state": "running", "zone": "Region OpenStack: os-gra7", "vcore": 2, "memoryLimit": 4096, "model": {"name": "vps-value-2-4-80"}}}
SCALEWAY = {"/instance/v1/zones/fr-par-1/servers": {"servers": [{"name": "hermes-crm", "state": "running", "commercial_type": "DEV1-S", "public_ip": {"address": "51.15.0.1"}, "private_ip": "10.0.0.2"},
                                                               {"name": "hermes-tools", "state": "stopped", "commercial_type": "DEV1-S"}]}}
CLOUDFLARE = {"/client/v4/zones": {"result": [{"name": "418.example"}], "result_info": {"total_count": 4}},
              "/client/v4/accounts/acc/cfd_tunnel": {"result": [{"name": "olympus", "status": "healthy"}, {"name": "old", "status": "down"}]}}
TAILSCALE = {"/api/v2/tailnet/-/devices": {"devices": [{"hostname": "tailscale-sr", "addresses": ["100.64.0.5"], "enabledRoutes": ["10.1.0.0/24", "10.30.0.0/24"], "clientVersion": "1.70.0-t1", "updateAvailable": True},
                                                       {"hostname": "phone", "addresses": ["100.64.0.9"], "enabledRoutes": []}]}}
LLM = {"/api/tags": {"models": [{"name": "qwen3:latest"}, {"name": "nomic-embed-text"}]}, "/api/ps": {"models": [{"name": "qwen3:latest"}]}, "/v1/models": {"data": [{"id": "Qwen/Qwen3-32B-AWQ"}]}}
PIHOLE = {"/api/auth": {"session": {"valid": True, "sid": "S1"}}, "/api/stats/summary": {"queries": {"total": 4200, "blocked": 760, "percent_blocked": 18.1}}}
KUMA = """# HELP monitor_status Monitor Status (1 = UP, 0= DOWN)
monitor_status{monitor_name="plex",monitor_type="http",monitor_url="https://plex.home.lan",monitor_hostname="null",monitor_port="null"} 1
monitor_response_time{monitor_name="plex",monitor_type="http",monitor_url="https://plex.home.lan",monitor_hostname="null",monitor_port="null"} 12
monitor_status{monitor_name="k2so",monitor_type="http",monitor_url="https://k2so.example"} 0
"""
SYNOLOGY = {
    "SYNO.API.Auth.login": {"sid": "SID"}, "SYNO.API.Auth.logout": {},
    "SYNO.Core.System.info": {"model": "DS923+", "firmware_ver": "DSM 7.2.1", "ram_size": 4096, "sys_temp": 41, "up_time": "120:10:05"},
    "SYNO.Core.System.Utilization.get": {"cpu": {"user_load": 5, "system_load": 3}, "memory": {"real_usage": 34}},
    "SYNO.Storage.CGI.Storage.load_info": {"volumes": [{"vol_path": "/volume1", "status": "normal", "size": {"total": str(100 * GIB), "used": str(61 * GIB)}}], "disks": [{"name": "Drive 1", "temp": 34}]},
}


def _vm(path, params):
    q = params.get("query", "")
    if path.endswith("query_range"):
        return {"data": {"result": [{"metric": {"instance": "olympus:9100"}, "values": [[i, str(30 + i)] for i in range(31)]}]}}
    if q == "node_hwmon_temp_celsius":
        return {"data": {"result": [{"metric": {"instance": "olympus:9100", "chip": "platform_coretemp_0", "sensor": "temp1"}, "value": [0, "71"]}]}}
    if q == "node_hwmon_temp_crit_celsius":
        return {"data": {"result": [{"metric": {"instance": "olympus:9100", "chip": "platform_coretemp_0", "sensor": "temp1"}, "value": [0, "100"]}]}}
    if q == "node_hwmon_fan_rpm":
        return {"data": {"result": [{"metric": {"instance": "olympus:9100", "chip": "it87", "sensor": "fan1"}, "value": [0, "3200"]}]}}
    if q == "DCGM_FI_DEV_GPU_TEMP":
        return {"data": {"result": [{"metric": {"instance": "delphi:9400", "gpu": "1"}, "value": [0, "83"]}]}}
    return {"data": {"result": []}}


def _handler(request: httpx.Request) -> httpx.Response:
    path, host = request.url.path, request.url.host
    if host == "syno":
        form = dict(p.split("=", 1) for p in request.content.decode().split("&"))
        return httpx.Response(200, json={"success": True, "data": SYNOLOGY[f"{form['api']}.{form['method']}"]})
    if host == "vm":
        return httpx.Response(200, json=_vm(path, dict(request.url.params)))
    if host == "kuma":
        return httpx.Response(200, text=KUMA)
    if host == "eu.api.ovh.com" and path == "/1.0/auth/time":
        return httpx.Response(200, text="1700000000")
    if host == "eu.api.ovh.com":
        assert request.headers["X-Ovh-Signature"].startswith("$1$") and request.headers["X-Ovh-Application"] == "AK"
    if host == "broken":
        return httpx.Response(401, json={"errors": "nope"})
    tables = {"pve": PROXMOX, "nas": TRUENAS, "udm": UNIFI, "api.ui.com": SITEMANAGER, "hermes-docker": DOCKER, "netbox": NETBOX, "ha": HOMEASSISTANT, "bmc": REDFISH, "eu.api.ovh.com": OVH,
              "api.scaleway.com": SCALEWAY, "api.cloudflare.com": CLOUDFLARE, "api.tailscale.com": TAILSCALE, "ollama": LLM, "vllm": LLM, "pi": PIHOLE}
    body = tables.get(host, {}).get(path)
    return httpx.Response(200, json=body) if body is not None else httpx.Response(404, json={"path": path})


CONFIGS = {
    "proxmox": {"url": "https://pve:8006", "token_id": "pantheon@pve!ro", "token_secret": "s3cret"},
    "metrics": {"url": "http://vm:8428"},
    "truenas": {"url": "https://nas", "api_key": "k"},
    "unifi": {"url": "https://udm", "api_key": "k"},
    "sitemanager": {"api_key": "k", "sites": {"Home lab": "home", "Site B": "b"}},
    "docker": {"hosts": {"hermes": "http://hermes-docker:2375"}},
    "netbox": {"url": "https://netbox", "token": "t", "owner": "Totophe"},
    "synology": {"url": "https://syno:5001", "username": "u", "password": "p", "site": "b", "id": "synology"},
    "homeassistant": {"url": "http://ha:8123", "token": "t", "power": {"olympus": "sensor.olympus_plug_power", "delphi": "sensor.delphi_plug_power", "kronos": "sensor.broken"}},
    "ipmi": {"hosts": {"alexandria": {"url": "https://bmc", "username": "u", "password": "p"}}},
    "ovh": {"app_key": "AK", "app_secret": "AS", "consumer_key": "CK"},
    "scaleway": {"secret_key": "k"},
    "cloudflare": {"api_token": "t", "account_id": "acc"},
    "tailscale": {"api_key": "k"},
    "llm": {"engines": {"kronos-a": {"host": "kronos", "kind": "ollama", "url": "http://ollama:11434"}, "delphi": {"host": "delphi", "kind": "vllm", "url": "http://vllm:8000"}}},
    "pihole": {"url": "http://pi", "password": "p", "guest": "pihole"},
    "uptimekuma": {"url": "http://kuma:3001", "api_key": "k"},
}


@pytest.fixture(autouse=True)
def fake_network(monkeypatch):
    monkeypatch.setattr(http, "transport", httpx.MockTransport(_handler))


def run(id: str, cfg: dict | None = None) -> dict:
    return asyncio.run(BY_ID[id].fetch(cfg or CONFIGS[id]))


def build(data: dict) -> dict:
    """Build the snapshot from live datasets only and check it against the API contract."""
    snap = snapshot({i.id: data.get(i.id) for i in INTEGRATIONS}, set(), World(), Prefs(None), "24 h")
    Snapshot.model_validate(snap)
    return snap


def obj(snap, id):
    return next(o for o in snap["objects"] if o["id"] == id)


def facts(o, tab="Overview"):
    return {i["k"]: i["v"] for t in o["tabs"] if t["name"] == tab for s in t["sections"] if s["type"] == "kv" for i in s["items"]}


# ---------- one test per client ----------


def test_proxmox():
    d = run("proxmox")
    assert [n["id"] for n in d["nodes"]] == ["olympus"] and d["nodes"][0]["status"] == "warn"  # 58 of 64 GB
    assert [(g["id"], g["kind"], g["status"]) for g in d["guests"]] == [("hermes", "VM", "ok"), ("pihole", "LXC", "off")]
    hermes, pihole = d["guests"]
    assert (hermes["vlan"], hermes["mac"], hermes["nic"], hermes["role"]) == ("30", "BC:24:11:AA:BB:CC", "virtio · vmbr0", "ARR stack")
    assert pihole["ip"] == "10.30.0.110" and hermes["observed"] == {"memory_mb": 8192, "vcpus": 4}
    snap = build({"proxmox": d})
    assert obj(snap, "hermes")["host"] == "olympus" and facts(obj(snap, "olympus"))["Proxmox"] == "pve-manager/8.2.4"
    assert snap["backups"]["jobs"][0]["target"] == "nexus"


def test_victoriametrics():
    hw = run("metrics")["hosts_hardware"]
    assert hw["olympus"]["temps"] == [("coretemp_0 temp1", 71, 85, 100)] and hw["olympus"]["fans"] == [("it87 fan1", 3200)]
    assert hw["delphi"]["temps"] == [("GPU 1", 83, 83, 90)]
    assert set(hw["olympus"]["charts"]) == {"live", "1 h", "24 h", "7 d"} and len(hw["olympus"]["charts"]["24 h"][0]["values"]) == 31
    snap = build({"proxmox": run("proxmox"), "metrics": run("metrics")})
    tabs = {t["name"]: t["sections"] for t in obj(snap, "olympus")["tabs"]}
    assert [s["t"] for s in tabs["Metrics"]] == ["CPU", "Memory"] and tabs["Metrics"][0]["value"] == 60
    assert [s["type"] for s in tabs["Hardware"]] == ["temps", "fans"]


def test_truenas():
    d = run("truenas")
    assert d["host"]["id"] == "alexandria" and d["host"]["status"] == "warn"
    assert d["pools"][0]["capacity"] == [("Used", 81, "65.0 TB / 80.0 TB")]
    assert [x["t"] for x in d["pools"][0]["datasets"]] == ["chronicles", "forge"]
    snap = build({"truenas": d})
    assert obj(snap, "atlas")["st"] == "warn" and snap["storage"]["volumes"][0]["obj"] == "atlas"


def test_unifi():
    d = run("unifi")
    assert [x["id"] for x in d["devices"]] == ["udm-pro-max", "access-switch"]
    assert [(v["vid"], v["subnet"], v["gw"], v["dhcp"]) for v in d["vlans"]] == [(1, "10.1.0.0/24", "10.1.0.1", "10.1.0.50–10.1.0.250"), (30, "10.30.0.0/24", "10.30.0.1", "off")]
    assert d["updates"] == [("udm-pro-max", "Firmware 4.2.0", "UniFi")] and d["power"] == [{"id": "access-switch", "w": 22, "src": "poe"}]
    snap = build({"unifi": d})
    assert obj(snap, "vlan30")["rel"][0]["items"][0]["ref"] == "udm-pro-max"
    assert snap["power"]["all"]["total"] == 22 and snap["updates"][0]["obj"] == "udm-pro-max"


def test_sitemanager():
    d = run("sitemanager")
    assert [(s["id"], s["site"], s["status"]) for s in d["sites"]] == [("home", "home", "ok"), ("b", "b", "warn")]
    snap = build({"sitemanager": d})
    assert [s["id"] for s in snap["scopes"]] == ["all", "home", "b"] and snap["scopes"][0]["line"] == "All sites · Home lab and Site B"


def test_docker():
    d = run("docker")
    assert [(c["id"], c["guest"], c["status"]) for c in d["containers"]] == [("hermes.sonarr", "hermes", "warn"), ("hermes.radarr", "hermes", "ok")]
    with pytest.raises(RuntimeError, match="no Docker host answered"):
        run("docker", {"hosts": {"x": "http://broken"}})
    partial = run("docker", {"hosts": {"hermes": "http://hermes-docker:2375", "x": "http://broken"}})
    assert len(partial["containers"]) == 2 and partial["warnings"] == ["x: HTTP 401 from GET http://broken/containers/json"]


def test_netbox_and_drift_against_proxmox():
    d = run("netbox")
    assert d["object_count"] == "57" and [p["id"] for p in d["planned"]] == ["hyperion"]
    assert d["declared"]["hermes"] == {"memory_mb": 6144, "vcpus": 4.0}
    snap = build({"proxmox": run("proxmox"), "netbox": d})
    assert [(x["obj"], x["field"], x["declared"], x["observed"]) for x in snap["cmdb"]["drift"]] == [("hermes", "Memory", "6144 MB", "8192 MB")]
    assert facts(obj(snap, "olympus"), "Asset & CMDB")["Model"] == "Minisforum MS-01"
    assert facts(obj(snap, "hermes"), "Asset & CMDB") == {"Role": "ARR stack", "Owner": "Totophe", "Lifecycle": "Active", "Criticality": "Low"}
    assert obj(snap, "hyperion")["st"] == "plan"
    assert any(n["route"] == "drift" for n in snap["overview"]["all"]["notices"])


def test_synology():
    d = run("synology")
    assert d["host"]["meters"] == [("volume1", 61, "61 GB / 100 GB"), ("CPU", 8), ("Memory", 34)]
    assert d["host"]["hardware"]["temps"] == [("Drive 1", 34, 45, 55), ("System", 41, 60, 70)]
    assert facts(obj(build({"synology": d}), "synology"))["Uptime"] == "5 d 0 h"


def test_homeassistant():
    d = run("homeassistant")
    assert d["power"] == [{"id": "olympus", "w": 72, "src": "plug"}, {"id": "delphi", "w": 762, "src": "plug"}]
    assert d["warnings"] == ["sensor.broken has no reading"]


def test_redfish():
    d = run("ipmi")
    assert d["power"] == [{"id": "alexandria", "w": 168, "src": "ipmi"}]
    assert d["hosts_hardware"]["alexandria"] == {"temps": [("CPU Temp", 52, 75, 85)], "fans": [("FAN1", 1100)]}
    assert ("PSU PS1", "650 W · OK") in d["psu"]["alexandria"]
    snap = build({"truenas": run("truenas"), "ipmi": d})
    assert [s["type"] for t in obj(snap, "alexandria")["tabs"] if t["name"] == "Hardware" for s in t["sections"]] == ["temps", "fans", "kv"]


def test_providers():
    ovh, scw, cf = run("ovh"), run("scaleway"), run("cloudflare")
    assert [(v["id"], v["status"]) for v in ovh["vps"]] == [("r2d2", "ok")]
    assert [(v["id"], v["status"]) for v in scw["vps"]] == [("hermes-crm", "ok"), ("hermes-tools", "crit")] and scw["provider"]["status"] == "warn"
    assert cf["provider"]["sub"] == "2 tunnels · 4 zones" and cf["provider"]["status"] == "warn"
    snap = build({"ovh": ovh, "scaleway": scw, "cloudflare": cf})
    assert obj(snap, "r2d2")["prov"] == "ovh" and facts(obj(snap, "r2d2"))["Zone"] == "Region OpenStack: os-gra7"
    assert [n["id"] for n in snap["topology"]["all"]["nodes"]] == ["ovh", "scaleway", "cloudflare"]


def test_tailscale_llm_pihole_uptimekuma():
    ts, llm, pi, kuma = run("tailscale"), run("llm"), run("pihole"), run("uptimekuma")
    assert ts["routers"]["tailscale-sr"]["facts"][0] == ("Advertises", "10.1.0.0/24 · 10.30.0.0/24") and ts["devices"] == 2 and "update available" in ts["warnings"][0]
    assert llm["hosts"]["kronos"] == [("Ollama", "1 instance"), ("Ollama models", "qwen3:latest · nomic-embed-text"), ("Ollama loaded", "qwen3:latest")]
    assert llm["hosts"]["delphi"] == [("vLLM", "1 instance"), ("vLLM models", "Qwen/Qwen3-32B-AWQ")]
    assert pi["meters"] == [("Blocked", 18, "18% of 4200 queries", "ok")]
    assert kuma["probes"] == [{"name": "plex", "target": "https://plex.home.lan", "up": True, "ms": 12}, {"name": "k2so", "target": "https://k2so.example", "up": False, "ms": 0}]
    snap = build({"proxmox": run("proxmox"), "pihole": pi})
    assert [m["l"] for t in obj(snap, "pihole")["tabs"] if t["name"] == "Overview" for s in t["sections"] if s["type"] == "bars" for m in s["items"]] == ["CPU", "Blocked"]


def test_nut_over_tcp():
    answers = {
        "LIST UPS": 'BEGIN LIST UPS\nUPS rack "Rack UPS"\nEND LIST UPS\n',
        "LIST VAR rack": 'BEGIN LIST VAR rack\nVAR rack battery.charge "64"\nVAR rack battery.runtime "660"\nVAR rack ups.load "42"\nVAR rack ups.status "OB DISCHRG"\n'
                         'VAR rack ups.realpower.nominal "1000"\nVAR rack ups.model "Smart-UPS 1500"\nVAR rack input.voltage "0.0"\nEND LIST VAR rack\n',
    }

    async def scenario():
        async def upsd(reader, writer):
            while line := (await reader.readline()).decode().strip():
                if line == "LOGOUT":
                    break
                writer.write(answers.get(line, "ERR UNKNOWN-COMMAND\n").encode())
                await writer.drain()
            writer.close()

        server = await asyncio.start_server(upsd, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        async with server:
            return await BY_ID["nut"].fetch({"host": "127.0.0.1", "port": port, "ups": {"rack": {"powers": {"olympus": "group 2"}}}})

    d = asyncio.run(scenario())
    ups = d["ups"][0]
    assert (ups["id"], ups["batt"], ups["runtime"], ups["on_battery"], ups["load_w"], ups["status"]) == ("ups-rack", 64, 11, True, 420, "crit")
    assert d["alerts"][0]["title"] == "rack on battery · 64% · 11 min left"
    snap = build({"proxmox": run("proxmox"), "nut": d, "homeassistant": run("homeassistant")})
    assert obj(snap, "olympus")["rel"][-1] == {"label": "Powered by", "items": [{"ref": "ups-rack", "t": None, "s": "group 2", "r": "", "c": None, "rc": None}]}
    power = snap["power"]["all"]
    assert power["onBattery"] and [b["key"] for b in power["branches"]] == ["ups-rack"] and power["branches"][0]["rows"][0]["name"] == "olympus"
    assert [a["id"] for a in snap["alerts"]] == ["nut-ups-rack"]


# ---------- together, and the plumbing around them ----------


def test_every_client_together_builds_one_inventory():
    data = {id: run(id) for id in CONFIGS}
    snap = build(data)
    ids = [o["id"] for o in snap["objects"]]
    assert len(ids) == len(set(ids))
    assert obj(snap, "hermes.sonarr")["host"] == "hermes"
    hermes_tabs = {t["name"]: t["sections"] for t in obj(snap, "hermes")["tabs"]}
    assert [e["ref"] for e in hermes_tabs["Containers"][0]["items"]] == ["hermes.sonarr", "hermes.radarr"]
    assert {d["t"] for d in snap["overview"]["all"]["domains"]} == {"Sites & WAN", "Hosts", "Power", "Workloads", "Storage", "Network", "Edge & cloud", "Drift & CMDB"}
    assert snap["topology"]["all"]["lines"] == [] and len(snap["topology"]["all"]["nodes"]) == len([o for o in snap["objects"] if o["type"] in ("Host", "Network device", "Provider")])
    json.dumps(snap)


def test_every_integration_but_quicksrv_has_a_client():
    assert [i.id for i in INTEGRATIONS if not i.fetch] == ["quicksrv"]
    assert set(CONFIGS) | {"nut"} == {i.id for i in INTEGRATIONS if i.fetch}


@pytest.mark.parametrize("id", sorted(CONFIGS))
def test_missing_settings_are_named(id):
    with pytest.raises(ConfigError, match="missing setting"):
        run(id, {"verify_tls": True})


def test_errors_are_described_without_secrets():
    with pytest.raises(httpx.HTTPStatusError) as err:
        run("truenas", {"url": "https://broken", "api_key": "k"})
    assert describe(err.value) == "HTTP 401 from GET https://broken/api/v2.0/system/info"
    assert describe(ConfigError("missing setting: url")) == "Not configured: missing setting: url"
    assert describe(KeyError("data")) == "Unexpected answer: field 'data' is missing"


def test_poller_reports_how_each_poll_went():
    async def scenario():
        changed = []
        configs = {"truenas": {"url": "https://broken", "api_key": "k"}, "docker": {"hosts": {"hermes": "http://hermes-docker:2375", "x": "http://broken"}}, "pihole": CONFIGS["pihole"]}
        poller = Poller(INTEGRATIONS, configs, lambda: changed.append(1), paused=lambda id: id == "pihole")
        assert poller.can_poll("docker") and not poller.can_poll("proxmox")
        poller.start()
        await asyncio.sleep(0.2)
        poller.stop()
        return poller

    poller = asyncio.run(scenario())
    assert not poller.status["truenas"].ok and poller.status["truenas"].message.startswith("HTTP 401")
    assert poller.status["docker"].ok and "x: HTTP 401" in poller.status["docker"].message and "warnings" not in poller.data["docker"]
    assert "pihole" not in poller.status  # paused sources are not polled
    snap = snapshot({i.id: poller.data.get(i.id) for i in INTEGRATIONS}, set(), World(), Prefs(None), "24 h", poller=poller)
    by_id = {s["id"]: s for s in snap["sources"]}
    assert (by_id["truenas"]["health"], by_id["docker"]["health"], by_id["pihole"]["health"]) == ("error", "warn", "disconnected")
    assert by_id["docker"]["detail"].startswith("Synced 0 s ago") and by_id["pihole"]["detail"] == "Waiting for the first poll"
    assert by_id["proxmox"]["detail"] == "Not configured: add a [proxmox] section to pantheon.toml" and not by_id["proxmox"]["canSync"]
    assert by_id["quicksrv"]["detail"] == "No live client for this source yet"


def test_config_file_makes_an_integration_live(tmp_path, monkeypatch):
    cfg = tmp_path / "pantheon.toml"
    cfg.write_text('[proxmox]\nurl = "https://pve:8006"\ntoken_id = "a@pve!b"\ntoken_secret = "${PVE_SECRET}"\n\n[unifi]\nenabled = false\nurl = "x"\n\n[docker.hosts]\nhermes = "http://h:2375"\n')
    monkeypatch.setenv("PVE_SECRET", "s3cret")
    monkeypatch.setenv("PANTHEON_CONFIG", str(cfg))
    s = Settings.from_env()
    assert s.sources["proxmox"]["token_secret"] == "s3cret" and set(s.sources) == {"proxmox", "docker"}
    assert "proxmox" not in s.mock_ids and "unifi" in s.mock_ids and len(s.mock_ids) == len(INTEGRATIONS) - 2
    monkeypatch.delenv("PVE_SECRET")
    with pytest.raises(ValueError, match="PVE_SECRET"):
        Settings.from_env()
    cfg.write_text('[proxmxo]\nurl = "x"\n')
    with pytest.raises(ValueError, match="proxmxo"):
        load_sources(cfg)


def test_example_config_covers_every_client(monkeypatch):
    import re
    from pathlib import Path

    path = Path(__file__).parents[1] / "pantheon.example.toml"
    for name in re.findall(r"\$\{(\w+)\}", path.read_text()):
        monkeypatch.setenv(name, "x")
    assert set(load_sources(path)) == {i.id for i in INTEGRATIONS if i.fetch}
