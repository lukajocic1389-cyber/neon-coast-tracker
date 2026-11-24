# Intent — Neon Coast: Mission & Reputation Tracker

> Jira: NC-1 (Story). Status: **approved at GATE 1 (2026-11-24)**. Decisions are in `spec.md` §9.

## Problem

Neon Coast is a fictional open-world city. A separate, simulated game engine reports mission outcomes
as JSON events. Players need a companion app that turns those events into trustworthy progress:
how much cash they hold, how much reputation they have with each crew, and what they did recently.

The core risk is **trust in the numbers**. Game engines retry, send malformed data, and reference
players or missions that do not exist. If the tracker double-counts a retried event or rewards a failed
mission, the progression economy is broken.

## Desired result

A small, reliable web app that:

1. Holds a catalog of at least five fictional missions (ID, title, crew, description).
2. Accepts mission-result events over HTTP, validates them, and **rejects** unknown players, unknown
   missions, and invalid values with clear messages.
3. Applies the fixed progression rules: *completed* adds `cash_reward` and `reputation_reward` once
   (reputation is tracked **per crew**); *failed* is recorded but awards nothing.
4. Treats a repeated `event_id` as a **duplicate**: no second record, no second reward, and a clear
   duplicate response.
5. Shows a per-player dashboard: completed and failed counts, cash balance, reputation by crew, and
   recent mission history.
6. Keeps all of this across an application restart.
7. Ships with a simulator that submits 100+ seeded events, including failures and duplicates, with
   repeatable results.

## Users

| User | Need |
|---|---|
| Player (fictional) | Sees their progress on the dashboard. |
| Simulated game engine | Posts mission results; needs unambiguous accept / duplicate / reject responses. |
| Developer / reviewer (assessor) | Runs it locally or in Docker, runs the tests, and checks CI and Jira evidence. |

## Constraints

- **Fictional content only.** No GTA VI or Rockstar names, characters, art, or trademarks. No real
  gaming accounts or external game APIs.
- The business rules in the assignment PDF (§3) are fixed. **No extra game mechanics** unless they are
  clearly marked optional.
- Small and reliable over feature-rich. A simple web interface is enough.
- Reproducible launch (local and Docker); no paid hosting.
- Every AI-generated artifact is reviewed and verified by a human. The evidence trail is truthful.
- Timebox: about 6–10 hours of focused work.

## Out of scope

- Game engine, 3D graphics, real-time multiplayer, and any game assets.
- Authentication and authorization (a local, fictional system; documented as a limitation).
- Player registration flows. Players are a fixed, seeded fictional roster.
- Spending cash, shops, levels, reputation decay, or any mechanic not in PDF §3.
- **Mission replay protection** (one reward per player per mission). This is the interview live-change
  request. It is deliberately *not* built now and is practised on a separate unmerged branch.
- Production hosting, scaling, and multi-instance deployment.
