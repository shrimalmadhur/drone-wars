# Drone Wars Backend Multiplayer And Leaderboards Roadmap

## Goal
Define a practical path from the current browser-only `Drone Wars` prototype to a backend-driven system with:
- global leaderboards
- backend-owned player/session identity
- real squad/lobby flows
- authoritative co-op multiplayer

This document is intentionally a deferred roadmap, not an implementation commitment for the current milestone.

## Why This Exists
- The current repo is a client-only Vite + Three.js game with no backend service.
- Persistent progression today is local-browser state in [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js).
- The game loop and simulation are browser-owned in [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js) and [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js).
- Proper multiplayer cannot be achieved by extending browser-local persistence alone. It requires a real authority for rooms, player state, scoring, and match outcomes.

## Product Direction
- Keep single-player playable while backend systems are introduced.
- Ship real backend leaderboards before full multiplayer.
- Build co-op first, not PvP.
- Keep the browser client focused on rendering, input, and presentation once multiplayer begins.
- Avoid fake “multiplayer” where each client still owns combat truth locally.

## Non-Goals
- PvP as part of the first backend rollout
- Full anti-cheat guarantees
- Cross-region matchmaking sophistication
- Voice/chat/social systems beyond presence and session membership
- Backend migration of all local profile/progression systems on day one

## Recommended Architecture

### 1. Product data and auth layer
Use a hosted backend with browser-friendly auth and relational storage for:
- anonymous or lightweight account identity
- player profile rows
- run submission records
- leaderboard queries
- session metadata
- lobby membership

### 2. Realtime match authority
Use a room-oriented realtime runtime for actual multiplayer matches:
- one room process per live session
- websocket transport
- server-owned match state
- client inputs sent to the room
- room snapshots/events broadcast back to clients

### 3. Browser client role
The existing frontend should eventually own only:
- rendering
- input capture
- interpolation and smoothing
- HUD and menus
- non-authoritative local responsiveness

The browser should stop owning:
- enemy spawning
- hit resolution
- pickup collection truth
- score authority
- wave progression authority

## Current Codebase Constraints
- [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js) persists local progress in `localStorage`.
- [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js) wires the start screen, run lifecycle, and profile updates directly in the browser.
- [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js) owns combat truth, spawn logic, mission progression, pickups, and run summaries.
- [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js) calculates rewards and achievement unlocks locally.

These modules are fine for single-player, but they are the exact boundaries that must be broken apart for real multiplayer.

## Backend Rollout Plan

### Phase 1: Backend foundation
- Add backend configuration and environment variables for the web client.
- Introduce a dedicated service layer in the frontend so networked data access does not live directly inside [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js).
- Create backend-owned identity for each pilot:
  - anonymous account or guest sign-in
  - stable backend `user_id`
  - optional display name synced from the client
- Keep current browser-local profile values as temporary UX state, not multiplayer truth.

### Phase 2: Real leaderboard backend
- Add persistent backend tables for submitted runs and player-facing leaderboard slices.
- Submit runs through a backend API or server function rather than writing straight from the browser into a public table.
- Validate minimal invariants on submission:
  - unique `run_id`
  - one completion per run
  - plausible duration
  - plausible score/wave/kills combinations
- Expose read paths for:
  - global all-time leaderboard
  - weekly leaderboard
  - player personal bests
- Replace browser-local leaderboard reads in the UI with backend-driven reads.

### Phase 3: Lobby and session model
- Add backend tables for:
  - `game_sessions`
  - `session_members`
  - `session_invites` if invite links are desired later
- Support these flows:
  - create squad
  - join squad by code or link
  - leave squad
  - ready/unready
  - session closed / abandoned
- Move the start screen toward explicit modes:
  - solo run
  - create squad
  - join squad

### Phase 4: Realtime lobby presence
- Add backend-driven presence so players in the same lobby can see:
  - who is connected
  - selected callsign
  - map selection
  - ready state
- Treat lobby presence as lightweight metadata only.
- Do not confuse lobby presence with match authority.

### Phase 5: Authoritative co-op room prototype
- Create one room process per live match.
- Port a minimal subset first:
  - player join/leave
  - player transform updates
  - room seed
  - match start countdown
  - basic wave state broadcast
- The first room milestone should prove:
  - two players can join the same room
  - both receive the same authoritative snapshot stream
  - disconnects are handled cleanly

