"""Configuration: environment variables, plus pantheon.toml for the live integrations."""

from __future__ import annotations

import os
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .integrations import INTEGRATIONS


@dataclass(frozen=True)
class Settings:
    #: Integrations that serve their mock dataset. The others are live.
    mock_ids: frozenset[str]
    #: Where the SQLite file lives; None keeps Pantheon's own state in memory.
    data_dir: Path | None
    #: Connection settings of the live integrations, by integration id.
    sources: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> Settings:
        """
        PANTHEON_MOCK    "all" (default), "none", or a comma-separated list of integration ids.
        PANTHEON_CONFIG  path of pantheon.toml. Default: pantheon.toml in the data directory, then in the working directory.
        PANTHEON_DATA_DIR

        An integration with a section in pantheon.toml is live, whatever PANTHEON_MOCK says.
        """
        known = {i.id for i in INTEGRATIONS}
        raw = os.environ.get("PANTHEON_MOCK", "all").strip().lower()
        if raw == "all":
            ids = set(known)
        elif raw in ("none", ""):
            ids = set()
        else:
            ids = {part.strip() for part in raw.split(",") if part.strip()}
            _check(ids, known, "PANTHEON_MOCK")
        data_dir = Path(os.environ["PANTHEON_DATA_DIR"]) if os.environ.get("PANTHEON_DATA_DIR") else None

        explicit = os.environ.get("PANTHEON_CONFIG")
        candidates = [Path(explicit)] if explicit else [*([data_dir / "pantheon.toml"] if data_dir else []), Path("pantheon.toml")]
        path = next((p for p in candidates if p.is_file()), None)
        if explicit and not path:
            raise ValueError(f"PANTHEON_CONFIG points to {explicit}, which does not exist")
        sources = load_sources(path) if path else {}
        return cls(frozenset(ids - set(sources)), data_dir, sources)


def _check(ids: set[str], known: set[str], where: str) -> None:
    unknown = ids - known
    if unknown:
        raise ValueError(f"{where} names unknown integrations: {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")


def load_sources(path: Path) -> dict[str, dict]:
    """Read pantheon.toml: one table per live integration. ``${NAME}`` is replaced by that environment variable."""
    with path.open("rb") as f:
        doc = tomllib.load(f)
    _check(set(doc), {i.id for i in INTEGRATIONS}, str(path))
    return {id: _expand(cfg, f"[{id}]") for id, cfg in doc.items() if isinstance(cfg, dict) and cfg.get("enabled", True)}


def _expand(value: Any, where: str) -> Any:
    if isinstance(value, dict):
        return {k: _expand(v, where) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand(v, where) for v in value]
    if isinstance(value, str):
        def env(m: re.Match) -> str:
            if m.group(1) not in os.environ:
                raise ValueError(f"{where} in pantheon.toml uses ${{{m.group(1)}}}, but that environment variable is not set")
            return os.environ[m.group(1)]
        return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", env, value)
    return value
