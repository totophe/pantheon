# Pantheon

Home lab observatory: one place to see sites, hosts, guests, containers, network, edge
tunnels, power, backups and alerts, with a page for every object and the topology map as
one way of looking at them.

```
browser ──► web (Caddy: static UI, proxies /api) ──► server (FastAPI) ──► integrations
```

- **`server/`** — Python, FastAPI. Holds one module per integration, merges their datasets
  into one inventory, and serves it. Every integration has a mock dataset; all but one also
  have a live client (see "Going live").
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
| `PANTHEON_MOCK` | `all` | Which integrations serve mock data: `all`, `none`, or a comma-separated list of ids. |
| `PANTHEON_CONFIG` | `pantheon.toml` | Connection settings of the live integrations. Looked for in the data directory, then the working directory. |
| `PANTHEON_DATA_DIR` | unset | Directory for the SQLite file with Pantheon's own state. Unset keeps it in memory. The Docker image sets it to `/data`, a volume. |

Integration ids: `proxmox`, `metrics` (VictoriaMetrics), `truenas`, `nut`, `unifi`,
`sitemanager`, `docker`, `netbox`, `synology`, `homeassistant`, `ipmi`, `ovh`, `quicksrv`,
`scaleway`, `cloudflare`, `tailscale`, `llm` (Ollama / vLLM), `pihole`, `uptimekuma`.

## Going live

**The live clients have only been run against canned answers, never against the real
systems.** Expect to debug each one.

1. Copy `server/pantheon.example.toml` to `pantheon.toml` and keep the sections you want.
   An integration with a section is live; the rest keep serving mock data. Secrets can be
   written as `${NAME}` and supplied through the environment. `pantheon.toml` and `.env` are
   git-ignored.
2. Try one source on its own. This prints the dataset it produces, or the error:

   ```bash
   cd server && uv run python -m pantheon.probe proxmox
   ```

3. Start the server and open **Settings → Data sources**. Each live source shows how its
   last poll went, with the error if it failed, and a **Sync now** button. Pausing a live
   source stops polling it.
4. Set `PANTHEON_MOCK=none` to see only real data.

Things to know:

- **Ids.** An object's id is its lower-cased name (`Olympus` → `olympus`). Sources describing
  the same machine must agree on the name, or be given the id where a setting asks for one
  (Docker hosts, Home Assistant sensors, NUT loads, LLM engines).
- **Mixing mock and live.** As soon as one integration is live, the hand-made demo pages
  (topology with links, power insights, overview notes) give way to computed ones, so
  nothing invented is shown next to real data. Mock datasets still fill in the rest.
- **Not there yet for live data:** alerts (only a UPS on battery raises one), links on the
  topology map, power history, firewall rules, backup runs. Statuses use simple thresholds.
- **No live client:** Quicksrv.io has no API; its VPS would have to come in through
  node_exporter and `[metrics]`. Redfish is used for BMCs; IPMI-only boards need
  `ipmi_exporter` and `[metrics]` instead.

## API

| Endpoint | What it does |
| --- | --- |
| `GET /api/snapshot?range=24 h` | Everything the UI shows for one time range (`live`, `1 h`, `24 h`, `7 d`) |
| `GET /api/events` | Server-sent events: one message per change; the UI then fetches a new snapshot |
| `POST /api/actions/{key}` | Run an action the snapshot offers (live-migrate, run diagnostics, …) |
| `POST /api/sources/{id}/sync` | Poll one live source now |
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
| `server/src/pantheon/integrations/` | One module per integration: metadata, mock dataset, live client |
| `server/src/pantheon/poller.py`, `http.py`, `probe.py` | Polling of live sources, shared HTTP helpers, the command-line probe |
| `server/pantheon.example.toml` | Every live integration's settings, documented |
| `server/src/pantheon/inventory.py` | Merges the datasets into objects with tabs and sections |
| `server/src/pantheon/views.py` | Power breakdown and overview: hand-made for the demo lab, computed for real data |
| `server/src/pantheon/lab.py` | Topology: the demo lab's hand-placed map, and the automatic layout for real data |
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

## Adding or fixing a live client

Each client is a `fetch(cfg)` coroutine in `server/src/pantheon/integrations/`, next to the
integration's `mock`. It receives its section of `pantheon.toml` and returns the same shape
as the mock; fields it cannot know are left out and the UI omits them. A `warnings` list in
the result marks a poll as partly successful. `server/tests/test_live.py` holds a canned
answer per system: when a real answer differs, fix the client and update the canned one.

## Keyboard

- `⌘K` / `Ctrl K` opens search; `Enter` opens the first result
- `Esc` closes search and the alerts popover
