# Hyper-Realistic Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Drone Wars from arcade-style solid-color primitives to hyper-realistic visuals with varied terrain, detailed entity models, enhanced materials, and cinematic post-processing — while maintaining 60fps on mid-range hardware.

**Architecture:** Five-layer upgrade: (1) post-processing pipeline with bloom + SSAO, (2) diverse terrain decorations with multiple tree/rock/building species, (3) entity model detail enhancements, (4) material & surface realism improvements, (5) sky/fog/water atmosphere enhancements. All changes use instanced meshes and shared MeshStandardMaterial for performance.

**Tech Stack:** Three.js r177, `three-stdlib` (for EffectComposer, UnrealBloomPass, SAOPass), Vite

---

### Task 1: Install post-processing dependency and set up EffectComposer

**Files:**
- Modify: `package.json`
- Modify: `src/game/Game.js:1-12` (imports), `src/game/Game.js:45-52` (renderer setup), `src/game/Game.js:259-264` (render call)

- [ ] **Step 1: Install three-stdlib**

Run:
```bash
npm install three-stdlib
```

Expected: Package added to package.json dependencies.

- [ ] **Step 2: Add post-processing imports to Game.js**

Add these imports at the top of `src/game/Game.js` after the existing three import:

```javascript
import { EffectComposer } from 'three-stdlib';
import { RenderPass } from 'three-stdlib';
import { UnrealBloomPass } from 'three-stdlib';
import { SAOPass } from 'three-stdlib';
import { OutputPass } from 'three-stdlib';
```

- [ ] **Step 3: Initialize EffectComposer in constructor**

After `this.mount.appendChild(this.renderer.domElement);` (line 52), add:

```javascript
// Post-processing pipeline
this.composer = new EffectComposer(this.renderer);
this.composer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));

const renderPass = new RenderPass(this.scene, this.camera);
this.composer.addPass(renderPass);

// SSAO — ambient occlusion for depth and grounding
this.saoPass = new SAOPass(this.scene, this.camera);
this.saoPass.params.saoBias = 0.5;
this.saoPass.params.saoIntensity = 0.04;
this.saoPass.params.saoScale = 5;
this.saoPass.params.saoKernelRadius = 30;
this.saoPass.params.saoBlurRadius = 8;
this.saoPass.params.saoBlurStdDev = 4;
this.saoPass.params.saoBlurDepthCutoff = 0.01;
this.composer.addPass(this.saoPass);

// Bloom — glow bleed from emissive surfaces
this.bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3,   // strength
  0.4,   // radius
  0.75   // threshold
);
this.composer.addPass(this.bloomPass);

const outputPass = new OutputPass();
this.composer.addPass(outputPass);
```

- [ ] **Step 4: Replace renderer.render with composer.render**

In the render loop (around line 262), replace:
```javascript
this.renderer.render(this.scene, this.camera);
```
with:
```javascript
this.composer.render();
```

- [ ] **Step 5: Update resize method to include composer**

Find the `resize()` method and add after the renderer resize:
```javascript
this.composer.setSize(width, height);
```

- [ ] **Step 6: Run the game to verify post-processing works**

Run:
```bash
npm run dev
```

Expected: Game renders with subtle bloom on emissive surfaces (projectile trails, muzzle flashes, cockpit lights) and ambient occlusion darkening creases and contact points. No visual breakage. Steady 60fps.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/game/Game.js
git commit -m "feat: add post-processing pipeline with bloom and SSAO"
```

---

### Task 2: Upgrade sky shader with procedural clouds and sun disc

**Files:**
- Modify: `src/game/world/environment.js`

- [ ] **Step 1: Enhance the sky vertex shader**

In `environment.js`, find the sky ShaderMaterial creation. Replace the vertex shader with:

```glsl
varying vec3 vWorldPosition;
varying vec2 vUv;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

- [ ] **Step 2: Enhance the fragment shader with procedural cloud layer and sun disc**

Replace the fragment shader with:

```glsl
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float time;
varying vec3 vWorldPosition;

// Simple noise for cloud patterns
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldPosition);
  float h = dir.y;

  // Base sky gradient
  vec3 color;
  if (h > 0.0) {
    color = mix(horizonColor, topColor, smoothstep(0.0, 0.45, h));
  } else {
    color = mix(horizonColor, bottomColor, smoothstep(0.0, -0.25, h));
  }

  // Sun disc with soft falloff
  float sunDot = dot(dir, normalize(sunDirection));
  float sunDisc = smoothstep(0.9965, 0.9985, sunDot);
  float sunGlow = pow(max(sunDot, 0.0), 64.0) * 0.4;
  float sunHalo = pow(max(sunDot, 0.0), 8.0) * 0.15;
  color += sunColor * (sunDisc + sunGlow + sunHalo);

  // Warm horizon tint near sun
  float horizonBlend = 1.0 - abs(h);
  float sunProximity = pow(max(sunDot, 0.0), 3.0);
  color += vec3(0.3, 0.15, 0.05) * horizonBlend * sunProximity * 0.3;

  // Procedural cloud layer at horizon
  if (h > -0.05 && h < 0.35) {
    vec2 cloudUV = dir.xz / (h + 0.1) * 0.3;
    cloudUV += time * 0.002;
    float clouds = fbm(cloudUV * 3.0);
    clouds = smoothstep(0.35, 0.65, clouds);
    float cloudFade = smoothstep(-0.05, 0.05, h) * smoothstep(0.35, 0.15, h);
    vec3 cloudColor = mix(horizonColor, vec3(1.0), 0.6);
    color = mix(color, cloudColor, clouds * cloudFade * 0.5);
  }

  gl_FragColor = vec4(color, 1.0);
}
```

