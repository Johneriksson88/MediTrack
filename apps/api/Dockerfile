# MediTrack API — multi-stage Dockerfile (Pattern P)
#
# Build context is the repo root (declared in docker-compose.yml). That's
# required so the pnpm workspace (`pnpm-workspace.yaml`, `packages/shared`,
# `pnpm-lock.yaml`) is available to install from.
#
# Stage 1 `builder` — install all deps, generate Prisma client, compile TS
# Stage 2 `runtime` — copy only dist + production deps; entrypoint runs
#                     `prisma migrate deploy` + `prisma db seed` + `node`
#
# Base image choice (Plan 05): `node:20-bookworm-slim` (Debian/glibc) instead
# of `node:20-alpine` (musl). Prisma 5's bundled query engine binaries map
# cleanly to `debian-openssl-3.0.x` on bookworm; the Alpine `linux-musl-openssl-3.0.x`
# binary inconsistently fails to load when copied across multi-stage builds
# (see deferred-items.md / Plan 04 issues). Image is ~20MB larger but the
# `docker compose up --build` golden command works reliably — required for
# Phase 1 success criterion #4 and the brief §3.3 "ett plus".

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

# pnpm via corepack (matches packageManager pin in root package.json)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Debian build deps for argon2's native module + openssl runtime for Prisma's
# query engine (Prisma's `debian-openssl-3.0.x` binary needs libssl3 at link).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ \
      openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests first — better layer caching when src changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all workspace deps with frozen lockfile (supply-chain safety, T-01-SC).
RUN pnpm install --frozen-lockfile

# Now copy sources.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared first — api imports `@meditrack/shared` via the package's
# `exports` field which points at `./dist/index.js`. Without this step,
# `tsc -p .` in apps/api fails with TS2307 ("Cannot find module
# '@meditrack/shared'").
RUN pnpm --filter @meditrack/shared run build

# Generate the Prisma client, then compile TS → dist.
RUN pnpm --filter @meditrack/api exec prisma generate
RUN pnpm --filter @meditrack/api run build

# -----------------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Runtime needs libssl3 (Prisma query engine) + dumb-init (zombie reaper) +
# ca-certificates (TLS to anywhere). No python/make/g++ in the runtime layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy the installed deps + workspace metadata so `pnpm --filter @meditrack/api`
# works at runtime (we need prisma + tsx for `prisma migrate deploy` and
# `prisma db seed`, both of which are still pnpm-script invocations).
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
# `prisma db seed` runs `tsx prisma/seed.ts` which imports
# `../src/auth/password.js` (TS source resolved at runtime by tsx). Copy
# the api `src/` and `tsconfig.json` into the runtime image so the seed
# command works on a fresh `docker compose up --build`.
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

EXPOSE 3000

# Healthcheck: Node fetch against /healthz. Pure-node so we avoid installing
# curl/wget just for the probe.
HEALTHCHECK --interval=10s --timeout=5s --retries=20 --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Pattern P: migrate → seed → serve. All three idempotent. dumb-init reaps
# zombie children if prisma sub-processes outlive the parent.
ENTRYPOINT ["dumb-init", "--"]
CMD sh -c "pnpm --filter @meditrack/api exec prisma migrate deploy && pnpm --filter @meditrack/api exec prisma db seed && node apps/api/dist/server.js"
