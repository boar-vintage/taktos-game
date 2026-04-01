FROM node:22-alpine AS builder
RUN corepack enable pnpm

WORKDIR /app

# Install deps (workspace requires all package.json manifests)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY terminal/package.json ./terminal/
RUN pnpm install --frozen-lockfile

# Build server
COPY tsconfig.base.json ./
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
RUN pnpm --filter @taktos/server build

# migrate.ts resolves migrations relative to its compiled location (dist/db/),
# so copy SQL files to dist/migrations/ where it expects them
RUN cp -r server/src/migrations server/dist/migrations

# ---- production image ----
FROM node:22-alpine AS runner
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY terminal/package.json ./terminal/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/server/dist ./server/dist

ENV NODE_ENV=production
EXPOSE 4000

# Run migrations, seed world data, then start server
CMD ["sh", "-c", "node server/dist/db/migrate.js && node server/dist/db/seed.js && node server/dist/index.js"]
