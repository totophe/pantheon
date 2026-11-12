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


sitemanager = Integration("sitemanager", "UniFi Site Manager", "2 sites · Site Magic · WAN failover", "20 s", mock)
