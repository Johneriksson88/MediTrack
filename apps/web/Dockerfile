# MediTrack Web — multi-stage Dockerfile (Pattern P)
#
# Strategy: build the SPA in stage 1; serve the static dist via Vite's
# `preview` command in stage 2 (no nginx — keeps the image small and
# the dev/prod surface identical to `pnpm preview`).
#
# Same-origin proxying: vite.config exposes a `preview.proxy` block that
# forwards `/api/*` → `http://${VITE_API_HOST}:3000`. In docker-compose
# `VITE_API_HOST=api` (the service name on the compose network) so the
# session cookie travels with no CORS gymnastics — matches the Vite-proxy
# strategy of D-02.

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Workspace manifests for cacheable install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build the SPA to apps/web/dist.
RUN pnpm --filter @meditrack/web run build

# -----------------------------------------------------------------------------
# Stage 2: runtime — Vite preview server (same code path as `pnpm preview`)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

ENV NODE_ENV=production
# In compose the api service is reachable at host `api`. Outside compose,
# override via `VITE_API_HOST` before `docker run` (or use `pnpm preview`).
ENV VITE_API_HOST=api

# Copy only what `vite preview` needs.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
COPY --from=builder /app/apps/web/index.html ./apps/web/index.html

EXPOSE 5173

# `vite preview` serves the built dist; the proxy entry in vite.config.ts
# forwards /api → the api service. Bind 0.0.0.0 so the compose port mapping
# reaches the listener.
CMD ["pnpm", "--filter", "@meditrack/web", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
