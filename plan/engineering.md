# Home Lab Monitor — Engineering Doc

Companion to `homelab-monitor-architecture.md`. The architecture doc says **what** we're building; this doc pins down **how** — runtime versions, packages, repo layout, conventions, and the dev/build/deploy contract.

---

## 1. Runtime & Language

- **Node.js 24 LTS** everywhere (agents and central server). No Bun in v1.
- **TypeScript 5.x**, strict mode on.
- **Dev:** `tsx` for direct TS execution.
- **Prod:** `tsc` build to `dist/`, run compiled JS under PM2 / Docker.

Targeting Node 24 gives us native `fetch`, stable `node:test`, `node:sqlite` (we still prefer better-sqlite3 for Drizzle compatibility), and modern ESM without polyfills. `"type": "module"` in every workspace package.

---

## 2. Tech Stack

| Layer              | Choice                              | Notes                                                          |
| ------------------ | ----------------------------------- | -------------------------------------------------------------- |
| HTTP framework     | **Hono**                            | Same API on agent + monitor; tiny, typed                       |
| WebSocket          | **Hono WS helper** (`@hono/node-ws`) | Push channel from monitor to dashboard                         |
| Validation         | **Zod**                             | Shared schemas live in `packages/shared`                       |
| Config files       | **`yaml`** + Zod                    | `servers.yaml`, `alerts.yaml` validated at startup             |
| Logging            | **pino** + `pino-pretty` (dev)      | Structured JSON in prod                                        |
| OS metrics         | **systeminformation**               | CPU, RAM, disk, network, uptime                                |
| Docker             | **dockerode**                       | Typed, well-maintained socket client                           |
| PM2                | **pm2** programmatic API            | Direct IPC; agent must run on the same host as the PM2 daemon  |
| DB driver          | **better-sqlite3**                  | Synchronous, fast, perfect fit for the monitor                 |
| ORM                | **Drizzle**                         | Typed schema + migrations over `better-sqlite3`                |
| Email              | **mailgun.js**                      | Official Mailgun SDK; ships TS types                           |
| UI framework       | **React 19** + **Vite**             | Vite served as static assets by the monitor in prod            |
| UI styling         | **Tailwind v4**                     | No shadcn; bespoke primitives                                  |
| UI animation       | **Framer Motion**                   | Status transitions, card expansion                             |
| UI charts          | **uPlot**                           | Tiny, fast sparklines                                          |
| UI state           | **Zustand**                         | Small global store for server list + WS status                 |
| Monorepo           | **pnpm workspaces**                 | 3 packages, no Turborepo                                       |
| Lint + format      | **Biome**                           | Single tool replaces ESLint + Prettier                         |
| Process manager    | **PM2**                             | server-c agent + monitor host monitor                                     |
| Container base     | **`node:24-slim`**                  | Multi-stage build for the agent image                          |

**Deferred:** tRPC, Turborepo, Vitest (until something nontrivial to test).

---

## 3. Repository Layout

```
homelab-monitor/
├── packages/
│   ├── shared/                  ← Zod schemas, shared types, constants
│   │   ├── src/
│   │   │   ├── metrics.ts       ← MetricsSnapshot Zod schema (single source of truth)
│   │   │   ├── config.ts        ← servers.yaml / alerts.yaml schemas
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent/                   ← deployed to server-a, server-b, server-c
│   │   ├── src/
│   │   │   ├── index.ts         ← Hono server entry
│   │   │   ├── auth.ts          ← Bearer-token middleware
│   │   │   ├── collectors/
│   │   │   │   ├── os.ts
│   │   │   │   ├── docker.ts
│   │   │   │   └── pm2.ts
│   │   │   ├── sampler.ts       ← background CPU sampler (5s interval)
│   │   │   └── env.ts           ← Zod-validated env loader
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── monitor/                 ← deployed to monitor host
│       ├── src/
│       │   ├── index.ts
│       │   ├── poller.ts
│       │   ├── state.ts         ← in-memory server state store
│       │   ├── db/
│       │   │   ├── client.ts    ← better-sqlite3 + pragmas
│       │   │   ├── schema.ts    ← Drizzle schema
│       │   │   └── migrations/
│       │   ├── ws.ts            ← WebSocket push server
│       │   ├── api.ts           ← REST history endpoints
│       │   ├── alerts/
│       │   │   ├── index.ts     ← state-transition listener
│       │   │   ├── mailgun.ts   ← Mailgun client wrapper
│       │   │   └── cooldown.ts
│       │   └── env.ts
│       ├── ui/                  ← Vite React app
│       │   ├── src/
│       │   │   ├── main.tsx
│       │   │   ├── App.tsx
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   │   └── useWebSocket.ts
│       │   │   └── store.ts     ← Zustand
│       │   ├── index.html
│       │   ├── vite.config.ts
│       │   └── tailwind.config.ts
│       └── package.json
│
├── servers.yaml                 ← gitignored
├── servers.example.yaml
├── alerts.yaml                  ← gitignored
├── alerts.example.yaml
├── biome.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json                 ← root scripts only
└── README.md
```

