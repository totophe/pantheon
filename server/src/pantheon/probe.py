"""Run one live integration once and print what it returns.

    uv run python -m pantheon.probe proxmox

Reads the same configuration as the server (pantheon.toml, PANTHEON_CONFIG). Use it to
debug a client without starting the server: the output is the dataset the inventory is built from.
"""

from __future__ import annotations

import asyncio
import json
import sys
import traceback

from .config import Settings
from .http import describe
from .integrations import INTEGRATIONS


def main(argv: list[str]) -> int:
    by_id = {i.id: i for i in INTEGRATIONS}
    if len(argv) != 1 or argv[0] not in by_id:
        print(f"usage: python -m pantheon.probe <integration>\nintegrations: {', '.join(by_id)}", file=sys.stderr)
        return 2
    integration, settings = by_id[argv[0]], Settings.from_env()
    if not integration.fetch:
        print(f"{integration.name} has no live client.", file=sys.stderr)
        return 1
    if integration.id not in settings.sources:
        print(f"No [{integration.id}] section in pantheon.toml.", file=sys.stderr)
        return 1
    try:
        data = asyncio.run(integration.fetch(settings.sources[integration.id]))
    except Exception as err:
        traceback.print_exc()
        print(f"\n{integration.name}: {describe(err)}", file=sys.stderr)
        return 1
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False, default=str)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
