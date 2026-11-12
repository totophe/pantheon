"""Building blocks shared by every integration.

An integration turns one outside system (Proxmox, UniFi, NetBox…) into a
*dataset*: a plain dict in Pantheon's own vocabulary. Small tuples keep the
datasets readable:

    meter   (label, percent[, text[, level]])
    fact    (key, value[, level])
    temp    (label, °C, warn threshold, critical threshold)
    fan     (label, rpm)
    chart   (title, base, amplitude, unit, warn threshold or 0, seed)

Levels are "ok" | "warn" | "crit" | "info" | "mute" | "text". Statuses are
"ok" | "warn" | "crit" | "plan" | "off".
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

Dataset = dict[str, Any]


def ref(obj: str, s: str = "", r: str = "", rc: str | None = None) -> dict:
    """A list row that points at another object."""
    return {"ref": obj, "t": None, "s": s, "r": r, "c": None, "rc": rc}


def item(t: str, s: str = "", r: str = "", c: str | None = None, rc: str | None = None) -> dict:
    """A free-text list row."""
    return {"ref": None, "t": t, "s": s, "r": r, "c": c, "rc": rc}


def note(t: str, text: str, tone: str | None = None, action: tuple[str, str] | None = None) -> dict:
    return {"t": t, "text": text, "tone": tone, "action": action}


@dataclass(frozen=True)
class Integration:
    id: str
    name: str
    #: What it covers, shown on the Data sources page.
    covers: str
    #: Polling interval.
    sync: str
    #: The demo dataset. It receives the simulated world so mock actions show up in the data.
    mock: Callable[[Any], Dataset]
    #: Health of the mock connection.
    health: str = "ok"
    #: Live client: given the integration's section of pantheon.toml, returns the same shape as ``mock``.
    fetch: Callable[[dict], Awaitable[Dataset]] | None = None
