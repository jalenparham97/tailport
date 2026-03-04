# Tailport

Expose local and tailnet services to the internet with clean subdomain URLs — powered by [Tailscale Funnel](https://tailscale.com/kb/1223/tailscale-funnel) and a Bun-based reverse proxy.

```
tailport expose api localhost:3000
→ https://api.tailport.dev
```

## How It Works

Tailport runs a single router on port `9000` and exposes it via Tailscale Funnel. Incoming requests are dispatched by subdomain using the `Host` header:

```
Internet → Tailscale Funnel → *.tailport.dev → Tailport Router (port 9000)
                                                    │
                               ┌────────────────────┼────────────────────┐
                           api:3000          grafana:3001          llm:11434
```

The router reads the first subdomain, looks it up in `~/.config/tailport/routes.json`, and proxies the request — preserving the method, headers, and body stream so webhooks and POST traffic work without modification.

Routes are reloaded automatically whenever the config file changes, so you never need to restart the router after adding or removing a service.

## Prerequisites

- [Bun](https://bun.sh) installed
- [Tailscale](https://tailscale.com) installed and authenticated on the machine running Tailport
- A DNS wildcard record: `*.tailport.dev → your router machine` (via Tailscale Funnel)

## Quickstart

```bash
# 1. Install dependencies
bun install

# 2. Build the standalone binary
bun run build

# 3. Start the router and enable Tailscale Funnel
./tailport start

# 4. In another terminal, expose a service
./tailport expose api localhost:3000

# 5. Access it publicly
# https://api.tailport.dev
```

## Commands

### `tailport start`

Starts the Bun router on port `9000` and enables Tailscale Funnel:

```bash
./tailport start
```

- Creates `~/.config/tailport/routes.json` if it does not exist
- Runs `tailscale funnel 9000`
- Keeps the router running until `Ctrl+C`

---

### `tailport expose <name> <target>`

Registers a new route and prints the public URL:

```bash
./tailport expose api       localhost:3000
./tailport expose frontend  localhost:5173
./tailport expose grafana   nas:3001
./tailport expose llm       gpu-box:11434
```

- `name` — subdomain label (lowercase letters, numbers, and hyphens)
- `target` — `<host>:<port>` of the upstream service (local or anywhere on your tailnet)

The running router picks up the change instantly without a restart.

---

### `tailport remove <name>`

Removes a route:

```bash
./tailport remove api
```

---

### `tailport list`

Prints all registered services and their public URLs:

```bash
./tailport list
```

```
Name        Target              URL
api         localhost:3000      https://api.tailport.dev
frontend    localhost:5173      https://frontend.tailport.dev
grafana     nas:3001            https://grafana.tailport.dev
```

## Configuration

Routes are stored at `~/.config/tailport/routes.json`:

```json
{
  "api": "localhost:3000",
  "frontend": "localhost:5173",
  "grafana": "nas:3001",
  "llm": "gpu-box:11434"
}
```

You can edit this file directly — the router reloads it automatically on save.

## Building the Binary

```bash
bun run build
```

Compiles `cli/index.ts` into a single self-contained executable (no Bun runtime required on the target machine):

```bash
./tailport --help
```

## Scripts

| Command             | Description                                 |
| ------------------- | ------------------------------------------- |
| `bun run dev`       | Run the CLI via Bun directly                |
| `bun run start`     | Run `tailport start` via Bun                |
| `bun run build`     | Compile to a standalone `./tailport` binary |
| `bun run typecheck` | TypeScript type check with no emit          |

## Project Structure

```
tailport/
├── cli/
│   ├── index.ts              # Command dispatcher
│   └── commands/
│       ├── start.ts          # tailport start
│       ├── expose.ts         # tailport expose
│       ├── remove.ts         # tailport remove
│       └── list.ts           # tailport list
├── router/
│   └── server.ts             # Bun HTTP reverse proxy
├── lib/
│   ├── config.ts             # Config path helpers
│   ├── routes.ts             # Route persistence (read/write/validate)
│   └── tailscale.ts          # tailscale funnel subprocess
├── package.json
└── tsconfig.json
```

## Use Cases

- **Webhook testing** — receive live webhook payloads from GitHub, Stripe, etc.
- **Remote demos** — share a dev server with a client without deploying
- **API integration testing** — expose a local API to a third-party service
- **Tailnet services** — proxy machines like `nas`, `gpu-box`, or `pi` through a single public entry point
