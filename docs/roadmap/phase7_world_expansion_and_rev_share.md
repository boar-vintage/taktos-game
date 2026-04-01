# Phase 7 — World Economy & Rev Share System

## Objective
Introduce a federated world economy where:
- Core World remains the premium, high-trust hiring hub
- Satellite Worlds drive acquisition, curation, and niche specialization
- Revenue is shared via clear, enforceable rules tied to **Contact Unlock events**
- Payments, identity, and reputation remain centralized in Core

---

## Guiding Principles

- **Core owns the rails**
  - Identity
  - Reputation
  - Payments (merchant of record)
  - Contact unlock transaction

- **Satellites own distribution**
  - Employer acquisition
  - Candidate acquisition
  - Niche branding (e.g., TechCrunch World, Nurse World)

- **Clients are separate from worlds**
  - Terminal, SMS, HTML, etc. are renderers only
  - Worlds define economic behavior

- **Single source of truth**
  - All transactions and events flow through Core

---

## Canonical Economic Event

### Contact Unlock
The only billable event in the system.

Definition:
> A successful mutual contact exchange between employer and candidate.

All revenue sharing is derived from this event.

---

## Milestone 7.1 — Core Transaction Ledger

### Goal
Create a canonical, auditable ledger for all unlock transactions.

### Deliverables
- `unlock_transactions` table finalized with:
  - world_id (where transaction occurred)
  - origin_world_id (where user originated)
  - price_cents
  - status (created, paid, refunded)
- Add:
  - attribution fields (nullable for now)
  - created_at, updated_at

### Requirements
- Every unlock must be recorded
- Stripe session ID stored
- Refund support

---

## Milestone 7.2 — Revenue Split Engine (Core-Only First)

### Goal
Introduce deterministic revenue allocation logic.

### Rules (v1)
- Core → Core: 100% Core

### Deliverables
- Service: `calculateRevenueSplit(transaction)`
- Output:
  - core_share_cents
  - satellite_share_cents (0 for now)
- Store results in ledger or computed view

---

## Milestone 7.3 — Satellite World Data Model

### Goal
Enable satellite world creation (no UI yet required).

### Deliverables
Tables:
- `worlds`
  - id, slug, name, is_core, status
- `satellite_agreements`
  - world_id
  - rev_share_satellite_bps (default 8000)
  - rev_share_core_bps (default 2000)
  - payout_schedule
- `portals`
  - from_world_id
  - to_world_id (must include Core)

### Requirements
- Every satellite must have a portal to Core
- Core is always world_id = canonical

---

## Milestone 7.4 — Satellite → Satellite Revenue (Local Transactions)

### Goal
Support transactions inside satellite worlds.

### Rules
- Satellite → Satellite:
  → 80% Satellite / 20% Core

### Deliverables
- Extend revenue split engine:
  - Detect transaction world
  - Apply 80/20 split
- Ensure:
  - Core still processes payment
  - Ledger reflects split

---

## Milestone 7.5 — Cross-World Attribution (Travel)

### Goal
Track and reward user origin across worlds.

### Concepts
- Users have:
  - `origin_world_id`
  - `origin_timestamp`

---

### Case A — Satellite → Core (Inbound)

#### Rules
- Satellite-origin user transacts in Core
- Core receives majority
- Satellite receives **decaying share**

#### Example Decay
- 0–90 days: 70% Core / 30% Satellite
- 90–365 days: 85% Core / 15% Satellite
- 365+ days: 100% Core

#### Deliverables
- `attribution_decay_rules` table (JSON acceptable)
- Function:
  - `calculateAttributionShare(user_origin, now)`

---

### Case B — Core → Satellite (Outbound)

#### Rules
- Core-origin user transacts in Satellite

→ 50% Core / 50% Satellite

#### Deliverables
- Extend revenue engine to handle outbound case

---

## Milestone 7.6 — Global Pricing System (v1)

### Goal
Keep pricing simple but extensible.

### Rules
- Single global base price (e.g., $100)
- Satellites can apply **approved multipliers**

### Constraints
- Multiplier band: 0.8x – 1.5x
- Must apply to entire world (no per-user pricing)
- Must be approved by Core

### Deliverables
- Add fields to `worlds`:
  - pricing_multiplier
  - multiplier_status (pending/approved)
- Update unlock price calculation:
  - price = base_price × multiplier

---

## Milestone 7.7 — Payments & Payouts

### Goal
Establish payout system to satellites.

### Rules
- Core is **merchant of record**
- Satellites never directly collect money

### Deliverables
- Payout ledger:
  - satellite_id
  - period (month)
  - gross_revenue
  - refunds
  - reserve_hold
  - net_payout
- Monthly payout job:
  - aggregates transactions
  - applies splits
  - applies reserve (e.g., 10%)

### Integration
- Stripe (existing)
- Optional: Stripe Connect (future)

---

## Milestone 7.8 — Promotion Layer (Core Monetization)

### Goal
Allow satellites to pay for visibility in Core.

### Concepts
- Sponsored placement
- Featured portals
- Satellite “embassies” inside Core

### Deliverables
- `promotions` table:
  - world_id
  - placement_type
  - start_at / end_at
- Render in Core:
  - promoted worlds list
  - featured storefronts

---

## Milestone 7.9 — Reputation & Quality Controls

### Goal
Prevent cross-world contamination.

### Requirements
- Global reputation system:
  - fraud_score
  - trust_score
- Core defines minimum thresholds
- Satellites can be stricter, not weaker

### Deliverables
- Add fields to users and/or employers
- Filter queries:
  - only show users above threshold in Core

---

## Milestone 7.10 — Admin & Observability

### Goal
Make the system operable.

### Deliverables
- Admin endpoints:
  - create satellite
  - approve multiplier
  - view payouts
  - view transaction ledger
- Dashboards (basic):
  - revenue by world
  - unlock volume
  - conversion rates

---

## Future (Post Phase 7)

- Dynamic pricing by:
  - role
  - geography
  - demand
- Fully open client ecosystem
- Automated rev share marketplace
- Advanced fraud detection
- Satellite self-service onboarding

---

## Summary

This phase establishes:

- A **federated hiring economy**
- With **centralized trust + payments**
- And **distributed growth via satellites**

Core remains:
→ premium, high-trust, high-liquidity

Satellites become:
→ acquisition engines + niche ecosystems

Unlock becomes:
→ the universal economic primitive