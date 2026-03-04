# ── Stage 1: download cloudflared binary ───────────────────────────────────────
FROM alpine:3.21 AS cloudflared-dl

ARG CLOUDFLARED_VERSION=2024.12.2

RUN apk add --no-cache curl && \
    curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64" && \
    chmod +x /usr/local/bin/cloudflared

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM oven/bun:1-alpine

# Copy cloudflared from stage 1
COPY --from=cloudflared-dl /usr/local/bin/cloudflared /usr/local/bin/cloudflared

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy only the source needed to run the server
COPY tsconfig.json ./
COPY lib/ ./lib/
COPY server/ ./server/

# Run as non-root for security
RUN addgroup -S tailport && adduser -S tailport -G tailport
USER tailport

ENV NODE_ENV=production

CMD ["bun", "run", "server/index.ts"]
