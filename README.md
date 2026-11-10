# Pantheon

Home lab observatory: one place to see sites, hosts, guests, containers, network, edge
tunnels, power, backups and alerts, with a page for every object and the topology map as
one way of looking at them.

This repository currently holds the web UI, built from the "Pantheon — full working mockup"
design. It runs on a demo inventory; no backend is wired in yet.

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
| `src/model/store.ts` | UI state, mirrored to the URL hash (`#/hosts`, `#/o/olympus/Hardware`) |
| `src/model/buildView.js` | Demo inventory and the state → view-model function, ported from the design prototype |
| `src/model/types.ts` | Types for the UI state and the view model |
| `src/styles.css` | Design tokens and all styles |

Every list page (Hosts, Storage, Alerts, Drift…) is the same `ListPage` fed different tables,
and every object (site, host, VM, container, VLAN, VPS, UPS, service…) is the same `ObjectPage`
fed different tabs and cards. Adding a new kind of object is a data change, not a new screen.

## Keyboard

- `⌘K` / `Ctrl K` opens search; `Enter` opens the first result
- `Esc` closes search and the alerts popover

## Next step

`buildView.js` is where real data replaces the demo registry: Proxmox, UniFi, TrueNAS,
VictoriaMetrics, NetBox and the other sources listed under Settings → Data sources. Actions
such as "Live-migrate", "Run diagnostics" or "Simulate power cut" are simulated in the browser.
