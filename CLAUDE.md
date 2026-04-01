# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root via pnpm workspaces.

```bash
pnpm dev          # Start backend server (tsx watch, hot reload)
pnpm terminal     # Start terminal client
pnpm build        # Build all packages (tsc)
pnpm test         # Run all tests (vitest)
pnpm lint         # Type-check all packages (tsc --noEmit)
pnpm migrate      # Run pending SQL migrations
pnpm seed         # Seed the database with sample data
```

Run a single test file:
```bash
cd server && pnpm vitest run test/routes.test.ts
cd terminal && pnpm vitest run test/parser.test.ts
```

Server tests require a live Postgres instance (`DATABASE_URL` defaults to `postgres://taktos:taktos@localhost:5432/taktos`).

Start Postgres:
```bash
docker compose up -d
```

## Product
For the roadamp look in /docs/roadmap/roadmap.md

## Architecture

### Monorepo layout
- `server/` — Fastify backend (`@taktos/server`)
- `terminal/` — Blessed terminal client (`@taktos/terminal`)
- `docs/` — Architecture notes and OpenAPI spec

### Server internals

**Entry point flow:** `index.ts` → `buildApp()` in `app.ts` → registers plugins and route modules → starts WsHub after `app.after()`.

**Auth:** `plugins/auth.ts` decorates `app.authenticate` — a `preHandler` that verifies the JWT and checks `admin_user_blocks` for banned users (403). HTML routes use a separate cookie-based auth path in `services/html/auth.ts` (cookie name: `takt_jwt`), which also enforces blocks on every request.

**Route prefixes:**
- `/api/*` — REST API (auth, world queries, actions, federation)
- `/html/*` — Server-rendered HTML client ("Blue Link City")
- `/admin` — Admin Control Center (HTML, admin role required)
- `/admin/sms/*` — SMS admin API (JWT-protected)
- `/sms/inbound` — Twilio webhook

**Database:** Single `pg` pool (`db/pool.ts`). Migrations are plain SQL files in `server/src/migrations/`, applied in filename order by `db/migrate.ts` with a `schema_migrations` tracking table. Add new migrations as `NNN_description.sql`.

**Event model:** `events` is append-only. Current state lives in `presence`, `places`, `jobs`, `unlock_transactions`. WebSocket subscriptions are scoped to `(world_id, place_id?)` via `services/wsHub.ts`.

**HTML rendering:** No framework — `services/html/render.ts` exports `e()` (HTML-escape), `link()`, and `page()` helpers. All in-world actions use signed one-time links (`services/html/signedLinks.ts`) rather than forms, so no JS is required client-side. The `/html/*` routes have no client-side JavaScript, which eliminates DOM XSS entirely. XSS protection relies on `e()` being applied to every piece of user-controlled content — never interpolate user data into HTML template strings without it. `link()` already calls `e()` on both href and text. The `/admin` route is the only exception: it includes D3 + Bootstrap and uses `jsonForScript()` (which escapes `<`) for any data embedded in `<script>` tags.

**SMS client:** Invite-only Twilio integration in `services/sms/`. Policy enforcement (quotas, STOP/START/HELP compliance) lives in `services/sms/policy.ts`.

**Admin controls:** `routes/adminHtml.ts` serves the admin dashboard at `/admin` with D3 charts, online user monitoring, and user management (block/unblock, role change, password reset, force offline). `services/adminAccess.ts` provides `isUserBlocked()` called from all auth paths.

### Key env vars (`server/.env`)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Min 16 chars |
| `ACTION_LINK_SECRET` | Min 16 chars, signs HTML action links |
| `HTML_ONLINE_WINDOW_SECONDS` | Presence online window (60–120) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stub values work for dev |
| `TWILIO_*` | Leave empty to skip SMS signature validation |

Copy `server/.env.example` → `server/.env` before first run.
