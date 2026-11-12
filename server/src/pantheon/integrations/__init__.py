"""Every planned integration, and the datasets they deliver."""

from __future__ import annotations

from typing import Any

from .apps import llm, pihole, tailscale, uptimekuma
from .base import Dataset, Integration
from .docker import docker
from .edge import cloudflare, ovh, quicksrv, scaleway
from .netbox import netbox
from .power import homeassistant, ipmi, nut
from .proxmox import proxmox
from .sitemanager import sitemanager
from .synology import synology
from .truenas import truenas
from .unifi import unifi
from .victoriametrics import victoriametrics

#: The order is the order of the Data sources page, and the order in which
#: alerts, updates and power readings from different sources are merged.
INTEGRATIONS: list[Integration] = [
    proxmox, victoriametrics, truenas, nut, unifi, sitemanager, docker, netbox, synology,
    homeassistant, ipmi, ovh, quicksrv, scaleway, cloudflare, tailscale, llm, pihole, uptimekuma,
]

Datasets = dict[str, Dataset | None]


def collect(sim: Any, mock_ids: set[str], live: Datasets) -> Datasets:
    """One dataset per integration: its mock if it runs in mock mode, else whatever its live client delivered."""
    return {i.id: i.mock(sim) if i.id in mock_ids else live.get(i.id) for i in INTEGRATIONS}


__all__ = ["INTEGRATIONS", "Datasets", "Integration", "collect"]
