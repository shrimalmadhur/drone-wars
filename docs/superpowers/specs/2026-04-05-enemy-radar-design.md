# Enemy Radar Minimap

## Overview

Add a circular radar minimap to the top-right of the HUD showing nearby enemy positions as color-coded dots. The radar uses a forward-up orientation (rotates with the player) and only displays enemies within engagement range.

## Visual Design

- **Shape**: Circular canvas, ~140px diameter
- **Position**: Top-right corner, below the score/wave/enemies metrics bar
- **Background**: Dark semi-transparent (`rgba(9, 17, 32, 0.8)`) with a subtle border ring
- **Player indicator**: Small chevron/triangle at center, pointing up (forward direction)
- **Crosshairs**: Faint horizontal + vertical lines through center for orientation
- **Range ring**: Faint circle at ~75% radius indicating engagement range boundary

### Enemy Dots

- Small filled circles (~3-4px radius)
- Color-coded per `CONFIG.palette`:
  - Tank: `0x9bb37d` (green)
  - Drone: `0xff8865` (orange)
  - Missile: `0xff5f5f` (red)
  - Ship: `0x52c2c8` (teal)
- Subtle glow effect via canvas shadow blur
- Only enemies within 180 world units are shown
- Dots fade in/out as enemies enter/exit radar range

### Rotation

- Forward-up: enemy positions are transformed relative to player position and yaw
- The coordinate system rotates with the player so "ahead" is always up on the radar

## Data Flow

- **Player data**: `Simulation.getSnapshot()` provides `playerPosition` (Vector3) and `playerYaw` (radians)
- **Enemy data**: `Simulation.getAimCandidates()` returns alive enemies with `position`, `type` — filtered by distance <= 180 units
- **No new data sources needed** — everything required already exists in the snapshot/candidates API

## Integration (No New Files)

### `index.html`
- Add `<canvas id="radar" width="140" height="140"></canvas>` inside the HUD area

### `src/main.js`
- Add `radar: document.querySelector('#radar')` to the `hud` object

### `src/game/Game.js`
- Add `renderRadar()` method, called from `renderHud()` each frame
- Store `radarCtx = hud.radar.getContext('2d')` in constructor

### `src/style.css`
- Position the radar canvas in the top-right, below the metrics bar

### Per-Frame Render Logic (`renderRadar()`)

1. Clear the canvas
2. Draw background circle
3. Draw faint crosshair lines
4. Draw range ring at 75% radius
5. Get aim candidates from `this.simulation.getAimCandidates()`
6. For each enemy within 180 units of player position:
   - Compute relative position: `enemyPos - playerPos`
   - Rotate by negative player yaw (forward-up transform)
   - Scale world units to canvas pixels (180 units -> ~60px radius)
   - Clamp to radar bounds
   - Draw colored dot with shadow glow
7. Draw player chevron at center

### Performance

- Canvas 2D drawing on a 140px circle is negligible overhead
- Reuse temporary variables for relative position math (no per-frame allocations)
- `getAimCandidates()` is already called each frame for aim-assist; reusing it is free
