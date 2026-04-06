# Drone Wars

Single-player 3D drone combat game built with Three.js + Vite.

## Commands

- `npm run dev` — start dev server (Vite)
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run test` — run tests (vitest)

## Architecture

```
src/
├── main.js                    # Entry point, wires HUD DOM refs to Game
├── style.css                  # All CSS (HUD, reticle, layout)
├── game/
│   ├── Game.js                # Render loop, camera, aim-assist, HUD updates
│   ├── Simulation.js          # Game state engine: spawning, physics, collisions
│   ├── config.js              # All tuning constants (CONFIG object)
│   ├── state.js               # Game state enum (BOOT/RUNNING/PAUSED/GAME_OVER)
│   ├── input.js               # Keyboard input → snapshot object
│   ├── math.js                # Collision detection, aim-assist, RNG
│   ├── entities/
│   │   ├── Player.js           # Player drone: movement, shooting, damage
│   │   ├── EnemyBase.js        # Base class for all enemies
│   │   ├── DroneEnemy.js       # Aerial orbiting enemy
│   │   ├── TankEnemy.js        # Ground-based enemy
│   │   ├── ShipEnemy.js        # Water-based stationary enemy
│   │   ├── MissileEnemy.js     # Homing projectile enemy
│   │   └── Projectile.js      # Pooled projectile system
│   ├── systems/
│   │   └── waves.js            # Wave composition & spawn scheduling
│   └── world/
│       ├── terrain.js          # Procedural terrain chunks, biomes, decoration
│       └── environment.js      # Sky, lighting, fog, atmosphere
index.html                      # HTML overlay (HUD, reticle, metrics)
```

## Key Patterns

- **HUD is HTML DOM overlay**, not canvas or Three.js. Elements are queried in `main.js` and passed to `Game` as a `hud` object. Updated every frame in `Game.renderHud()`.
- **Enemies** are stored in `Simulation.enemies[]` array. Each has `.group.position` (Vector3), `.type`, `.health`, `.alive`.
- **Player position**: `Simulation.player.group.position` (Vector3), yaw in `Simulation.player.yaw`.
- **Snapshot pattern**: `Simulation.getSnapshot()` returns current game state for rendering. `Simulation.getAimCandidates()` returns alive enemies for aim-assist.
- **Coordinate system**: X/Z horizontal, Y vertical. Arena radius 180 units. Altitude range 7–82.
- **Enemy colors** defined in `CONFIG.palette`: tank=green, drone=orange, missile=red, ship=teal.
- **Fixed timestep** simulation (1/60s) with accumulator pattern in `Game.start()`.

## Conventions

- ES6 modules, no TypeScript
- No framework — vanilla JS + Three.js
- CSS in single `style.css` file
- Config constants centralized in `config.js`
