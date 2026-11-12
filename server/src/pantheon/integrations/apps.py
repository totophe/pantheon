"""Application-level sources: inference engines, DNS, the tailnet and uptime probes."""

import asyncio
import re

from ..http import ConfigError, client, describe, get, need, slug
from .base import Integration, ref


def _llm(sim):
    return {
        # Engine facts per host.
        "hosts": {
            "kronos": [("Ollama", "2 instances"), ("Models", "qwen3 · nomic-embed")],
            "delphi": [("Engine", "vLLM tensor-parallel"), ("Throughput", "38 tok/s")],
        },
        "engines": [
            {"id": "ollama-a", "host": "kronos", "kind": "ollama", "models": ["qwen3"]},
            {"id": "ollama-b", "host": "kronos", "kind": "ollama", "models": ["nomic-embed"]},
            {"id": "vllm-server", "host": "delphi", "kind": "vllm", "models": ["Qwen3 32B · AWQ"], "tokens_per_second": 38},
        ],
    }


def _pihole(sim):
    # The guest that runs Pi-hole, and the meters it adds there.
    return {"guest": "pihole", "meters": [("Queries", 18, "4.2 k/h", "ok")], "queries_per_hour": 4200, "blocked_pct": 18}


def _tailscale(sim):
    return {
        # Subnet routers, by the guest they run in.
        "routers": {"tailscale": {"facts": [("Advertises", "VLAN 1 · VLAN 30")], "rel": [("Network", [ref("vlan1"), ref("vlan30")])]}},
        "devices": 9,
        "token_expires_in_days": 6,
    }


def _uptimekuma(sim):
    # Not shown anywhere yet: no screen in the design displays probes on their own.
    return {
        "probes": [
            {"name": "plex.home.lan", "target": "apollo", "up": True, "ms": 12},
            {"name": "git.home.lan", "target": "gitea", "up": True, "ms": 9},
            {"name": "status.home.lan", "target": "monitoring", "up": True, "ms": 7},
            {"name": "k2so public HTTPS", "target": "k2so", "up": True, "ms": 38},
            {"name": "r2d2 public HTTPS", "target": "r2d2", "up": True, "ms": 31},
            {"name": "Wellmade CRM", "target": "hermes-crm", "up": True, "ms": 54},
        ],
    }


# ---------- live ----------


async def _fetch_llm(cfg: dict) -> dict:
    """Ollama and vLLM servers, asked which models they hold.

    [llm.engines.<name>]  host = "<object id>", kind = "ollama" | "vllm", url
    """
    engines = cfg.get("engines") or {}
    if not engines:
        raise ConfigError("missing setting: [llm.engines.<name>]")

    async def one(name: str, e: dict) -> dict:
        need(e, "host", "url")
        async with client(cfg, e["url"]) as c:
            if e.get("kind", "ollama") == "vllm":
                return {"id": name, "host": e["host"], "kind": "vllm", "models": [m["id"] for m in (await get(c, "/v1/models")).get("data", [])], "loaded": None}
            models = [m["name"] for m in (await get(c, "/api/tags")).get("models", [])]
            try:
                loaded = [m["name"] for m in (await get(c, "/api/ps")).get("models", [])]
            except Exception:
                loaded = None
            return {"id": name, "host": e["host"], "kind": "ollama", "models": models, "loaded": loaded}

    results = await asyncio.gather(*(one(n, e) for n, e in engines.items()), return_exceptions=True)
    failed = [f"{n}: {describe(r)}" for n, r in zip(engines, results, strict=True) if isinstance(r, BaseException)]
    good = [r for r in results if not isinstance(r, BaseException)]
    if not good:
        raise RuntimeError("no engine answered · " + " · ".join(failed))
    hosts: dict[str, list] = {}
    for host in dict.fromkeys(e["host"] for e in good):
        mine = [e for e in good if e["host"] == host]
        for kind, label in (("ollama", "Ollama"), ("vllm", "vLLM")):
            of_kind = [e for e in mine if e["kind"] == kind]
            if of_kind:
                models = list(dict.fromkeys(m for e in of_kind for m in e["models"]))
                loaded = list(dict.fromkeys(m for e in of_kind for m in e["loaded"] or []))
                hosts.setdefault(host, []).extend([(label, f"{len(of_kind)} instance{'s' if len(of_kind) > 1 else ''}"), (f"{label} models", " · ".join(models[:8]) or "none"),
                                                   *([(f"{label} loaded", " · ".join(loaded) or "none")] if kind == "ollama" and any(e["loaded"] is not None for e in of_kind) else [])])
    return {"hosts": hosts, "engines": good, **({"warnings": failed} if failed else {})}