- [ ] **Step 3: Add new uniforms to the ShaderMaterial**

Update the uniforms object to include:

```javascript
sunDirection: { value: new THREE.Vector3(preset.sunOffset.x, preset.sunOffset.y, preset.sunOffset.z).normalize() },
sunColor: { value: new THREE.Color(preset.sunGlow) },
time: { value: 0 },
```

- [ ] **Step 4: Update the sky in the environment update function**

In the `update()` method, add sky time update:

```javascript
if (this.skyMat) {
  this.skyMat.uniforms.time.value = elapsed;
}
```

Where `this.skyMat` is a reference to the sky ShaderMaterial saved during creation.

- [ ] **Step 5: Run to verify sky looks correct**

Run:
```bash
npm run dev
```

Expected: Sky shows a visible sun disc with soft glow and halo, subtle procedural cloud wisps near the horizon that slowly drift, warm golden tint on horizon near the sun. No framerate impact.

- [ ] **Step 6: Commit**

```bash
git add src/game/world/environment.js
git commit -m "feat: upgrade sky shader with procedural clouds and sun disc"
```

---

### Task 3: Add height-based fog with distance color shift

**Files:**
- Modify: `src/game/world/environment.js`
- Modify: `src/game/Game.js` (fog update in render loop)

- [ ] **Step 1: Replace linear fog with custom height-based fog shader**

In `environment.js`, after creating the scene fog, add a fog density function. Instead of replacing Three.js fog entirely (which would require shader injection), we'll use a simpler approach — modulate fog color based on camera altitude:

In the `update()` method of the environment system, add:

```javascript
// Height-based fog: denser near ground, thinner at altitude
const cameraY = camera.position.y;
const groundLevel = 5;
const maxAlt = 80;
const heightFactor = THREE.MathUtils.clamp((cameraY - groundLevel) / (maxAlt - groundLevel), 0, 1);

// Fog thins with altitude
const baseFogNear = preset.fogNear;
const baseFogFar = preset.fogFar;
scene.fog.near = baseFogNear + heightFactor * 40;
scene.fog.far = baseFogFar + heightFactor * 80;

// Fog shifts bluer at distance
const baseFogColor = new THREE.Color(preset.fog);
const distantFogColor = new THREE.Color(preset.fog).offsetHSL(0.05, 0, -0.05);
scene.fog.color.copy(baseFogColor).lerp(distantFogColor, heightFactor * 0.3);
```

- [ ] **Step 2: Pass camera reference to environment update**

Ensure the environment `update()` method receives the camera. In `Game.js`, where the environment is updated, pass `this.camera`:

```javascript
this.simulation.terrain.env.update(elapsed, this.camera);
```

(Check actual call site — environment may be updated through terrain or directly.)

- [ ] **Step 3: Run to verify height-based fog**

Run:
```bash
npm run dev
```

Expected: Flying low near ground shows thicker, warmer fog. Flying high shows thinner fog with slightly bluer tint. The transition is smooth. Performance unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/game/world/environment.js src/game/Game.js
git commit -m "feat: add height-based fog with altitude-dependent density and color"
```

---

### Task 4: Add diverse tree species to Frontier terrain

**Files:**
- Modify: `src/game/world/terrain.js`

This is the largest task — it replaces the single uniform tree type with 5 visually distinct species.

- [ ] **Step 1: Define tree species geometry and materials**

In `terrain.js`, find `buildFrontierDecorMeshes()`. Replace the single tree geometry setup with multiple species. Add before the function or inside it:

```javascript
// Tree species definitions
const TREE_SPECIES = {
  pine: {
    trunkGeo: new THREE.CylinderGeometry(0.2, 0.5, 7, 6),
    crownGeos: [
      new THREE.ConeGeometry(2.8, 5.5, 7),
      new THREE.ConeGeometry(2.1, 4.5, 7),
      new THREE.ConeGeometry(1.4, 3.5, 7),
    ],
    crownOffsets: [3.5, 6.0, 8.0],
    trunkColor: 0x3d2415,
    crownColors: [0x1a5428, 0x226b35, 0x2d8044],
    scaleRange: [0.7, 1.5],
    weight: 0.35,
  },
  oak: {
    trunkGeo: new THREE.CylinderGeometry(0.35, 0.65, 5, 6),
    crownGeos: [
      new THREE.SphereGeometry(3.2, 8, 6),
    ],
    crownOffsets: [5.5],
    trunkColor: 0x4a3020,
    crownColors: [0x3a6e2e],
    crownScaleY: 0.65,
    scaleRange: [0.8, 1.3],
    weight: 0.25,
  },
  birch: {
    trunkGeo: new THREE.CylinderGeometry(0.12, 0.22, 8, 5),
    crownGeos: [
      new THREE.SphereGeometry(1.6, 7, 5),
      new THREE.SphereGeometry(1.3, 7, 5),
      new THREE.SphereGeometry(1.0, 7, 5),
    ],
    crownOffsets: [5.0, 6.8, 8.2],
    crownSpread: 0.8,
    trunkColor: 0xd4cfc4,
    crownColors: [0x5a9e48, 0x68ac55, 0x76ba62],
    scaleRange: [0.6, 1.1],
    weight: 0.2,
  },
  deadTree: {
    trunkGeo: new THREE.CylinderGeometry(0.18, 0.45, 6, 5),
    branchGeos: [
      new THREE.CylinderGeometry(0.06, 0.12, 3.5, 4),
      new THREE.CylinderGeometry(0.05, 0.10, 2.8, 4),
      new THREE.CylinderGeometry(0.04, 0.09, 2.2, 4),
    ],
    branchAngles: [
      { rx: 0.6, ry: 0, rz: 0.4 },
      { rx: -0.3, ry: 1.2, rz: -0.5 },
      { rx: 0.2, ry: 2.5, rz: 0.3 },
    ],
    branchOffsets: [3.5, 4.5, 5.0],
    trunkColor: 0x4a3828,
    branchColor: 0x3d2e20,
    scaleRange: [0.7, 1.2],
    weight: 0.1,
  },
  bush: {
    crownGeos: [
      new THREE.SphereGeometry(1.5, 6, 5),
      new THREE.SphereGeometry(1.1, 6, 5),
    ],
    crownOffsets: [0.8, 0.6],
    crownSpread: 1.2,
    trunkColor: 0x3a2a18,
    crownColors: [0x456b38, 0x507a42],
    scaleRange: [0.5, 1.0],
    weight: 0.1,
  },
};
```

- [ ] **Step 2: Create InstancedMesh for each species**

Replace the existing tree InstancedMesh creation with per-species meshes. For each species, create trunk + crown InstancedMesh objects. Store them in a `treeSpecies` map:

```javascript
const MAX_TREES_PER_SPECIES = 200;
const speciesMeshes = {};

