# Phase 1 — Core Features

## Goal

Build the features that define Taktos as a distinct product — not a job board, not a social network. All features must work across all three client modalities (API, terminal, Blue Link City).

---

## Businesses

Storefronts are real businesses, not generic "places."

- Businesses have: name, description, category, logo/visual identity, open roles
- Businesses exist as a first-class entity in the data model, importable from external sources (e.g. Google Places)
- A place in the world corresponds to a business
- Multiple businesses can exist on a main street

**Employer claim flow:**
- An employer claims ownership of a business storefront
- Verification gate: must confirm business ownership before accessing candidate demand or taking unlock actions
- Prevents fake or squatted listings

---

## Resume Drop

The core jobseeker action. Signals long-term aspiration, not urgent job search.

**Jobseeker can:**
- Drop an evergreen resume at any business storefront
- Resume is not a traditional CV — it signals availability and interest
- Set a "still interested" flag; auto-expires after ~180 days without renewal
- Control visibility (toggle, photo visibility)
- See which employers have viewed or unlocked them

**What this creates:**
- A persistent graph of career intent
- Latent demand data for employers: "X people want to work here"
- Passive supply that compounds over time

**Data model additions:**
- `business_aspirations` (user_id, business_id, saved_at, resume_dropped_at, still_interested, expires_at)

---

## Tak Tak

The signature lightweight social interaction. Not chat.

**Mechanic:**
1. User initiates tak tak toward another user in the same space
2. Recipient sees: "Tak?"
3. Recipient responds: "Tak." (or ignores)
4. Both are presented a structured dialog wheel (see Canned Language)

**Properties:**
- Intentional: requires mutual acknowledgment
- Persistent: creates a connection record visible in both users' histories
- Rate-limited: cooldown prevents spam
- Opt-out: users can mark themselves as "not available"

**Not:**
- Free-form messaging
- A chat system
- One-sided

---

## Canned Language / Dialog Wheel

All in-world communication is structured, not freeform. This keeps the world legible and safe without moderation overhead.

**Phrase categories:**
- Greetings: "Just exploring", "New to this area"
- Intent signals: "Looking for retail work", "Open to part-time"
- Recommendations: "This place is worth checking out", "Saved any good spots?"
- Employer responses: "Yes, hiring evenings", "Check the storefront", "Not hiring yet"

**Properties:**
- Phrases are contextual (differ between jobseeker↔jobseeker and jobseeker↔employer)
- Responses can surface storefront cards and recommendations
- No free-form typing anywhere in the world

**Currently built:** Dialog wheel exists in Blue Link City HTML client. Needs API + terminal parity.

---

## Employer Validation

Gate that prevents unverified employers from accessing candidate data or appearing as live presences.

**Verification flow:**
- Employer signs up and claims a business
- Submits verification (business docs, domain email, etc.)
- Admin approves via admin dashboard
- Once verified: can see resume drop demand, appear as employer avatar, initiate unlock

**Admin queue:**
- Admin dashboard shows pending verifications
- Approve / reject with notes

---

## Admin Screens

The operational interface for running the platform. Already partially built.

**Built:**
- User management: block/unblock, role assignment, password reset, force offline
- Platform stats: user count, online users, blocked count, 24h event volume, revenue
- Online monitoring with "God Mode" (see all live activity)
- D3 event throughput chart + role distribution chart

**Still needed:**
- Business verification queue (approve/reject employer claims)
- Content moderation queue (flagged interactions)
- Resume drop activity (drops per business, demand heatmap)
- Tak tak activity and interaction health metrics
- SMS admin parity with HTML admin

---

## Success Criteria

- Jobseekers can browse businesses, drop resumes, and tak-tak with others in all three clients
- Employers can claim storefronts, get verified, and see latent demand
- Admins can operate the platform day-to-day without touching the database
- No free-form text exists anywhere in the world

---

## Guiding Principle

Capture desire first.
The aspiration graph is the product.
Everything else is infrastructure around it.
