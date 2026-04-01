# Phase 4 — Platformization (Satellites)

## Goal

Turn Taktos into a creation platform. Let third parties build niche worlds — themed job environments, geographic cities, industry verticals — on top of Core infrastructure. Core retains identity, payments, and reputation. Satellites own distribution and branding.

The federation schema scaffolding (`worlds`, `portals`, `satellite_agreements`, `attribution_decay_rules`) is already in the database.

---

## Guiding Principles

- **Core owns the rails:** identity, reputation, payments (merchant of record), contact unlock transaction
- **Satellites own distribution:** employer acquisition, candidate acquisition, niche branding
- **Clients are separate from worlds:** terminal, HTML, isometric are renderers — worlds define economic behavior
- **Single source of truth:** all transactions and events flow through Core

---

## Canonical Economic Event

### Contact Unlock
The only billable event. All revenue sharing is derived from it.

> A successful mutual contact exchange between employer and candidate.

---

## Multi-World Expansion

Before opening to third-party creators, Taktos launches its own satellite worlds to prove the model:

| World | Type | Purpose |
|-------|------|---------|
| Austin | Geographic (retail/food) | High SMB density, fast hiring cycles |
| San Diego | Geographic (hospitality/tourism) | Seasonal labor, event-driven hiring |
| Remote / Tech Tower | Non-geographic | Long-cycle tech hiring, aspirational companies |

City launch playbook:
1. Seed supply (import 10k–20k businesses)
2. Activate demand (invite early jobseekers)
3. Activate employers (push claim flow, highlight latent demand)
4. Measure the loop (wishlist → resume → unlock → contact)

---

## Revenue Split Engine

### Core → Core
100% Core

### Satellite → Satellite (local transactions)
80% Satellite / 20% Core

### Satellite → Core (inbound — user originated in satellite, transacts in Core)
Decaying attribution share:
- 0–90 days: 70% Core / 30% Satellite
- 90–365 days: 85% Core / 15% Satellite
- 365+ days: 100% Core

### Core → Satellite (outbound — Core-origin user transacts in satellite)
50% Core / 50% Satellite

---

## Pricing System

- Single global base price (e.g. $100 per unlock)
- Satellites can apply approved multipliers: 0.8x–1.5x band
- Multiplier applies to entire world (no per-user pricing)
- Must be approved by Core before taking effect

---

## Payouts

- Core is merchant of record; satellites never collect money directly
- Monthly payout job:
  - Aggregates transactions by world
  - Applies revenue splits
  - Applies reserve hold (e.g. 10% for 90 days)
  - Issues net payout to satellite operators
- Future: Stripe Connect for automated disbursement

---

## Promotion Layer

Satellites can pay for visibility inside Core:
- Sponsored portal placement
- Featured storefronts
- Satellite "embassy" districts inside Core

---

## Satellite SDK / Tooling

For third-party world operators:
- World creation API (no UI required initially)
- Asset pipeline for storefront visuals
- Revenue dashboard
- Agreement terms and multiplier approval workflow
- Satellite self-service onboarding (future)

---

## Reputation & Quality Controls

- Global `fraud_score` and `trust_score` on users (already in schema)
- Core defines minimum thresholds for visibility
- Satellites can be stricter than Core, never weaker
- Prevents cross-world reputation contamination

---

## Admin & Observability

Extend admin dashboard to cover:
- Create / approve satellite worlds
- Approve pricing multipliers
- View payout ledger by world and period
- Revenue by world, unlock volume, conversion rates

---

## Key Metrics

Per world:
- Businesses seeded and % claimed
- Wishlists per user
- Resume drops per business
- Employer unlock rate
- Time spent in world
- Revenue attributed to world

---

## Success Criteria

- At least 2 world types (geographic + non-geographic) show strong engagement
- Satellite operators earning meaningful rev share
- Launching a new world is repeatable from a playbook
- Core's quality and trust levels are not degraded by satellite activity

---

## Guiding Principle

If we can launch Austin, San Diego, and Remote successfully,
we can launch anywhere.

Taktos becomes a platform for building work-discovery worlds —
not a single product deployed everywhere.
