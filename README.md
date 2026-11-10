# Pantheon

Home lab observatory: one place to see sites, hosts, guests, containers, network, edge
tunnels, power, backups and alerts, with a page for every object and the topology map as
one way of looking at them.

This repository currently holds the web UI, built from the "Pantheon — full working mockup"
design. Every planned integration has a mock dataset, and a global **Mock data** switch
chooses between those and live sources. No live client is written yet, so with the switch
off the app is empty.

## Run it

```bash
npm install
```

```bash
npm run dev
```

`npm run build` type-checks and produces a static bundle in `dist/`.

## Layout

| Path | What it is |
| --- | --- |
| `src/App.tsx` | Shell: top bar, sidebar, breadcrumbs, page switch, command palette |
| `src/components/` | Shell pieces and shared UI primitives (`ui.tsx`) |
| `src/pages/` | Overview, Topology, Power, the generic list page and the generic object page |
| `src/model/store.ts` | UI state, mirrored to the URL hash (`#/hosts`, `#/o/olympus/Hardware`); holds the data mode |
| `src/model/buildView.js` | Builds one inventory from the integrations' datasets, then the view model the pages render |
| `src/model/types.ts` | Types for the UI state and the view model |
| `src/integrations/` | One module per integration: its metadata, its mock dataset, and the slot for its live client |
| `src/styles.css` | Design tokens and all styles |

Every list page (Hosts, Storage, Alerts, Drift…) is the same `ListPage` fed different tables,
and every object (site, host, VM, container, VLAN, VPS, UPS, service…) is the same `ObjectPage`
fed different tabs and cards. Adding a new kind of object is a data change, not a new screen.

## Keyboard

- `⌘K` / `Ctrl K` opens search; `Enter` opens the first result
- `Esc` closes search and the alerts popover

## Data: mock or live

The **Mock data** switch in the top bar (also on Settings → Data sources) is global and is
remembered in the browser. `VITE_DATA_MODE=live` makes live the default for a build.

- **On:** every integration in `src/integrations/` reports its mock dataset, together
  describing one demo home lab. The simulated actions ("Live-migrate", "Run diagnostics",
  "Simulate power cut"…) change those datasets, so the whole UI reacts.
- **Off:** only data fetched by an integration's live client is used. None has one yet, so
  pages show "No data yet".

Integrations with mock data: Proxmox VE, VictoriaMetrics, TrueNAS, NUT, UniFi Network,
UniFi Site Manager, Docker agents, NetBox, Synology DSM, Home Assistant, IPMI / Redfish, OVH,
Quicksrv.io, Scaleway, Cloudflare, Tailscale, Ollama / vLLM, Pi-hole and Uptime Kuma.

Each integration owns some objects (Proxmox owns nodes and guests, TrueNAS the pools, UniFi
the switches and VLANs…) and may add to objects owned by another (VictoriaMetrics adds
sensors to hosts, NetBox the CMDB record, NUT the power path). All of them can contribute to
shared feeds: alerts, updates, recent changes, power readings, backup jobs. A source that
delivers nothing simply leaves its part out.

## Next step

Give an integration a live client: add `fetch()` to its entry in `src/integrations/`,
returning the same shape as its `mock()`. The store already calls it in live mode and merges
the result.