`packages/shared` is consumed by both `agent` and `monitor` via workspace protocol (`"@homelab/shared": "workspace:*"`).

---

## 4. Schema Discipline

The metrics payload is the contract between agent and monitor. It is defined **once**, in `packages/shared/src/metrics.ts`, as a Zod schema. Both sides use it:

- **Agent** builds the response object and passes it through `MetricsSnapshot.parse()` before serializing — guarantees a malformed shape never escapes.
- **Monitor** parses the agent response with the same schema — protects against an out-of-date agent.

`type MetricsSnapshot = z.infer<typeof MetricsSnapshot>` is the only TS type either side imports; never hand-written.

Same pattern for `servers.yaml` and `alerts.yaml`: load YAML → `Config.parse()` → typed config object. Validation failure exits the process at startup with a clear error.

---

## 5. Environment & Configuration

### Agent env vars (Zod-validated at boot)

| Var             | Required | Default      | Description                                  |
| --------------- | -------- | ------------ | -------------------------------------------- |
| `SERVER_ID`     | yes      | —            | Friendly id; matches `servers.yaml` entry    |
| `API_KEY`       | yes      | —            | Bearer token; agent rejects requests without |
| `BIND_HOST`     | yes      | —            | LAN IP to bind (never `0.0.0.0`)             |
| `PORT`          | no       | `3005`       |                                              |
| `ENABLE_DOCKER` | no       | `false`      | `true` on all three hosts in v1              |
| `ENABLE_PM2`    | no       | `false`      | `true` on server-c only                          |
| `LOG_LEVEL`     | no       | `info`       |                                              |
| `SAMPLE_INTERVAL_MS` | no  | `5000`       | Background CPU sampler interval              |

### Monitor env vars

| Var                      | Required | Default      | Description                                |
| ------------------------ | -------- | ------------ | ------------------------------------------ |
| `PORT`                   | no       | `8080`       |                                            |
| `BIND_HOST`              | no       | `0.0.0.0`    | LAN + Tailscale interface                  |
| `POLL_INTERVAL_MS`       | no       | `10000`      |                                            |
| `POLL_TIMEOUT_MS`        | no       | `5000`       | Per-agent timeout                          |
| `HISTORY_RETENTION_HOURS`| no       | `24`         |                                            |
| `DB_PATH`                | no       | `./data/monitor.sqlite` |                                 |
| `SERVERS_CONFIG`         | no       | `./servers.yaml` |                                        |
| `ALERTS_CONFIG`          | no       | `./alerts.yaml`  |                                        |
| `LOG_LEVEL`              | no       | `info`       |                                            |

### Config files

`servers.yaml` and `alerts.yaml` are **gitignored**. Their `*.example.yaml` counterparts are committed and represent the canonical shape. Both are parsed through Zod on startup; any drift fails fast.

---

## 6. Conventions

**Logging.** `pino` instance per package, scoped child loggers per module (`logger.child({ module: 'poller' })`). One log line per significant event: poll cycle complete, agent state transition, alert dispatched, error. Avoid noisy per-request logs in the agent.

**Errors.** No try/catch around things that should crash the process (config load, DB open). Wrap network I/O (agent fetch, Mailgun call) and degrade gracefully. Never let alerting or a single bad agent take the poller down.

**Time.** All timestamps stored and exchanged as `unix ms` integers. UI converts to local time at render.

**Numbers.** CPU/memory percentages are `number | null` end-to-end. `null` means "not yet computed" (cold start). UI renders `null` as `—`.

**HTTP.** Agent responds `200` with payload, `401` on bad/missing token, `500` on collector error (with body `{ error: string }`). Monitor's REST endpoints follow the same pattern.

**No comments unless they explain WHY.** Stack-defined; reiterating in code.

---

## 7. Dev / Build / Deploy

### Local dev

```
pnpm install
pnpm --filter @homelab/agent dev          # tsx watch
pnpm --filter @homelab/monitor dev        # tsx watch + Vite UI dev server
pnpm --filter @homelab/monitor ui:dev     # Vite only (proxies API to monitor)
```

The monitor in dev runs the API on `:8080` and the Vite dev server on `:5173` with a proxy for `/api` and `/ws`.

### Build

```
pnpm -r build           # tsc per package; vite build for ui/
```

`monitor` build emits:
- `packages/monitor/dist/` — compiled server JS
- `packages/monitor/ui/dist/` — Vite static bundle, served by Hono in prod

### Agent Docker image

Multi-stage:
1. `node:24-slim` builder → `pnpm install` + `pnpm build`
2. `node:24-slim` runtime → copy `dist/` + production node_modules; `CMD ["node", "dist/index.js"]`

