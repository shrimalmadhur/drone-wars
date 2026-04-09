# Drone Wars Retention Roadmap

## Review Summary
**Adversarial Review**: Passed. The final plan now matches the current lifecycle constraints in the repo, including merge-safe profile writes, gated restart flow, scoped between-run configuration, and safe analytics assumptions.
**Completeness Review**: Passed. The final plan now includes the missing integration points for restart ownership, modifier plumbing, DOM-capable UI test coverage, and explicit mission/ability wiring.
**Revision rounds**: 2
**Unresolved notes**: Client-side progression remains intentionally local and non-authoritative; future shared systems like leaderboards should not trust local profile values.

## Goal
Increase single-player retention before attempting multiplayer by adding medium-depth progression, stronger run-to-run goals, clearer post-run feedback, and measurable engagement instrumentation. The work should reuse the current browser-based survival prototype rather than replacing the loop.

## Product Direction
- Keep the core fantasy: quick aerial combat runs against escalating waves.
- Improve retention through:
  - persistent progression between runs
  - more varied run goals inside a session
  - clearer rewards and better feedback at the end of each run
  - more player build choice without overwhelming the current control scheme
- Explicitly defer synchronous multiplayer until the single-player loop produces stronger replayability metrics.

## Existing Baseline
- The game already has:
  - player name and map theme persistence in [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js)
  - start screen + HUD wiring in [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js) and [`/Users/madhur/conductor/repos/drone-wars/index.html`](/Users/madhur/conductor/repos/drone-wars/index.html)
  - wave-based single-player survival in [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js)
  - run-stat calculation and achievement evaluation in [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js)
  - achievements and best-score persistence in [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js)
  - lightweight analytics hooks in [`/Users/madhur/conductor/repos/drone-wars/src/game/analytics.js`](/Users/madhur/conductor/repos/drone-wars/src/game/analytics.js)

## Non-Goals
- Real-time multiplayer or PvP netcode
- Matchmaking, accounts, backend persistence, or anti-cheat
- Full campaign narrative
- Asset-heavy content production pipeline

## Success Metrics
- Increase average runs per local player session
- Increase percentage of players who start another run within 2 minutes of a game over
- Increase best-wave progression over a player’s first 5 runs
- Increase pickup / ability usage and mission completion rates

## Release Strategy
- Release 1: Retention foundation
- Release 2: In-run goal variety
- Release 3: Build depth and replayability

## Cross-Cutting Architecture Decisions
- Keep profile persistence in [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js) and calculation logic in [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js). Do not blur those responsibilities.
- Introduce a schema-versioned, merge-safe player profile before adding new persistent fields. `recordPlayerRun()` must become additive instead of reconstructing a fixed-shape object.
- Add explicit run lifecycle APIs:
  - `startRun` on initial launch and replay
  - `completeRun` on the first transition into game over
  - `restartRun` as a public `Game`-level method instead of relying on raw `R` handling inside simulation state mutation
- Add a shared runtime tuning object, for example `runModifiers`, computed before each run and threaded into `Game`, `Simulation`, `Player`, enemy constructors, and score/currency reward calculations. Upgrades and mutators must both use this path.
- Treat the start screen as profile and preflight UI, not a one-time form. The plan assumes it can be shown again between runs or replaced with an equivalent post-run preflight panel before new run settings are applied.
- Scope reusable between-run preflight changes to progression/loadout/mutator choices. Map theme changes require a full `Game`/`Simulation` rebuild because terrain and environment are constructed only once today.

## Release 1: Retention Foundation

### 1. Expand Player Profile Persistence
- Extend [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js) to persist:
  - unlocked upgrades
  - equipped loadout
  - lifetime stats
  - mission unlock progress
  - anonymous `profileId`
  - current profile schema version
- Replace `DEFAULT_PLAYER_PROGRESS` with a versioned profile shape so future changes can be migrated safely.
- Add a profile migration helper that upgrades older localStorage payloads without wiping saved best score or achievements.
- Change save/update flows so they merge owned fields rather than rewriting the entire profile object.
- Add dedicated profile-side actions for:
  - `recordRunStart`
  - `recordRunComplete`
  - `purchaseUpgrade`
  - `equipLoadout`
  - `setPreRunSelection`
- Make validation live in the profile/meta layer, not in DOM event handlers.

