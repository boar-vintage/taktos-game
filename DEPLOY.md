# Deployment

Taktos deploys to [Railway](https://railway.app) via Docker. The server is the only deployed service; the terminal client runs locally and connects to the production server.

## First-time setup

### 1. Create a Railway project

Create a new project in the Railway dashboard.

### 2. Add the server service

- New → GitHub Repo → select `taktos-game`
- Railway detects the `Dockerfile` and builds with it
- **Important:** leave the Custom Start Command blank (Settings → Deploy). The `Dockerfile` `CMD` already runs migrations, seed, and the server in the correct order. Setting a custom start command (e.g. `pnpm --filter @taktos/server start`) bypasses migrations and the app will fail with `relation "users" does not exist`.

### 3. Add a Postgres database

- New → Database → PostgreSQL
- Railway automatically provisions the database and injects `DATABASE_URL` into linked services

### 4. Link variables to the service

In the Postgres plugin → Variables → share with your server service. Railway injects `DATABASE_URL` automatically.

### 5. Set required environment variables

In your server service → Variables tab, add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | Any random string, 16+ chars |
| `ACTION_LINK_SECRET` | Any random string, 16+ chars |

Optional (leave empty to disable SMS):

| Variable | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |
| `TWILIO_PHONE_NUMBER` | E.164 format, e.g. `+15550001234` |

### 6. Generate a public domain

Service → Settings → Networking → Generate Domain

This gives you a `*.up.railway.app` URL.

## Connecting the terminal client to production

Set these in `terminal/.env` (or export in your shell):

```
TAKTOS_API_URL=https://your-app.up.railway.app/api
TAKTOS_WS_URL=wss://your-app.up.railway.app/ws
```

Then run normally:

```bash
pnpm terminal
```

## HTML client

The HTML client is served by the server at `/html`. No separate deployment needed — just open `https://your-app.up.railway.app/html` in a browser.

## How deployment works

1. Push to `main` triggers a Railway build
2. Railway builds the Docker image (see `Dockerfile`)
3. On container start, `db/migrate.js` runs pending SQL migrations, then the server starts
4. Railway probes `GET /health` — the service becomes live once it responds 200

## CI

GitHub Actions runs on every push to `main` and on pull requests:

```
lint → migrate → test
```

Tests require a live Postgres instance; the CI workflow spins one up as a service container. See `.github/workflows/ci.yml`.

## Creating the first admin

1. Sign up normally at `https://your-app.up.railway.app/html/signup`
2. Promote the account via the Railway Postgres query tool (or any psql client):

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

The admin dashboard is then available at `/admin`.

## Troubleshooting

**Healthcheck fails immediately** — Almost always means `DATABASE_URL` is not set or the Postgres plugin is not linked to the service. Check Variables in the Railway dashboard.

**SSL errors connecting to Postgres** — Railway private networking (`.railway.internal`) does not use SSL. Public proxy URLs do. The `db/pool.ts` handles this automatically by checking the hostname.

**Migration error on deploy** — Check Railway deploy logs. Each migration runs in a transaction and rolls back on failure. Fix the offending SQL and redeploy.

**`relation "users" does not exist` on first request** — The Custom Start Command in Railway (Settings → Deploy) is overriding the Dockerfile `CMD` and skipping migrations. Clear the Custom Start Command field so Railway uses the Dockerfile directly, then redeploy.
