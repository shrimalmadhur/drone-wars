# Game Feel / Juice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add screen shake, hit direction indicators, explosion debris, enhanced projectile visuals, and 3D score pops to make combat feel impactful and arcadey.

**Architecture:** Five independent effect systems integrated into the existing render loop. CameraShake, ExplosionEffect, and ScorePop are new pooled classes in `src/game/effects/`. Hit direction indicators are CSS overlays driven from Game.js. Projectile visuals are enhanced in-place in Projectile.js and Player.js. All tuning constants added to CONFIG.

**Tech Stack:** Three.js (existing), vanilla JS, CSS animations

---

## File Structure

### New Files
- `src/game/effects/CameraShake.js` — Manages layered shake events, applies offset to camera each frame
- `src/game/effects/ExplosionEffect.js` — Pooled fireball + debris chunks spawned on enemy death
- `src/game/effects/ScorePop.js` — Pooled billboard sprites showing floating score text

### Modified Files
- `src/game/config.js` — New `effects` section with all tuning constants
- `src/game/Game.js` — Integrate shake, hit indicators, score pops into render loop
- `src/game/Simulation.js` — Pass damage source position on player hit, pass enemy info on death
- `src/game/entities/Player.js` — Muzzle flash on fire, expose damage source tracking
- `src/game/entities/Projectile.js` — Ribbon trail geometry, per-projectile point lights
- `index.html` — Vignette overlay + chevron container elements
- `src/style.css` — Vignette and chevron styles/animations
- `src/main.js` — Query new HUD elements and pass to Game

---

### Task 1: Add effect tuning constants to CONFIG

**Files:**
- Modify: `src/game/config.js`

- [ ] **Step 1: Add effects config section**

Add the following `effects` section to the CONFIG object in `src/game/config.js`, after the `palette` section (after line 109, before the closing `};`):

```javascript
  effects: {
    shake: {
      maxDisplacement: 1.2,
      onDamage: { intensity: 0.8, duration: 0.3 },
      onKill: { intensity: 0.5, duration: 0.2 },
      onFire: { intensity: 0.15, duration: 0.08 },
    },
    hitIndicator: {
      fadeIn: 0.05,
      hold: 0.15,
      fadeOut: 0.3,
      chevronRadius: 120,
    },
    explosion: {
      poolSize: 15,
      fireballDuration: 0.6,
      debrisCount: 4,
      debrisDuration: 1.5,
      debrisFadeTime: 0.3,
      debrisGravity: 18,
      debrisSpeed: 12,
    },
    muzzleFlash: {
      duration: 0.06,
      lightIntensity: 3.0,
      lightRange: 15,
    },
    trail: {
      segments: 4,
      lightIntensity: 0.6,
      lightRange: 8,
      trackingWidthMultiplier: 1.5,
      trackingBrightnessBoost: 0.4,
    },
    scorePop: {
      poolSize: 10,
      riseSpeed: 5,
      duration: 1.0,
      startScale: 0.8,
      endScale: 1.3,
      fontSize: 48,
    },
  },
```

- [ ] **Step 2: Verify the config loads**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/config.js
git commit -m "feat: add effects tuning constants to CONFIG"
```

---

### Task 2: Create CameraShake system

**Files:**
- Create: `src/game/effects/CameraShake.js`
- Modify: `src/game/Game.js`

- [ ] **Step 1: Create CameraShake class**

Create `src/game/effects/CameraShake.js`:

```javascript
import { CONFIG } from '../config.js';

export class CameraShake {
  constructor() {
    this.events = [];
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;
  }

  add(intensity, duration, dirX = 0, dirY = 0, dirZ = 0) {
    this.events.push({ intensity, duration, elapsed: 0, dirX, dirY, dirZ });
  }

  update(dt) {
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;

    const max = CONFIG.effects.shake.maxDisplacement;

    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.elapsed += dt;
      if (e.elapsed >= e.duration) {
        this.events.splice(i, 1);
        continue;
      }
      const progress = e.elapsed / e.duration;
      const strength = e.intensity * (1 - progress);

      if (e.dirX !== 0 || e.dirY !== 0 || e.dirZ !== 0) {
        // Directional shake (e.g., recoil)
        const decay = 1 - progress;
        this.offsetX += e.dirX * strength * decay;
        this.offsetY += e.dirY * strength * decay;
        this.offsetZ += e.dirZ * strength * decay;
      } else {
        // Random shake
        this.offsetX += (Math.random() - 0.5) * 2 * strength;
        this.offsetY += (Math.random() - 0.5) * 2 * strength;
      }
    }