### 2. Add Lifetime Stats and Currency
- Expand [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js) to track:
  - total kills
  - total time played
  - total pickups collected
  - bosses defeated
  - runs started / completed
  - currency earned across runs
- Introduce a small reward currency earned from score, wave milestones, and completed missions.
- Keep the first economy intentionally simple: no refunds, no branching tree yet, only linear unlock purchases.
- Document run lifecycle integration explicitly:
  - initial launch starts a run from [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js)
  - replay starts a run through a new `Game.restartRun()` wrapper
  - game over records completion once from [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js)
- Add a per-run `runId` and a local run index so analytics can correlate starts and completions.

### 3. Add Run Summary Flow
- Add a post-run summary overlay in [`/Users/madhur/conductor/repos/drone-wars/index.html`](/Users/madhur/conductor/repos/drone-wars/index.html) and [`/Users/madhur/conductor/repos/drone-wars/src/style.css`](/Users/madhur/conductor/repos/drone-wars/src/style.css).
- Add summary DOM refs and UI controller wiring in [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js).
- Add a public `Game.restartRun()` method and move restart ownership out of raw game-over key handling.
- Remove or gate the direct `controls.restartPressed` restart path inside [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js) so game-over replay cannot bypass summary rendering or lifecycle tracking.
- Introduce a distinct post-run summary state so:
  - game over records the run once
  - summary renders deterministically
  - restart only happens via the summary CTA or a clearly documented keyboard shortcut routed through the same restart API
- Include:
  - final score
  - highest wave
  - kills
  - pickups
  - new achievements
  - currency earned
  - a prominent “Run it back” button
- Ensure the summary is shown only after the run completes and does not interfere with pause/restart behavior.
- Defer mission-specific summary rows to Release 2.

### 4. Add Basic Upgrade Shop on Start Screen
- Extend the preflight/start UI in [`/Users/madhur/conductor/repos/drone-wars/index.html`](/Users/madhur/conductor/repos/drone-wars/index.html) to display a compact hangar/loadout panel that can be revisited between runs.
- Treat map theme as a separate full-launch setting unless a later change explicitly adds a `Game` rebuild path.
- Implement starter upgrades in new focused modules:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/upgrades.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/loadout.js`
- Add a shared runtime modifier builder in:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/runModifiers.js`
- Initial upgrades should modify existing systems only:
  - hull integrity bonus
  - pulse cooldown reduction
  - pickup magnet radius
  - slight weapon spread control
- Compute `runModifiers` before each run starts and thread them through [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js), [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js), and [`/Users/madhur/conductor/repos/drone-wars/src/game/entities/Player.js`](/Users/madhur/conductor/repos/drone-wars/src/game/entities/Player.js).
- Document ownership for validation:
  - upgrade definitions and prices in `meta/upgrades.js`
  - equip rules in `meta/loadout.js`
  - purchase/equip persistence and affordability checks in `playerProfile.js`

### 5. Add Retention Analytics Events
- Extend [`/Users/madhur/conductor/repos/drone-wars/src/game/analytics.js`](/Users/madhur/conductor/repos/drone-wars/src/game/analytics.js) with:
  - `run_started`
  - `run_completed`
  - `run_summary_viewed`
  - `run_restarted_from_summary`
  - `upgrade_purchased`
  - `loadout_equipped`
  - `mission_completed`
- Ensure analytics calls are best-effort only and preserve the current no-op behavior when GA is unavailable.
- Harden the analytics wrapper to guard on `globalThis.window` or `globalThis.gtag` so the expanded analytics surface is safe in browserless test environments.
- Add `profileId`, `runId`, run index, and current map/loadout/mutator metadata to run lifecycle events so the success metrics are measurable.

## Release 2: In-Run Goal Variety

