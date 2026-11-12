"""What the server remembers: the simulated world, Pantheon's own settings, and who is listening."""

from __future__ import annotations

import asyncio
import json
import sqlite3
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass
class World:
    """State of the demo lab that the mock actions change. In memory only: a restart resets it."""

    mem_fixed: bool = False
    k2so_fixed: bool = False
    sonarr_fixed: bool = False
    on_batt: bool = False
    batt: int = 100
    cap: bool = False
    rep: str = "idle"  # idle | running | done
    pct: int = 0
    diag: str = "idle"  # idle | running | done
    step: int = -1


class Simulator:
    """Mock actions. Each one changes the world, some over time, the way the real action would."""

    def __init__(self, world: World, changed: Callable[[], None]):
        self.world, self._changed = world, changed
        self._tasks: dict[str, asyncio.Task] = {}

    def run(self, key: str) -> bool:
        w = self.world
        if key == "migrate":
            w.mem_fixed = True
        elif key == "sonarr":
            w.sonarr_fixed = True
        elif key == "fixk2so":
            w.k2so_fixed = True
        elif key == "cap":
            w.cap = not w.cap
        elif key == "diag":
            self._start("diag", self._diagnose())
        elif key == "powercut":
            self._stop("powercut")
            w.on_batt, w.batt = not w.on_batt, 100
            if w.on_batt:
                self._start("powercut", self._drain())
        elif key == "replicate":
            if w.rep != "running":
                w.rep, w.pct = "running", 0
                self._start("replicate", self._replicate())
        else:
            return False
        self._changed()
        return True

    def _stop(self, name: str) -> None:
        task = self._tasks.pop(name, None)
        if task:
            task.cancel()

    def _start(self, name: str, coro) -> None:
        self._stop(name)
        self._tasks[name] = asyncio.create_task(coro)

    def shutdown(self) -> None:
        for name in list(self._tasks):
            self._stop(name)

    async def _diagnose(self) -> None:
        for i in range(6):
            self.world.diag, self.world.step = ("running" if i < 5 else "done"), i
            self._changed()
            if i < 5:
                await asyncio.sleep(0.65)

    async def _drain(self) -> None:
        while self.world.batt > 24:
            await asyncio.sleep(0.5)
            self.world.batt = max(24, self.world.batt - 2)
            self._changed()

    async def _replicate(self) -> None:
        while self.world.pct < 100:
            await asyncio.sleep(0.14)
            self.world.pct = min(100, self.world.pct + 5)
            if self.world.pct == 100:
                self.world.rep = "done"
            self._changed()


#: Flags a person can flip, by group.
TOGGLES = ("acked", "silenced", "accepted", "off", "sched", "notif")
CHANNELS = [("ntfy", "ntfy · phone push", "critical + warning"), ("email", "Email · daily digest", "all"), ("quiet", "Quiet hours 23:00–07:00", "critical still pushes"), ("slack", "Slack · #homelab", "critical only")]
_DEFAULTS = {"notif": {"ntfy": True, "email": True, "quiet": True, "slack": False}, "price": "0.30"}


class Prefs:
    """Pantheon's own state (acknowledged alerts, paused sources, tariff…), kept in SQLite."""

    def __init__(self, path: Path | None):
        self._db = sqlite3.connect(path or ":memory:", check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self._data = {**{g: {} for g in TOGGLES}, **json.loads(json.dumps(_DEFAULTS))}
        for key, value in self._db.execute("SELECT key, value FROM prefs"):
            self._data[key] = json.loads(value)

    def group(self, name: str) -> dict[str, bool]:
        return self._data[name]

    @property
    def price(self) -> str:
        return self._data["price"]

    def toggle(self, group: str, key: str) -> None:
        self._data[group][key] = not self._data[group].get(key, False)
        self._save(group)

    def set(self, key: str, value) -> None:
        self._data[key] = value
        self._save(key)

    def _save(self, key: str) -> None:
        with self._db:
            self._db.execute("INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(self._data[key])))


class Hub:
    """Tells connected browsers that something changed, so they fetch a fresh snapshot."""

    def __init__(self) -> None:
        self.version = 0
        self._subscribers: set[asyncio.Queue[int]] = set()

    def publish(self) -> None:
        self.version += 1
        for q in self._subscribers:
            q.put_nowait(self.version)

    async def stream(self, keepalive: float = 15) -> AsyncIterator[str]:
        q: asyncio.Queue[int] = asyncio.Queue()
        self._subscribers.add(q)
        try:
            yield f"data: {self.version}\n\n"
            while True:
                try:
                    version = await asyncio.wait_for(q.get(), keepalive)
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                while not q.empty():  # several changes at once need only one refresh
                    version = q.get_nowait()
                yield f"data: {version}\n\n"
        finally:
            self._subscribers.discard(q)
