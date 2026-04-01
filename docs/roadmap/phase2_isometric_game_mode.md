# Phase 2 — Isometric Game Mode

## Goal

Deliver the full visual experience that makes Taktos feel like a game, not a website. The API-first architecture means this is an additive fourth client — terminal, HTML, and isometric all run on the same backend simultaneously.

---

## Core Goal

Make "walking around and discovering work" feel compelling as a visual experience.

Not:
- A web app with a map
- A 3D world
- A social media feed

But:
- An isometric "Main Street" you walk down
- Real businesses as storefronts you enter
- Other people visible as avatars sharing the same space

---

## Avatar System

Each user is represented by:
- An 8-bit isometric avatar
- Walk animation (movement between tiles)
- Idle animation (standing in place)

Employers:
- Visible flag indicator
- Slight visual distinction (badge or clothing detail) — verified employers only

---

## World Rendering

- Isometric tile-based main streets
- Storefronts rendered as buildings with visual identity (logo, lighting)
- Enter/exit transitions when moving into a place
- Presence of other users visible as avatars on the street (not just a list)

Density management:
- Each street = small room (5–20 users per instance)
- Automatic sharding when a street fills
- Seamless transitions between shards

---

## Tak Tak in Isometric

Tak tak becomes a visual gesture between avatars:
- User clicks another avatar → "Tak?" prompt appears
- Animated gesture plays when tak tak is accepted
- Dialog wheel overlays on screen

The mechanic is identical to Phase 1 — only the presentation changes.

---

## NPC / Ghost Layer

To prevent streets from feeling empty during low-traffic periods:
- Simulated walkers (NPCs) maintain ambient energy
- "Ghost trails" show recent activity ("3 visited recently", "Someone just saved this")
- Passive density signals are always present

Goal: The world should never feel abandoned.

---

## Live Density Signals

- "12 people on South Congress right now"
- "3 employers nearby"
- "Hiring active in this district"

These surface in the visual layer as ambient indicators, reinforcing that the world is alive.

---

## Success Criteria

- Walking down a street feels novel and fun
- Other users are immediately visible as avatars
- Storefronts are recognizable as real businesses
- All Phase 0 and Phase 1 features work identically through the isometric client
- The world never feels empty (NPC layer covers low-density periods)

---

## Guiding Principle

The isometric mode is the experience that makes Taktos feel like a game.
The terminal and HTML clients proved the mechanics work.
This phase makes them feel right.