### 6. Introduce Mission Types
- Add a mission system in new modules:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/missions.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/missions.test.js`
- Start with 3 mission templates that fit the current simulation:
  - survival: reach wave N
  - hunter: destroy X airborne enemies
  - demolition: destroy X heavy targets (`tank`, `turret`, `ship`, `boss`)
- Make exactly one mission active per run to keep the UI simple.
- Define deterministic mission classifications up front:
  - airborne: `drone`, `missile`, `boss`
  - heavy: `tank`, `turret`, `ship`, `boss`
- Gate mission assignment by expected availability so early runs cannot receive impossible demolition quotas.
- Surface the active mission in the HUD and run summary.

### 7. Thread Mission State Through Simulation
- Store active mission progress in [`/Users/madhur/conductor/repos/drone-wars/src/game/state.js`](/Users/madhur/conductor/repos/drone-wars/src/game/state.js) and snapshot APIs returned from [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js).
- Add authoritative mission hooks inside [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.js):
  - enemy destroyed in `applyDamageToEnemy()`
  - wave start/complete in `beginWave()`
  - pickup collected at the collection mutation point
- Use snapshots only for UI projection, not as the source of truth for mission completion.
- Guarantee mission completion is idempotent so the reward cannot be granted multiple times if restart timing or game-over flow changes later.

### 8. Add One Mutator Slot Per Run
- Introduce optional run modifiers in a new module:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/mutators.js`
- Examples:
  - high-risk: enemies fire faster, score and currency bonus
  - scavenger: more pickups, lower base health
  - pulse pilot: shorter pulse cooldown, lower weapon damage
- Select mutators in the reusable preflight UI, persist the selected mutator as current loadout state, and compile it into the same `runModifiers` object used by upgrades.
- Restrict the first release of mutators to numeric tuning of existing systems so implementation remains contained.
- Document the touchpoints for enemy-side mutators: enemy constructors, spawn pacing, pickup timing, and score/currency multipliers.

## Release 3: Build Depth and Replayability

### 9. Add One Secondary Ability Slot
- Implement a simple ability framework in:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/abilities.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/abilities.test.js`
- First add a thin ability abstraction that preserves current pulse behavior while replacing pulse-specific HUD/snapshot wiring with generic ability metadata.
- After that refactor lands, migrate the current pulse into the framework as the default equipped ability.
- Add one new unlockable ability with distinct play value but low engine risk:
  - `dash`: quick burst movement with cooldown and brief invulnerability window
- Update controls copy in [`/Users/madhur/conductor/repos/drone-wars/index.html`](/Users/madhur/conductor/repos/drone-wars/index.html) and aim/HUD messaging in [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js).
- Keep the existing `pulseAce` achievement working during and after the refactor.
- Keep exactly one active ability at a time to avoid control overload.

### 10. Add Enemy Role Variants Without Major Engine Changes
- Implement 2 higher-value behavior variants as drone subtypes before introducing new top-level enemy types:
  - jammer drone: temporarily reduces radar range or lock quality
  - support drone: buffs nearby enemies or restores a small amount of health
- Implement them by extending current drone behavior in [`/Users/madhur/conductor/repos/drone-wars/src/game/entities`](/Users/madhur/conductor/repos/drone-wars/src/game/entities) and wave selection in [`/Users/madhur/conductor/repos/drone-wars/src/game/systems/waves.js`](/Users/madhur/conductor/repos/drone-wars/src/game/systems/waves.js).
- Update the required touchpoints explicitly:
  - config entries in [`/Users/madhur/conductor/repos/drone-wars/src/game/config.js`](/Users/madhur/conductor/repos/drone-wars/src/game/config.js)
  - spawn queue annotations
  - HUD/radar labels in [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js)
  - analytics payload classification
  - tests for wave selection and effect behavior
- Favor modifier-style behavior over entirely new rendering or physics systems.

### 11. Add Lightweight Unlock Cadence
- Gate content in clear steps:
  - starter profile: pulse + basic stat upgrades
  - after first boss defeat: mutators unlock
  - after several successful runs: dash ability unlocks
  - after mission completions: support/jammer variants appear in later waves
- Ensure the player is never shown store items they cannot understand; locked items need brief requirements text.
- Add explicit unlock evaluation helpers that compute:
  - `isUnlocked`
  - requirement text
  - whether the item can currently be equipped or purchased

## Implementation Order

### Phase A: Data and UI foundation
1. Expand profile schema and migration helpers in [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.js).
2. Expand run stats and unlock evaluation in [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js).
3. Add run summary markup and styles in [`/Users/madhur/conductor/repos/drone-wars/index.html`](/Users/madhur/conductor/repos/drone-wars/index.html) and [`/Users/madhur/conductor/repos/drone-wars/src/style.css`](/Users/madhur/conductor/repos/drone-wars/src/style.css).
4. Add explicit run lifecycle APIs plus summary rendering and restart CTA wiring in [`/Users/madhur/conductor/repos/drone-wars/src/main.js`](/Users/madhur/conductor/repos/drone-wars/src/main.js) and [`/Users/madhur/conductor/repos/drone-wars/src/game/Game.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Game.js).

