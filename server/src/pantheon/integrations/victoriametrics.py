from .base import Integration, item, note


def T(k, label, x, y, w, h, t, warn, thr, sensor, *, vert=False, note=None):
    return {"k": k, "kind": "temp", "label": label, "x": x, "y": y, "w": w, "h": h, "t": t, "warn": warn, "thr": thr, "sensor": sensor, "vert": vert, "note": note}


def F(k, label, x, y, s, rpm, max_rpm, sensor):
    return {"k": k, "kind": "fan", "label": label, "x": x, "y": y, "s": s, "rpm": rpm, "max": max_rpm, "sensor": sensor}


def mock(sim):
    M = sim.mem_fixed
    return {
        # Charts, sensors and thermal layout per host (node_exporter, DCGM, smartctl, ipmi_exporter).
        "hosts": {
            "olympus": {
                "charts": [("CPU", 38, 8, "%", 0, 1), ("Memory", 73 if M else 91, 1.5, "%", 90, 2), ("Network", 1.8, 0.6, " Gbps", 0, 3), ("Package temp", 71, 3, " °C", 90, 4)],
                "temps": [("CPU package", 71, 90, 100), ("P-cores (hottest)", 78, 90, 100), ("E-cores", 66, 90, 100), ("DDR5 SO-DIMM", 54, 75, 85), ("NVMe 1 · local-nvme", 52, 65, 75), ("X710 SFP+", 58, 80, 90)],
                "fans": [("CPU blower", 3200), ("SSD fan", 2600)],
                "drives": [item("NVMe 1 · local-nvme", "9 120 h", "PASSED · 52 °C"), item("NVMe 2", "9 118 h", "PASSED · 48 °C"), item("NVMe 3 · boot", "9 118 h", "PASSED · 45 °C")],
                "layout": {"chassis": "Minisforum MS-01", "default": "pcore", "comps": [
                    F("fcpu", "CPU blower", 60, 90, 76, 3200, 5200, "it87 fan1"), T("cpu", "CPU package · i9-13900H", 190, 40, 170, 120, 71, 90, 100, "coretemp Package"),
                    T("pcore", "P-cores (hottest)", 190, 168, 82, 46, 78, 90, 100, "coretemp Core 8", note="P-cores burst to ~90 °C during builds; the MS-01 throttles at 100 °C."), T("ecore", "E-cores", 278, 168, 82, 46, 66, 90, 100, "coretemp Core 16–23"),
                    T("ram", "DDR5", 380, 40, 60, 174, 54, 75, 85, "spd5118", vert=True), T("vrm", "VRM", 470, 40, 120, 50, 63, 90, 105, "acpitz zone2"),
                    T("nvme1", "M.2 1 · local-nvme", 40, 250, 150, 30, 52, 65, 75, "nvme0"), T("nvme2", "M.2 2", 40, 288, 150, 30, 48, 65, 75, "nvme1"), T("nvme3", "M.2 3 · boot", 40, 326, 150, 30, 45, 65, 75, "nvme2"),
                    T("nic", "X710 · 2× SFP+", 220, 262, 220, 40, 58, 80, 90, "ethtool -m"), F("fssd", "SSD fan", 480, 260, 54, 2600, 4000, "it87 fan2")]},
            },
            "prometheus": {
                "charts": [("CPU", 22, 6, "%", 0, 5), ("GPU", 41, 12, "%", 0, 6)],
                "temps": [("CPU package", 54, 85, 100), ("RTX A2000", 61, 83, 90), ("NVMe", 44, 65, 75)],
                "fans": [("CPU", 1100), ("Case", 900)],
            },
            "kronos": {
                "temps": [("CPU 0", 48, 80, 90), ("CPU 1", 51, 80, 90), ("RTX 5060 Ti", 58, 83, 90)],
                "fans": [("Front", 800), ("Rear", 850)],
            },
            "delphi": {
                "charts": [("GPU 1 temp", 83, 2, " °C", 83, 7), ("Tokens/s", 38, 6, "", 0, 8)],
                "temps": [("GPU 0 core", 76, 83, 90), ("GPU 0 VRAM junction", 92, 100, 110), ("GPU 1 core", 83, 83, 90), ("GPU 1 VRAM junction", 101, 100, 110), ("CPU", 58, 85, 100), ("NVMe", 49, 65, 75)],
                "temps_wide": True,
                "fans": [("GPU 0", 1950), ("GPU 1", 2400), ("Front", 1400), ("Rear", 1300)],
                "notes": [note("GPU 1 memory at 101 °C", "GPU 1 breathes air already heated by GPU 0. GDDR6X throttles near 110 °C; sustained 100 °C+ shortens its life. A riser to space the cards or a 300 W power cap usually costs under 5% tokens/s.", "warn")],
                "layout": {"chassis": "Tower · 2× RTX 3090", "default": "g1mem", "comps": [
                    F("ff1", "Front fan 1", 12, 70, 52, 1400, 2000, "nct6798 fan2"), F("ff2", "Front fan 2", 12, 200, 52, 1400, 2000, "nct6798 fan3"),
                    T("cpu", "CPU · i5-13500T", 350, 22, 120, 80, 58, 85, 100, "coretemp"), T("ram", "RAM", 480, 22, 40, 80, 46, 75, 85, "spd5118", vert=True), T("nvme", "M.2", 350, 108, 120, 22, 49, 65, 75, "nvme0"),
                    T("g0", "PCIe 1 · GPU 0 · RTX 3090", 200, 140, 340, 64, 76, 83, 90, "DCGM gpu0"), T("g0mem", "GPU 0 · VRAM junction", 200, 208, 340, 20, 92, 100, 110, "DCGM MEMORY_TEMP gpu0"),
                    T("g1", "PCIe 2 · GPU 1 · RTX 3090", 200, 246, 340, 64, 83, 83, 90, "DCGM gpu1", note="GPU 1 breathes air already heated by GPU 0. A riser to space the cards or a 300 W cap usually costs under 5% tokens/s."),
                    T("g1mem", "GPU 1 · VRAM junction", 200, 314, 340, 20, 101, 100, 110, "DCGM MEMORY_TEMP gpu1", note="GDDR6X throttles near 110 °C; sustained 100 °C+ shortens its life. Repadding is the usual fix."),
                    T("psu", "PSU · 762 W", 40, 300, 130, 56, 44, 55, 65, "smart plug + PSU sensor"),
                    F("gf0", "GPU 0 fans", 430, 157, 30, 1950, 3000, "DCGM fan gpu0"), F("gf1", "GPU 1 fans", 430, 263, 30, 2400, 3000, "DCGM fan gpu1"), F("fr", "Rear fan", 572, 40, 54, 1300, 2000, "nct6798 fan1")]},
            },
            "alexandria": {
                "charts": [("Pool used", 82, 0.5, "%", 80, 9), ("NFS throughput", 640, 180, " MB/s", 0, 10)],
                "temps": [("Exos bay 1", 36, 45, 55), ("Exos bay 2", 37, 45, 55), ("Exos bay 3", 39, 45, 55), ("Exos bay 4", 46, 45, 55), ("Exos bay 5", 38, 45, 55), ("Exos bay 6", 36, 45, 55), ("CPU", 52, 75, 85), ("HBA · LSI", 61, 70, 80), ("Optane", 44, 65, 70)],
                "temps_wide": True,
                "fans": [("FAN1 CPU", 1100), ("FAN2 front", 900), ("FAN3 front", 900), ("FAN4 rear", 1000)],
                "fans_title": "Fans · IPMI Standard",
                "layout": {"chassis": "Thermaltake tower · X9SRI-F", "default": "d4", "comps": [
                    F("fan2", "FAN2 · front", 12, 70, 52, 900, 1800, "IPMI FAN2"), F("fan3", "FAN3 · front", 12, 230, 52, 900, 1800, "IPMI FAN3"),
                    T("d1", "Exos · bay 1", 80, 24, 130, 46, 36, 45, 55, "smartctl sda"), T("d2", "Exos · bay 2", 80, 76, 130, 46, 37, 45, 55, "smartctl sdb"), T("d3", "Exos · bay 3", 80, 128, 130, 46, 39, 45, 55, "smartctl sdc"),
                    T("d4", "Exos · bay 4", 80, 180, 130, 46, 46, 45, 55, "smartctl sdd", note="Bay 4 sits in the dead zone between the two front fans and runs ~8 °C hotter than its neighbours. The planned CSE-836 fan wall fixes this."),
                    T("d5", "Exos · bay 5", 80, 232, 130, 46, 38, 45, 55, "smartctl sde"), T("d6", "Exos · bay 6", 80, 284, 130, 46, 36, 45, 55, "smartctl sdf"),
                    T("psu", "PSU · 168 W", 236, 18, 100, 56, 38, 50, 60, "IPMI PSU temp"),
                    T("dimma", "A", 352, 30, 28, 110, 41, 70, 80, "IPMI DIMM A~D", vert=True), T("cpu", "CPU · E5-2650L v2", 388, 30, 130, 110, 52, 75, 85, "IPMI CPU (PECI)"),
                    F("fan1", "FAN1 · CPU", 462, 52, 46, 1100, 2200, "IPMI FAN1"), T("dimmb", "B", 526, 30, 28, 110, 40, 70, 80, "IPMI DIMM E~H", vert=True),
                    T("pch", "PCH", 420, 162, 80, 46, 48, 80, 90, "IPMI PCH"),
                    T("hba", "PCIe 1 · HBA LSI SAS2308", 236, 236, 290, 30, 61, 70, 80, "mpt temp", note="HBAs have no fan and rely on case airflow. 61 °C is normal; keep it under 70."),
                    T("nic", "PCIe 2 · 10GbE NIC", 236, 274, 290, 30, 55, 80, 90, "ethtool -m"), T("optane", "PCIe 3 · Optane P4800X", 236, 312, 290, 30, 44, 65, 70, "nvme smart-log"),
                    F("fan4", "FAN4 · rear", 572, 60, 54, 1000, 2000, "IPMI FAN4")]},
            },
        },
        "alerts": [{"id": "a3", "sev": "warn", "title": "Delphi GPU 1 VRAM at 101 °C", "where": "delphi", "when": "6 min", "obj": "delphi", "resolved": False, "domain": "Hardware", "action": "Sensors", "tab": "Hardware"}],
    }


victoriametrics = Integration("metrics", "VictoriaMetrics", "node_exporter · DCGM · smartctl · cAdvisor", "15 s", mock)