    // Clamp to max displacement
    const len = Math.sqrt(this.offsetX * this.offsetX + this.offsetY * this.offsetY + this.offsetZ * this.offsetZ);
    if (len > max) {
      const scale = max / len;
      this.offsetX *= scale;
      this.offsetY *= scale;
      this.offsetZ *= scale;
    }
  }

  apply(camera) {
    camera.position.x += this.offsetX;
    camera.position.y += this.offsetY;
    camera.position.z += this.offsetZ;
  }

  reset() {
    this.events.length = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;
  }
}
```

- [ ] **Step 2: Integrate CameraShake into Game.js**

In `src/game/Game.js`:

Add import at top (after existing imports):
```javascript
import { CameraShake } from './effects/CameraShake.js';
```

In the constructor (after `this.simulation = ...` line), add:
```javascript
    this.cameraShake = new CameraShake();
```

In the `updateCamera()` method, after the camera position is set (after line 109 where camera lerps to player position), add:
```javascript
    this.cameraShake.apply(this.camera);
```

In the `start()` method's `tick()` function, before `this.renderer.render(this.scene, this.camera)` (before line 96), add:
```javascript
        this.cameraShake.update(elapsed);
```

In the `renderHud()` method, add shake triggers. After the existing `hitFlash` check (around line 150-153 where reticle classes are toggled), add:
```javascript
    // Screen shake on damage
    if (snapshot.hitFlash > 0 && snapshot.hitFlash > this._lastHitFlash) {
      const cfg = CONFIG.effects.shake.onDamage;
      this.cameraShake.add(cfg.intensity, cfg.duration);
    }
    this._lastHitFlash = snapshot.hitFlash;
```

Add the CONFIG import if not already present at top of Game.js:
```javascript
import { CONFIG } from './config.js';
```

Initialize `this._lastHitFlash = 0;` in the Game constructor.

- [ ] **Step 3: Add fire recoil shake**

In `src/game/Game.js`, in the `renderHud()` method, after the fire flash check (around the `fireFlash` handling), add:
```javascript
    if (snapshot.fireFlash > 0 && snapshot.fireFlash > this._lastFireFlash) {
      const cfg = CONFIG.effects.shake.onFire;
      // Recoil: backward along camera's look direction
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
      this.cameraShake.add(cfg.intensity, cfg.duration, dir.x, dir.y, dir.z);
    }
    this._lastFireFlash = snapshot.fireFlash;
```

Initialize `this._lastFireFlash = 0;` in the Game constructor.

Add `import * as THREE from 'three';` at top of Game.js if not already present.

- [ ] **Step 4: Add kill shake**

This requires knowing when an enemy dies. We need to expose kill events from Simulation. In `src/game/Simulation.js`, in the `getSnapshot()` method (around line 420-434), add a `killEvents` field:

In the Simulation constructor, add:
```javascript
    this.killEvents = [];
```

In `applyDamageToEnemy()` (around line 215 where `state.score += enemy.scoreValue`), add:
```javascript
      this.killEvents.push({
        position: enemy.group.position.clone(),
        type: enemy.type,
        score: enemy.scoreValue,
      });
```

In `getSnapshot()`, add to the returned object:
```javascript
      killEvents: this.killEvents,
```

At the end of `update()` (before the method closes, after line ~411), add:
```javascript
    this.killEvents.length = 0;
```

Then in `Game.js`, in `renderHud()`, after the fire recoil shake code, add:
```javascript
    for (const kill of snapshot.killEvents) {
      const cfg = CONFIG.effects.shake.onKill;
      this.cameraShake.add(cfg.intensity, cfg.duration);
    }
```

- [ ] **Step 5: Clean up shake on restart**

In `Game.js`, find where the game restarts (in the render loop or wherever simulation is reset). In `Simulation.restart()` (line 55-74), the killEvents array should also be cleared. Add to the `restart()` method:

```javascript
    this.killEvents.length = 0;
```

In `Game.js`, add to `dispose()`:
```javascript
    this.cameraShake.reset();