for (const [name, spec] of Object.entries(TREE_SPECIES)) {
  const meshes = { name };

  // Trunk
  if (spec.trunkGeo) {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: spec.trunkColor,
      roughness: 0.85,
      metalness: 0.05,
    });
    meshes.trunk = new THREE.InstancedMesh(spec.trunkGeo, trunkMat, MAX_TREES_PER_SPECIES);
    meshes.trunk.castShadow = true;
    meshes.trunk.receiveShadow = true;
    meshes.trunk.count = 0;
    scene.add(meshes.trunk);
  }

  // Crowns (or branches for dead trees)
  meshes.crowns = [];
  const geos = spec.crownGeos || spec.branchGeos || [];
  const colors = spec.crownColors || [spec.branchColor];
  for (let i = 0; i < geos.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      roughness: 0.75,
      metalness: 0.05,
    });
    const im = new THREE.InstancedMesh(geos[i], mat, MAX_TREES_PER_SPECIES);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    scene.add(im);
    meshes.crowns.push(im);
  }

  speciesMeshes[name] = meshes;
}
```

- [ ] **Step 3: Update decoration placement to use species selection**

In the chunk decoration loop (inside `rebuildFrontierDecor`), replace the single tree placement with species-selected placement:

```javascript
// Select species based on hash for deterministic randomness
const speciesNames = Object.keys(TREE_SPECIES);
const speciesWeights = speciesNames.map(n => TREE_SPECIES[n].weight);

function selectSpecies(hashVal) {
  let cumulative = 0;
  for (let i = 0; i < speciesNames.length; i++) {
    cumulative += speciesWeights[i];
    if (hashVal < cumulative) return speciesNames[i];
  }
  return speciesNames[speciesNames.length - 1];
}

// Per-tree placement
const h = hash2(wx + idx * 7.3, wz + idx * 13.1);
const species = selectSpecies(h);
const spec = TREE_SPECIES[species];
const meshSet = speciesMeshes[species];

// Randomized scale within species range
const scaleH = hash2(wx + 99.1, wz + 77.3);
const scale = spec.scaleRange[0] + scaleH * (spec.scaleRange[1] - spec.scaleRange[0]);

// Slight lean
const leanX = (hash2(wx + 41.2, wz + 63.8) - 0.5) * 0.1;
const leanZ = (hash2(wx + 82.4, wz + 19.6) - 0.5) * 0.1;

// Random Y rotation
const rotY = hash2(wx + 55.5, wz + 88.9) * Math.PI * 2;
```

Then set transforms for trunk and each crown layer using the species-specific offsets, applying the scale, lean, and rotation.

- [ ] **Step 4: Add per-instance color tinting**

For crown meshes, enable instance color for HSL variation:

```javascript
// After creating each crown InstancedMesh
im.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(MAX_TREES_PER_SPECIES * 3), 3
);

// When placing each instance, set a tinted color
const tintH = hash2(wx + 123.4, wz + 456.7);
const baseColor = new THREE.Color(colors[i % colors.length]);
baseColor.offsetHSL((tintH - 0.5) * 0.08, (tintH - 0.5) * 0.1, (tintH - 0.5) * 0.06);
im.setColorAt(instanceIndex, baseColor);
```

- [ ] **Step 5: Remove old single-species tree meshes**

Remove the old `treesTrunk`, `treesCrownBottom`, `treesCrownMiddle`, `treesCrownTop` InstancedMesh creation and all references in the decoration placement loop. Replace with the new species system.

- [ ] **Step 6: Run to verify diverse trees**

Run:
```bash
npm run dev
```

Expected: Frontier terrain shows a mix of pine, oak, birch, dead trees, and bushes. Each instance has slightly different scale, rotation, lean, and color tint. No two clusters look identical. Performance stays at 60fps (instancing keeps draw calls constant).

- [ ] **Step 7: Commit**

```bash
git add src/game/world/terrain.js
git commit -m "feat: add 5 diverse tree species with per-instance variation"
```

---

### Task 5: Add varied rock formations and ground scatter

**Files:**
- Modify: `src/game/world/terrain.js`

- [ ] **Step 1: Define 3 rock variants**

Replace the single `DodecahedronGeometry(2.4, 0)` with 3 variants:

```javascript
const ROCK_VARIANTS = [
  {
    geo: new THREE.DodecahedronGeometry(2.4, 0),
    color: 0x889077,
    scaleRange: [0.6, 1.3],
    squash: { x: [0.8, 1.2], y: [0.5, 1.0], z: [0.8, 1.2] },
    weight: 0.4,
  },
  {
    geo: new THREE.DodecahedronGeometry(1.8, 1),
    color: 0x7a8068,
    scaleRange: [0.5, 1.0],
    squash: { x: [1.0, 1.8], y: [0.3, 0.6], z: [1.0, 1.5] },
    weight: 0.35,
  },
  {
    geo: new THREE.DodecahedronGeometry(1.2, 2),
    color: 0x6b7560,
    scaleRange: [0.4, 0.8],
    squash: { x: [0.9, 1.1], y: [0.8, 1.1], z: [0.9, 1.1] },
    weight: 0.25,
  },
];
```

- [ ] **Step 2: Create InstancedMesh per rock variant**

```javascript
const MAX_ROCKS_PER_VARIANT = 150;
const rockMeshes = ROCK_VARIANTS.map(variant => {
  const mat = new THREE.MeshStandardMaterial({
    color: variant.color,
    roughness: 0.92,
    metalness: 0.05,
  });
  const im = new THREE.InstancedMesh(variant.geo, mat, MAX_ROCKS_PER_VARIANT);
  im.castShadow = true;
  im.receiveShadow = true;
  im.count = 0;
  scene.add(im);
  return im;
});
```

- [ ] **Step 3: Add ground scatter — small stones and fallen logs**

Add two more InstancedMesh types for ground scatter:

```javascript
// Small stones
const smallStoneGeo = new THREE.DodecahedronGeometry(0.4, 0);
const smallStoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.95, metalness: 0.02 });
const smallStones = new THREE.InstancedMesh(smallStoneGeo, smallStoneMat, 400);
smallStones.receiveShadow = true;
smallStones.count = 0;
scene.add(smallStones);

