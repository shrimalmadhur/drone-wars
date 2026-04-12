# Drone Wars Next Improvements Issue Drafts

Repository: `shrimalmadhur/drone-wars`

These issue drafts are derived from the current shipped state of the repo, not from a generic wishlist. They focus on the next improvements that add gameplay variety and replayability on top of the existing systems.

## Issue 1

Title: `Boss encounter overhaul: add distinct boss patterns and phase transitions`

Body:

```md
## Summary
The current game already has a boss enemy, but the next leverage point is not more progression scaffolding. It is making boss encounters feel more distinct, more learnable, and more replayable.

This issue adds multiple boss attack patterns and simple phase transitions so boss waves feel like a major event instead of a scaled health pool.

## Goals
- Add 2-3 distinct boss attack patterns
- Add at least 2 boss phases tied to health thresholds
- Improve boss telegraphing so players can read and react to attacks
- Preserve current performance and test coverage expectations

## Scope
- Update boss behavior in `src/game/entities/BossEnemy.js`
- Thread any required balance/config values through `src/game/config.js`
- Surface boss phase / threat messaging in `src/game/Game.js` HUD status copy where useful
- Extend simulation tests and any entity tests affected by the new patterns

## Candidate Patterns
- missile barrage pattern
- sweeping projectile fan
- charge / reposition window with vulnerability or spacing pressure

## Acceptance Criteria
- Boss encounters feel mechanically distinct from normal enemy waves
- Boss changes include readable telegraphs before major attacks
- Boss phases change behavior, not just numeric scaling
- Existing game loop remains stable and tests are updated
```

## Issue 2

Title: `Elite wave events: add high-identity encounters beyond numeric scaling`

Body:

```md
## Summary
Wave directives exist today, but most run variety still comes from quantity and stat scaling. This issue adds a small set of more memorable encounter events that materially change how a wave is played.

## Goals
- Add 3-4 elite wave event variants
- Make each event alter player decision-making, not just spawn counts
- Keep implementation compatible with the existing wave/directive pipeline

## Scope
- Extend `src/game/systems/waveDirectives.js`
- Update wave generation logic in `src/game/systems/waves.js` if needed
- Add HUD communication for active elite wave context in `src/game/Game.js`
- Add tests for directive selection and application

## Candidate Events
- hunter squad: faster airborne pursuit pressure
- fortified convoy: fewer enemies, heavier armor, stronger score payout
- blackout sector: weaker radar / lock quality for one wave
- salvage surge: dense pickup economy with higher threat pacing

## Acceptance Criteria
- At least 3 elite wave events are implemented
- Each event has clear player-facing messaging
- Events create noticeably different wave pacing or tactics
- Tests cover selection and modifier application
```

## Issue 3

Title: `Biome gameplay pass: make map themes affect rules, not only presentation`

Body:

```md
## Summary
Map themes are currently persisted and visible, but they should become a replayability system. This issue makes each biome influence gameplay through encounter composition and environmental rules.

## Goals
- Give each map theme a gameplay identity
- Make biome selection meaningfully affect run feel
- Reuse existing environment / terrain / wave systems where possible

## Scope
- Extend map theme metadata in `src/mapThemes.js`
- Thread biome modifiers into `src/game/Simulation.js`
- Apply biome-specific effects through environment, hazards, pickups, and wave composition
- Update any relevant start-screen copy in `src/main.js` and `index.html`

## Candidate Biome Effects
- storm coast: reduced visibility, more airborne pressure
- volcanic basin: more hazard fields and tighter safe space
- salvage graveyard: more pickups, more heavy units
- highlands: more vertical combat windows and long-range pressure

## Acceptance Criteria
- Each map theme has at least one gameplay-impacting modifier
- Biome effects are communicated to the player before a run starts
- Biome differences are visible in moment-to-moment play, not just art direction
- Tests cover biome modifier plumbing where practical
```

## Issue 4

Title: `Loadout archetypes: expand build identity beyond scalar upgrades`

Body:

```md
## Summary
The game already has upgrades, mutators, and abilities, but builds are still mostly numeric tuning. This issue introduces stronger loadout identity so runs feel intentionally different.

## Goals
- Create 3 clear loadout archetypes
- Make loadout choice affect combat rhythm and strengths / weaknesses
- Keep controls understandable and compatible with current input model

## Scope
- Extend meta systems in `src/game/meta/`
- Thread archetype modifiers through `src/game/meta/runModifiers.js`
- Update player combat behavior in `src/game/entities/Player.js`
- Update pre-run UI and summary messaging in `src/main.js` and `index.html`

## Candidate Archetypes
- control pilot: stronger pulse utility, weaker direct DPS
- interceptor: stronger dash mobility and lock pressure
- bruiser: slower handling, higher survivability, heavier burst damage

## Acceptance Criteria
- At least 3 archetypes are selectable
- Each archetype changes gameplay in a recognizable way
- Archetypes are communicated clearly in pre-run UI
- Existing upgrades / mutators still compose cleanly with the new model
```

## Issue 5

Title: `Mission system expansion: chained contracts and meaningful bonus objectives`

Body:

```md
## Summary
The current mission system is a good base, but it is still shallow. This issue expands missions into a stronger run-structure layer with more varied objective types and better risk / reward.

## Goals
- Add more primary mission types
- Add chained or branching bonus objectives
- Make missions shape player choices during the run

## Scope
- Expand mission definitions and state transitions in `src/game/systems/missions.js`
- Update simulation integration in `src/game/Simulation.js`
- Improve mission HUD and run summary communication in `src/game/Game.js` and `src/main.js`
- Add tests for new mission and bonus objective logic

## Candidate Additions
- timed elimination contract
- priority target hunt
- defense / hold-zone style objective using existing arena logic
- branch choice between safer reward and harder reward

## Acceptance Criteria
- Mission variety is meaningfully broader than the current 3 core mission types
- Bonus objectives can create tactical tradeoffs
- Mission progress remains readable in HUD and summary views
- Tests cover the new progression logic
```

## Issue 6

Title: `Combat readability pass: improve telegraphs, warnings, and counterplay clarity`

Body:

```md
## Summary
As more systems accumulate, combat readability becomes a retention issue. This pass improves player understanding of incoming threats and enemy state changes so skill matters more.

## Goals
- Make major enemy attacks easier to read
- Clarify jammer/support drone effects
- Improve missile and boss threat warnings
- Add clearer feedback for enemy vulnerability or state changes where applicable

## Scope
- Update HUD and feedback in `src/game/Game.js`
- Extend enemy behavior and signaling in `src/game/entities/`
- Tune relevant visual/audio cues in `src/game/audio/` and `src/game/effects/`
- Add tests where logic changes are deterministic

## Acceptance Criteria
- Players receive clearer warning before major damage events
- Support and jammer effects are understandable without reading code
- Boss and missile threats have stronger telegraphing
- The readability pass improves clarity without cluttering the HUD
```

## Issue 7

Title: `First-run onboarding and unlock communication pass`

Body:

```md
## Summary
The game now has enough systems that new players can miss important mechanics. This issue improves first-run onboarding and the explanation of unlocked systems so retention does not depend on guessing.

## Goals
- Add a lightweight guided first-run experience
- Explain abilities, mutators, and upgrades more clearly
- Improve unlock messaging and progression readability

## Scope
- Update start / hangar UI in `src/main.js`, `src/style.css`, and `index.html`
- Use profile data in `src/playerProfile.js` to gate onboarding state
- Add lightweight contextual prompts during early runs
- Improve locked-item and newly-unlocked-item messaging

## Acceptance Criteria
- First-time players get a guided introduction to movement, firing, and ability usage
- Unlock requirements and benefits are visible in the UI
- Newly unlocked content is acknowledged clearly after a run
- Returning players are not forced through intrusive tutorials
```

## Suggested Implementation Order

1. Boss encounter overhaul
2. Elite wave events
3. Combat readability pass
4. Biome gameplay pass
5. Mission system expansion
6. Loadout archetypes
7. First-run onboarding and unlock communication
