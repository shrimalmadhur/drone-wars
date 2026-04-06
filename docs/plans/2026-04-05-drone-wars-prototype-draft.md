# Drone Wars Prototype Plan

## Goal
Build the first playable single-player `Drone Wars` prototype in this workspace using Three.js. No implementation code exists yet, so all runtime files and directories will be created from scratch. The prototype should establish the game loop and core systems, not the full final content set.

## Scope
- Browser-based Three.js game bootstrapped with Vite.
- One player-controlled combat drone.
- Infinite-ammo shooting with cooldown.
- Procedural battlefield with mountains, sea, and enemy zones.
- Initial enemy set:
  - Ground tanks that patrol and fire upward.
  - Enemy drones that chase and shoot.
  - Missile threats that home toward the player.
  - Sea ships near the waterline that act as ranged turrets.
- HUD with health, score, wave, enemy count, and control hints.
- Basic wave progression and restart flow.

## Out of Scope
- Multiplayer.
- Audio.
- Save/load.
- Sophisticated physics or collision libraries.
- Asset pipeline with imported 3D models.

## Implementation Steps

### 1. Project scaffold
- Create `package.json` with:
  - `three` in `dependencies`
  - `vite` and `vitest` in `devDependencies`
  - scripts for `dev`, `build`, `preview`, and `test`
- Add `index.html`, `src/main.js`, `src/style.css`, and `vite.config.js`.
- In `index.html`, create:
  - `#app` as the renderer mount target
  - a HUD overlay with stable IDs for score, health fill, wave, enemy count, status, and controls
- In `src/main.js`, instantiate `new Game(...)`, append the renderer canvas, and import `src/style.css`.
- Add `README.md` with run/build instructions.
- Run `npm install` immediately after scaffold creation to lock dependencies early.

### 2. Core game architecture
- Add `src/game/Game.js` as the main coordinator for renderer, scene, camera, update loop, restart flow, and UI bindings.
- Add small focused modules and create all directories from scratch:
  - `src/game/config.js`
  - `src/game/input.js`
  - `src/game/math.js`
  - `src/game/state.js`
  - `src/game/entities/player.js`
  - `src/game/entities/projectile.js`
  - `src/game/entities/EnemyBase.js`
  - `src/game/entities/TankEnemy.js`
  - `src/game/entities/DroneEnemy.js`
  - `src/game/entities/MissileEnemy.js`
  - `src/game/entities/ShipEnemy.js`
  - `src/game/world/terrain.js`
  - `src/game/world/environment.js`
  - `src/game/systems/waves.js`
- Keep all entities on lightweight classes with `update(dt, context)` and `dispose()` methods.
- Define the integration contract explicitly:
  - `Game` owns the scene graph, entity arrays/pools, score/health/wave state, and HUD sync.
  - `input.js` exposes a mutable control snapshot plus reset/teardown helpers.
  - `terrain.js` exposes `getGroundHeight(x, z)`, `isSea(x, z)`, `clampToArena(position)`, and spawn helpers.
  - `waves.js` decides what enemy types spawn and when.
  - Collision and damage results feed back into `Game`, which updates state and HUD.
- Use a delta-time game loop with clamping in `Game.js`, and make all timers, movement, cooldowns, homing, and invulnerability windows seconds-based.
- Define a simple finite-state machine in `state.js` or `Game.js`: `boot`, `running`, `gameOver`, `restartPending`.

### 3. Rendering and world setup
- Configure fog, sky-colored background, directional sunlight, ambient light, and shadow settings.
- Generate a procedural battlefield:
  - Rolling ground plane with height variation.
  - Clustered mountain meshes around the map edge.
  - A sea region with ship spawns.
- Define spawn regions for `ground`, `air`, `missile`, and `sea` threats and expose them through the world helpers.
- Add simple geometry-based art direction using primitive meshes and color palette constants, since the repo has no assets.

### 4. Player drone and controls
- Implement the player drone mesh with a chase camera.
- Use a concrete default control model:
  - `W/S`: forward/back thrust
  - `A/D`: yaw left/right
  - Arrow keys: strafe left/right and pitch assist
  - `Q/E`: altitude down/up
  - `Space`: fire along the drone forward vector
- Add bounded arena logic, health, fire cooldown, invulnerability window after hits, and simple bank/tilt animation derived from movement.
- Reset input on `blur`, `visibilitychange`, and restart so controls cannot get stuck.

### 5. Combat systems
- Add projectile pooling for player/enemy fire to avoid unbounded growth and silent deletion.
- Implement collision checks with distance-based hit tests.
- Tune infinite ammo around cooldown and projectile speed instead of clip limits.
- Add explosion flashes / debris-lite feedback with ephemeral meshes or particle points.
- Define projectile expiry rules: hit disposal, arena-bounds cleanup, max lifetime, and full pool reset on restart.

### 6. Enemy systems
- Implement a shared enemy base with variants:
  - Tank: ground-constrained patrol, periodic shell fire.
  - Drone: airborne chaser, circles player before firing.
  - Missile: fast homing threat with limited lifetime.
  - Ship: sea-bound turret with slower heavy shots.
- Add wave spawner logic in `src/game/systems/waves.js`.
- Increase difficulty by wave count via spawn counts, speed, and fire cadence.
- Enforce fairness rules:
  - minimum spawn distance from player
  - per-type concurrency caps
  - spawn cooldowns
  - off-screen or edge-biased spawn positions
  - telegraphed missile entries where possible

### 7. HUD and game state
- Build overlay HUD in HTML/CSS for title, controls, score, health bar, wave number, enemy count, and restart prompt.
- Wire DOM updates from `Game.js`.
- Treat `Game` as the owner of score increments, health changes, enemy counts, and wave transitions, then push those values into the HUD on state change or each frame.
- Define restart/reset steps explicitly:
  - dispose transient effects
  - clear enemies and active projectiles
  - reset projectile pools
  - restore player state and respawn position
  - reset score, wave, timers, and HUD
  - preserve one input binding set and avoid duplicate listeners

### 8. Verification
- Add unit tests with `vitest` for:
  - math/collision helpers
  - wave scaling and spawn composition
  - projectile lifetime/pool behavior
  - restart state reset logic
- Run `npm test`.
- Run `npm run build` to catch syntax/import issues.
- Run a runtime smoke check in local dev to verify:
  - scene boots
  - movement works
  - firing works
  - enemies spawn
  - health/score update
  - restart works
  - focus-loss input reset works

## Milestones
- Milestone 1: scaffold builds after `npm install`
- Milestone 2: terrain and camera render
- Milestone 3: player movement and firing work
- Milestone 4: one enemy type can spawn, attack, and die
- Milestone 5: all prototype enemy types and wave flow work
- Milestone 6: tests and production build pass

## Risks and Mitigations
- Risk: Greenfield scope could sprawl into an unfinished architecture.
  - Mitigation: Keep art primitive-based and build only one clean vertical slice.
- Risk: Too many entities could tank browser performance.
  - Mitigation: Use capped entity counts, cheap geometry, and straightforward cleanup.
- Risk: Empty repo means no test harness.
  - Mitigation: Treat `npm run build` as the minimum executable verification and keep logic decomposed for future automated tests.

## Verification Commands
- `npm install`
- `npm test`
- `npm run build`