### Phase 6: Combat authority migration
- Refactor the current simulation so game rules can run outside the browser.
- Extract or duplicate a shared rules/core layer from [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js).
- Move authoritative ownership of the following into the room:
  - enemy spawns
  - projectile ownership and impact resolution
  - damage application
  - pickup spawns and collection
  - mission progress
  - score increments
  - game-over conditions
- Keep the browser as a renderer of snapshots plus local input sender.

### Phase 7: Reconciliation and feel
- Add interpolation for remote players and enemies.
- Add local prediction for the local player only if the baseline feel is too laggy.
- Reconcile client state against server snapshots instead of trusting the client.
- Preserve good arcade feel without reintroducing client-owned truth.

## Data Model Sketch

### Backend tables
- `player_profiles`
  - `user_id`
  - `display_name`
  - `created_at`
  - `updated_at`
- `run_submissions`
  - `run_id`
  - `user_id`
  - `score`
  - `wave`
  - `kills`
  - `duration_ms`
  - `map_theme`
  - `submitted_at`
  - optional validation flags
- `game_sessions`
  - `id`
  - `host_user_id`
  - `status`
  - `map_theme`
  - `max_players`
  - `created_at`
- `session_members`
  - `session_id`
  - `user_id`
  - `joined_at`
  - `ready`
  - `role`

### Room state
- room id
- match phase
- seed / deterministic inputs where useful
- authoritative player states
- enemy states
- projectile states
- pickups
- wave and mission state
- score board for the room

## Frontend Refactor Plan

### New frontend boundaries
- `src/services/auth/`
- `src/services/leaderboard/`
- `src/services/sessions/`
- `src/services/matchmaking/` or `src/services/realtime/`
- `src/game/net/` for client snapshot interpolation and input transport

### Existing modules that will need changes
- [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js)
  - stop owning direct persistence/network rules
  - orchestrate UI and service calls only
- [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js)
  - narrow to local preferences and cached local profile state
  - stop implying authority over shared systems
- [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js)
  - accept network snapshots and local input transport
  - reduce direct dependence on local simulation truth over time
- [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js)
  - become extractable into shared rules or a server-owned simulation path

## Security and Integrity Rules
- Never trust browser-submitted score as final truth.
- Never trust client-owned game-over or mission completion as final truth.
- Require a backend-issued user identity for all leaderboard and session actions.
- Make run submission idempotent using `run_id`.
- Rate limit join/create/submit endpoints.
- Record server timestamps for all authoritative actions.

## Recommended Delivery Order
1. Backend auth and identity
2. Backend leaderboard submission and read API
3. Start screen session UI changes
4. Lobby/session persistence and join flow
5. Realtime lobby presence
6. Minimal authoritative room with shared movement
7. Authoritative combat migration
8. Match-end submission integrated with leaderboard

## Milestones
- Milestone 1: players can sign in anonymously and fetch global leaderboards
- Milestone 2: runs submit to the backend and appear on real leaderboards
- Milestone 3: players can create and join squads
- Milestone 4: two players can connect to the same live room
- Milestone 5: the room owns wave state and player transforms
- Milestone 6: the room owns combat and score truth

## Risks And Mitigations
- Risk: trying to ship authoritative co-op before leaderboard/auth/session foundations exist.
  - Mitigation: build backend identity and leaderboards first.
- Risk: bolting networking directly into the current browser simulation creates permanent tech debt.
  - Mitigation: introduce explicit service and simulation boundaries before deep multiplayer work.
- Risk: overbuilding for PvP complexity too early.
  - Mitigation: target 2-player co-op first and defer PvP.
- Risk: client-submitted runs are easy to tamper with.
  - Mitigation: move run submission behind backend validation and then toward full room-owned authority.
- Risk: the game feel regresses when authority leaves the browser.
  - Mitigation: ship interpolation first, add prediction only where necessary.

## Defer Until Ready
- PvP
- ranked ladders
- anti-cheat hardening beyond basic validation
- cross-device progression migration
- friends/social graph

## Decision Summary
- Proper backend-driven leaderboards are the first realistic shared system.
- Proper multiplayer should be authoritative and room-based.
- Co-op is the right first multiplayer mode.
- The repo should not attempt to “upgrade” local browser truth into internet multiplayer incrementally without first introducing clear backend ownership boundaries.
