"""Power: smart plugs (Home Assistant), server BMCs (IPMI / Redfish) and UPS units (NUT)."""

import asyncio

from ..http import ConfigError, client, describe, get, need, slug
from .base import Integration, item, ref


def _homeassistant(sim):
    return {
        "power": [
            {"id": "olympus", "w": 60 if sim.mem_fixed else 72, "src": "plug"},
            {"id": "prometheus", "w": 118 if sim.mem_fixed else 96, "src": "plug"},
            {"id": "delphi", "w": 0 if sim.on_batt else (642 if sim.cap else 762), "src": "gpu"},
            {"id": "kronos", "w": 0 if sim.on_batt else 142, "src": "plug"},
        ],
        "psu": {
            "olympus": [("Supply", "External 280 W adapter"), ("Telemetry", "none · no PMBus", "mute"), ("At the wall", "72 W · Home Assistant plug"), ("Headroom", "~74%")],
            "delphi": [("PSU", "ATX · [MODEL] · 1600 W"), ("Load", "762 W · 48%"), ("Peak (7 d)", "1 140 W · 71%", "warn"), ("Transients", "each 3090 spikes to ~650 W"), ("Efficiency (est.)", "~92%")],
            "prometheus": [("PSU", "ATX · [MODEL] · 550 W"), ("Load", "96 W · 17%"), ("Telemetry", "smart plug only", "mute")],
            "kronos": [("PSU", "Dell 685 W (OEM)"), ("Load", "142 W · 21%"), ("Telemetry", "iDRAC-less · smart plug", "mute")],
        },
    }


def _ipmi(sim):
    return {
        "power": [{"id": "alexandria", "w": 168, "src": "ipmi"}],
        "psu": {"alexandria": [("PSU", "ATX · [MODEL] · 650 W"), ("Load", "168 W · 26%"), ("Temperature", "38 °C (IPMI)"), ("Rails 12 / 5 / 3.3 V", "12.06 / 5.02 / 3.31 V"), ("Efficiency (est.)", "~90%")]},
    }


def _nut(sim):
    on = sim.on_batt
    batt = sim.batt if on else 100
    runtime = max(1, round(18 * batt / 100))
    trig50, trig5 = on and batt <= 50, on and runtime <= 5
    return {
        "ups": [
            {
                "id": "ups-home", "name": "ups-rack", "site": "home", "status": "crit" if on else "ok", "sub": "Home lab · [MODEL] 1500 VA / 1000 W · NUT on alexandria",
                "batt": batt, "runtime": runtime, "on_battery": on, "load_w": 420,
                "meters": [("Battery", batt, f"{batt}%", "crit" if batt <= 50 else ("warn" if batt <= 80 else "ok")), ("Load", 42, "420 / 1000 W"),
                           ("Runtime at this load", round(runtime / 18 * 100), f"{runtime} min", "crit" if runtime <= 5 else ("warn" if runtime <= 10 else "ok"))],
                "facts": [("State", "ON BATTERY" if on else "On line", "crit" if on else "ok"), ("Input", "0 V · mains lost" if on else "231 V · 50 Hz", "crit" if on else None), ("Output", "230 V"), ("Last self-test", "Sun 03:30 · passed"), ("Battery installed", "[DATE]"), ("Driver", "NUT usbhid-ups")],
                "protects": [ref("udm", "group 1 · stays up to the end"), ref("agg", "group 1 · stays up to the end"), ref("prometheus", "group 2 · off at 50%"), ref("olympus", "group 2 · off at 5 min left"), ref("alexandria", "group 3 · last, at 3 min left")],
                "policy": [
                    item("At 50% battery", "prometheus: guests stop, then host powers off", "triggered" if trig50 else "armed", "warn" if trig50 else "ok", "warn" if trig50 else "mute"),
                    item("5 min of runtime left", "olympus: guests shut down in order, then host", "triggered" if trig5 else "armed", "crit" if trig5 else "ok", "crit" if trig5 else "mute"),
                    item("3 min of runtime left", "alexandria: NFS clients gone, pool export, power off", "armed", "ok", "mute"),
                    item("Mains back", 'BIOS "restore on AC" + Proxmox start-at-boot order', "armed", "ok", "mute"),
                ],
                "events": [*([item("Mains lost · on battery", "NUT", "just now", "crit")] if on else []), item("Self-test passed", "NUT", "Sun 03:30", "ok"), item("Brownout · 2 s on battery", "NUT", "12 Oct", "warn")],
                "rel": [("Site", [ref("home")]), ("Monitored by", [ref("alexandria", "NUT server · USB")]), ("Not protected", [ref("delphi", "wall power"), ref("kronos", "wall power")])],
                # Things an operator can do to this UPS: (label when idle, label when on battery, action key).
                "actions": [("Simulate power cut", "Restore mains", "powercut")],
                # Label of the link from each powered object back to this UPS.
                "powered_by": {"olympus": "group 2", "alexandria": "group 3 · NUT server", "prometheus": "group 2", "udm": "group 1", "agg": "group 1"},
                # Shutdown group shown on each protected host's Hardware tab.
                "power_path": {"olympus": "group 2 · off at 5 min left", "alexandria": "group 3 · last off · NUT server", "prometheus": "group 2 · off at 50%"},
            },
            {
                "id": "ups-b", "name": "ups-siteb", "site": "b", "status": "ok", "sub": "Site B · [MODEL] 600 VA · USB to Synology",
                "batt": 100, "runtime": 42, "on_battery": False, "load_w": 62,
                "meters": [("Battery", 100), ("Load", 18, "62 W"), ("Runtime at this load", 100, "42 min", "ok")],
                "facts": [("State", "On line", "ok"), ("Input", "229 V · 50 Hz"), ("Driver", "Synology DSM UPS server")],
                "protects": [ref("synology", "safe mode at 10% battery"), ref("udmse", "stays up")],
                "rel": [("Site", [ref("siteb")])],
                "powered_by": {"synology": "USB", "udmse": ""},
                "power_path": {"synology": "USB · DSM safe mode at 10%"},
            },
        ],
        "alerts": [{"id": "a0", "sev": "crit", "title": f"Home lab on battery · {batt}% · {runtime} min left", "where": "ups-rack", "when": "just now", "obj": "ups-home", "resolved": False, "domain": "Power", "action": "Open UPS"}] if on else [],
    }