// Fallen logs (frontier only)
const logGeo = new THREE.CylinderGeometry(0.2, 0.25, 3.5, 6);
const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9, metalness: 0.03 });
const fallenLogs = new THREE.InstancedMesh(logGeo, logMat, 100);
fallenLogs.castShadow = true;
fallenLogs.receiveShadow = true;
fallenLogs.count = 0;
scene.add(fallenLogs);
```

- [ ] **Step 4: Update chunk decoration to place varied rocks and scatter**

In the decoration placement loop, use hash-based selection for rock variants with non-uniform scaling:

```javascript
// Rock variant selection
const rockHash = hash2(wx + idx * 23.7, wz + idx * 31.4);
let variantIdx = 0;
let cumWeight = 0;
for (let v = 0; v < ROCK_VARIANTS.length; v++) {
  cumWeight += ROCK_VARIANTS[v].weight;
  if (rockHash < cumWeight) { variantIdx = v; break; }
}
const variant = ROCK_VARIANTS[variantIdx];

// Non-uniform scaling for natural look
const baseScale = variant.scaleRange[0] + hash2(wx+1.1, wz+2.2) * (variant.scaleRange[1] - variant.scaleRange[0]);
const sx = baseScale * (variant.squash.x[0] + hash2(wx+3.3, wz+4.4) * (variant.squash.x[1] - variant.squash.x[0]));
const sy = baseScale * (variant.squash.y[0] + hash2(wx+5.5, wz+6.6) * (variant.squash.y[1] - variant.squash.y[0]));
const sz = baseScale * (variant.squash.z[0] + hash2(wx+7.7, wz+8.8) * (variant.squash.z[1] - variant.squash.z[0]));
```

Also add 3-5 small stones near each rock placement, and occasional fallen logs near tree positions.

- [ ] **Step 5: Remove old single-type rock InstancedMesh**

Remove the old `rocks` InstancedMesh and replace all references with the new variant system.

- [ ] **Step 6: Run to verify varied rocks and ground scatter**

Run:
```bash
npm run dev
```

Expected: Rocks come in 3 distinct shapes — round boulders, flat slabs, and detailed smaller rocks. Each has non-uniform scaling making them look natural. Small stones scatter around rock clusters. Occasional fallen logs near trees. Performance stays at 60fps.

- [ ] **Step 7: Commit**

```bash
git add src/game/world/terrain.js
git commit -m "feat: add varied rock formations and ground scatter decorations"
```

---

### Task 6: Add varied cloud types with altitude layers

**Files:**
- Modify: `src/game/world/terrain.js`

- [ ] **Step 1: Define cloud variety parameters**

Replace the uniform cloud system. After the existing `CLOUD_BODY_LOBES` and `CLOUD_WISP_LOBES` constants, add:

```javascript
const CLOUD_TYPES = [
  {
    name: 'cumulus',
    lobes: CLOUD_BODY_LOBES,
    wisps: CLOUD_WISP_LOBES,
    baseScale: 1.0,
    scaleRange: [0.7, 1.5],
    opacity: 0.55,
    altitudeRange: [95, 140],
    weight: 0.4,
  },
  {
    name: 'small_puff',
    lobes: CLOUD_BODY_LOBES.slice(0, 3),
    wisps: [],
    baseScale: 0.5,
    scaleRange: [0.3, 0.7],
    opacity: 0.45,
    altitudeRange: [85, 120],
    weight: 0.3,
  },
  {
    name: 'high_cirrus',
    lobes: [],
    wisps: CLOUD_WISP_LOBES,
    baseScale: 1.8,
    scaleRange: [1.2, 2.5],
    opacity: 0.2,
    altitudeRange: [140, 180],
    weight: 0.2,
  },
  {
    name: 'low_haze',
    lobes: CLOUD_BODY_LOBES.slice(0, 2),
    wisps: CLOUD_WISP_LOBES.slice(0, 1),
    baseScale: 1.4,
    scaleRange: [1.0, 2.0],
    opacity: 0.25,
    altitudeRange: [70, 95],
    weight: 0.1,
  },
];
```

- [ ] **Step 2: Update cloud placement to use varied types**

In the cloud creation code, replace the uniform cloud spawning with type-selected spawning:

```javascript
// Select cloud type per instance
const cloudTypeHash = hash2(angle * 100, radius * 100);
let cloudType = CLOUD_TYPES[0];
let cumW = 0;
for (const ct of CLOUD_TYPES) {
  cumW += ct.weight;
  if (cloudTypeHash < cumW) { cloudType = ct; break; }
}

