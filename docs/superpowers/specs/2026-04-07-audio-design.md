# Audio System — Design Spec

Add a fully procedural audio system using the Web Audio API. All sounds are synthesized at runtime — zero audio file downloads. Covers combat SFX, game state cues, ambient atmosphere, and a dynamic engine hum. Full 3D spatial audio for world-positioned sounds.

## 1. Audio Engine Architecture

A single `AudioEngine` class owns the Web Audio API `AudioContext` and manages all sound playback.

### Responsibilities
- Create and resume the AudioContext (requires user gesture per browser policy)
- Master volume control + mute toggle (M key)
- Library of procedural sound generators (functions that build short-lived audio graphs)
- 3D listener tracking synced to camera position/orientation each frame
- Spatial positioning for world sounds via PannerNodes
- Continuous sound management (engine hum, wind loop, low health warning)

### Lifecycle
- Instantiated in `Game.js` constructor
- AudioContext created and resumed on first user interaction (start form submit)
- `updateListener(camera)` called each render frame
- Continuous sounds start on game begin, stop on game over/pause
- Disposed on game dispose

## 2. Combat Sounds

All procedural — built from oscillators, noise buffers, and filters. Each creates a short-lived audio graph that self-disposes after playback.

| Sound | Trigger | Technique | Spatial |
|-------|---------|-----------|---------|
| Player fire | Player shoots | Short bright saw wave burst, high pitch, fast decay | No |
| Enemy fire | Enemy shoots | Duller square wave pop, lower pitch | Yes (enemy position) |
| Projectile impact | Projectile hits terrain/obstacle | White noise burst + low thud, very short | Yes (impact position) |
| Player hit | Player takes damage | Distorted crunch + low rumble, mid duration | No (centered) |
| Explosion | Enemy killed | Layered noise burst — initial crack, then rolling low-frequency rumble over ~0.6s | Yes (death position) |
| Missile flyby | Missile within 30 units of player (checked each frame in Game.js from enemy positions) | Doppler-shifted sine sweep, pitch drops as it passes. Cooldown of 2s per missile to avoid spam. | Yes (missile position) |
| Lock-on acquired | Aim assist locks | Two-tone ascending beep (short-short) | No (UI) |

Spatial sounds use PannerNode positioned at world coordinates. Non-spatial sounds play through master gain directly.

## 3. Continuous Sounds

| Sound | Behavior | Technique |
|-------|----------|-----------|
| Engine hum | Plays while game is running, pitch modulated by player speed | Filtered sawtooth oscillator, pitch range mapped to velocity magnitude |
| Wind/atmosphere | Plays while game is running, constant volume | Filtered white noise with slow LFO on filter cutoff |

Both start on game begin, stop on game over or pause.

## 4. Game State Sounds

| Sound | Trigger | Technique |
|-------|---------|-----------|
| Wave complete | All enemies cleared | Ascending three-tone chime (sine waves), pleasant |
| Game over | Health reaches 0 | Descending minor chord sting, fades into low rumble |
| Low health warning | Health below 25% | Repeating short beep every ~0.8s, stops when health rises above 25% or game ends |

Low health warning is a repeating interval created/destroyed on health threshold crossings.

## 5. 3D Spatial Audio

- Web Audio API PannerNode with `HRTF` panning model for realistic 3D positioning
- Distance model: inverse, with refDistance and maxDistance tuned so nearby sounds are loud, distant sounds fade naturally
- Listener position and orientation updated from camera each frame via `AudioListener`
- Coordinate system maps directly from Three.js world coordinates (X/Z horizontal, Y vertical)

## 6. File Structure

```
src/game/audio/
├── AudioEngine.js    — Context, listener, master gain, mute, playback methods, continuous sound management
├── sounds.js         — All procedural sound generator functions (one per sound)
└── constants.js      — Audio-specific synthesis parameters (frequencies, durations, envelopes)
```

Sound generators are separated from the engine because ~13 sounds at 15-30 lines each would bloat the engine file. AudioEngine imports and calls them.

Audio synthesis parameters (oscillator frequencies, filter cutoffs, envelope times) live in `constants.js` rather than the main CONFIG to avoid bloating it with 50+ audio-specific values. `CONFIG.audio` holds only high-level knobs.

## 7. Integration Points

### Game.js (render loop)
- Instantiate `AudioEngine` in constructor
- Resume AudioContext on user gesture (start form submit)
- Call `engine.updateListener(camera)` each frame
- Call `engine.setEngineSpeed(playerSpeed)` each frame for dynamic pitch
- Trigger sounds from snapshot data:
  - `fireFlash` rising → `playPlayerFire()`
  - `killEvents` → `playExplosion(x, y, z)` per kill
  - `damageEvents` → `playPlayerHit()` per damage event
  - `fireEvents` → `playEnemyFire(x, y, z)` per enemy fire
  - Health crossing 25% threshold → start/stop low health warning
  - Mode transitions → `playWaveComplete()`, `playGameOver()`
  - Lock-on state change → `playLockOn()`

### Simulation.js
- Add `fireEvents` array (same pattern as killEvents/damageEvents)
- Populate when enemies fire with `{ x, y, z, type }`
- Expose in `getSnapshot()` via `.slice()`, clear in `clearFrameEvents()`

### Input.js
- Add M key binding for mute toggle

### Config
- New `CONFIG.audio` section: masterVolume, distanceRef, distanceMax, lowHealthThreshold, enginePitchRange

## 8. Modified Files

- `src/game/config.js` — add `CONFIG.audio` section
- `src/game/Game.js` — instantiate engine, per-frame updates, trigger sounds
- `src/game/Simulation.js` — add `fireEvents` array for enemy fire positions
- `src/game/input.js` — add M key for mute toggle
- `src/main.js` — pass audio references to Game

## 9. New Files

- `src/game/audio/AudioEngine.js` — main engine class
- `src/game/audio/sounds.js` — procedural sound generators
- `src/game/audio/constants.js` — synthesis parameters