# ---------- live ----------


async def _fetch_homeassistant(cfg: dict) -> dict:
    """Home Assistant over its REST API with a long-lived access token.

    [homeassistant]  url, token, [homeassistant.power] "<object id>" = "sensor.some_plug_power"
    """
    need(cfg, "url", "token")
    sensors = cfg.get("power") or {}
    if not sensors:
        raise ConfigError("missing setting: [homeassistant.power]")
    async with client(cfg, cfg["url"].rstrip("/") + "/api", headers={"Authorization": f"Bearer {cfg['token']}"}) as c:
        states = {s["entity_id"]: s for s in await get(c, "/states")}
    power, psu, missing = [], {}, []
    for obj, entity in sensors.items():
        state = states.get(entity)
        try:
            watts = float(state["state"]) * (1000 if state["attributes"].get("unit_of_measurement") == "kW" else 1)
        except (TypeError, KeyError, ValueError):
            missing.append(f"{entity} has no reading")
            continue
        power.append({"id": obj, "w": round(watts), "src": "plug"})
        psu[obj] = [("At the wall", f"{round(watts)} W · Home Assistant"), ("Sensor", entity)]
    return {"power": power, "psu": psu, **({"warnings": missing} if missing else {})}


async def _fetch_redfish(cfg: dict) -> dict:
    """Server BMCs that speak Redfish: power draw, PSUs, temperatures and fans.

    [ipmi.hosts.<object id>]  url, username, password, verify_tls = false

    Boards with IPMI only (no Redfish) cannot be read this way; export them with ipmi_exporter and use [metrics].
    """
    hosts = cfg.get("hosts") or {}
    if not hosts:
        raise ConfigError("missing setting: [ipmi.hosts.<object id>]")

    async def one(obj: str, h: dict) -> dict:
        need(h, "url", "username", "password")
        async with client({"verify_tls": False, **h}, h["url"].rstrip("/"), auth=(h["username"], h["password"])) as c:
            chassis = (await get(c, "/redfish/v1/Chassis"))["Members"][0]["@odata.id"].rstrip("/")
            pw = await get(c, f"{chassis}/Power")
            try:
                th = await get(c, f"{chassis}/Thermal")
            except Exception:
                th = {}
        watts = next((p.get("PowerConsumedWatts") for p in pw.get("PowerControl", []) if p.get("PowerConsumedWatts") is not None), None)
        supplies = [("PSU " + str(p.get("Name", i + 1)), " · ".join(x for x in (f"{p['PowerCapacityWatts']} W" if p.get("PowerCapacityWatts") else None, (p.get("Status") or {}).get("Health")) if x) or None)
                    for i, p in enumerate(pw.get("PowerSupplies", []))]
        rails = [(v.get("Name", "Rail"), f"{v['ReadingVolts']} V") for v in pw.get("Voltages", []) if v.get("ReadingVolts") is not None][:6]
        temps = [(t.get("Name", "Sensor"), round(t["ReadingCelsius"]), round(t.get("UpperThresholdNonCritical") or (t.get("UpperThresholdCritical") or 95) - 10), round(t.get("UpperThresholdCritical") or 95))
                 for t in th.get("Temperatures", []) if t.get("ReadingCelsius") is not None]
        fans = [(f.get("Name") or f.get("FanName", "Fan"), round(f["Reading"])) for f in th.get("Fans", []) if f.get("Reading") is not None]
        return {"id": obj, "watts": watts, "psu": [("Load", f"{round(watts)} W" if watts is not None else None), *supplies, *rails], "hw": {**({"temps": temps} if temps else {}), **({"fans": fans} if fans else {})}}

    results = await asyncio.gather(*(one(o, h) for o, h in hosts.items()), return_exceptions=True)
    failed = [f"{o}: {describe(r)}" for o, r in zip(hosts, results, strict=True) if isinstance(r, BaseException)]
    good = [r for r in results if not isinstance(r, BaseException)]
    if not good:
        raise RuntimeError("no BMC answered · " + " · ".join(failed))
    return {
        "power": [{"id": r["id"], "w": round(r["watts"]), "src": "ipmi"} for r in good if r["watts"] is not None],
        "psu": {r["id"]: r["psu"] for r in good},
        "hosts_hardware": {r["id"]: r["hw"] for r in good if r["hw"]},
        **({"warnings": failed} if failed else {}),
    }


