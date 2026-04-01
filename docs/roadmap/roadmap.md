# ROADMAP.md — Taktos (High-Level Vision & Phases)

## Vision

Taktos is an immersive, social, game-like platform for discovering work.

Instead of searching job listings, users:
- Walk through virtual cities
- Discover real businesses
- Build a long-term "wishlist" of places they want to work
- Connect with employers when timing aligns

Core shift:
From urgent job search → to long-term career aspiration

---

## What We're Building

At its core, Taktos combines three systems:

1. A living, explorable world
   - Main Streets with real businesses as storefronts
   - Synchronous presence (people walking around)

2. An aspiration graph
   - Users save places they want to work
   - Drop evergreen resumes
   - Build long-term intent over time

3. A hiring unlock marketplace
   - Employers claim storefronts
   - See latent demand (people who want to work there)
   - Pay to unlock contact info and reach out off-platform

This creates a new kind of labor market:
- Social
- Passive
- Long-cycle
- Affinity-driven

---

## Product Philosophy

- Work is social → not transactional
- Discovery > search
- Presence > listings
- Intent compounds over time
- Simplicity > feature bloat (no chat, no ATS)

---

## Phase 0 — Three Client Modalities

Goal:
Deliver the same core world across all three access modes so no modality is a second-class citizen.

The three clients are:
- **API** — REST + WebSocket, the canonical interface all other clients are built on
- **Terminal** — Blessed TUI; for developers and power users
- **Blue Link City** — Server-rendered HTML, no JS, accessible from any browser

All three must support:
- Signup / login / logout
- World navigation (map, enter/leave place)
- Presence (who is here)
- Basic social interaction (tak tak / wave)
- Job listings inside places
- Persona (profile, role)

Success looks like:
- A user can fully participate in the world from any of the three clients
- The three clients share the same backend auth, event stream, and presence model

---

## Phase 1 — Core Features

Goal:
Build the features that make Taktos a useful and distinct product, across all three client modalities.

### Businesses
- Storefronts are real businesses with descriptions, logos, open roles
- Businesses exist as first-class entities (not just "places")
- Employers can claim and manage their storefront

### Resume Drop
- Jobseekers drop an evergreen resume at a storefront
- Resume is not a traditional CV — it signals aspiration and availability
- Drops accumulate over time; employers see latent demand ("X people want to work here")

### Tak Tak
- The signature lightweight social interaction
- A gesture between two users (like a tap on the shoulder)
- Persistent: creates a connection record; shows up in your history
- Not chat — intentionally minimal

### Canned Language / Dialog Wheel
- In-world communication via pre-written phrases, not freeform text
- Phrases are contextual (greeting, interest, farewell)
- Keeps the world legible and safe without moderation overhead
- Already partially built for Blue Link City; needs full parity across modalities

### Employer Validation
- Verification flow for employers claiming a storefront
- Prevents fake or squatted business listings
- Gate for seeing resume drop demand and taking unlock actions

### Admin Screens
- Admin dashboard (already built): user management, block/unblock, role assignment, presence monitoring
- Extend to: business verification queue, content moderation, platform health metrics

Success looks like:
- Jobseekers browse, drop resumes, and tak-tak with others
- Employers see who wants to work at their business
- Admins can operate the platform without touching the database

---

## Phase 2 — Isometric Game Mode

Goal:
Deliver the full visual experience that makes Taktos feel like a game, not a website.

Add:
- Isometric "Main Street" renderer
- Avatar movement and pathfinding
- Visual storefronts with enter/exit transitions
- Presence as visible avatars (not just a user list)
- Tak tak as an animated gesture between avatars

The API-first architecture means this client is additive — the same backend powers terminal, HTML, and isometric simultaneously.

Success looks like:
- Walking down a street feels novel and fun
- Presence of other users is immediately visible
- The world doesn't feel empty

---

## Phase 3 — Monetization

Goal:
Turn employer intent into revenue.

Add:
- Paid unlock system: employer pays to unlock a jobseeker's contact info
- Stripe billing (move beyond stub)
- Webhook signature verification for production
- Employer-facing dashboard: candidate pool, unlock history, spend
- Basic recommendation ("you may want to unlock this person")

Success looks like:
- Employers paying to unlock candidates
- Successful off-platform hires traceable to Taktos

---

## Phase 4 — Platformization (Satellites)

Goal:
Let third parties build districts and worlds on top of Taktos Core.

Add:
- Satellite world protocol (federation scaffolding already exists in schema)
- SDK / tooling for satellite operators
- Revenue share: satellite operators earn from unlock transactions in their worlds
- Attribution model: origin and attribution tracked per transaction
- Themed environments (e.g. "Startup Alley", "Restaurant Row", "Tech Tower")

Economy:
- Satellite operators earn from employer activity in their worlds
- Core retains a platform cut
- Attribution decay rules govern rev-share over time

Taktos becomes:
A platform for building work-discovery worlds

---

## End State

Taktos evolves into:

- A network of explorable work environments
- A persistent graph of career intent
- A marketplace where opportunity finds you
- A creator platform where others build the future of work discovery

Not a job board.

A living world.