```

- [ ] **Step 6: Verify shake works**

Run: `npm run dev`
Play the game, take damage from enemies, fire weapon, kill enemies. Verify:
- Heavy shake when taking damage
- Subtle backward nudge when firing
- Medium shake when killing enemies
- Shakes don't cause camera to fly wildly off-screen

- [ ] **Step 7: Commit**

```bash
git add src/game/effects/CameraShake.js src/game/Game.js src/game/Simulation.js
git commit -m "feat: add camera shake system with damage, kill, and fire recoil"
```

---

### Task 3: Add hit direction indicators (vignette + chevron)

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/main.js`
- Modify: `src/game/Game.js`
- Modify: `src/game/Simulation.js`

- [ ] **Step 1: Add HTML elements for hit indicators**

In `index.html`, add these elements right after the closing `</div>` of `#reticle` (after line 57):

```html
    <div id="hit-vignette" class="hit-vignette"></div>
    <div id="hit-chevrons" class="hit-chevrons"></div>
```

- [ ] **Step 2: Add CSS for vignette and chevrons**

In `src/style.css`, add at the end (before any media queries, so before line ~474):

```css
/* Hit direction indicators */
.hit-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 80;
  opacity: 0;
  transition: opacity 0.05s ease-in;
}

.hit-vignette--active {
  opacity: 1;
}

.hit-chevrons {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 81;
}

.hit-chevron {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  opacity: 0;
}

.hit-chevron__arrow {
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 16px solid rgba(255, 80, 80, 0.9);
  filter: drop-shadow(0 0 6px rgba(255, 0, 0, 0.6));
}
```

- [ ] **Step 3: Pass damage source info from Simulation**

In `src/game/Simulation.js`, we need to track where damage came from. In the `resolvePlayerHit()` method (around line 272-297), the projectile's position is available. We need to expose this.

Add a field in the Simulation constructor:
```javascript
    this.damageEvents = [];
```

In `resolvePlayerHit(projectile, start, end)` (line 272), right after `this.player.applyDamage(projectile.damage)` on line 289, add:
```javascript
        this.damageEvents.push({
          sourceX: projectile.x,
          sourceY: projectile.y,
          sourceZ: projectile.z,
          damage: projectile.damage,
        });
```

The `projectile` parameter is a store item with `.x, .y, .z, .damage` fields. `start`/`end` are `{x,y,z}` objects for the ray segment.

Add to `getSnapshot()`:
```javascript
      damageEvents: this.damageEvents,
```

Clear at the end of `update()`:
```javascript
    this.damageEvents.length = 0;
```

Clear in `restart()`:
```javascript
    this.damageEvents.length = 0;
```

- [ ] **Step 4: Add HUD refs for hit indicators in main.js**

In `src/main.js`, add to the `hud` object (after line 27):
```javascript
  hitVignette: document.querySelector('#hit-vignette'),
  hitChevrons: document.querySelector('#hit-chevrons'),
```

- [ ] **Step 5: Implement hit indicator logic in Game.js**

In `src/game/Game.js`, add a hit indicator manager. In the constructor, add:
```javascript
    this.hitIndicators = [];
```