async def _nut_list(reader, writer, command: str) -> list[list[str]]:
    """Send one LIST command to upsd and return its rows, each split into words with quotes removed."""
    writer.write(command.encode() + b"\n")
    await writer.drain()
    rows = []
    while True:
        line = (await asyncio.wait_for(reader.readline(), 10)).decode(errors="replace").strip()
        if not line or line.startswith("ERR"):
            raise RuntimeError(f"upsd answered {line or 'nothing'!r} to {command!r}")
        if line.startswith("END LIST"):
            return rows
        if not line.startswith("BEGIN LIST"):
            head, _, quoted = line.partition('"')
            rows.append([*head.split(), quoted.rstrip('"')])


async def _fetch_nut(cfg: dict) -> dict:
    """Network UPS Tools: asks upsd (port 3493) for every UPS it knows.

    [nut]  host, port = 3493, site = "home"
    [nut.ups.<ups name>]  site, [nut.ups.<ups name>.powers] "<object id>" = "shutdown group or note"
    """
    need(cfg, "host")
    reader, writer = await asyncio.wait_for(asyncio.open_connection(cfg["host"], int(cfg.get("port", 3493))), cfg.get("timeout", 10))
    try:
        names = [(row[1], row[-1]) for row in await _nut_list(reader, writer, "LIST UPS")]
        variables = {name: {row[2]: row[-1] for row in await _nut_list(reader, writer, f"LIST VAR {name}")} for name, _ in names}
        writer.write(b"LOGOUT\n")
    finally:
        writer.close()

    def num(v: dict, key: str) -> float | None:
        try:
            return float(v[key])
        except (KeyError, ValueError):
            return None

    units, alerts = [], []
    for name, desc in names:
        v, own = variables[name], (cfg.get("ups") or {}).get(name, {})
        flags = v.get("ups.status", "").split()
        on_batt, low = "OB" in flags, "LB" in flags
        batt, load = round(num(v, "battery.charge") or 0), num(v, "ups.load")
        runtime = round((num(v, "battery.runtime") or 0) / 60)
        nominal = num(v, "ups.realpower.nominal")
        watts = num(v, "ups.realpower") or (load * nominal / 100 if load is not None and nominal else None)
        uid, powers = f"ups-{slug(name)}", own.get("powers") or {}
        units.append({
            "id": uid, "name": name, "site": own.get("site", cfg.get("site", "home")), "status": "crit" if on_batt or low else "ok",
            "sub": " · ".join(x for x in (v.get("ups.mfr"), v.get("ups.model") or desc, f"{nominal:.0f} W" if nominal else None) if x) or "UPS",
            "batt": batt, "runtime": runtime, "on_battery": on_batt, "load_w": round(watts) if watts is not None else 0,
            "meters": [("Battery", batt, f"{batt}%", "crit" if batt <= 50 else ("warn" if batt <= 80 else "ok")),
                       *([("Load", round(load), f"{round(watts)} / {nominal:.0f} W" if watts is not None and nominal else f"{load:.0f}%")] if load is not None else [])],
            "facts": [("State", "ON BATTERY" if on_batt else ("On line" if "OL" in flags else v.get("ups.status")), "crit" if on_batt else "ok"), ("Runtime", f"{runtime} min" if runtime else None),
                      ("Input", f"{v['input.voltage']} V" if v.get("input.voltage") else None), ("Output", f"{v['output.voltage']} V" if v.get("output.voltage") else None),
                      ("Last self-test", v.get("ups.test.result")), ("Battery date", v.get("battery.mfr.date") or v.get("battery.date")), ("Driver", v.get("driver.name"))],
            "protects": [ref(obj, label) for obj, label in powers.items()],
            "rel": [],
            "powered_by": dict(powers), "power_path": dict(powers),
        })
        if on_batt:
            alerts.append({"id": f"nut-{uid}", "sev": "crit", "title": f"{name} on battery · {batt}% · {runtime} min left", "where": name, "when": "now", "obj": uid, "resolved": False, "domain": "Power", "action": "Open UPS"})
    return {"ups": units, "alerts": alerts}


homeassistant = Integration("homeassistant", "Home Assistant", "smart plugs · power · rack temperature", "10 s", _homeassistant, fetch=_fetch_homeassistant)
ipmi = Integration("ipmi", "IPMI / Redfish", "alexandria BMC · fans · PSU · rails", "30 s", _ipmi, fetch=_fetch_redfish)
nut = Integration("nut", "NUT · UPS", "2 UPS · load · battery · runtime", "5 s", _nut, fetch=_fetch_nut)