### Phase B: Meta systems
5. Add runtime tuning plumbing with `runModifiers`.
6. Add upgrades/loadout modules and purchase/equip flows.
7. Thread equipped bonuses and selected mutators into run setup.
8. Add analytics events for summary, run lifecycle, upgrades, and loadouts.

### Phase C: Run variety
9. Add mission definitions and mission state tracking.
10. Add one mutator slot in the reusable preflight UI.
11. Surface mission/mutator context in HUD and run summary.

### Phase D: Build depth
12. Refactor pulse HUD/snapshot/state into a generic ability slot.
13. Add `dash` as the second ability.
14. Add jammer/support enemy variants and wave integration.

## Test Strategy

### Unit Tests
- Add test-infrastructure support for DOM assertions by switching relevant UI tests to a browser-capable environment such as `jsdom` or an equivalent Vitest setup instead of relying only on the current node environment in [`/Users/madhur/conductor/repos/drone-wars/vite.config.js`](/Users/madhur/conductor/repos/drone-wars/vite.config.js).
- Extend [`/Users/madhur/conductor/repos/drone-wars/src/playerProfile.test.js`](/Users/madhur/conductor/repos/drone-wars/src/playerProfile.test.js) for:
  - profile migration
  - unlock persistence
  - invalid saved schema fallback
  - new profile fields surviving `recordRunComplete`
  - purchase/equip validation
- Extend or add tests around [`/Users/madhur/conductor/repos/drone-wars/src/game/progression.js`](/Users/madhur/conductor/repos/drone-wars/src/game/progression.js) for:
  - currency calculation
  - lifetime stat merges
  - unlock gating
- Add tests for new meta modules:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/upgrades.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/loadout.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/mutators.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/meta/runModifiers.js`
- Add mission and ability tests in new test files:
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/missions.test.js`
  - `/Users/madhur/conductor/repos/drone-wars/src/game/systems/abilities.test.js`
- Extend [`/Users/madhur/conductor/repos/drone-wars/src/game/state.test.js`](/Users/madhur/conductor/repos/drone-wars/src/game/state.test.js) and [`/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.test.js`](/Users/madhur/conductor/repos/drone-wars/src/game/Simulation.test.js) for:
  - mission reward granted once
  - equipped bonuses applied to initial state
  - mission selection and progress updates by classification
  - summary payload contains new retention fields
  - pulse-to-ability compatibility
- Add UI integration coverage for:
  - summary visibility on run completion
  - summary dismiss/restart behavior
  - mission and mutator summary rows appearing only after those releases
- Add analytics wrapper tests or spies for:
  - `run_started`
  - `run_completed`
  - `run_summary_viewed`
  - `run_restarted_from_summary`
  - `upgrade_purchased`
  - `loadout_equipped`
  - `mission_completed`
- Add wave and behavior coverage for jammer/support variants.

### Manual Verification
- Start a fresh profile and verify the first run still boots cleanly.
- Complete a run and confirm the summary shows correct stats and allows immediate restart.
- Purchase an upgrade, reload the page, and confirm it persists and affects the next run.
- Equip a mutator and confirm its numeric changes are visible in gameplay.
- Complete each mission type and confirm rewards and analytics fire once.
- Unlock the second ability and confirm the controls and cooldown messaging remain understandable.

### Verification Commands
- `npm test`
- `npm run build`

## Risks and Mitigations
- Risk: profile schema churn breaks saved local progress.
  - Mitigation: add explicit migration/versioning and tests for older payloads.
- Risk: too many knobs make the start screen cluttered.
  - Mitigation: release in layers, keeping exactly one mission, one mutator, and one active ability slot.
- Risk: progression bonuses trivialize difficulty.
  - Mitigation: keep bonuses additive but small and cover balance with config-driven values.
- Risk: mission tracking duplicates event logic and drifts from combat truth.
  - Mitigation: derive mission progress from existing kill/wave/pickup events in `Simulation`.
- Risk: retention work is not measurable.
  - Mitigation: add targeted analytics events before deeper content investment.

## Future Follow-Up After This Roadmap
- Online leaderboard using a backend or hosted score service
- Replay seed sharing or ghost runs
- Two-player co-op survival
- PvP only after co-op and simulation sync constraints are understood