// Altitude from type's range
const altHash = hash2(angle * 200, radius * 200);
const altitude = cloudType.altitudeRange[0] + altHash * (cloudType.altitudeRange[1] - cloudType.altitudeRange[0]);

// Scale from type's range
const scaleHash = hash2(angle * 300, radius * 300);
const cloudScale = cloudType.baseScale * (cloudType.scaleRange[0] + scaleHash * (cloudType.scaleRange[1] - cloudType.scaleRange[0]));

// Slight grey tint variation
const tintHash = hash2(angle * 400, radius * 400);
const greyShift = (tintHash - 0.5) * 0.08;
```

Apply `cloudScale` to lobe transforms, `altitude` to Y position, and opacity from `cloudType.opacity`. Use only the lobes/wisps defined for the type.

- [ ] **Step 3: Increase cloud count for layered feel**

Change cloud count from 18 to 28 — the extra clouds are mostly small puffs and high cirrus which are cheap to render.

- [ ] **Step 4: Run to verify varied clouds**

Run:
```bash
npm run dev
```

Expected: Sky shows large cumulus, small scattered puffs, thin high-altitude wisps, and occasional low haze. Clouds at different heights create depth. No performance impact (still instanced spheres).

- [ ] **Step 5: Commit**

```bash
git add src/game/world/terrain.js
git commit -m "feat: add varied cloud types with altitude layers and tint variation"
```

---

### Task 7: Upgrade City buildings with procedural variation

**Files:**
- Modify: `src/game/world/terrain.js`

- [ ] **Step 1: Add building variation parameters**

Add building style definitions near the city decoration code:

```javascript
const BUILDING_STYLES = [
  { widthRange: [0.7, 1.0], depthRange: [0.7, 1.0], floorRange: [3, 8], color: 0x43484f, roofStyle: 'flat' },
  { widthRange: [0.5, 0.8], depthRange: [0.5, 0.8], floorRange: [8, 20], color: 0x3a4048, roofStyle: 'antenna' },
  { widthRange: [0.9, 1.3], depthRange: [0.9, 1.3], floorRange: [2, 5], color: 0x4d525a, roofStyle: 'ac_units' },
  { widthRange: [0.6, 0.9], depthRange: [0.8, 1.1], floorRange: [5, 12], color: 0x383e46, roofStyle: 'water_tower' },
];

const BUILDING_FACADE_TINTS = [0x43484f, 0x3d4249, 0x484d55, 0x3a3f47, 0x4e535b];
```

- [ ] **Step 2: Randomize building dimensions per placement**

In the city building placement loop, replace uniform tower creation with per-building variation:

```javascript
const styleHash = hash2(bx * 17.3, bz * 31.7);
const style = BUILDING_STYLES[Math.floor(styleHash * BUILDING_STYLES.length)];

const widthHash = hash2(bx + 11.1, bz + 22.2);
const depthHash = hash2(bx + 33.3, bz + 44.4);
const floorHash = hash2(bx + 55.5, bz + 66.6);

const width = style.widthRange[0] + widthHash * (style.widthRange[1] - style.widthRange[0]);
const depth = style.depthRange[0] + depthHash * (style.depthRange[1] - style.depthRange[0]);
const floors = Math.floor(style.floorRange[0] + floorHash * (style.floorRange[1] - style.floorRange[0]));
const height = floors * 3.5;

// Per-building facade tint
const tintHash = hash2(bx + 77.7, bz + 88.8);
const facadeColor = BUILDING_FACADE_TINTS[Math.floor(tintHash * BUILDING_FACADE_TINTS.length)];
```

Apply these dimensions to the tower core geometry scaling.

- [ ] **Step 3: Add randomized window emissive pattern**

For each building, randomize which windows are "lit":

```javascript
// Window band instances — randomize lit/unlit per building
const windowLitHash = hash2(bx + 99.9, bz + 111.1);
const litFraction = 0.3 + windowLitHash * 0.4; // 30-70% windows lit

// When setting window instance color:
const isLit = hash2(bx + windowIdx * 7.1, bz + windowIdx * 11.3) < litFraction;
const windowColor = isLit
  ? new THREE.Color(0xffeebb).multiplyScalar(0.8 + hash2(bx + windowIdx, bz) * 0.4)
  : new THREE.Color(0x112233);
```

This makes each building have a unique window lighting pattern, creating a lived-in city feel. The warm lit windows will also glow subtly from the bloom pass.

- [ ] **Step 4: Add rooftop detail based on style**

After placing each building, add rooftop features based on the style:

```javascript
if (style.roofStyle === 'antenna') {
  // Thin cylinder antenna on top
  // CylinderGeometry(0.05, 0.05, 3, 4) at building top center
}
if (style.roofStyle === 'ac_units') {
  // 2-3 small boxes on roof
  // BoxGeometry(0.8, 0.5, 0.8) scattered on roof surface
}
if (style.roofStyle === 'water_tower') {
  // Cylinder + cone on roof
  // CylinderGeometry(0.6, 0.6, 1.5, 6) + ConeGeometry(0.7, 0.4, 6)
}
```

Use InstancedMesh for each rooftop element type to keep draw calls low.

- [ ] **Step 5: Run to verify varied buildings**

Run:
```bash
npm run dev
```

Expected: City theme shows buildings of different heights, widths, and colors. Some are tall skinny towers, others squat blocks. Windows have varied warm/dark patterns. Rooftops have different features. The city feels organic rather than grid-perfect.

- [ ] **Step 6: Commit**

```bash
git add src/game/world/terrain.js
git commit -m "feat: add procedural building variation with randomized windows and rooftops"
```

---

### Task 8: Enhance Player drone model with detail geometry

**Files:**
- Modify: `src/game/entities/Player.js`

- [ ] **Step 1: Add panel line details to fuselage**

In `Player.js`, after the fuselage mesh is created (around the `CapsuleGeometry` section), add recessed panel lines:

```javascript
// Panel lines on fuselage
const panelLineMat = new THREE.MeshStandardMaterial({
  color: 0x1a2030,
  roughness: 0.6,
  metalness: 0.4,
});
const panelLineGeo = new THREE.BoxGeometry(0.04, 0.04, 2.2);

