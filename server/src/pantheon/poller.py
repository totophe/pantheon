"""Keeps the datasets of live integrations fresh."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from .integrations import Datasets, Integration

log = logging.getLogger("pantheon.poller")
_UNITS = {"s": 1, "min": 60, "h": 3600}


def seconds(sync: str) -> float:
    """"15 s" → 15, "5 min" → 300."""
    amount, unit = sync.split()
    return float(amount) * _UNITS[unit]


class Poller:
    """One task per live integration that has a client; each polls on its own interval."""

    def __init__(self, integrations: list[Integration], changed: Callable[[], None]):
        self.data: Datasets = {}
        self._integrations = [i for i in integrations if i.fetch]
        self._changed = changed
        self._tasks: list[asyncio.Task] = []

    def start(self) -> None:
        self._tasks = [asyncio.create_task(self._poll(i)) for i in self._integrations]

    def stop(self) -> None:
        for task in self._tasks:
            task.cancel()

    async def _poll(self, integration: Integration) -> None:
        while True:
            try:
                self.data[integration.id] = await integration.fetch()
                self._changed()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Keep the last good dataset: a source that hiccups should not empty the UI.
                log.exception("%s did not answer", integration.name)
            await asyncio.sleep(seconds(integration.sync))
