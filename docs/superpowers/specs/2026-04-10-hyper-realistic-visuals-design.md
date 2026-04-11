# Hyper-Realistic Visuals Upgrade

**Date:** 2026-04-10  
**Status:** Approved  
**Approach:** Combined geometry + materials + post-processing  
**Performance target:** 60fps on mid-range hardware (GTX 1060 / M1 equivalent)

## 1. Terrain & World Variety

### Trees (Frontier theme)
- 5 species replacing the current uniform 3-tier cone:
  - **Pine**: Tall narrow cones, varied heights (4–10 units), random lean (±5°)
  - **Oak**: Sphere/ellipsoid canopy on thick trunk, randomized canopy squash
  - **Birch**: Thin trunk, small clustered sphere canopy
  - **Dead tree**: Bare trunk + 2–3 angled branch cylinders, no canopy
  - **Bush**: Low hemisphere clusters, ground-level scatter
- Per-instance variation: scale (0.6x–1.4x), Y-rotation, slight lean, canopy color tint shift (±15% HSL)
- One `InstancedMesh` per species with per-instance color attribute

### Buildings (City theme)
- Procedural building generator with randomized:
  - Floor count (3–20), width/depth ratio
  - Window pattern (grid density, lit/unlit randomization)
  - Rooftop features (AC units, water towers, antenna, helipad)
  - Facade color variation (2–3 base colors with per-building tint)
- Clusters of 2–3 buildings per block

### Rocks & Ground Scatter
- 3 rock variants: DodecahedronGeometry at detail levels 0, 1, 2
- Non-uniform scaling (stretched boulders, round stones, flat slabs)
- Ground scatter: small stones, debris near roads (city), fallen logs near trees (frontier)

### Clouds
- Varied sizes (small wisps to large cumulus)
- Altitude layers (low haze vs high cirrus)
- Slight grey tint variation for depth

## 2. Entity Model Enhancements

### Player Drone
- Panel line details (thin recessed BoxGeometry strips on fuselage)
- Antenna nub on tail boom
- Ventilation grates on motor shrouds
- Landing light under nose (small emissive disc)
- Per-motor rotor spin speed variation (±10%)

### Enemy Drones
- Wire/cable detail between arms and body (thin cylinders)
- Sensor array under body (small box grid)
- Variant details: assault = gun pods, support = repair dish, jammer = antenna spines

### Tanks
- ERA blocks on hull sides (small box grid)
- Smoke grenade launchers on turret sides (cylinder clusters)
- Tow cable on rear hull (torus segment)
- Track link segments replacing smooth boxes
- Antenna whip on turret

### Ships
- Waterline weathering (darker material band at hull bottom)
- Anchor detail on bow
- Life rafts on superstructure sides
- Deck clutter (crates, equipment boxes)
- Wake foam trailing behind hull (semi-transparent planes)

### Missiles
- Faceted seeker head cone
- Body panel line rings
- Brighter flickering exhaust with inner glow
- Smoke trail (fading small spheres)

**Budget:** Max ~30 additional primitives per entity type. All use shared materials.

## 3. Materials & Surface Realism

### Roughness/Metalness Variation
- Edge wear: slightly shinier roughness on edges (worn paint effect)
- Weathered panels: slightly rougher flat surfaces
- Undersides darker via vertex color or second material

### Color Tint Variation
- Per-instance HSL jitter on terrain decorations
- Per-spawn ±5% tint shift on enemy entities

### Emissive Enhancements
- Cockpit glass interior glow
- Tank commander hatch interior light
- Ship bridge windows warm interior lighting
- Building windows: randomized on/off emissive

### Water Surface
- Animated vertex displacement using multi-frequency sine waves
- Specular highlight from sun direction on wave peaks
- Semi-transparent with depth-fade color shift (shallow lighter, deep darker)
- Only animate visible water chunks

## 4. Post-Processing

### Bloom (UnrealBloomPass)
- Strength: ~0.3, radius: ~0.4, threshold: ~0.75
- Half-resolution rendering (~1ms GPU)
- Affects: muzzle flashes, projectile trails, exhausts, cockpit lights, building windows

### SSAO (N8AOPass preferred, SAOPass fallback)
- Radius: ~5, intensity: ~0.5
- Half-resolution rendering (~1ms GPU)
- Affects: creases, contact points, window recesses, under-drone arms

### Sky Shader Upgrade
- Procedural noise-based cloud layer at horizon
- Sun disc with soft edge falloff
- Color shift based on sun angle (warm golden at horizon)

### Fog Enhancement
- Height-based fog: denser near ground, thinner at altitude
- Fog color shifts bluer with distance

### Excluded Effects (performance)
- No depth of field
- No god rays / volumetric light
- No motion blur
- No screen-space reflections

**Total post-processing budget: ~2–3ms per frame**

## 5. Performance Strategy

- **Instancing:** One `InstancedMesh` per decoration type with per-instance matrix + color
- **Distance-based density:** Near chunks get full detail, far chunks get only trees/buildings
- **Half-res post-processing:** Bloom + SSAO at 0.5x resolution, upscaled
- **Entity detail budget:** Max ~30 extra primitives per type, shared materials
- **Water animation:** Vertex displacement on existing mesh, visible chunks only
- **Pixel ratio:** Stays capped at 1.75
- **Shadow map:** Unchanged at 2048x2048
