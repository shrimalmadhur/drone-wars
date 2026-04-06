# Enemy Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a circular radar minimap in the top-right HUD showing color-coded enemy dots within engagement range, rotating with the player (forward-up).

**Architecture:** HTML canvas element overlaid on the HUD, drawn every frame via Canvas 2D API. Enemy positions are transformed relative to player position/yaw. No new files — modifications to 4 existing files.

**Tech Stack:** Canvas 2D API, existing Three.js game loop

---

### Task 1: Add radar canvas to HTML and wire up HUD reference

**Files:**
- Modify: `index.html:20-39` (inside `.hud__topbar`)
- Modify: `src/main.js:6-18` (hud object)

- [ ] **Step 1: Add canvas element to index.html**

Add the radar canvas after the `.hud__metrics` div, inside `.hud__topbar`:

```html
<!-- In index.html, after the closing </div> of .hud__metrics (line 39), add: -->
<canvas id="radar" class="radar" width="140" height="140"></canvas>
```

The full `.hud__topbar` section should look like:

```html
<div class="hud__topbar">
  <div>
    <p class="hud__eyebrow">Single-player combat prototype</p>
    <h1>Drone Wars</h1>
  </div>
  <div class="hud__metrics">
    <div class="metric">
      <span class="metric__label">Score</span>
      <strong id="score-value">0</strong>
    </div>
    <div class="metric">
      <span class="metric__label">Wave</span>
      <strong id="wave-value">1</strong>
    </div>
    <div class="metric">
      <span class="metric__label">Enemies</span>
      <strong id="enemy-count">0</strong>
    </div>
  </div>
  <canvas id="radar" class="radar" width="140" height="140"></canvas>
</div>
```

- [ ] **Step 2: Add radar to hud object in main.js**

Add `radar` to the hud object in `src/main.js`:

```javascript
const hud = {
  score: document.querySelector('#score-value'),
  wave: document.querySelector('#wave-value'),
  enemyCount: document.querySelector('#enemy-count'),
  healthValue: document.querySelector('#health-value'),
  healthFill: document.querySelector('#health-fill'),
  status: document.querySelector('#status-panel'),
  reticle: document.querySelector('#reticle'),
  reticleLabel: document.querySelector('#reticle-label'),
  hitMarker: document.querySelector('#hit-marker'),
  targetName: document.querySelector('#target-name'),
  targetHealth: document.querySelector('#target-health'),
  radar: document.querySelector('#radar'),
};
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: add radar canvas element and HUD reference"
```

---

### Task 2: Style the radar canvas with CSS

**Files:**
- Modify: `src/style.css` (add radar styles at end, before `@media`)

- [ ] **Step 1: Add radar CSS**

Add these styles to `src/style.css` just before the `@media (max-width: 900px)` block:

```css
.radar {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  backdrop-filter: blur(14px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  flex-shrink: 0;
  align-self: flex-start;
}
```

Also add a responsive rule inside the existing `@media (max-width: 900px)` block:

```css
.radar {
  width: 100px;
  height: 100px;
  align-self: flex-end;
}
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`

