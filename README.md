# Tailport

Expose local servers to the internet with clean subdomain URLs — no account, no config, just a single command.

```
tailport expose myapp 3000
→ https://myapp.tailport.dev
```

## How It Works

Tailport runs a hosted relay server (on Railway) behind Cloudflare Tunnel. When you run `tailport expose`, the CLI opens a persistent WebSocket to the relay server and registers a subdomain. Incoming HTTPS requests for that subdomain are forwarded over the WebSocket to your local machine and proxied to the port you specified.

```
Internet → Cloudflare Tunnel → *.tailport.dev → Relay Server (Railway)
                                                        │  WebSocket
                                                   tailport CLI
                                                        │
                                                 localhost:3000
```

No ports need to be opened. No cloud account required. Ctrl+C to disconnect.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/jalenparham97/tailport/main/scripts/install.sh | sudo sh
```

## Usage

```bash
# Authenticate (one time)
tailport auth login <your-token>

# Expose a local server
tailport expose myapp 3000
# → https://myapp.tailport.dev

# Expose with a full URL target
tailport expose myapp http://localhost:3000

# List active tunnels (self-hosted mode)
tailport list

# Remove a route (self-hosted mode)
tailport remove myapp
```

## Commands

### `tailport auth`

```bash
tailport auth login <token>   # Save your auth token
tailport auth logout          # Remove saved token
tailport auth token           # Print current token
tailport auth generate        # Generate a token (admin, requires TAILPORT_TOKEN_SECRET)
```

---

### `tailport expose <name> <port>`

Opens a tunnel and exposes `localhost:<port>` at `https://<name>.tailport.dev`.

```bash
tailport expose myapp 3000
tailport expose webhooks 8080
tailport expose api 4000
```

Press `Ctrl+C` to disconnect and free the subdomain.

---

### `tailport list`

Prints all registered routes (self-hosted mode only).

---

### `tailport remove <name>`

Removes a route (self-hosted mode only).

---

### `tailport setup`

One-time setup for self-hosted mode. Installs cloudflared, creates a Cloudflare Tunnel, and writes the config.

---

### `tailport start`

Starts the local router and cloudflared tunnel (self-hosted mode only).

## Building from Source

```bash
bun install
bun run build        # Compiles to ./tailport binary
bun run typecheck    # TypeScript type check
```

## Scripts

| Command             | Description                                 |
| ------------------- | ------------------------------------------- |
| `bun run dev`       | Run the CLI via Bun directly                |
| `bun run build`     | Compile to a standalone `./tailport` binary |
| `bun run server`    | Run the relay server locally                |
| `bun run typecheck` | TypeScript type check with no emit          |

## Project Structure

```
tailport/
├── cli/
│   ├── index.ts              # Command dispatcher
│   └── commands/
│       ├── auth.ts           # tailport auth
│       ├── expose.ts         # tailport expose
│       ├── start.ts          # tailport start (self-hosted)
│       ├── setup.ts          # tailport setup (self-hosted)
│       ├── remove.ts         # tailport remove
│       └── list.ts           # tailport list
├── server/
│   ├── index.ts              # Relay server (deployed on Railway)
│   ├── registry.ts           # WebSocket client registry
│   └── proxy.ts              # HTTP-over-WebSocket forwarding
├── lib/
│   ├── config.ts             # Config path helpers
│   └── routes.ts             # Route persistence (self-hosted)
├── scripts/
│   └── install.sh            # curl install script
├── Dockerfile                # Production image (Alpine + cloudflared)
├── package.json
└── tsconfig.json
```

## Use Cases

- **Webhook testing** — receive live webhook payloads from GitHub, Stripe, etc.
- **Remote demos** — share a dev server with a client without deploying
- **API integration testing** — expose a local API to a third-party service

## Self-Hosted Mode

Set `TAILPORT_TUNNEL_NAME` in your environment to run tailport against your own Cloudflare Tunnel instead of the hosted relay. Run `tailport setup` to configure it.
