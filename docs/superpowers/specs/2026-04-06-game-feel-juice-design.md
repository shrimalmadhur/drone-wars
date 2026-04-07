# Game Feel / Juice — Design Spec

Enhance combat feedback across the board: screen shake, hit direction indicators, explosion debris, projectile visuals, and kill confirmation score pops. Goal is to make every shot fired and every hit taken feel impactful and arcadey.

## 1. Screen Shake System

A `CameraShake` class that layers multiple simultaneous shake events. Each event has intensity, duration, and linear decay.

### Shake Triggers

| Event | Intensity | Duration | Notes |
|-------|-----------|----------|-------|
| Player takes damage | 0.8 (strong) | 300ms | Random XY offset |
| Enemy killed | 0.5 (medium) | 200ms | Random XY offset |
| Player fires | 0.15 (subtle) | 80ms | Backward nudge along aim axis |

### Behavior

- Each frame, sum all active shake offsets and apply to camera position
- Offsets are random XY, decaying linearly over the event's duration
- Multiple shakes stack additively, capped at max displacement of 1.2 units to prevent the camera flying off-screen
- Lives in a new `CameraShake` class, called from `Game.js` each render frame

## 2. Hit Direction Indicators

Two-layer HTML/CSS overlay system (consistent with existing HUD pattern) triggered when the player takes damage.

### Vignette Layer

- Full-screen CSS overlay with radial gradient: transparent center, red edges
- Gradient offset toward the side damage came from (angle between player forward vector and damage source direction)
- Fade in 50ms, hold 150ms, fade out 300ms
- Opacity scales with damage amount (bigger hit = more intense)

### Chevron Layer

- Small red chevron/arrow as a CSS element
- Positioned on a circle ~120px from screen center, pointing toward damage source in screen space
- Same fade timing as vignette (50ms in, 150ms hold, 300ms out)
- Multiple simultaneous hits from different directions show multiple chevrons

### Implementation

- New elements in `index.html`, styled in `style.css`
- Driven by damage events in `Game.js`

## 3. Explosion & Debris System

Triggered when an enemy's `.alive` goes false.

### Fireball

- 3-4 overlapping spheres at slightly offset positions around death point
- Color transition: bright orange-white -> orange-red -> dark smoke gray
- Scales up rapidly, fades over ~600ms
- Point light at explosion center that brightens then dims with fireball lifecycle

### Debris Chunks

- 3-5 random geometric pieces (box/wedge shapes) per enemy death
- Colored to match enemy type from `CONFIG.palette`
- Each piece gets random outward velocity + spin + downward gravity
- Tumble for ~1.5s, fade out (opacity) over the last 0.3s
- No terrain collision — pieces fall through for simplicity and performance

### Implementation

- New `ExplosionEffect` class in `src/game/effects/`
- Debris geometry pre-generated (a few simple reusable shapes)
- Pool of ~15 explosion instances to avoid GC spikes during heavy waves
- `Simulation.js` triggers the effect at enemy position on death

## 4. Enhanced Projectile Visuals

### Muzzle Flash

- Bright cyan point light + small billboard sprite at gun barrel position
- Flares up on fire, decays over ~60ms
- Light intensity strong enough to briefly illuminate nearby geometry

### Projectile Trails

- Replace current basic trail with a ribbon/streak that stretches based on speed
- 3-4 segments long, fading in opacity from head to tail
- Emissive material: player shots cyan, enemy shots warm orange
- Each projectile carries a small point light (low intensity, ~8m range) tinting nearby surfaces

### Lock-on Tracking Visibility

- When a projectile curves toward a locked target, trail gets slightly brighter/wider
- Makes tracking visually readable

### Implementation

- Trail geometry in `Projectile.js` becomes a short `BufferGeometry` ribbon updated each frame
- Muzzle flash managed in `Player.js` fire method
- Point lights on projectiles pooled (reused from projectile pool)

## 5. Kill Confirmation — 3D Score Pops

### Behavior

- Floating text shows score value (+110, +150, etc.) at enemy death position in 3D world space
- Text drifts upward ~5 units/sec
- Fades out over ~1s
- Color matches enemy type from `CONFIG.palette` (green=tank, orange=drone, red=missile, teal=ship)
- Scales slightly larger as it rises (starts small, grows ~1.3x)

### Implementation

- Three.js sprite with canvas-rendered text (avoids DOM overhead for many simultaneous pops)
- Pool of ~10 sprite instances recycled
- Updated each frame in `Game.js` render loop: position drifts up, opacity decreases
- Billboard-style (always faces camera)

## New Files

- `src/game/effects/CameraShake.js` — shake event manager
- `src/game/effects/ExplosionEffect.js` — fireball + debris pool
- `src/game/effects/ScorePop.js` — 3D floating score text pool

## Modified Files

- `src/game/Game.js` — integrate shake, hit indicators, score pops into render loop
- `src/game/Simulation.js` — fire explosion effects on enemy death, pass damage source info
- `src/game/entities/Player.js` — muzzle flash on fire, pass damage direction to HUD
- `src/game/entities/Projectile.js` — ribbon trail geometry, per-projectile point lights
- `index.html` — vignette overlay + chevron container elements
- `src/style.css` — vignette and chevron styles/animations
- `src/game/config.js` — new CONFIG entries for all tuning constants (shake intensities, durations, pool sizes, etc.)
