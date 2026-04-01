:::writing{variant=“standard” id=“90214”}

PHASE_1_3_MVP.md — Aspiration + Employer + Unlock Marketplace

Overview

Phases 1–3 establish the core Taktos loop:

Discover → Desire → Signal → Unlock → Contact

This is the foundation of the entire product and business.

⸻

Core Goal

Build a functioning two-sided marketplace where:
	•	Job seekers express long-term interest in businesses
	•	Employers discover latent demand
	•	Employers pay to access candidate contact info

No:
	•	Job listings
	•	Messaging system
	•	ATS

⸻

System 1 — Aspiration Engine (Job Seeker)

Users can:
	•	Walk the world
	•	Enter storefronts
	•	❤️ Save businesses (wishlist)
	•	📄 Drop evergreen resumes

This creates:

A persistent graph of career intent

⸻

Data Model

user_id
business_id
saved_flag
resume_dropped_flag
interest_level
last_active_at
still_interested_flag


⸻

System 2 — Employer Layer

Employers can:
	•	Claim storefronts
	•	Verify ownership
	•	Access a dashboard (web/webview)

They see:
	•	of people who saved them
	•	of resume drops
	•	Candidate previews

⸻

System 3 — Unlock Marketplace

Taktos monetizes via:

Employer-paid access to candidate contact info

⸻

Candidate States

saved
resume_dropped
contact_released


⸻

Case 1 — Wishlist + Resume Drop

User:
	•	Saves business
	•	Drops resume

System:
	•	Contact is auto-releasable upon employer unlock

⸻

Case 2 — Employer Discovery

Employer:
	•	Sees recommended candidate

System:
	•	Must request contact
	•	User must approve

⸻

Employer Experience

Pre-Unlock View

Employers see:
	•	Photo (optional)
	•	First name + last initial
	•	Experience summary
	•	Availability
	•	Signals:
	•	“Saved your storefront”
	•	“Still interested”

Hidden:
	•	Contact info
	•	Full resume

⸻

Unlock Action

Employer clicks:

🔓 Unlock Contact

Result:
	•	Full contact info revealed
	•	Resume accessible
	•	Logged as monetization event

⸻

Pricing (v1)
	•	Low-friction, blitz-scale pricing
	•	Example:
	•	$29/month early access
	•	Unlimited unlocks initially

Optimize later.

⸻

Trust & Safety

Employer Requirements
	•	Must verify business ownership
	•	Must claim storefront before access

⸻

Job Seeker Controls
	•	Visibility toggle
	•	Photo visibility toggle
	•	See who unlocked them
	•	Resume auto-expiry (~180 days)

⸻

Recommendation System (No Search)

Employers cannot search candidates.

Candidates are surfaced via:
	1.	Wishlist + resume (strong signal)
	2.	Algorithmic suggestions

⸻

Why This Works

High Intent
	•	Candidates already interested
	•	Employers pay to engage

⸻

No Spam
	•	No cold outreach
	•	No scraping
	•	No mass messaging

⸻

Simplicity
	•	No chat
	•	No inbox
	•	No ATS

⸻

Key Metrics
	•	Wishlists per user
	•	Resume drops per business
	•	Employer claim rate
	•	Unlock rate
	•	Unlock → contact rate

⸻

Success Criteria

This phase is successful if:
	•	Users save multiple businesses
	•	Users drop resumes without urgency
	•	Employers claim storefronts
	•	Employers pay to unlock candidates

⸻

Outcome

A working marketplace where:
	•	Demand (job seekers) expresses intent
	•	Supply (employers) pays to access it

⸻

Guiding Principle

Capture desire first.
Monetize access second.
:::