// Dorsal panel lines (2 parallel lines on top)
const panelLine1 = new THREE.Mesh(panelLineGeo, panelLineMat);
panelLine1.position.set(0.4, 0.85, 0);
model.add(panelLine1);

const panelLine2 = new THREE.Mesh(panelLineGeo, panelLineMat);
panelLine2.position.set(-0.4, 0.85, 0);
model.add(panelLine2);

// Side panel lines
const sidePanelGeo = new THREE.BoxGeometry(0.04, 0.6, 0.04);
const sidePanel1 = new THREE.Mesh(sidePanelGeo, panelLineMat);
sidePanel1.position.set(0.88, 0.2, 0.8);
model.add(sidePanel1);

const sidePanel2 = new THREE.Mesh(sidePanelGeo, panelLineMat);
sidePanel2.position.set(-0.88, 0.2, 0.8);
model.add(sidePanel2);

const sidePanel3 = new THREE.Mesh(sidePanelGeo, panelLineMat);
sidePanel3.position.set(0.88, 0.2, -0.6);
model.add(sidePanel3);

const sidePanel4 = new THREE.Mesh(sidePanelGeo, panelLineMat);
sidePanel4.position.set(-0.88, 0.2, -0.6);
model.add(sidePanel4);
```

- [ ] **Step 2: Add antenna and landing light**

```javascript
// Antenna nub on tail boom
const antennaGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.8, 4);
const antennaMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.7 });
const antenna = new THREE.Mesh(antennaGeo, antennaMat);
antenna.position.set(0, 0.6, -3.5);
model.add(antenna);

// Landing light under nose
const landingLightGeo = new THREE.CircleGeometry(0.15, 8);
const landingLightMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffcc,
  emissiveIntensity: 1.5,
  roughness: 0.1,
  metalness: 0.3,
});
const landingLight = new THREE.Mesh(landingLightGeo, landingLightMat);
landingLight.rotation.x = -Math.PI / 2;
landingLight.position.set(0, -0.5, 2.2);
model.add(landingLight);
```

- [ ] **Step 3: Add ventilation grates on motor shrouds**

```javascript
// Ventilation grates on each motor shroud
const ventGeo = new THREE.BoxGeometry(0.3, 0.03, 0.12);
const ventMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.6 });

for (const nacelle of nacelles) {
  for (let v = 0; v < 3; v++) {
    const vent = new THREE.Mesh(ventGeo, ventMat);
    vent.position.set(0, 0.35, -0.2 + v * 0.2);
    nacelle.add(vent);
  }
}
```

(Where `nacelles` are the motor mount groups — adapt based on how motors are added to the model.)

- [ ] **Step 4: Vary rotor spin speeds per motor**

In the `update()` method, replace the uniform rotor speed with per-motor variation:

```javascript
// Replace: this.rotors.forEach(r => r.rotation.y += 35 * dt);
// With:
const baseSpeed = 35;
const speedOffsets = [1.0, 1.06, 0.94, 1.03]; // ±10% variation
this.rotors.forEach((r, i) => {
  r.rotation.y += baseSpeed * speedOffsets[i % speedOffsets.length] * dt;
});
```

- [ ] **Step 5: Run to verify player drone details**

Run:
```bash
npm run dev
```

Expected: Player drone shows visible panel lines on the fuselage, a small antenna on the tail, a landing light under the nose, ventilation grates on motor shrouds, and slightly desynchronized rotor speeds. The overall silhouette is the same but the detail level is much higher up close.

- [ ] **Step 6: Commit**

```bash
git add src/game/entities/Player.js
git commit -m "feat: add panel lines, antenna, landing light, and vent details to player drone"
```

---

### Task 9: Enhance enemy entity models

**Files:**
- Modify: `src/game/entities/DroneEnemy.js`
- Modify: `src/game/entities/TankEnemy.js`
- Modify: `src/game/entities/ShipEnemy.js`
- Modify: `src/game/entities/MissileEnemy.js`

- [ ] **Step 1: Add detail geometry to DroneEnemy**

In `DroneEnemy.js`, after the main model is built, add:

```javascript
// Wire/cable between arms and body
const wireMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.4 });
const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4);

for (let i = 0; i < 4; i++) {
  const angle = (Math.PI / 4) + (Math.PI / 2) * i;
  const wire = new THREE.Mesh(wireGeo, wireMat);
  wire.position.set(Math.cos(angle) * 1.0, -0.25, Math.sin(angle) * 1.0);
  wire.rotation.z = angle + Math.PI / 2;
  wire.rotation.x = 0.15;
  model.add(wire);
}

