"""Keeps the datasets of live integrations fresh, and remembers how each poll went."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

from .http import describe
from .integrations import Datasets, Integration

log = logging.getLogger("pantheon.poller")
_UNITS = {"s": 1, "min": 60, "h": 3600}
#: Live sources are never polled more often than this, whatever interval the integration advertises.
MIN_INTERVAL = 10.0


def seconds(sync: str) -> float:
    """"15 s" → 15, "5 min" → 300."""
    amount, unit = sync.split()
    return float(amount) * _UNITS[unit]


@dataclass
class Status:
    ok: bool
    at: float
    ms: int
    #: Why it failed, or what was only partly read.
    message: str | None = None


class Poller:
    """One task per live integration that has a client and a config section; each polls on its own interval."""

    def __init__(self, integrations: list[Integration], configs: dict[str, dict], changed: Callable[[], None], paused: Callable[[str], bool] = lambda _: False):
        self.data: Datasets = {}
        self.status: dict[str, Status] = {}
        self._configs = configs
        self._integrations = {i.id: i for i in integrations if i.fetch and i.id in configs}
        self._changed, self._paused = changed, paused
        self._tasks: list[asyncio.Task] = []

    def can_poll(self, id: str) -> bool:
        return id in self._integrations

    def start(self) -> None:
        self._tasks = [asyncio.create_task(self._loop(i)) for i in self._integrations.values()]

    def stop(self) -> None:
        for task in self._tasks:
            task.cancel()

    async def refresh(self, id: str) -> Status:
        """Poll one integration now."""
        integration = self._integrations[id]
        started = time.monotonic()
        try:
            data = await integration.fetch(self._configs[id])
        except asyncio.CancelledError:
            raise
        except Exception as err:
            # Keep the last good dataset: a source that hiccups should not empty the UI.
            log.exception("%s did not answer", integration.name)
            status = Status(False, time.time(), round((time.monotonic() - started) * 1000), describe(err))
        else:
            warnings = data.pop("warnings", None)
            self.data[id] = data
            status = Status(True, time.time(), round((time.monotonic() - started) * 1000), " · ".join(warnings) if warnings else None)
        self.status[id] = status
        self._changed()
        return status

    async def _loop(self, integration: Integration) -> None:
        interval = max(MIN_INTERVAL, float(self._configs[integration.id].get("interval") or seconds(integration.sync)))
        while True:
            if not self._paused(integration.id):
                await self.refresh(integration.id)
            await asyncio.sleep(interval)
