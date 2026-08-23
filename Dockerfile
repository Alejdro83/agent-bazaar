FROM node:22-slim AS base
# Node 22, not 20: @supabase/supabase-js's realtime client needs a native
# WebSocket global, which Node 20 doesn't have — it was throwing "Node.js
# detected but native WebSocket not found" on every query (including plain
# .textSearch() calls that never touch realtime), silently killing /search
# and /myagents in production.

# Build — needs devDependencies (typescript, tsx) to run `tsc`, so this
# stage does a full `npm ci`, never `--omit=dev`. (The previous version
# reused an --omit=dev install here, which meant `tsc` itself was missing:
# `npm run bot:build` failed with "tsc: not found".)
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.bot.json ./
COPY src ./src
RUN npm run bot:build

# Runtime — production-only dependencies, plus the compiled bot output.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 bot && \
    adduser --system --uid 1001 bot

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

USER bot

# Long-polling bot — no HTTP server, so no EXPOSE / health-check port.
CMD ["node", "dist/bot/index.js"]
