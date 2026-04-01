# Phase 3 — Monetization

## Goal

Turn employer intent into revenue. The unlock marketplace is the only billable event in the system — employer pays to access a candidate's contact info.

---

## Core Model

> Employer-paid access to candidate contact info

No:
- Job listings fees
- Subscription tiers (initially)
- Messaging credits
- ATS fees

One action, one price:

🔓 Unlock Contact

---

## Candidate States

```
saved → resume_dropped → contact_released
```

**Auto-releasable** (no employer approval required):
- Candidate saved the business AND dropped a resume
- Employer pays → contact info is immediately revealed

**Requires candidate approval:**
- Employer discovered candidate algorithmically (not via direct signal)
- Employer requests contact → candidate must approve before unlock completes

---

## Pre-Unlock Employer View

Employers see (before paying):
- First name + last initial
- Experience summary
- Availability signal
- "Saved your storefront" / "Still interested" indicators

Hidden until unlocked:
- Full contact info
- Full resume

---

## Unlock Action

Employer initiates:
1. Clicks "Unlock Contact"
2. Stripe checkout (real, not stub)
3. On payment success:
   - Full contact info revealed
   - Resume accessible
   - `ContactUnlocked` event appended and broadcast
   - Logged in `unlock_transactions`

---

## Pricing (v1)

Low-friction, blitz-scale:
- Single global base price (configurable via `UNLOCK_PRICE_CENTS`)
- Unlimited unlocks — no per-seat cap
- Optimize tiers later based on data

---

## Stripe Integration

Move beyond the dev stub:
- Real Stripe checkout sessions
- Webhook signature verification (currently bypassed)
- Refund support
- Stripe session ID stored on every transaction

---

## Recommendation System (No Search)

Employers cannot search candidates directly.

Candidates are surfaced via:
1. Direct signal: wishlist + resume drop at the employer's business
2. Algorithmic suggestion: high-affinity candidates based on behavior

This prevents cold outreach dynamics and keeps intent high on both sides.

---

## Employer Dashboard

- Candidate pool: people who saved or dropped resumes at their business
- Unlock history: who they've contacted, when
- Spend summary
- "Still interested" signals and expiry alerts

---

## Hiring Events

Time-bound moments that drive synchronous employer/candidate presence:
- "Hiring Night — Austin (7–9pm)"
- "Brunch Rush — Cafés Hiring Now"
- Employers opt in, mark "active hiring," appear more prominently
- Users who saved matching businesses get notified

These create urgency without breaking the passive, long-cycle model.

---

## Job Seeker Controls

- Visibility toggle (appear/not appear to employers)
- Photo visibility toggle
- See who unlocked them
- Resume auto-expiry (~180 days); renewal prompt before expiry

---

## Key Metrics

- Resume drops per business
- Employer claim rate
- Unlock rate (unlocks / candidate views)
- Unlock → contact success rate
- Revenue per employer per month

---

## Success Criteria

- Employers paying to unlock candidates
- Webhook signature verification in production
- Successful off-platform hires traceable to Taktos
- No spam, cold outreach, or mass messaging possible

---

## Guiding Principle

Capture desire first.
Monetize access second.
The unlock is valuable only because the aspiration graph is real.