Add a new method to Game.js:
```javascript
  showHitIndicator(sourceX, sourceY, sourceZ, damage) {
    const cfg = CONFIG.effects.hitIndicator;
    const totalDuration = cfg.fadeIn + cfg.hold + cfg.fadeOut;

    // Compute angle from player forward to damage source
    const snapshot = this.simulation.getSnapshot();
    const dx = sourceX - snapshot.playerPosition.x;
    const dz = sourceZ - snapshot.playerPosition.z;
    const angleToSource = Math.atan2(dx, dz);
    const relativeAngle = angleToSource - snapshot.playerYaw;

    // Vignette — offset radial gradient toward damage side
    const vignX = 50 + Math.sin(relativeAngle) * 30;
    const vignY = 50 - Math.cos(relativeAngle) * 30;
    const intensity = Math.min(1, damage / 20);
    this.hud.hitVignette.style.background =
      `radial-gradient(circle at ${vignX}% ${vignY}%, transparent 30%, rgba(255, 40, 40, ${0.35 * intensity}) 100%)`;

    // Chevron — position on circle around screen center
    const chevron = document.createElement('div');
    chevron.className = 'hit-chevron';
    const arrow = document.createElement('div');
    arrow.className = 'hit-chevron__arrow';
    chevron.appendChild(arrow);

    const r = cfg.chevronRadius;
    const cx = Math.sin(relativeAngle) * r;
    const cy = -Math.cos(relativeAngle) * r;
    chevron.style.transform = `translate(${cx}px, ${cy}px) rotate(${relativeAngle}rad)`;
    this.hud.hitChevrons.appendChild(chevron);

    this.hitIndicators.push({
      elapsed: 0,
      duration: totalDuration,
      fadeIn: cfg.fadeIn,
      hold: cfg.hold,
      fadeOut: cfg.fadeOut,
      chevron,
    });
  }

  updateHitIndicators(dt) {
    const cfg = CONFIG.effects.hitIndicator;
    let anyActive = false;

    for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
      const ind = this.hitIndicators[i];
      ind.elapsed += dt;

      if (ind.elapsed >= ind.duration) {
        ind.chevron.remove();
        this.hitIndicators.splice(i, 1);
        continue;
      }

      anyActive = true;
      let opacity;
      if (ind.elapsed < ind.fadeIn) {
        opacity = ind.elapsed / ind.fadeIn;
      } else if (ind.elapsed < ind.fadeIn + ind.hold) {
        opacity = 1;
      } else {
        opacity = 1 - (ind.elapsed - ind.fadeIn - ind.hold) / ind.fadeOut;
      }
      ind.chevron.style.opacity = opacity;
    }

    if (anyActive) {
      this.hud.hitVignette.classList.add('hit-vignette--active');
    } else {
      this.hud.hitVignette.classList.remove('hit-vignette--active');
      this.hud.hitVignette.style.background = '';
    }
  }
```

In the `renderHud()` method, process damage events from snapshot:
```javascript
    for (const dmg of snapshot.damageEvents) {
      this.showHitIndicator(dmg.sourceX, dmg.sourceY, dmg.sourceZ, dmg.damage);
    }
```

In the `start()` method's `tick()` function, before `this.renderer.render(...)`, add:
```javascript
        this.updateHitIndicators(elapsed);
```

- [ ] **Step 6: Verify hit indicators work**

Run: `npm run dev`
Play the game, let enemies hit you. Verify:
- Red vignette appears on the side of the screen closest to the damage source
- Red chevron arrow points toward the enemy that hit you
- Both fade out after ~0.5s
- Multiple simultaneous hits show multiple chevrons

- [ ] **Step 7: Commit**

```bash
git add index.html src/style.css src/main.js src/game/Game.js src/game/Simulation.js
git commit -m "feat: add hit direction indicators with vignette and chevrons"
```

---

### Task 4: Create ExplosionEffect system (fireball + debris)

**Files:**
- Create: `src/game/effects/ExplosionEffect.js`
- Modify: `src/game/Game.js`
- Modify: `src/game/Simulation.js`

- [ ] **Step 1: Create ExplosionEffect class**

Create `src/game/effects/ExplosionEffect.js`:

