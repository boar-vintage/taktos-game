# Taktos Core + Terminal Client

A pragmatic monorepo for **Taktos Core World** (backend) and an official open-source **terminal client**.

## Stack
- Backend: Node.js + TypeScript + Fastify + PostgreSQL + WebSocket (`ws`)
- Client: Node.js + TypeScript + Blessed
- Monorepo: pnpm workspaces
- Local infra: Docker Compose (Postgres + optional Redis)

## Repository Structure
```text
.
├── docker-compose.yml
├── docs
│   ├── architecture.md
│   └── openapi.yaml
├── package.json
├── pnpm-workspace.yaml
├── server
│   ├── .env.example
│   ├── package.json
│   ├── src
│   │   ├── app.ts
│   │   ├── config/env.ts
│   │   ├── db
│   │   │   ├── migrate.ts
│   │   │   ├── pool.ts
│   │   │   └── seed.ts
│   │   ├── index.ts
│   │   ├── migrations/001_init.sql
│   │   ├── plugins/auth.ts
│   │   ├── routes
│   │   │   ├── actions.ts
│   │   │   ├── auth.ts
│   │   │   ├── federation.ts
│   │   │   └── world.ts
│   │   ├── services
│   │   │   ├── events.ts
│   │   │   └── wsHub.ts
│   │   ├── types
│   │   │   ├── fastify-instance.d.ts
│   │   │   └── fastify.d.ts
│   │   └── utils
│   │       ├── auth.ts
│   │       └── sanitize.ts
│   └── test/routes.test.ts
├── terminal
│   ├── .env.example
│   ├── package.json
│   ├── src
│   │   ├── api/client.ts
│   │   ├── commands
│   │   │   ├── help.ts
│   │   │   └── parser.ts
│   │   ├── index.ts
│   │   ├── state/store.ts
│   │   ├── types.ts
│   │   ├── ui/layout.ts
│   │   └── utils/storage.ts
│   └── test/parser.test.ts
└── tsconfig.base.json
```

## Core Features Implemented
- Core world model with places/jobs/presence/event stream
- Commands supported in terminal:
  - `HELP`, `SIGNUP`, `LOGIN`, `LOGOUT`
  - `MAP`, `ENTER <#>`, `LEAVE`, `LOOK`, `JOBS`, `WHO`
  - `SAY <msg>`, `WAVE`, `UNLOCK <job#>`
  - `PROFILE`, `WORLD`, `PORTAL <world#>`
- Append-only events table + current state tables
- JWT auth + write-route protection
- Rate limits on chat/emote routes
- Chat sanitation (raw + normalized payload)
- Unlock transaction rails + Stripe checkout stub + simulate payment route
- Federation scaffolding (worlds/portals/agreements/attribution rule endpoints)
- Invite-only Twilio SMS client with session menus, JOIN codes, STOP/START/HELP compliance, and daily/burst quotas

## Run Locally
1. Copy env files:
```bash
cp server/.env.example server/.env
cp terminal/.env.example terminal/.env
```

2. Start Postgres (and Redis optional):
```bash
docker compose up -d
```

3. Install dependencies:
```bash
pnpm install
```

4. Run migrations + seed:
```bash
pnpm migrate
pnpm seed
```

5. Start backend:
```bash
pnpm dev
```

6. Start terminal client in another terminal:
```bash
pnpm terminal
```

7. Open two client sessions to verify realtime chat/emotes/presence.

8. Optional SMS setup:
```bash
# see docs/sms.md for full setup
```

## Terminal Quickstart
- `SIGNUP you@example.com password123 Casey employer`
- `MAP`
- `ENTER 1`
- `JOBS`
- `SAY hello from Main Street`
- `WAVE`
- `UNLOCK 1`

## WebSocket Protocol
- Connect: `ws://localhost:4000/ws?token=<JWT>`
- Client messages:
  - `{"type":"subscribe","worldId":"...","placeId":"...|null"}`
  - `{"type":"unsubscribe"}`
- Server messages:
  - `connected`, `presence.snapshot`, `event`, `error`, `pong`

## Notes
- MVP unlock model: employer/recruiter initiated contact unlock.
- Stripe webhook is a dev-oriented stub by default; signature verification is intentionally left for production hardening.
- Satellites are schema/API scaffolds only in this milestone.
- SMS webhook endpoint: `POST /sms/inbound`
- SMS docs: `docs/sms.md`

## SMS Admin Quickstart
1. Create an admin JWT (signup/login via `/api/auth/*`).
2. Create invite code:
```bash
curl -X POST http://localhost:4000/admin/sms/invites \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"max_uses":1,"expires_in_days":7}'
```
3. Optional explicit allowlist:
```bash
curl -X POST http://localhost:4000/admin/sms/allowlist \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"phone_e164":"+15551234567","status":"invited"}'
```
4. Test inbound SMS locally:
- Use Twilio console webhook to point at `POST /sms/inbound`.
- If local-only, use a tunnel such as ngrok (optional). Full steps are in `docs/sms.md`.