// Sensor array under body
const sensorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 });
const sensorGeo = new THREE.BoxGeometry(0.8, 0.08, 0.5);
const sensorArray = new THREE.Mesh(sensorGeo, sensorMat);
sensorArray.position.set(0, -0.55, 0);
model.add(sensorArray);
```

- [ ] **Step 2: Add detail geometry to TankEnemy**

In `TankEnemy.js`, after the main model is built, add:

```javascript
// ERA (reactive armor) blocks on hull sides
const eraGeo = new THREE.BoxGeometry(0.5, 0.4, 0.15);
const eraMat = new THREE.MeshStandardMaterial({ color: 0x6b7e5a, roughness: 0.85, metalness: 0.1 });
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 5; col++) {
    for (const side of [-1, 1]) {
      const era = new THREE.Mesh(eraGeo, eraMat);
      era.position.set(side * 3.4, 0.3 + row * 0.5, -3.0 + col * 1.6);
      era.castShadow = true;
      model.add(era);
    }
  }
}

// Smoke grenade launchers on turret sides
const launcherGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6);
const launcherMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.5 });
for (const side of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    const launcher = new THREE.Mesh(launcherGeo, launcherMat);
    launcher.rotation.z = side * 0.4;
    launcher.position.set(side * 2.2, 0.3, -0.4 + i * 0.25);
    this.turretGroup.add(launcher);
  }
}

// Antenna whip on turret
const whipGeo = new THREE.CylinderGeometry(0.02, 0.03, 2.5, 4);
const whipMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.7 });
const whip = new THREE.Mesh(whipGeo, whipMat);
whip.position.set(-1.2, 1.5, -0.5);
whip.rotation.z = 0.15;
this.turretGroup.add(whip);
```

- [ ] **Step 3: Add detail geometry to ShipEnemy**

In `ShipEnemy.js`, after the main model is built, add:

```javascript
// Waterline weathering band
const waterlineGeo = new THREE.BoxGeometry(11.2, 0.5, 22.2);
const waterlineMat = new THREE.MeshStandardMaterial({
  color: 0x1a3a3d,
  roughness: 0.8,
  metalness: 0.15,
});
const waterline = new THREE.Mesh(waterlineGeo, waterlineMat);
waterline.position.set(0, -1.2, 0);
model.add(waterline);

// Deck clutter — crates and equipment
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a5040, roughness: 0.85, metalness: 0.08 });
const cratePositions = [
  { x: -3.5, z: -6, s: 0.8 },
  { x: 3.2, z: -7, s: 0.6 },
  { x: -2.0, z: 8, s: 0.7 },
  { x: 4.0, z: 3, s: 0.5 },
];
for (const cp of cratePositions) {
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(cp.s, cp.s * 0.7, cp.s),
    crateMat
  );
  crate.position.set(cp.x, 1.85, cp.z);
  crate.castShadow = true;
  model.add(crate);
}

// Life rafts on sides
const raftGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
const raftMat = new THREE.MeshStandardMaterial({ color: 0xff6633, roughness: 0.7, metalness: 0.1 });
for (const side of [-1, 1]) {
  const raft = new THREE.Mesh(raftGeo, raftMat);
  raft.position.set(side * 5.2, 3.5, -2);
  raft.rotation.z = side * 0.3;
  model.add(raft);
}
```

- [ ] **Step 4: Add detail geometry to MissileEnemy**

In `MissileEnemy.js`, after the main model is built, add:

```javascript
// Body panel line rings
const ringMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.4, metalness: 0.4 });
const ringPositions = [-0.8, 0.4, 1.6];
for (const rz of ringPositions) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.03, 6, 12),
    ringMat
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0, rz);
  model.add(ring);
}

// Enhanced exhaust — inner brighter glow
const innerExhaustGeo = new THREE.SphereGeometry(0.2, 6, 6);
const innerExhaustMat = new THREE.MeshStandardMaterial({
  color: 0xffff00,
  emissive: 0xffaa00,
  emissiveIntensity: 4,
  transparent: true,
  opacity: 0.9,
});
this.innerExhaust = new THREE.Mesh(innerExhaustGeo, innerExhaustMat);
this.innerExhaust.position.set(0, 0, -2.5);
this.innerExhaust.scale.set(0.6, 0.6, 1.2);
model.add(this.innerExhaust);
```

Also update the MissileEnemy `update()` to animate the inner exhaust alongside the existing exhaust flicker.

- [ ] **Step 5: Run to verify all entity enhancements**

Run:
```bash
npm run dev
```

Expected: Enemy drones show wires and sensor arrays. Tanks have ERA blocks, smoke launchers, and antenna whips. Ships have a waterline band, deck clutter, and orange life rafts. Missiles have panel rings and a brighter dual-layer exhaust. All entities read as more detailed and military-realistic.

- [ ] **Step 6: Commit**

```bash
git add src/game/entities/DroneEnemy.js src/game/entities/TankEnemy.js src/game/entities/ShipEnemy.js src/game/entities/MissileEnemy.js
git commit -m "feat: add detail geometry to all enemy entity models"
```

---

### Task 10: Add material enhancements and emissive details

**Files:**
- Modify: `src/game/entities/Player.js`
- Modify: `src/game/entities/ShipEnemy.js`
- Modify: `src/game/entities/TankEnemy.js`
- Modify: `src/game/world/terrain.js` (building windows emissive)

- [ ] **Step 1: Add cockpit interior glow to Player**

In `Player.js`, update the glass material to have a subtle interior emissive:

```javascript
// Update glassMaterial to add interior instrument glow
this.glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x7db1c9,
  roughness: 0.08,
  metalness: 0.82,
  transparent: true,
  opacity: 0.88,
  emissive: 0x2a5a6a,
  emissiveIntensity: 0.3,
});
```

- [ ] **Step 2: Add warm interior lighting to Ship bridge windows**

In `ShipEnemy.js`, update the window material:

```javascript
this.windowMat = new THREE.MeshStandardMaterial({
  color: 0x112233,
  roughness: 0.1,
  metalness: 0.8,
  emissive: 0xffcc66,
  emissiveIntensity: 0.4,
});
```

- [ ] **Step 3: Add commander hatch interior light to Tank**

In `TankEnemy.js`, update the hatch material or add a small emissive disc under the hatch:

```javascript
// Interior light visible through hatch
const hatchLightGeo = new THREE.CircleGeometry(0.35, 6);
const hatchLightMat = new THREE.MeshStandardMaterial({
  color: 0x443322,
  emissive: 0x664422,
  emissiveIntensity: 0.6,
  roughness: 0.5,
  metalness: 0.3,
});
const hatchLight = new THREE.Mesh(hatchLightGeo, hatchLightMat);
hatchLight.rotation.x = -Math.PI / 2;
hatchLight.position.set(0.8, 3.42, -0.5);
model.add(hatchLight);
```

- [ ] **Step 4: Run to verify emissive enhancements**

Run:
```bash
npm run dev
```

Expected: Player canopy has a subtle blue-green interior glow. Ship bridge windows glow warm amber. Tank hatches show a dim interior light. All these glow slightly more with the bloom pass creating subtle light bleed.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/Player.js src/game/entities/ShipEnemy.js src/game/entities/TankEnemy.js
git commit -m "feat: add emissive interior glow to cockpit, bridge, and hatch"
```

