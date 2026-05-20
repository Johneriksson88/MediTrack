# MediTrack API — multi-stage Dockerfile (Pattern P)
#
# Build context is the repo root (declared in docker-compose.yml). That's
# required so the pnpm workspace (`pnpm-workspace.yaml`, `packages/shared`,
# `pnpm-lock.yaml`) is available to install from.
#
# Stage 1 `builder` — install all deps, generate Prisma client, compile TS
# Stage 2 `runtime` — copy only dist + production deps; entrypoint runs
#                     `prisma migrate deploy` + `prisma db seed` + `node`

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# pnpm via corepack (matches packageManager pin in root package.json)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Native deps for argon2: alpine needs python3 + make + g++ for the build,
# AND we install libstdc++ so the runtime stage can load the prebuilt binary
# without an alpine-musl mismatch.
RUN apk add --no-cache python3 make g++ libstdc++

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

# Generate the Prisma client, then compile TS → dist.
RUN pnpm --filter @meditrack/api exec prisma generate
RUN pnpm --filter @meditrack/api run build

# -----------------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libstdc++ dumb-init

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

EXPOSE 3000

# Healthcheck: Node fetch against /healthz. Pure-node so we avoid installing
# curl/wget just for the probe.
HEALTHCHECK --interval=10s --timeout=5s --retries=20 --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Pattern P: migrate → seed → serve. All three idempotent. dumb-init reaps
# zombie children if prisma sub-processes outlive the parent.
ENTRYPOINT ["dumb-init", "--"]
CMD sh -c "pnpm --filter @meditrack/api exec prisma migrate deploy && pnpm --filter @meditrack/api exec prisma db seed && node apps/api/dist/server.js"