Image is built once per release and pushed to the local registry (or `docker save`/`scp`/`docker load` if no registry yet).

### Deploy targets

| Host             | Method                            | Artifact                                       |
| ---------------- | --------------------------------- | ---------------------------------------------- |
| server-a   | `docker compose up -d agent`      | `homelab-agent:latest` image                   |
| server-b       | `docker compose up -d agent`      | `homelab-agent:latest` image                   |
| server-c             | `pm2 start ecosystem.config.cjs`  | Built `dist/` synced to host                   |
| monitor host        | `pm2 start ecosystem.config.cjs`  | Built `dist/` + `ui/dist/` synced to host      |

Sync method for v1: `rsync` over SSH from a dev machine. Formal CI/CD is out of scope for v1.

### DB migrations

Drizzle generates SQL migrations into `packages/monitor/src/db/migrations/`. The monitor runs pending migrations on startup before opening the poller. New migrations ship with the monitor build; no manual step.

---

## 8. Tooling Config

- **`tsconfig.base.json`** — `strict: true`, `moduleResolution: "bundler"`, `target: "ES2022"`, `module: "ESNext"`. Each package extends it.
- **`biome.json`** — formatter + linter; recommended ruleset; 2-space indent, single quotes, trailing commas.
- **`pnpm-workspace.yaml`** — `packages: ['packages/*']`.

---

## 9. Embedded / LED-Panel Clients

A second consumer pattern is supported alongside the dashboard: small displays (e.g. an ESP32 driving a P2.5 LED matrix) that render at-a-glance status. These clients are too memory-constrained for the WS payload, so the monitor exposes a separate compact endpoint.

### Endpoint

```
GET /api/display              -> 200 application/json + ETag
GET /api/display              with If-None-Match → 304 (no body) when nothing changed
GET /api/display?names=8      truncate displayName to 8 chars (small panels)
```

### Why polling, not WebSocket / SSE

For embedded clients the trade-offs invert:

- **WebSocket** libraries on ESP32-class chips burn RAM on framing/reconnect logic.
- **SSE** is workable (long-lived HTTP, line-delimited) and a fine upgrade path if you need sub-second updates.
- **Plain GET polling** is what we recommend. It's trivial to implement on any HTTP client, easy to debug with `curl`, and combined with content-based ETags it costs almost nothing on the wire when state hasn't changed.

Recommended client cadence: 5 s. Send `If-None-Match: "<last-etag>"` to receive 304s when state is identical between polls — the panel skips JSON parse + redraw, which reduces flicker and power draw.

### Schema (compact, integer-only)

```jsonc
{
  "ts": 1735000000000,
  "fleet":   { "online": 2, "degraded": 1, "offline": 0, "cpu": 45, "ram": 63, "rx": 5800000, "tx": 1200000 },
  "servers": [
    { "id": "srv-a", "name": "Server A", "s": "ok",   "cpu": 32, "ram": 67, "disk": 78, "rx": 4200000, "tx":  812000 },
    { "id": "srv-b", "name": "Server B", "s": "warn", "cpu": 89, "ram": 71, "disk": 45, "rx": 1100000, "tx":  240000 },
    { "id": "srv-c", "name": "Server C", "s": "ok",   "cpu": 45, "ram": 52, "disk": 61, "rx":  500000, "tx":  150000 }
  ]
}
```

- All percentages are **rounded integers** — LED panels don't need decimals.
- `s` is a 3-letter status: `ok` / `warn` / `err` (3-byte enum, easy to switch on).
- `rx` / `tx` are **bytes per second** of the primary WAN-facing interface, computed agent-side. Loopback/docker/bridge/veth interfaces are filtered out.
- `name` is server-side truncated. Override with `?names=N`.
- `id` is included so clients can keep stable per-server display slots across polls.

Payload size for ~5 servers: ~500 bytes. ArduinoJson with a 2 KB doc is enough.

### ETag

Hash is content-based: derived from `fleet` + `servers` only, **not** `ts`. So a poll that finds the dashboard in identical state returns the same ETag despite the body's `ts` field being fresh — letting the embedded client safely skip work via `If-None-Match` / 304.

### Auth

Same model as the rest of the API: Tailscale-only network surface in v1. If you put the embedded client on a separate VLAN with no tailnet, add a query-param key (e.g. `?key=…`) and validate it server-side.

---

## 10. Open Questions / Future Work

- **CI:** none in v1. Could add a tiny GitHub Actions job to typecheck + biome-check on PR — defer until the project has more than one contributor.
- **Tests:** Vitest when collectors get nontrivial; not v1.
- **Auth rotation:** API keys are static in v1. If rotation matters later, generate per-agent keys and a small rotation script.
- **Image registry:** v1 uses `docker save`/`scp`. If we add more agents, stand up a tiny local registry on the monitor host.
- **Downsampled history:** see architecture doc §2c future work.
- **Threshold alerts + digest:** see architecture doc §4 v2.
