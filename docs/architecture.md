# Taktos Core Architecture

## 1) Client vs World Separation
- **Core world server** (`/server`) is the canonical runtime for identity, presence, event log, unlock transactions, and future federation agreements.
- **Terminal client** (`/terminal`) is only a presentation + command layer over REST + WebSocket APIs.
- This keeps multiple client modalities possible later (SMS, web, FPS, etc.) because gameplay/business rules remain server-side.

## 2) Why Core Owns Identity + Payments
- Identity is global in `users`, not world-local, so trust/reputation can travel across worlds.
- Reputation placeholders (`fraud_score`, `trust_score`) live in Core now, enabling future anti-abuse pipelines without breaking schema.
- Unlock transactions are created in Core with attribution fields (`origin_world_id`, `attribution_world_id`) so billing and rev-share are traceable even before satellite execution logic is built.

## 3) Event-Sourced-ish, Pragmatic
- `events` is append-only and stores canonical action records (chat, enter, leave, unlock, etc.).
- Current-state read models (`presence`, `places`, `jobs`, `unlock_transactions`) power fast API reads and terminal UX.
- WebSocket subscription scope is `(world_id, optional place_id)` to stream relevant events only.

## 4) Federation Scaffolding
- `worlds` stores Core + satellite worlds.
- `portals` models world-to-world routing. Satellites can have required portals back to Core.
- `satellite_agreements` and `attribution_decay_rules` are included as MVP scaffolds.
- Current client defaults to Core world and does not auto-navigate satellite policies yet.

## 5) Unlock Revenue Model (MVP choice)
- Canonical billable flow: **employer/recruiter initiates unlock** for a job contact.
- API flow: create transaction (`created`) -> checkout stub -> simulate/webhook mark `paid`.
- `ContactUnlockRequested` and `ContactUnlocked` events are appended and broadcast.
