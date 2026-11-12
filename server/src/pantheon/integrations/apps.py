"""Application-level sources: inference engines, DNS, the tailnet and uptime probes."""

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


llm = Integration("llm", "Ollama / vLLM", "3 engines · loaded models · tokens/s", "15 s", _llm)
pihole = Integration("pihole", "Pi-hole", "DNS queries · local records", "30 s", _pihole)
tailscale = Integration("tailscale", "Tailscale", "devices · subnet routes · API token expires in 6 days", "1 min", _tailscale, health="warn")
uptimekuma = Integration("uptimekuma", "Uptime Kuma", "22 probes · external sites", "30 s", _uptimekuma)
