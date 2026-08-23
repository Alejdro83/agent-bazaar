FROM node:20-slim AS base

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