Open the browser. Confirm:
- A dark circular element appears in the top-right area, next to the metrics
- It has the same panel styling as the metric cards
- It's 140px and circular

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat: style radar canvas with panel appearance"
```

---

### Task 3: Add radar rendering infrastructure to Game.js

**Files:**
- Modify: `src/game/Game.js:8-35` (constructor) and add `renderRadar()` method

- [ ] **Step 1: Store radar context and constants in Game constructor**

In `src/game/Game.js`, add these lines inside the constructor, after `this.aimState = { ... };` (after line 35):

```javascript
this.radarCtx = hud.radar.getContext('2d');
this.radarSize = hud.radar.width;
this.radarCenter = this.radarSize / 2;
this.radarWorldRadius = 180;
this.radarDrawRadius = this.radarCenter - 10;
```

- [ ] **Step 2: Add empty renderRadar method and call it from renderHud**

Add the `renderRadar()` method to the `Game` class, after the `renderHud()` method:

```javascript
renderRadar() {
  const ctx = this.radarCtx;
  const cx = this.radarCenter;
  const r = this.radarDrawRadius;

  ctx.clearRect(0, 0, this.radarSize, this.radarSize);

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(9, 17, 32, 0.8)';
  ctx.fill();

  // Border ring
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(138, 244, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
```

Add a call to `this.renderRadar()` at the end of the `renderHud()` method (after the target health else block, around line 159):

```javascript
this.renderRadar();
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Confirm the radar shows as a dark circle with a subtle border in the top-right. It should be empty (no dots yet).

- [ ] **Step 4: Commit**

```bash
git add src/game/Game.js
git commit -m "feat: add radar rendering infrastructure with background circle"
```

---

### Task 4: Draw crosshairs, range ring, and player chevron

**Files:**
- Modify: `src/game/Game.js` (expand `renderRadar()`)

- [ ] **Step 1: Add crosshairs and range ring**

Expand `renderRadar()` — add this code after the border ring drawing, before the closing brace:

```javascript
// Crosshair lines
ctx.strokeStyle = 'rgba(138, 244, 255, 0.08)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(cx - r, cx);
ctx.lineTo(cx + r, cx);
ctx.moveTo(cx, cx - r);
ctx.lineTo(cx, cx + r);
ctx.stroke();

// Range ring at 75%
ctx.beginPath();
ctx.arc(cx, cx, r * 0.75, 0, Math.PI * 2);
ctx.strokeStyle = 'rgba(138, 244, 255, 0.06)';
ctx.stroke();
```

- [ ] **Step 2: Add player chevron at center**

Add this code after the range ring, still inside `renderRadar()`:

```javascript
// Player chevron (pointing up = forward)
ctx.fillStyle = 'rgba(138, 244, 255, 0.9)';
ctx.beginPath();
ctx.moveTo(cx, cx - 5);
ctx.lineTo(cx - 3.5, cx + 3);
ctx.lineTo(cx + 3.5, cx + 3);
ctx.closePath();
ctx.fill();
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Confirm:
- Faint crosshair lines visible through center
- A faint range ring at 75% radius
- A small cyan chevron pointing up at center

- [ ] **Step 4: Commit**

```bash
git add src/game/Game.js
git commit -m "feat: add radar crosshairs, range ring, and player chevron"
```

---

### Task 5: Draw enemy dots with color coding and glow

**Files:**
- Modify: `src/game/Game.js` (expand `renderRadar()`)

- [ ] **Step 1: Add color lookup constant**

Add this constant at the top of `Game.js`, after the existing imports (after line 6):

```javascript
const RADAR_COLORS = {
  tank: '#9bb37d',
  drone: '#ff8865',
  missile: '#ff5f5f',
  ship: '#52c2c8',
};
```

- [ ] **Step 2: Add enemy dot rendering logic**

In `renderRadar()`, add this code after the player chevron drawing and before the closing brace:

```javascript
// Enemy dots
const snapshot = this.simulation.getSnapshot();
const candidates = this.simulation.getAimCandidates();
const scale = this.radarDrawRadius / this.radarWorldRadius;
const cosYaw = Math.cos(-snapshot.playerYaw);
const sinYaw = Math.sin(-snapshot.playerYaw);

for (const enemy of candidates) {
  const dx = enemy.position.x - snapshot.playerPosition.x;
  const dz = enemy.position.z - snapshot.playerPosition.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > this.radarWorldRadius) {
    continue;
  }

  // Rotate relative position by negative yaw (forward-up)
  const rx = dx * cosYaw - dz * sinYaw;
  const rz = dx * sinYaw + dz * cosYaw;

  // Scale to canvas and flip Z so forward (positive Z in game) is up on radar
  const px = cx + rx * scale;
  const py = cx - rz * scale;

  // Fade at edge of range
  const alpha = dist > this.radarWorldRadius * 0.85
    ? 1 - (dist - this.radarWorldRadius * 0.85) / (this.radarWorldRadius * 0.15)
    : 1;

  const color = RADAR_COLORS[enemy.type] || '#ffffff';

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

// Reset shadow and alpha
ctx.shadowBlur = 0;
ctx.globalAlpha = 1;
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Play the game. Confirm:
- Enemy dots appear on the radar as colored circles
- Tanks are green, drones are orange, missiles are red, ships are teal
- Dots have a subtle glow effect
- Dots move relative to the player's position
- Turning the drone rotates the dot positions (forward-up works)
- Dots only appear for enemies within ~180 units
- Dots fade out near the edge of the radar range

- [ ] **Step 4: Commit**

```bash
git add src/game/Game.js
git commit -m "feat: render color-coded enemy dots on radar with glow and fade"
```

---

### Task 6: Final cleanup and verify

**Files:**
- No new changes — verification only

- [ ] **Step 1: Full visual verification**

Run: `npm run dev`

Play through at least 2 waves. Verify:
- Radar is visible in top-right, circular, dark background
- Crosshairs and range ring are subtle but visible
- Player chevron at center points up
- Enemy dots appear with correct colors as enemies spawn
- Dots move correctly as enemies move and as the player turns
- Dots disappear when enemies are destroyed
- Dots fade out at the edge of the radar range
- No performance issues (smooth 60fps)
- Radar scales down on narrow viewports (< 900px)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass (no regressions).

- [ ] **Step 4: Final commit if any adjustments were made**

Only if tweaks were needed during verification:
```bash
git add -A
git commit -m "fix: radar visual adjustments from verification"
```