```javascript
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _debrisGeos = [
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.BoxGeometry(0.4, 0.8, 0.3),
  new THREE.TetrahedronGeometry(0.5),
  new THREE.BoxGeometry(0.3, 0.3, 1.0),
];

export class ExplosionEffect {
  constructor(scene) {
    this.scene = scene;
    const cfg = CONFIG.effects.explosion;

    this.pool = [];
    for (let i = 0; i < cfg.poolSize; i++) {
      const entry = {
        active: false,
        elapsed: 0,

        // Fireball: 3 overlapping spheres
        fireballs: [],
        fireLight: new THREE.PointLight(0xff8800, 0, 20),

        // Debris chunks
        debris: [],
      };

      for (let f = 0; f < 3; f++) {
        const geo = new THREE.SphereGeometry(1, 8, 6);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffaa44,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        entry.fireballs.push({ mesh, mat, offsetX: 0, offsetY: 0, offsetZ: 0 });
      }

      entry.fireLight.visible = false;
      scene.add(entry.fireLight);

      for (let d = 0; d < cfg.debrisCount; d++) {
        const geo = _debrisGeos[d % _debrisGeos.length];
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          roughness: 0.7,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        entry.debris.push({
          mesh,
          mat,
          vx: 0, vy: 0, vz: 0,
          spinX: 0, spinY: 0, spinZ: 0,
        });
      }

      this.pool.push(entry);
    }
  }

  spawn(x, y, z, color) {
    const cfg = CONFIG.effects.explosion;
    let entry = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) { entry = this.pool[i]; break; }
    }
    if (!entry) {
      // Steal oldest
      let oldest = this.pool[0];
      for (let i = 1; i < this.pool.length; i++) {
        if (this.pool[i].elapsed > oldest.elapsed) oldest = this.pool[i];
      }
      entry = oldest;
    }

    entry.active = true;
    entry.elapsed = 0;

    // Setup fireballs at slightly offset positions
    for (let i = 0; i < entry.fireballs.length; i++) {
      const fb = entry.fireballs[i];
      fb.offsetX = (Math.random() - 0.5) * 1.5;
      fb.offsetY = (Math.random() - 0.5) * 1.5;
      fb.offsetZ = (Math.random() - 0.5) * 1.5;
      fb.mesh.position.set(x + fb.offsetX, y + fb.offsetY, z + fb.offsetZ);
      fb.mesh.scale.setScalar(0.3);
      fb.mat.opacity = 1;
      fb.mat.color.set(0xffffcc); // Start white-hot
      fb.mesh.visible = true;
    }

    entry.fireLight.position.set(x, y, z);
    entry.fireLight.color.set(0xff8800);
    entry.fireLight.intensity = 5;
    entry.fireLight.visible = true;

    // Setup debris
    const debrisColor = new THREE.Color(color);
    for (let i = 0; i < entry.debris.length; i++) {
      const d = entry.debris[i];
      d.mesh.position.set(x, y, z);
      d.mesh.scale.setScalar(0.8 + Math.random() * 0.6);
      d.mat.color.copy(debrisColor);
      d.mat.opacity = 1;
      d.mesh.visible = true;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = cfg.debrisSpeed * (0.6 + Math.random() * 0.8);
      d.vx = Math.cos(angle) * Math.cos(elevation) * speed;
      d.vy = Math.sin(elevation) * speed + 4;
      d.vz = Math.sin(angle) * Math.cos(elevation) * speed;

      d.spinX = (Math.random() - 0.5) * 10;
      d.spinY = (Math.random() - 0.5) * 10;
      d.spinZ = (Math.random() - 0.5) * 10;
    }
  }

  update(dt) {
    const cfg = CONFIG.effects.explosion;

    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.elapsed += dt;

      // Fireball phase (0 to fireballDuration)
      const fbProgress = Math.min(1, entry.elapsed / cfg.fireballDuration);
      for (const fb of entry.fireballs) {
        if (fbProgress >= 1) {
          fb.mesh.visible = false;
          continue;
        }
        const scale = 0.3 + fbProgress * 3.5;
        fb.mesh.scale.setScalar(scale);
        fb.mat.opacity = 1 - fbProgress * 0.9;

        // Color transition: white → orange → dark gray
        if (fbProgress < 0.4) {
          fb.mat.color.lerpColors(
            new THREE.Color(0xffffcc),
            new THREE.Color(0xff6622),
            fbProgress / 0.4
          );
        } else {
          fb.mat.color.lerpColors(
            new THREE.Color(0xff6622),
            new THREE.Color(0x333333),
            (fbProgress - 0.4) / 0.6
          );
        }
      }

      // Fire light
      if (fbProgress < 1) {
        entry.fireLight.intensity = 5 * (1 - fbProgress);
      } else {
        entry.fireLight.visible = false;
      }

      // Debris phase (full duration)
      const debrisProgress = entry.elapsed / cfg.debrisDuration;
      for (const d of entry.debris) {
        if (debrisProgress >= 1) {
          d.mesh.visible = false;
          continue;
        }

        // Physics
        d.vy -= cfg.debrisGravity * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;

        // Spin
        d.mesh.rotation.x += d.spinX * dt;
        d.mesh.rotation.y += d.spinY * dt;
        d.mesh.rotation.z += d.spinZ * dt;

        // Fade in last portion
        const fadeStart = 1 - cfg.debrisFadeTime / cfg.debrisDuration;
        if (debrisProgress > fadeStart) {
          d.mat.opacity = 1 - (debrisProgress - fadeStart) / (1 - fadeStart);
        }
      }

      // Deactivate when all done
      if (entry.elapsed >= cfg.debrisDuration) {
        entry.active = false;
        for (const fb of entry.fireballs) fb.mesh.visible = false;
        entry.fireLight.visible = false;
        for (const d of entry.debris) d.mesh.visible = false;
      }
    }
  }

  reset() {
    for (const entry of this.pool) {
      entry.active = false;
      for (const fb of entry.fireballs) fb.mesh.visible = false;
      entry.fireLight.visible = false;
      for (const d of entry.debris) d.mesh.visible = false;
    }
  }

  dispose() {
    for (const entry of this.pool) {
      for (const fb of entry.fireballs) {
        this.scene.remove(fb.mesh);
        fb.mesh.geometry.dispose();
        fb.mat.dispose();
      }
      this.scene.remove(entry.fireLight);
      for (const d of entry.debris) {
        this.scene.remove(d.mesh);
        d.mat.dispose();
      }
    }
  }
}
```