---

### Task 11: Add animated water surface

**Files:**
- Modify: `src/game/world/terrain.js`

- [ ] **Step 1: Store sea vertex positions for animation**

In the terrain chunk building code, when creating sea-biome chunks, store the original vertex positions so they can be animated:

```javascript
// After creating the chunk PlaneGeometry for sea biome
// Store reference for water animation
if (biome === 'sea') {
  const positions = chunkMesh.geometry.attributes.position;
  chunkMesh.userData.isWater = true;
  chunkMesh.userData.originalY = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    chunkMesh.userData.originalY[i] = positions.getY(i);
  }
}
```

- [ ] **Step 2: Update sea material for better water look**

Replace the flat sea material with a more realistic water material:

```javascript
// Sea material with transparency and slight specular
const seaMat = new THREE.MeshStandardMaterial({
  color: 0x195f93,
  roughness: 0.15,
  metalness: 0.6,
  transparent: true,
  opacity: 0.85,
});
```

- [ ] **Step 3: Add water animation in terrain update loop**

In the terrain's `update()` method (or create one if needed), animate water chunks:

```javascript
updateWater(elapsed) {
  for (const chunk of this.activeChunks) {
    if (!chunk.mesh.userData.isWater) continue;

    const positions = chunk.mesh.geometry.attributes.position;
    const origY = chunk.mesh.userData.originalY;
    const wx = chunk.worldX;
    const wz = chunk.worldZ;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) + wx;
      const z = positions.getZ(i) + wz;

      // Multi-frequency sine waves for organic rolling
      const wave1 = Math.sin(x * 0.08 + elapsed * 1.2) * 0.3;
      const wave2 = Math.cos(z * 0.06 + elapsed * 0.8) * 0.25;
      const wave3 = Math.sin((x + z) * 0.12 + elapsed * 1.6) * 0.15;

      positions.setY(i, origY[i] + wave1 + wave2 + wave3);
    }

    positions.needsUpdate = true;
    chunk.mesh.geometry.computeVertexNormals();
  }
}
```

- [ ] **Step 4: Call water update from the game loop**

In `Game.js` or wherever the terrain update is called, add:

```javascript
this.simulation.terrain.updateWater(elapsed);
```

- [ ] **Step 5: Run to verify animated water**

Run:
```bash
npm run dev
```

Expected: Sea areas show gentle rolling waves with multi-frequency animation. Water surface catches sun specular highlights on wave peaks due to the metalness/roughness settings. The transparency gives slight depth. No performance issues since only visible sea chunks animate.

- [ ] **Step 6: Commit**

```bash
git add src/game/world/terrain.js src/game/Game.js
git commit -m "feat: add animated water surface with rolling wave displacement"
```

---

### Task 12: Final integration testing and performance verification

**Files:**
- No new files — testing existing changes

- [ ] **Step 1: Run dev server and test Frontier theme**

Run:
```bash
npm run dev
```

Test Frontier theme:
- Verify diverse tree species (pine, oak, birch, dead trees, bushes) are visible
- Verify varied rock formations (boulders, slabs, round stones)
- Verify ground scatter (small stones, fallen logs)
- Verify animated water in sea areas
- Verify enhanced sky with sun disc, procedural clouds, height-based fog
- Verify player drone panel lines, antenna, landing light visible
- Verify enemy details visible (tank ERA, ship clutter, missile rings)
- Verify bloom glow on emissive surfaces
- Verify SSAO darkening at contact points

- [ ] **Step 2: Test City theme**

Switch to City theme and verify:
- Buildings have varied heights, widths, colors
- Window patterns vary per building (some lit, some dark)
- Rooftop features visible (antennas, AC units, water towers)
- Bloom on lit windows creates warm city glow

- [ ] **Step 3: Performance check**

Open browser DevTools, check:
- Frame time stays under 16.6ms (60fps)
- No significant frame drops during combat with many entities
- No memory leaks from water animation (vertex buffer reuse)
- Draw call count hasn't exploded (instancing should keep it manageable)

- [ ] **Step 4: Run build to ensure no errors**

```bash
npm run build
```

Expected: Clean build with no errors or warnings.

- [ ] **Step 5: Run tests**

```bash
npm run test
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 6: Commit any final fixes**

If any adjustments were needed during testing, commit them:

```bash
git add -A
git commit -m "fix: final visual tuning and integration fixes"
```
