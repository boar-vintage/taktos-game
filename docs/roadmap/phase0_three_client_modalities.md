# Phase 0 — Three Client Modalities

## Goal

Deliver the same core world across all three access modes so no client is a second-class citizen before building features on top of them.

---

## The Three Clients

### API
REST + WebSocket. The canonical interface. All other clients are built on top of it.

- Auth: `POST /api/auth/signup`, `POST /api/auth/login`
- World: `GET /api/worlds`, `GET /api/worlds/:id/places`
- Actions: enter/leave, wave, say, unlock
- WebSocket: subscribe to `(world_id, place_id?)` for live event stream

### Terminal
Blessed TUI client. For developers and power users.

Commands: `SIGNUP`, `LOGIN`, `LOGOUT`, `MAP`, `ENTER`, `LEAVE`, `LOOK`, `JOBS`, `WHO`, `SAY`, `WAVE`, `UNLOCK`, `PROFILE`, `WORLD`, `PORTAL`

### Blue Link City (HTML)
Server-rendered HTML, no client-side JavaScript required. Accessible from any browser.

- Login/signup/logout
- World navigation and place browsing
- Presence ("people nearby")
- Canned-language social interactions (dialog wheel)
- Job listings and unlock flow
- Link-driven actions via signed one-time URLs (no JS forms)

---

## Status

**Built:**
- Full API (REST + WebSocket) ✓
- Terminal client with all core commands ✓
- Blue Link City HTML client ✓
- Shared JWT auth across all three clients ✓
- Shared presence and event stream ✓
- Admin Control Center (`/admin`) ✓
- SMS client (Twilio, invite-only) ✓ — bonus modality not in original plan

**Remaining for full parity:**
- Tak tak interaction in terminal and API (currently only in HTML as dialog wheel)
- Resume drop in all three clients (not yet built in any)
- Business/storefront entities as distinct from "places" (not yet built)

---

## Success Criteria

- A user can fully participate in the world from any of the three clients
- All three clients share the same auth, event stream, and presence model
- No feature exists in one client that is architecturally impossible in another

---

## Guiding Principle

Build the rails before building the train.
The modality question must be settled before layering features on top.