- [ ] **Step 2: Integrate ExplosionEffect into Game.js**

In `src/game/Game.js`, add import:
```javascript
import { ExplosionEffect } from './effects/ExplosionEffect.js';
```

In the constructor, after `this.cameraShake = ...`:
```javascript
    this.explosions = new ExplosionEffect(this.scene);
```

In the `renderHud()` method, in the kill events loop (where we already added shake), add explosion spawning:
```javascript
    for (const kill of snapshot.killEvents) {
      const cfg = CONFIG.effects.shake.onKill;
      this.cameraShake.add(cfg.intensity, cfg.duration);
      const color = CONFIG.palette[kill.type] || CONFIG.palette.effect;
      this.explosions.spawn(kill.position.x, kill.position.y, kill.position.z, color);
    }
```

In the `start()` method's `tick()`, add explosion update (near where cameraShake.update is called):
```javascript
        this.explosions.update(elapsed);
```

In `dispose()`:
```javascript
    this.explosions.dispose();
```

- [ ] **Step 3: Verify explosions work**

Run: `npm run dev`
Kill enemies and verify:
- Fireballs appear at enemy death position with white→orange→gray color transition
- 3-5 debris chunks fly outward and tumble with gravity
- Debris fades out after ~1.5s
- No lag during heavy waves (pool recycles)

- [ ] **Step 4: Commit**

```bash
git add src/game/effects/ExplosionEffect.js src/game/Game.js
git commit -m "feat: add explosion fireball and debris chunks on enemy death"
```

---

### Task 5: Create ScorePop system (3D floating score text)

**Files:**
- Create: `src/game/effects/ScorePop.js`
- Modify: `src/game/Game.js`

- [ ] **Step 1: Create ScorePop class**

Create `src/game/effects/ScorePop.js`:

```javascript
import * as THREE from 'three';
import { CONFIG } from '../config.js';

function createTextTexture(text, color) {
  const cfg = CONFIG.effects.scorePop;
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.font = `bold ${cfg.fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeText(text, size / 2, size / 2);

  // Fill
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ScorePop {
  constructor(scene) {
    this.scene = scene;
    const cfg = CONFIG.effects.scorePop;

    this.pool = [];
    for (let i = 0; i < cfg.poolSize; i++) {
      const mat = new THREE.SpriteMaterial({
        map: null,
        transparent: true,
        opacity: 0,
        depthTest: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.scale.setScalar(3);
      scene.add(sprite);

      this.pool.push({
        active: false,
        elapsed: 0,
        sprite,
        mat,
        startY: 0,
      });
    }
  }

  spawn(x, y, z, score, color) {
    const cfg = CONFIG.effects.scorePop;
    let entry = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) { entry = this.pool[i]; break; }
    }
    if (!entry) {
      // Steal oldest
      let oldest = this.pool[0];
      for (let i = 1; i < this.pool.length; i++) {
        if (this.pool[i].elapsed > oldest.elapsed) oldest = this.pool[i];
      }
      entry = oldest;
    }

    // Create texture for this score value
    const text = `+${score}`;
    if (entry.mat.map) entry.mat.map.dispose();
    entry.mat.map = createTextTexture(text, color);
    entry.mat.opacity = 1;
    entry.mat.needsUpdate = true;

    entry.sprite.position.set(x, y + 2, z);
    entry.sprite.scale.setScalar(3 * cfg.startScale);
    entry.sprite.visible = true;

    entry.active = true;
    entry.elapsed = 0;
    entry.startY = y + 2;
  }

  update(dt) {
    const cfg = CONFIG.effects.scorePop;

    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.elapsed += dt;

      const progress = entry.elapsed / cfg.duration;
      if (progress >= 1) {
        entry.active = false;
        entry.sprite.visible = false;
        continue;
      }

      // Rise
      entry.sprite.position.y = entry.startY + entry.elapsed * cfg.riseSpeed;

      // Scale: grow from startScale to endScale
      const scale = cfg.startScale + (cfg.endScale - cfg.startScale) * progress;
      entry.sprite.scale.setScalar(3 * scale);

      // Fade out in second half
      if (progress > 0.5) {
        entry.mat.opacity = 1 - (progress - 0.5) / 0.5;
      } else {
        entry.mat.opacity = 1;
      }
    }
  }

  reset() {
    for (const entry of this.pool) {
      entry.active = false;
      entry.sprite.visible = false;
    }
  }

  dispose() {
    for (const entry of this.pool) {
      if (entry.mat.map) entry.mat.map.dispose();
      entry.mat.dispose();
      this.scene.remove(entry.sprite);
    }
  }
}
```

- [ ] **Step 2: Integrate ScorePop into Game.js**

In `src/game/Game.js`, add import:
```javascript
import { ScorePop } from './effects/ScorePop.js';
```

In constructor:
```javascript
    this.scorePops = new ScorePop(this.scene);
