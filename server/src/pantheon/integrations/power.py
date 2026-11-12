"""Power: smart plugs (Home Assistant), server BMCs (IPMI / Redfish) and UPS units (NUT)."""

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


homeassistant = Integration("homeassistant", "Home Assistant", "smart plugs · power · rack temperature", "10 s", _homeassistant)
ipmi = Integration("ipmi", "IPMI / Redfish", "alexandria BMC · fans · PSU · rails", "30 s", _ipmi)
nut = Integration("nut", "NUT · UPS", "2 UPS · load · battery · runtime", "5 s", _nut)
