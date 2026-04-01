# TODO

## Phase 0 — Three Client Modalities

- [x] Formalize tak tak as a named mechanic in the API (distinct from generic WAVE)
- [x] Add tak tak to the terminal client
- [x] Add resume drop to all three clients (API, terminal, Blue Link City)
- [x] Add businesses as a distinct entity from places (data model + API)

## Phase 1 — Core Features

### Businesses
- [x] Business data model (name, description, category, logo, open roles)
- [ ] Business import / seed flow (manual or API-driven, e.g. Google Places)
- [ ] Link places to businesses in the world

### Resume Drop
- [x] `resume_drops` table (user_id, place_id, dropped_at, still_interested, expires_at)
- [x] Drop resume action in API, terminal, and Blue Link City
- [ ] Save/wishlist a business (separate from dropping a resume)
- [ ] "Still interested" renewal flow + auto-expiry (~180 days)
- [ ] Jobseeker controls: visibility toggle, photo toggle, see who unlocked me

### Tak Tak
- [x] Define tak tak as a distinct event type in the event stream
- [ ] Mutual acknowledgment flow (request → accept/ignore)
- [ ] Connection record persisted after accepted tak tak
- [ ] Rate limiting / cooldown
- [ ] "Not available" opt-out status

### Canned Language
- [ ] Finalize phrase library (jobseeker↔jobseeker, jobseeker↔employer categories)
- [ ] API endpoint for dialog wheel interactions
- [ ] Terminal dialog wheel parity with Blue Link City

### Employer Validation
- [ ] Employer claim flow (claim a business storefront)
- [ ] Verification submission (domain email or business docs)
- [ ] Admin verification queue (approve / reject with notes)
- [ ] Gate: verified employers only can see candidate demand and initiate unlocks

### Admin Screens
- [ ] Business verification queue in admin dashboard
- [ ] Resume drop activity (drops per business, demand view)
- [ ] Tak tak activity and interaction health metrics
- [ ] SMS admin parity with HTML admin dashboard