```

In the kill events loop in `renderHud()`, add score pop spawn:
```javascript
    for (const kill of snapshot.killEvents) {
      const cfg = CONFIG.effects.shake.onKill;
      this.cameraShake.add(cfg.intensity, cfg.duration);
      const color = CONFIG.palette[kill.type] || CONFIG.palette.effect;
      this.explosions.spawn(kill.position.x, kill.position.y, kill.position.z, color);
      this.scorePops.spawn(kill.position.x, kill.position.y, kill.position.z, kill.score, color);
    }
```

In `tick()`, add score pop update:
```javascript
        this.scorePops.update(elapsed);
```

In `dispose()`:
```javascript
    this.scorePops.dispose();
```

- [ ] **Step 3: Verify score pops work**

Run: `npm run dev`
Kill enemies and verify:
- "+110", "+150", etc. floats up from enemy death position
- Text is colored to match enemy type
- Text grows slightly and fades out over ~1s
- Always faces camera (billboard)
- Multiple kills show multiple score pops

- [ ] **Step 4: Commit**

```bash
git add src/game/effects/ScorePop.js src/game/Game.js
git commit -m "feat: add 3D floating score pops on enemy kills"
```

---

### Task 6: Enhance projectile visuals (trails + muzzle flash)

**Files:**
- Modify: `src/game/entities/Projectile.js`
- Modify: `src/game/entities/Player.js`
- Modify: `src/game/Game.js`

- [ ] **Step 1: Enhance projectile trail in Projectile.js**

In `src/game/entities/Projectile.js`, the trail is currently a CylinderGeometry at lines 90-91. Replace the trail creation in the constructor's pool initialization loop.

Find the trail geometry creation (around line 90-91 where CylinderGeometry is created). Replace the trail mesh creation with a ribbon-style trail:

```javascript
        // Trail ribbon - 4 segments
        const trailGeo = new THREE.BufferGeometry();
        const segments = CONFIG.effects.trail.segments;
        const positions = new Float32Array((segments + 1) * 3);
        const opacities = new Float32Array(segments + 1);
        for (let s = 0; s <= segments; s++) {
          opacities[s] = 1 - s / segments;
        }
        trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const trailMat = new THREE.MeshBasicMaterial({
          color: CONFIG.palette.playerShot,
          transparent: true,
          opacity: 0.8,
        });
```

Actually, a ribbon trail with BufferGeometry is complex for this setup. A simpler and equally effective approach: keep the cylinder trail but make it stretch dynamically based on speed, and add emissive glow. This matches the existing pattern better.

Replace the trail material and update logic instead. In the constructor where trail materials are created, use MeshBasicMaterial with emissive-like brightness:

Find where trail meshes are assigned materials. The existing approach uses shared materials. Enhance as follows:

In the trail update section of `update()` (around lines 222-228), enhance the trail rendering:

```javascript
        // Enhanced trail - stretch based on speed, glow when tracking
        const dx = item.x - item.prevX;
        const dy = item.y - item.prevY;
        const dz = item.z - item.prevZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        trail.position.set(
          (item.x + item.prevX) * 0.5,
          (item.y + item.prevY) * 0.5,
          (item.z + item.prevZ) * 0.5,
        );
        trail.lookAt(item.prevX, item.prevY, item.prevZ);
        trail.scale.z = Math.max(2.2, dist * 0.7);

        // Widen and brighten trail when tracking a target
        if (item.targetId) {
          trail.scale.x = CONFIG.effects.trail.trackingWidthMultiplier;
          trail.scale.y = CONFIG.effects.trail.trackingWidthMultiplier;
          trail.material.opacity = 0.8 + CONFIG.effects.trail.trackingBrightnessBoost;
        } else {
          trail.scale.x = 1;
          trail.scale.y = 1;
          trail.material.opacity = 0.8;
        }
