"""Configuration, read from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .integrations import INTEGRATIONS


@dataclass(frozen=True)
class Settings:
    #: Integrations that serve their mock dataset. The others are live.
    mock_ids: frozenset[str]
    #: Where the SQLite file lives; None keeps Pantheon's own state in memory.
    data_dir: Path | None

    @classmethod
    def from_env(cls) -> Settings:
        """PANTHEON_MOCK = "all" (default), "none", or a comma-separated list of integration ids."""
        known = {i.id for i in INTEGRATIONS}
        raw = os.environ.get("PANTHEON_MOCK", "all").strip().lower()
        if raw == "all":
            ids = known
        elif raw in ("none", ""):
            ids = set()
        else:
            ids = {part.strip() for part in raw.split(",") if part.strip()}
            unknown = ids - known
            if unknown:
                raise ValueError(f"PANTHEON_MOCK names unknown integrations: {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")
        data_dir = os.environ.get("PANTHEON_DATA_DIR")
        return cls(frozenset(ids), Path(data_dir) if data_dir else None)