async def _fetch_pihole(cfg: dict) -> dict:
    """Pi-hole 6 over its REST API.

    [pihole]  url, password (the web or app password), guest = "<object id of the guest that runs it>"
    """
    need(cfg, "url", "password")
    async with client(cfg, cfg["url"].rstrip("/") + "/api") as c:
        res = await c.post("/auth", json={"password": cfg["password"]})
        res.raise_for_status()
        sid = (res.json().get("session") or {}).get("sid")
        if not sid:
            raise RuntimeError("Pi-hole did not open a session: wrong password?")
        try:
            summary = await c.get("/stats/summary", headers={"X-FTL-SID": sid})
            summary.raise_for_status()
            queries = summary.json().get("queries") or {}
        finally:
            try:  # Pi-hole allows few sessions at once
                await c.delete("/auth", headers={"X-FTL-SID": sid})
            except Exception:
                pass
    total, blocked = int(queries.get("total", 0)), round(float(queries.get("percent_blocked", 0)))
    return {"guest": cfg.get("guest", "pihole"), "meters": [("Blocked", blocked, f"{blocked}% of {total} queries", "ok")], "queries_total": total, "blocked_pct": blocked}


async def _fetch_tailscale(cfg: dict) -> dict:
    """Tailscale API with an API access token.

    [tailscale]  api_key, tailnet = "-" (the token's own tailnet)
    """
    need(cfg, "api_key")
    async with client(cfg, cfg.get("url", "https://api.tailscale.com/api/v2"), headers={"Authorization": f"Bearer {cfg['api_key']}"}) as c:
        devices = (await get(c, f"/tailnet/{cfg.get('tailnet', '-')}/devices", fields="all")).get("devices", [])
    routers = {}
    for d in devices:
        routes = d.get("enabledRoutes") or []
        if routes:
            routers[slug(d.get("hostname") or d.get("name", "").split(".")[0])] = {
                "facts": [("Advertises", " · ".join(routes)), ("Tailscale IP", (d.get("addresses") or [None])[0]), ("Client", d.get("clientVersion", "").split("-")[0] or None)], "rel": []}
    outdated = sum(1 for d in devices if d.get("updateAvailable"))
    return {"routers": routers, "devices": len(devices), **({"warnings": [f"{outdated} devices have a client update available"]} if outdated else {})}


_METRIC = re.compile(r'^(monitor_status|monitor_response_time)\{(.*)\}\s+(-?[\d.eE+]+)$')


async def _fetch_uptimekuma(cfg: dict) -> dict:
    """Uptime Kuma through its Prometheus endpoint, with an API key from its settings.

    [uptimekuma]  url, api_key
    """
    need(cfg, "url", "api_key")
    async with client(cfg, auth=("", cfg["api_key"])) as c:
        res = await c.get("/metrics")
        res.raise_for_status()
    probes: dict[str, dict] = {}
    for line in res.text.splitlines():
        m = _METRIC.match(line.strip())
        if not m:
            continue
        labels = dict(re.findall(r'(\w+)="((?:[^"\\]|\\.)*)"', m.group(2)))
        p = probes.setdefault(labels.get("monitor_name", "?"), {"name": labels.get("monitor_name", "?"), "target": labels.get("monitor_url") or labels.get("monitor_hostname", ""), "up": False, "ms": 0})
        if m.group(1) == "monitor_status":
            p["up"] = float(m.group(3)) == 1
        else:
            p["ms"] = max(0, round(float(m.group(3))))
    down = [p["name"] for p in probes.values() if not p["up"]]
    return {"probes": list(probes.values()), **({"warnings": [f"down: {', '.join(down)}"]} if down else {})}


llm = Integration("llm", "Ollama / vLLM", "3 engines · loaded models · tokens/s", "15 s", _llm, fetch=_fetch_llm)
pihole = Integration("pihole", "Pi-hole", "DNS queries · local records", "30 s", _pihole, fetch=_fetch_pihole)
tailscale = Integration("tailscale", "Tailscale", "devices · subnet routes · API token expires in 6 days", "1 min", _tailscale, health="warn", fetch=_fetch_tailscale)
uptimekuma = Integration("uptimekuma", "Uptime Kuma", "22 probes · external sites", "30 s", _uptimekuma, fetch=_fetch_uptimekuma)
