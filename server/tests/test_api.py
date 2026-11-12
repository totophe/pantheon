import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pantheon.config import Settings
from pantheon.integrations import INTEGRATIONS, Integration, collect
from pantheon.main import create_app
from pantheon.poller import Poller, seconds
from pantheon.snapshot import snapshot
from pantheon.state import Prefs, Simulator, World

ALL = frozenset(i.id for i in INTEGRATIONS)


def client(mock=ALL, data_dir=None) -> TestClient:
    return TestClient(create_app(Settings(frozenset(mock), data_dir)))


def obj(snap, id):
    return next(o for o in snap["objects"] if o["id"] == id)


def test_snapshot_describes_the_demo_lab():
    with client() as c:
        snap = c.get("/api/snapshot").json()
    assert len(snap["objects"]) == 74
    assert [a["id"] for a in snap["alerts"]] == ["a1", "a2", "a3", "a4", "a5", "a6"]
    assert snap["power"]["all"]["total"] == 1431
    assert [s["id"] for s in snap["scopes"]] == ["all", "home", "b"]
    assert all(s["mode"] == "mock" for s in snap["sources"])
    assert obj(snap, "olympus")["st"] == "warn"


def test_range_changes_the_series_but_not_the_inventory():
    with client() as c:
        day, week = c.get("/api/snapshot", params={"range": "24 h"}).json(), c.get("/api/snapshot", params={"range": "7 d"}).json()
        assert c.get("/api/snapshot", params={"range": "1 y"}).status_code == 422
    assert day["power"]["all"]["bars"] != week["power"]["all"]["bars"]
    assert [o["id"] for o in day["objects"]] == [o["id"] for o in week["objects"]]


def test_an_action_changes_the_lab():
    with client() as c:
        assert c.post("/api/actions/migrate").status_code == 204
        snap = c.get("/api/snapshot").json()
        assert c.post("/api/actions/nonsense").status_code == 404
    assert obj(snap, "olympus")["st"] == "ok"
    assert obj(snap, "icarus")["host"] == "prometheus"
    assert next(a for a in snap["alerts"] if a["id"] == "a2")["state"] == "resolved"
    assert snap["changes"][0]["t"] == "now"


def test_timed_actions_start_through_the_api():
    with client() as c:
        for key in ("diag", "powercut", "replicate"):
            assert c.post(f"/api/actions/{key}").status_code == 204, key
        snap = c.get("/api/snapshot").json()
    assert snap["power"]["all"]["onBattery"] and snap["backups"]["running"]


def test_power_cut_drains_the_battery_over_time():
    async def scenario():
        world, ticks = World(), []
        sim = Simulator(world, lambda: ticks.append(world.batt))
        assert sim.run("powercut") and world.on_batt
        await asyncio.sleep(1.2)
        assert world.batt < 100 and len(ticks) >= 3
        sim.run("powercut")
        assert not world.on_batt and world.batt == 100
        sim.shutdown()

    asyncio.run(scenario())


def test_toggles_and_settings():
    with client() as c:
        assert c.post("/api/toggles/acked/a1").status_code == 204
        assert c.post("/api/toggles/off/tailscale").status_code == 204
        assert c.post("/api/toggles/accepted/apollo").status_code == 404  # only through the accept action
        assert c.post("/api/actions/accept:apollo").status_code == 204
        assert c.put("/api/settings/price", json={"value": "0,45"}).status_code == 204
        snap = c.get("/api/snapshot").json()
    assert next(a for a in snap["alerts"] if a["id"] == "a1")["state"] == "acked"
    assert next(s for s in snap["sources"] if s["id"] == "tailscale")["paused"]
    assert [d["accepted"] for d in snap["cmdb"]["drift"]] == [False, True, True, False, False]
    assert "€ 0.45" in snap["power"]["all"]["tiles"][2]["s"]


def test_pantheons_own_state_survives_a_restart(tmp_path: Path):
    with client(data_dir=tmp_path) as c:
        c.post("/api/toggles/silenced/a3")
        c.post("/api/actions/migrate")
    with client(data_dir=tmp_path) as c:
        snap = c.get("/api/snapshot").json()
    assert next(a for a in snap["alerts"] if a["id"] == "a3")["silenced"]
    assert obj(snap, "olympus")["st"] == "warn"  # the simulated lab starts over


def test_without_mock_data_there_is_nothing_to_show():
    with client(mock=()) as c:
        snap = c.get("/api/snapshot").json()
        assert c.post("/api/actions/migrate").status_code == 409
    assert snap["objects"] == [] and snap["alerts"] == [] and snap["cmdb"] is None
    assert {s["health"] for s in snap["sources"]} == {"disconnected"}
    assert {s["mode"] for s in snap["sources"]} == {"live"}
    assert [s["id"] for s in snap["scopes"]] == ["all"]


@pytest.mark.parametrize("missing", sorted(ALL))
def test_any_single_source_can_be_missing(missing):
    with client(mock=ALL - {missing}) as c:
        res = c.get("/api/snapshot")
    assert res.status_code == 200, res.text[:500]


def test_mock_setting_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("PANTHEON_MOCK", "proxmox, unifi")
    assert Settings.from_env().mock_ids == {"proxmox", "unifi"}
    monkeypatch.setenv("PANTHEON_MOCK", "none")
    assert Settings.from_env().mock_ids == set()
    monkeypatch.delenv("PANTHEON_MOCK")
    assert Settings.from_env().mock_ids == ALL
    monkeypatch.setenv("PANTHEON_MOCK", "proxmox,nope")
    with pytest.raises(ValueError, match="nope"):
        Settings.from_env()


def test_live_integrations_are_polled_and_merged():
    async def scenario():
        calls = []

        async def fetch():
            calls.append(1)
            return {"sites": [], "marker": len(calls)}

        async def broken():
            raise RuntimeError("down")

        changed = []
        sources = [
            Integration("sitemanager", "Sites", "", "1 s", lambda sim: {}, fetch=fetch),
            Integration("x", "X", "", "1 s", lambda sim: {}, fetch=broken),
            Integration("y", "No client", "", "1 s", lambda sim: {}),
        ]
        poller = Poller(sources, lambda: changed.append(1))
        poller.start()
        await asyncio.sleep(0.05)
        poller.stop()
        return poller.data, changed

    data, changed = asyncio.run(scenario())
    assert data == {"sitemanager": {"sites": [], "marker": 1}} and changed == [1]
    merged = collect(World(), {"proxmox"}, data)
    assert merged["sitemanager"]["marker"] == 1 and merged["proxmox"]["nodes"] and merged["unifi"] is None
    assert seconds("15 s") == 15 and seconds("5 min") == 300


def test_snapshot_is_pure():
    world, prefs = World(), Prefs(None)
    first = snapshot(collect(world, set(ALL), {}), set(ALL), world, prefs, "24 h")
    assert first == snapshot(collect(world, set(ALL), {}), set(ALL), world, prefs, "24 h")


def test_committed_openapi_schema_is_current():
    committed = json.loads((Path(__file__).parents[1] / "openapi.json").read_text())
    hint = "run `uv run python -m pantheon.openapi > openapi.json`, then `npm run api:types` in web/"
    assert committed == create_app(Settings(ALL, None)).openapi(), hint
