# Pantheon

Home lab observatory: one place to see sites, hosts, guests, containers, network, edge
tunnels, power, backups and alerts, with a page for every object and the topology map as
one way of looking at them.

```
browser ──► web (Caddy: static UI, proxies /api) ──► server (FastAPI) ──► integrations
```

- **`server/`** — Python, FastAPI. Holds one module per integration, merges their datasets
  into one inventory, and serves it. Every integration currently delivers a mock dataset;
  none has a live client yet.
- **`web/`** — React + TypeScript (Vite). Renders what the API returns. It knows nothing
  about integrations or whether their data is mock or live.

## Run it

With Docker:

```bash
docker compose up --build
```

Then open http://localhost:8080 (set `PANTHEON_PORT` to change the port).

For development, run the two halves side by side. The server:

```bash
cd server && uv run uvicorn pantheon.main:app --reload --port 8000
```

The frontend, which proxies `/api` to port 8000 (set `PANTHEON_API` to point elsewhere):

```bash
cd web && npm install && npm run dev
```

## Configuration

Environment variables of the server:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PANTHEON_MOCK` | `all` | Which integrations serve mock data: `all`, `none`, or a comma-separated list of ids such as `proxmox,unifi`. The others are live. |
| `PANTHEON_DATA_DIR` | unset | Directory for the SQLite file with Pantheon's own state. Unset keeps it in memory. The Docker image sets it to `/data`, a volume. |

Integration ids: `proxmox`, `metrics` (VictoriaMetrics), `truenas`, `nut`, `unifi`,
`sitemanager`, `docker`, `netbox`, `synology`, `homeassistant`, `ipmi`, `ovh`, `quicksrv`,
`scaleway`, `cloudflare`, `tailscale`, `llm` (Ollama / vLLM), `pihole`, `uptimekuma`.

A live integration with no client delivers nothing, so its part of the inventory is simply
absent and Data sources shows it as "Not connected". With `PANTHEON_MOCK=none` the app is empty.

## API

| Endpoint | What it does |
| --- | --- |
| `GET /api/snapshot?range=24 h` | Everything the UI shows for one time range (`live`, `1 h`, `24 h`, `7 d`) |
| `GET /api/events` | Server-sent events: one message per change; the UI then fetches a new snapshot |
| `POST /api/actions/{key}` | Run an action the snapshot offers (live-migrate, run diagnostics, …) |
| `POST /api/toggles/{group}/{key}` | Flip one of Pantheon's own flags: `acked`, `silenced`, `off`, `sched`, `notif` |
| `PUT /api/settings/price` | Electricity tariff |
| `GET /api/health` | Liveness |

Interactive docs are at `/docs` on the server.

**Actions are simulated.** They change an in-memory model of the demo lab (reset on restart)
and never reach real infrastructure. Pantheon's own state (acknowledged alerts, paused
sources, accepted drift, schedules, notification channels, tariff) is stored in SQLite.

## Layout

| Path | What it is |
| --- | --- |
| `server/src/pantheon/integrations/` | One module per integration: metadata, mock dataset, slot for the live client |
| `server/src/pantheon/inventory.py` | Merges the datasets into objects with tabs and sections |
| `server/src/pantheon/views.py` | Power breakdown and overview, computed from the inventory |
| `server/src/pantheon/lab.py` | What is specific to this lab: the hand-placed topology and scope captions |
| `server/src/pantheon/snapshot.py` | Assembles the API response |
| `server/src/pantheon/state.py` | Simulated lab, SQLite-backed settings, change notifications |
| `server/src/pantheon/schema.py` | The API contract (Pydantic models) |
| `server/src/pantheon/main.py` | The FastAPI app |
| `web/src/api/` | API client and the types generated from the server's schema |
| `web/src/model/store.ts` | UI state (mirrored to the URL hash) plus the latest snapshot |
| `web/src/model/buildView.js` | Turns snapshot + UI state into what the pages render: colours, sizes, tables |
| `web/src/pages/`, `web/src/components/` | Overview, Topology, Power, the generic list page and object page, and the shell |

## Checks

```bash
cd server && uv run pytest && uv run ruff check .
```

```bash
cd web && npm run build
```

## Changing the API

The frontend's types are generated from the server's models. After changing
`server/src/pantheon/schema.py`:

```bash
cd server && uv run python -m pantheon.openapi > openapi.json
```

```bash
cd web && npm run api:types
```

A server test fails if `openapi.json` is out of date.

## Adding a live integration

Give the integration a `fetch` coroutine in `server/src/pantheon/integrations/` that returns
the same shape as its `mock`, and leave its id out of `PANTHEON_MOCK`. The server polls it
on the integration's interval and merges the result; the frontend needs no change.

## Keyboard

- `⌘K` / `Ctrl K` opens search; `Enter` opens the first result
- `Esc` closes search and the alerts popover