```

Also update the point light on each projectile to use the new config values. Find where lights are created in the constructor (around lines 125-130) and update:

```javascript
        const light = new THREE.PointLight(
          CONFIG.palette.playerShot,
          CONFIG.effects.trail.lightIntensity,
          CONFIG.effects.trail.lightRange,
        );
```

- [ ] **Step 2: Add muzzle flash to Player.js**

In `src/game/entities/Player.js`, add muzzle flash capability.

Add to the constructor (after the model is built, before `reset()` call):
```javascript
    // Muzzle flash
    this.muzzleLight = new THREE.PointLight(
      CONFIG.palette.playerShot,
      0,
      CONFIG.effects.muzzleFlash.lightRange,
    );
    this.muzzleLight.visible = false;
    this.group.add(this.muzzleLight);

    this.muzzleFlashTimer = 0;
```

Add CONFIG import at top of Player.js if not present:
```javascript
import { CONFIG } from '../config.js';
```

Add a method to trigger the flash:
```javascript
  triggerMuzzleFlash(origin) {
    const cfg = CONFIG.effects.muzzleFlash;
    this.muzzleLight.position.copy(origin).sub(this.group.position);
    this.muzzleLight.intensity = cfg.lightIntensity;
    this.muzzleLight.visible = true;
    this.muzzleFlashTimer = cfg.duration;
  }
```

In the `update()` method, add muzzle flash decay (at the end, before the method closes):
```javascript
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
        this.muzzleLight.visible = false;
      } else {
        const progress = 1 - this.muzzleFlashTimer / CONFIG.effects.muzzleFlash.duration;
        this.muzzleLight.intensity = CONFIG.effects.muzzleFlash.lightIntensity * (1 - progress);
      }
    }
```

- [ ] **Step 3: Trigger muzzle flash from Simulation**

In `src/game/Simulation.js`, in the `firePlayerWeapon()` method (around line 258-270), after spawning the projectile, trigger the muzzle flash:

```javascript
    this.player.triggerMuzzleFlash(spec.origin);
```

Where `spec` is the result of `this.player.buildShotSpec(...)`.

- [ ] **Step 4: Verify enhanced projectiles**

Run: `npm run dev`
Fire weapons and verify:
- Muzzle flash: bright cyan light pulses at barrel on each shot
- Trails stretch longer based on projectile speed
- Lock-on tracking projectiles have wider, brighter trails
- Projectile lights illuminate nearby terrain as they fly

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/Projectile.js src/game/entities/Player.js src/game/Simulation.js
git commit -m "feat: enhance projectile trails and add muzzle flash"
```

---

### Task 7: Integration testing and polish

**Files:**
- Modify: `src/game/Game.js` (if needed)
- Modify: `src/game/Simulation.js` (if needed)

- [ ] **Step 1: Full integration test**

Run: `npm run dev`
Play through 3+ waves testing:
1. **Screen shake**: damage shake (heavy), fire recoil (subtle backward), kill shake (medium)
2. **Hit indicators**: vignette + chevron point toward correct damage source, multiple simultaneous hits work
3. **Explosions**: fireball + debris on every enemy death, no visual glitches, pool recycles correctly
4. **Projectiles**: muzzle flash on fire, trails stretch, tracking trails glow wider
5. **Score pops**: correct score values, correct colors per enemy type, drift up and fade

- [ ] **Step 2: Performance check**

Play until wave 5+ with many enemies on screen. Verify:
- No FPS drops below 30fps
- No memory leaks (effects clean up properly)
- No console errors or warnings

- [ ] **Step 3: Reset/restart test**

Kill player (let health reach 0), press R to restart. Verify:
- All effects clear on restart
- No lingering debris, score pops, or stuck vignettes
- Camera shake resets

Add any needed cleanup to `Simulation.restart()` and `Game.js` restart handling.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: polish and integration fixes for game feel effects"
```
