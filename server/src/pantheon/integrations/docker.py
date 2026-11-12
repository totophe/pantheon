import asyncio

from ..http import ConfigError, client, describe, get, slug
from .base import Integration, item, note, ref

_RUNNING = [
    ("radarr", "hermes", "linuxserver/radarr", "612 MB"), ("lidarr", "hermes", "linuxserver/lidarr", "388 MB"), ("prowlarr", "hermes", "linuxserver/prowlarr", "201 MB"),
    ("transmission", "hermes", "linuxserver/transmission", "944 MB"), ("overseerr", "hermes", "sctx/overseerr", "256 MB"),
    ("plex", "apollo", "plexinc/pms-docker", "3.1 GB"), ("tautulli", "apollo", "tautulli/tautulli", "210 MB"), ("audiobookshelf", "apollo", "advplyr/audiobookshelf", "330 MB"), ("komga", "apollo", "gotson/komga", "640 MB"),
    ("gitea-app", "gitea", "gitea/gitea:1.22", "640 MB"), ("act-runner", "gitea", "gitea/act_runner", "120 MB"), ("caddy-proxy", "caddy", "lucaslorentz/caddy-docker-proxy", "90 MB"),
    ("victoriametrics", "monitoring", "victoriametrics/victoria-metrics", "1.4 GB"), ("vmagent", "monitoring", "victoriametrics/vmagent", "310 MB"), ("uptime-kuma", "monitoring", "louislam/uptime-kuma", "160 MB"), ("pantheon", "monitoring", "pantheon/server", "240 MB"),
    ("ollama-a", "kronos", "ollama/ollama", "6.2 GB"), ("ollama-b", "kronos", "ollama/ollama", "4.8 GB"), ("vllm-server", "vllm", "vllm/vllm-openai", "22 GB"),
]


def mock(sim):
    S = sim.sonarr_fixed
    sonarr = {
        "id": "sonarr", "name": "sonarr", "guest": "hermes", "image": "linuxserver/sonarr:4", "status": "ok" if S else "warn",
        "mem": "820 MB / 1.5 GB" if S else "1.0 GB / 1 GB", "up": "up 1 min" if S else "restarting (OOM ×3)",
        "restart": "unless-stopped", "cpu": 3, "memp": 55 if S else 100, "memt": "55%" if S else "100% · OOM",
        "notes": [] if S else [note("OOM-killed after update", "Exit code 137 three times in an hour since Watchtower pulled a new image. The new version needs more than the 1 GB limit.", "warn", ("Raise limit to 1.5 GB & restart", "sonarr"))],
        "events": [item("Restarted with 1.5 GB limit", "Pantheon action", "just now", "ok")] if S else [item("OOM-killed (137)", "docker", "10:42", "warn"), item("OOM-killed (137)", "docker", "10:21", "warn"), item("Image updated", "watchtower", "09:58", "info")],
        "rel": [("Service", [ref("svc-media")])],
    }
    running = [
        {"id": id, "name": id.replace("-app", "").replace("caddy-proxy", "caddy-docker-proxy"), "guest": guest, "image": image, "status": "ok", "mem": mem,
         "up": "up " + ("6 d" if guest == "hermes" else "23 d"), "restart": "unless-stopped", "cpu": 3, "memp": 40, "events": [item("Healthy", "healthcheck", "1 min ago", "ok")]}
        for id, guest, image, mem in _RUNNING
    ]
    return {
        "containers": [sonarr, *running],
        "alerts": [
            {"id": "a5", "sev": "warn", "title": "sonarr restarting (OOM)", "where": "hermes · sonarr", "when": "40 min", "obj": "sonarr", "resolved": S, "domain": "Workloads", "action": "Fix"},
            {"id": "a6", "sev": "info", "title": "3 container image updates", "where": "prometheus", "when": "1 d", "obj": "prometheus", "resolved": False, "domain": "Updates", "action": "Review"},
        ],
        "updates": [("prometheus", "3 container images", "Docker")],
        "changes": [{"t": "10:58", "k": "Workloads", "x": "Watchtower updated 4 images in hermes"}],
    }


# ---------- live ----------

_STATE = {"running": "ok", "restarting": "warn", "paused": "warn"}


async def fetch(cfg: dict) -> dict:
    """Docker Engine API on each host, reached through a read-only socket proxy.

    [docker.hosts]  "<guest or host id>" = "http://10.30.0.102:2375"
    """
    hosts = cfg.get("hosts") or {}
    if not hosts:
        raise ConfigError("missing setting: [docker.hosts]")

    async def one(host: str, url: str) -> list[dict]:
        async with client(cfg, url) as c:
            raw = await get(c, "/containers/json", all="true")
        out = []
        for ct in raw:
            name = (ct.get("Names") or ["/?"])[0].lstrip("/")
            state = ct.get("State", "")
            out.append({"id": f"{host}.{slug(name)}", "name": name, "guest": host, "image": ct.get("Image", ""), "status": _STATE.get(state, "off"), "up": ct.get("Status") or state,
                        "events": [item(state or "unknown", "docker", ct.get("Status", ""), "ok" if state == "running" else "warn")]})
        return out

    results = await asyncio.gather(*(one(h, u) for h, u in hosts.items()), return_exceptions=True)
    failed = [f"{h}: {describe(r)}" for h, r in zip(hosts, results, strict=True) if isinstance(r, BaseException)]
    if len(failed) == len(hosts):
        raise RuntimeError("no Docker host answered · " + " · ".join(failed))
    return {"containers": [c for r in results if not isinstance(r, BaseException) for c in r], **({"warnings": failed} if failed else {})}


docker = Integration("docker", "Docker agents", "9 hosts · containers · images · restarts", "15 s", mock, fetch=fetch)
