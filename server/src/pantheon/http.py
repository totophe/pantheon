"""Shared plumbing for the live clients: HTTP sessions, config checks, small formatters."""

from __future__ import annotations

import re
from typing import Any

import httpx

#: Tests replace this with an ``httpx.MockTransport`` so no client touches the network.
transport: httpx.AsyncBaseTransport | None = None


class ConfigError(Exception):
    """The integration's section in pantheon.toml is missing something."""


def need(cfg: dict, *keys: str) -> None:
    missing = [k for k in keys if not cfg.get(k)]
    if missing:
        raise ConfigError("missing setting" + ("s" if len(missing) > 1 else "") + ": " + ", ".join(missing))


def client(cfg: dict, base_url: str | None = None, **kwargs: Any) -> httpx.AsyncClient:
    """An HTTP session for one poll. ``verify_tls = false`` in the config accepts self-signed certificates."""
    return httpx.AsyncClient(
        base_url=(base_url or cfg["url"]).rstrip("/"), verify=cfg.get("verify_tls", True), timeout=cfg.get("timeout", 10.0),
        transport=transport, follow_redirects=True, **kwargs)


async def get(c: httpx.AsyncClient, path: str, **params: Any) -> Any:
    res = await c.get(path, params=params or None)
    res.raise_for_status()
    return res.json()


def describe(err: BaseException) -> str:
    """One line a person can act on, without query strings (they may carry credentials)."""
    if isinstance(err, httpx.HTTPStatusError):
        return f"HTTP {err.response.status_code} from {err.request.method} {err.request.url.copy_with(query=None)}"
    if isinstance(err, httpx.RequestError):
        try:
            where = f" ({err.request.url.copy_with(query=None)})"
        except RuntimeError:  # no request attached
            where = ""
        return f"{type(err).__name__}: {err or 'no answer'}{where}"
    if isinstance(err, ConfigError):
        return f"Not configured: {err}"
    if isinstance(err, KeyError):
        return f"Unexpected answer: field {err} is missing"
    return f"{type(err).__name__}: {err}"[:300]


def slug(name: str) -> str:
    """Object ids are lower-case names, so sources that name the same machine agree on its id."""
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")


def pct(used: float, total: float) -> int:
    return round(used / total * 100) if total else 0


def gb(n: float) -> str:
    v = n / 1024**3
    return f"{v / 1024:.1f} TB" if v >= 1024 else (f"{v:.0f} GB" if v >= 10 else f"{v:.1f} GB")


def uptime(seconds: float) -> str:
    d, rest = divmod(int(seconds), 86400)
    return f"{d} d {rest // 3600} h" if d else f"{rest // 3600} h {rest % 3600 // 60} min"
