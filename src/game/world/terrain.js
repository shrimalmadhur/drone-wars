import * as THREE from 'three/webgpu';
import {
  Fn, vec3, positionLocal, positionWorld, sin, cos, time as tslTime,
} from 'three/tsl';

import { DEFAULT_MAP_THEME, MAP_THEMES, sanitizeMapTheme } from '../../mapThemes.js';
import { CONFIG } from '../config.js';
import { randomRange, segmentIntersectsCylinderAt } from '../math.js';

const UP = new THREE.Vector3(0, 1, 0);
const CITY_BLOCK_SIZE = 24;
const CITY_ROAD_WIDTH = 2.6;
const CITY_CAR_COLORS = ['#ff6b57', '#ffd166', '#4ecdc4', '#f4f8ff', '#7ea3ff'];
const CLOUD_BODY_LOBES = [
  { x: 0, y: 0, z: 0, sx: 1.8, sy: 1.05, sz: 1.25 },
  { x: -5.5, y: -0.9, z: 1.6, sx: 1.15, sy: 0.78, sz: 0.92 },
  { x: 5.1, y: -0.6, z: -1.3, sx: 1.2, sy: 0.82, sz: 0.95 },
  { x: -1.3, y: 1.5, z: -2.6, sx: 1.05, sy: 0.72, sz: 0.88 },
  { x: 3.2, y: 1.1, z: 2.4, sx: 0.95, sy: 0.66, sz: 0.82 },
];
const CLOUD_WISP_LOBES = [
  { x: -8.5, y: -1.3, z: 4.8, sx: 1.8, sy: 0.34, sz: 1.35 },
  { x: 7.8, y: -0.8, z: -4.1, sx: 1.55, sy: 0.3, sz: 1.18 },
  { x: 0.8, y: -2.2, z: 0.4, sx: 2.15, sy: 0.28, sz: 1.55 },
];
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

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

function sampleBiomeField(x, z) {
  return (
    Math.sin(x * 0.0024) * 0.95 +
    Math.cos(z * 0.0021) * 0.8 +
    Math.sin((x + z) * 0.0012) * 0.55 +
    Math.cos((x - z) * 0.0016) * 0.35
  );
}

function getFrontierBiomeAt(x, z) {
  const field = sampleBiomeField(x, z);
  if (field < -0.72) {
    return 'sea';
  }
  if (field < -0.4) {
    return 'shore';
  }
  return 'land';
}

function getFrontierGroundHeightAt(x, z) {
  const biome = getFrontierBiomeAt(x, z);
  if (biome === 'sea') {
    return CONFIG.world.seaLevel;
  }

  const rolling = Math.sin(x * 0.035) * 4 + Math.cos(z * 0.028) * 5;
  const ridges = Math.sin((x + z) * 0.017) * 3.2;
  const mesas = Math.sin(x * 0.008) * Math.cos(z * 0.007) * 10;
  const field = sampleBiomeField(x, z);
  const shoreLift = biome === 'shore' ? (field + 0.4) * 18 : 0;
  return rolling + ridges + mesas + shoreLift;
}

function getFrontierSurfaceColor(x, z, height) {
  const biome = getFrontierBiomeAt(x, z);
  if (biome === 'sea') {
    return new THREE.Color('#195f93');
  }
  if (biome === 'shore') {
    const t = THREE.MathUtils.clamp((height - CONFIG.world.seaLevel) / 12, 0, 1);
    return new THREE.Color().lerpColors(
      new THREE.Color('#c9b17e'),
      new THREE.Color('#5f8154'),
      t,
    );
  }

  if (height > 18) {
    return new THREE.Color('#708564');
  }
  if (height > 10) {
    return new THREE.Color('#5b774f');
  }
  return new THREE.Color('#48663f');
}

function getCityRiverOffset(x) {
  return Math.sin(x * 0.0046) * 22 + Math.cos(x * 0.0019) * 10;
}

function sampleCityParkField(x, z) {
  return (
    Math.sin(x * 0.008) * 0.55 +
    Math.cos(z * 0.0074) * 0.45 +
    Math.sin((x - z) * 0.0042) * 0.35
  );
}

function distanceToGridLine(value, spacing) {
  const offset = fract(value / spacing);
  return Math.min(offset, 1 - offset) * spacing;
}

function isCityRoad(x, z) {
  return Math.min(
    distanceToGridLine(x, CITY_BLOCK_SIZE),
    distanceToGridLine(z, CITY_BLOCK_SIZE),
  ) < CITY_ROAD_WIDTH;
}

function getCityBiomeAt(x, z) {
  const waterDistance = Math.abs(z - getCityRiverOffset(x));
  if (waterDistance < 10) {
    return 'sea';
  }
  if (waterDistance < 18) {
    return 'shore';
  }
  return 'land';
}

function getCityGroundHeightAt(x, z) {
  const biome = getCityBiomeAt(x, z);
  if (biome === 'sea') {
    return CONFIG.world.seaLevel;
  }

  const base = (
    1.4 +
    Math.sin(x * 0.015) * 1.1 +
    Math.cos(z * 0.013) * 1.25 +
    Math.sin((x + z) * 0.01) * 0.7
  );
  const embankment = biome === 'shore' ? 1.5 : 0;
  const parkLift = sampleCityParkField(x, z) > 0.78 ? 0.9 : 0;
  return base + embankment + parkLift;
}

function getCitySurfaceColor(x, z) {
  const biome = getCityBiomeAt(x, z);
  if (biome === 'sea') {
    return new THREE.Color('#214f78');
  }
  if (biome === 'shore') {
    return new THREE.Color('#66717a');
  }
  if (sampleCityParkField(x, z) > 0.72 && !isCityRoad(x, z)) {
    return new THREE.Color('#526b48');
  }
  if (isCityRoad(x, z)) {
    return new THREE.Color('#2d333b');
  }
  return new THREE.Color('#43484f');
}

export function getBiomeAt(x, z, mapTheme = DEFAULT_MAP_THEME) {
  const theme = sanitizeMapTheme(mapTheme);
  return theme === MAP_THEMES.CITY
    ? getCityBiomeAt(x, z)
    : getFrontierBiomeAt(x, z);
}

export function getGroundHeightAt(x, z, mapTheme = DEFAULT_MAP_THEME) {
  const theme = sanitizeMapTheme(mapTheme);
  return theme === MAP_THEMES.CITY
    ? getCityGroundHeightAt(x, z)
    : getFrontierGroundHeightAt(x, z);
}

function getSurfaceColor(x, z, height, mapTheme = DEFAULT_MAP_THEME) {
  const theme = sanitizeMapTheme(mapTheme);
  return theme === MAP_THEMES.CITY
    ? getCitySurfaceColor(x, z, height)
    : getFrontierSurfaceColor(x, z, height);
}

function clampToArena(position) {
  return position;
}

export function canOccupyBiome(type, biome) {
  if (type === 'ship') {
    return biome === 'sea';
  }
  if (type === 'tank') {
    return biome === 'land' || biome === 'shore';
  }
  return true;
}

export function canOccupyAt(type, x, z, mapTheme = DEFAULT_MAP_THEME) {
  return canOccupyBiome(type, getBiomeAt(x, z, mapTheme));
}

function validSpawn(type, x, z, playerPosition, mapTheme) {
  const dist = Math.hypot(x - playerPosition.x, z - playerPosition.z);
  if (dist < CONFIG.world.spawnMinDistance) {
    return false;
  }
  return canOccupyAt(type, x, z, mapTheme);
}

function createSpawnPosition(type, x, z, rng, mapTheme) {
  const y = type === 'drone'
    ? randomRange(rng, 18, 36)
    : type === 'missile'
      ? randomRange(rng, 20, 48)
      : getGroundHeightAt(x, z, mapTheme);
  return new THREE.Vector3(x, y, z);
}

function searchSpawnRings(type, playerPosition, rng, minRadius, maxRadius, mapTheme) {
  const angleOffset = randomRange(rng, -Math.PI, Math.PI);
  for (let radius = minRadius; radius <= maxRadius; radius += 8) {
    const sampleCount = Math.max(48, Math.ceil((Math.PI * 2 * radius) / 18));
    for (let step = 0; step < sampleCount; step += 1) {
      const angle = angleOffset + (step / sampleCount) * Math.PI * 2;
      const x = playerPosition.x + Math.cos(angle) * radius;
      const z = playerPosition.z + Math.sin(angle) * radius;
      if (validSpawn(type, x, z, playerPosition, mapTheme)) {
        return createSpawnPosition(type, x, z, rng, mapTheme);
      }
    }
  }
  return null;
}

function resolveSpawnPosition(type, playerPosition, rng, mapTheme, options = {}) {
  const allowDistant = options.allowDistant ?? false;
  const minRadius = CONFIG.world.spawnMinDistance + 24;
  const maxRadius = CONFIG.world.spawnMaxDistance;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const angle = randomRange(rng, -Math.PI, Math.PI);
    const radius = randomRange(rng, minRadius, maxRadius);
    const x = playerPosition.x + Math.cos(angle) * radius;
    const z = playerPosition.z + Math.sin(angle) * radius;

    if (!validSpawn(type, x, z, playerPosition, mapTheme)) {
      continue;
    }

    return createSpawnPosition(type, x, z, rng, mapTheme);
  }

  const exhaustive = searchSpawnRings(
    type,
    playerPosition,
    rng,
    minRadius,
    Math.min(CONFIG.world.enemyDespawnDistance - 16, maxRadius + CONFIG.world.chunkSize * 2),
    mapTheme,
  );
  if (exhaustive) {
    return exhaustive;
  }

  if (allowDistant) {
    const distant = searchSpawnRings(
      type,
      playerPosition,
      rng,
      CONFIG.world.enemyDespawnDistance + 8,
      CONFIG.world.enemyDespawnDistance + CONFIG.world.chunkSize * 8,
      mapTheme,
    );
    if (distant) {
      return distant;
    }
  }

  if (type === 'tank' || type === 'ship') {
    return null;
  }

  const fallback = new THREE.Vector3(
    playerPosition.x,
    0,
    playerPosition.z - CONFIG.world.spawnMinDistance - 18,
  );
  fallback.y = type === 'drone' || type === 'missile'
    ? 24
    : getGroundHeightAt(fallback.x, fallback.z, mapTheme);
  return fallback;
}

function setInstanceTransform(mesh, index, position, rotationY, scale) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function setInstanceTransformEuler(mesh, index, position, rx, ry, rz, scale) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function setInstanceTransformWithLean(mesh, index, position, rotationY, leanX, leanZ, scale) {
  const matrix = new THREE.Matrix4();
  const qY = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  const qLean = new THREE.Quaternion().setFromEuler(new THREE.Euler(leanX, 0, leanZ, 'XYZ'));
  qY.multiply(qLean);
  matrix.compose(position, qY, scale);
  mesh.setMatrixAt(index, matrix);
}

function hideRemainingInstances(mesh, startIndex, scratchPosition) {
  for (let index = startIndex; index < mesh.count; index += 1) {
    setInstanceTransform(mesh, index, scratchPosition, 0, new THREE.Vector3(0.0001, 0.0001, 0.0001));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function worldOffset(baseX, baseY, baseZ, rotationY, localX, localY, localZ, target) {
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  target.set(
    baseX + localX * cos + localZ * sin,
    baseY + localY,
    baseZ - localX * sin + localZ * cos,
  );
  return target;
}

function setLocalInstanceTransform(mesh, index, anchorX, anchorZ, base, rotationY, offsets, scale, target) {
  const worldPosition = worldOffset(base.x, base.y, base.z, rotationY, offsets.x, offsets.y, offsets.z, target);
  return setInstanceTransform(
    mesh,
    index,
    worldToLocal(worldPosition.x, worldPosition.y, worldPosition.z, anchorX, anchorZ, target),
    rotationY + (offsets.ry ?? 0),
    scale,
  );
}

function buildFrontierDecorMeshes(group, maxCounts) {
  // --- Geometry per species ---
  // Pine (3-tier cone)
  const pineTrunkGeo = new THREE.CylinderGeometry(0.2, 0.5, 7, 6);
  const pineCrown0Geo = new THREE.ConeGeometry(2.8, 5.5, 7);
  const pineCrown1Geo = new THREE.ConeGeometry(2.1, 4.5, 7);
  const pineCrown2Geo = new THREE.ConeGeometry(1.4, 3.5, 7);

  // Oak (round canopy)
  const oakTrunkGeo = new THREE.CylinderGeometry(0.35, 0.65, 5, 6);
  const oakCrownGeo = new THREE.SphereGeometry(3.2, 8, 6);

  // Birch (thin trunk, clustered small spheres)
  const birchTrunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 8, 5);
  const birchCrown0Geo = new THREE.SphereGeometry(1.6, 7, 5);
  const birchCrown1Geo = new THREE.SphereGeometry(1.3, 7, 5);
  const birchCrown2Geo = new THREE.SphereGeometry(1.0, 7, 5);

  // Dead tree (bare trunk + angled branches)
  const deadTrunkGeo = new THREE.CylinderGeometry(0.18, 0.45, 6, 5);
  const deadBranch0Geo = new THREE.CylinderGeometry(0.06, 0.12, 3.5, 4);
  const deadBranch1Geo = new THREE.CylinderGeometry(0.05, 0.10, 2.8, 4);
  const deadBranch2Geo = new THREE.CylinderGeometry(0.04, 0.09, 2.2, 4);

  // Bush (low ground cover, no trunk)
  const bushCrown0Geo = new THREE.SphereGeometry(1.5, 6, 5);
  const bushCrown1Geo = new THREE.SphereGeometry(1.1, 6, 5);

  // --- Materials per species ---
  const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2415, roughness: 1 });
  const pineCrown0Mat = new THREE.MeshStandardMaterial({ color: 0x1a5428, roughness: 0.92 });
  const pineCrown1Mat = new THREE.MeshStandardMaterial({ color: 0x226b35, roughness: 0.90 });
  const pineCrown2Mat = new THREE.MeshStandardMaterial({ color: 0x2d8044, roughness: 0.88 });

  const oakTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 1 });
  const oakCrownMat = new THREE.MeshStandardMaterial({ color: 0x3a6e2e, roughness: 0.90 });

  const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xd4cfc4, roughness: 1 });
  const birchCrown0Mat = new THREE.MeshStandardMaterial({ color: 0x5a9e48, roughness: 0.90 });
  const birchCrown1Mat = new THREE.MeshStandardMaterial({ color: 0x68ac55, roughness: 0.88 });
  const birchCrown2Mat = new THREE.MeshStandardMaterial({ color: 0x76ba62, roughness: 0.86 });

  const deadTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 1 });
  const deadBranchMat = new THREE.MeshStandardMaterial({ color: 0x3d2e20, roughness: 1 });

  const bushCrown0Mat = new THREE.MeshStandardMaterial({ color: 0x456b38, roughness: 0.92 });
  const bushCrown1Mat = new THREE.MeshStandardMaterial({ color: 0x507a42, roughness: 0.90 });

  // --- InstancedMesh creation helper ---
  const treeCount = maxCounts.trees;
  function makeTreeMesh(geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, treeCount);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const treeSpecies = {
    pine: {
      trunk: makeTreeMesh(pineTrunkGeo, pineTrunkMat),
      crowns: [
        makeTreeMesh(pineCrown0Geo, pineCrown0Mat),
        makeTreeMesh(pineCrown1Geo, pineCrown1Mat),
        makeTreeMesh(pineCrown2Geo, pineCrown2Mat),
      ],
    },
    oak: {
      trunk: makeTreeMesh(oakTrunkGeo, oakTrunkMat),
      crowns: [makeTreeMesh(oakCrownGeo, oakCrownMat)],
    },
    birch: {
      trunk: makeTreeMesh(birchTrunkGeo, birchTrunkMat),
      crowns: [
        makeTreeMesh(birchCrown0Geo, birchCrown0Mat),
        makeTreeMesh(birchCrown1Geo, birchCrown1Mat),
        makeTreeMesh(birchCrown2Geo, birchCrown2Mat),
      ],
    },
    deadTree: {
      trunk: makeTreeMesh(deadTrunkGeo, deadTrunkMat),
      crowns: [
        makeTreeMesh(deadBranch0Geo, deadBranchMat),
        makeTreeMesh(deadBranch1Geo, deadBranchMat),
        makeTreeMesh(deadBranch2Geo, deadBranchMat),
      ],
    },
    bush: {
      crowns: [
        makeTreeMesh(bushCrown0Geo, bushCrown0Mat),
        makeTreeMesh(bushCrown1Geo, bushCrown1Mat),
      ],
    },
  };

  // Add all tree meshes to the group
  for (const speciesKey of Object.keys(treeSpecies)) {
    const species = treeSpecies[speciesKey];
    if (species.trunk) group.add(species.trunk);
    for (const crown of species.crowns) group.add(crown);
  }

  // --- Non-tree decor ---

  // Rock variants: boulders, flat slabs, round stones
  const rockVariantDefs = [
    { geo: new THREE.DodecahedronGeometry(2.4, 0), color: 0x889077, weight: 0.4 },
    { geo: new THREE.DodecahedronGeometry(1.8, 1), color: 0x7a8068, weight: 0.35 },
    { geo: new THREE.DodecahedronGeometry(1.2, 2), color: 0x6b7560, weight: 0.25 },
  ];
  const rockVariantMaterials = rockVariantDefs.map(
    (v) => new THREE.MeshStandardMaterial({ color: v.color, roughness: 1 }),
  );
  const rockVariants = rockVariantDefs.map((v, i) => {
    const mesh = new THREE.InstancedMesh(v.geo, rockVariantMaterials[i], maxCounts.rocks);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });

  // Ground scatter: small stones
  const smallStoneGeo = new THREE.DodecahedronGeometry(0.4, 0);
  const smallStoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.95 });
  const smallStones = new THREE.InstancedMesh(smallStoneGeo, smallStoneMat, maxCounts.smallStones);
  smallStones.castShadow = true;
  smallStones.receiveShadow = true;

  // Ground scatter: fallen logs
  const fallenLogGeo = new THREE.CylinderGeometry(0.2, 0.25, 3.5, 6);
  const fallenLogMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
  const fallenLogs = new THREE.InstancedMesh(fallenLogGeo, fallenLogMat, maxCounts.fallenLogs);
  fallenLogs.castShadow = true;
  fallenLogs.receiveShadow = true;

  const landmarkGeometry = new THREE.CylinderGeometry(0.9, 1.8, 14, 6);
  const cloudGeometry = new THREE.SphereGeometry(4.4, 10, 10);

  const landmarkMaterial = new THREE.MeshStandardMaterial({
    color: '#8c6e56',
    roughness: 0.88,
    metalness: 0.08,
  });
  const cloudBodyMaterial = new THREE.MeshStandardMaterial({
    color: '#f7fbff',
    transparent: true,
    opacity: 0.68,
    roughness: 0.96,
    metalness: 0.02,
    depthWrite: false,
  });
  const cloudWispMaterial = new THREE.MeshStandardMaterial({
    color: '#dce8f6',
    transparent: true,
    opacity: 0.2,
    roughness: 1,
    depthWrite: false,
  });

  const landmarks = new THREE.InstancedMesh(landmarkGeometry, landmarkMaterial, maxCounts.landmarks);
  const cloudsBody = new THREE.InstancedMesh(cloudGeometry, cloudBodyMaterial, maxCounts.cloudBody);
  const cloudsWisp = new THREE.InstancedMesh(cloudGeometry, cloudWispMaterial, maxCounts.cloudWisp);

  landmarks.castShadow = true;
  landmarks.receiveShadow = true;

  for (const rv of rockVariants) group.add(rv);
  group.add(smallStones, fallenLogs, landmarks, cloudsBody, cloudsWisp);

  // Collect all geometries and materials for disposal
  const allGeometries = [
    pineTrunkGeo, pineCrown0Geo, pineCrown1Geo, pineCrown2Geo,
    oakTrunkGeo, oakCrownGeo,
    birchTrunkGeo, birchCrown0Geo, birchCrown1Geo, birchCrown2Geo,
    deadTrunkGeo, deadBranch0Geo, deadBranch1Geo, deadBranch2Geo,
    bushCrown0Geo, bushCrown1Geo,
    ...rockVariantDefs.map((v) => v.geo),
    smallStoneGeo, fallenLogGeo,
    landmarkGeometry, cloudGeometry,
  ];
  const allMaterials = [
    pineTrunkMat, pineCrown0Mat, pineCrown1Mat, pineCrown2Mat,
    oakTrunkMat, oakCrownMat,
    birchTrunkMat, birchCrown0Mat, birchCrown1Mat, birchCrown2Mat,
    deadTrunkMat, deadBranchMat,
    bushCrown0Mat, bushCrown1Mat,
    ...rockVariantMaterials,
    smallStoneMat, fallenLogMat,
    landmarkMaterial, cloudBodyMaterial, cloudWispMaterial,
  ];

  return {
    treeSpecies,
    rockVariants,
    smallStones,
    fallenLogs,
    landmarks,
    cloudsBody,
    cloudsWisp,
    dispose() {
      for (const geo of allGeometries) geo.dispose();
      for (const mat of allMaterials) mat.dispose();
    },
  };
}

function buildCityDecorMeshes(group, maxCounts) {
  const towerCoreGeometry = new THREE.BoxGeometry(1, 1, 1);
  const towerWingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const towerCrownGeometry = new THREE.BoxGeometry(1, 1, 1);
  const windowBandGeometry = new THREE.BoxGeometry(1, 1, 1);
  const rooftopUnitGeometry = new THREE.BoxGeometry(1, 1, 1);
  const crowdGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
  const carBodyGeometry = new THREE.BoxGeometry(1.85, 0.55, 4.45);
  const carCabinGeometry = new THREE.BoxGeometry(1.48, 0.62, 2.18);
  const carGlassGeometry = new THREE.BoxGeometry(1.18, 0.38, 0.08);
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12);
  wheelGeometry.rotateZ(Math.PI * 0.5);
  const lightGeometry = new THREE.BoxGeometry(0.18, 0.12, 0.08);
  const helicopterBodyGeometry = new THREE.CapsuleGeometry(0.55, 2.8, 4, 8);
  helicopterBodyGeometry.rotateZ(Math.PI * 0.5);
  const helicopterCockpitGeometry = new THREE.SphereGeometry(0.72, 10, 10);
  const helicopterTailGeometry = new THREE.BoxGeometry(0.22, 0.22, 3.7);
  const helicopterFinGeometry = new THREE.BoxGeometry(0.18, 0.95, 0.68);
  const helicopterSkidGeometry = new THREE.BoxGeometry(0.08, 0.08, 2.7);
  const helicopterStrutGeometry = new THREE.BoxGeometry(0.06, 0.62, 0.06);
  const helicopterRotorGeometry = new THREE.BoxGeometry(0.2, 0.08, 7.4);
  const helicopterTailRotorGeometry = new THREE.BoxGeometry(0.8, 0.06, 0.16);

  const towerMaterial = new THREE.MeshStandardMaterial({
    color: '#848d9b',
    roughness: 0.58,
    metalness: 0.24,
    emissive: '#111826',
    emissiveIntensity: 0.18,
  });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: '#666f7b',
    roughness: 0.68,
    metalness: 0.18,
  });
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: '#b1b9c4',
    roughness: 0.36,
    metalness: 0.34,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: '#d7f0ff',
    emissive: '#b4e0ff',
    emissiveIntensity: 1.55,
    roughness: 0.08,
    metalness: 0.82,
  });
  const rooftopUnitMaterial = new THREE.MeshStandardMaterial({
    color: '#4a5058',
    roughness: 0.82,
    metalness: 0.12,
  });
  const crowdMaterial = new THREE.MeshStandardMaterial({
    color: '#c9cfca',
    roughness: 0.98,
  });
  const carBodyMaterial = new THREE.MeshStandardMaterial({
    color: '#f4f8ff',
    roughness: 0.34,
    metalness: 0.3,
  });
  const carCabinMaterial = new THREE.MeshStandardMaterial({
    color: '#d8dde5',
    roughness: 0.28,
    metalness: 0.26,
  });
  const carGlassMaterial = new THREE.MeshStandardMaterial({
    color: '#7fb3d0',
    roughness: 0.08,
    metalness: 0.82,
    transparent: true,
    opacity: 0.88,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: '#161a1f',
    roughness: 0.94,
    metalness: 0.04,
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: '#fff3c1',
    emissive: '#fff3c1',
    emissiveIntensity: 0.85,
  });
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: '#ff6b57',
    emissive: '#ff6b57',
    emissiveIntensity: 0.75,
  });
  const helicopterBodyMaterial = new THREE.MeshStandardMaterial({
    color: '#c5ced8',
    roughness: 0.34,
    metalness: 0.4,
  });
  const helicopterGlassMaterial = new THREE.MeshStandardMaterial({
    color: '#8ec1d8',
    roughness: 0.08,
    metalness: 0.86,
    transparent: true,
    opacity: 0.84,
  });
  const helicopterRotorMaterial = new THREE.MeshStandardMaterial({
    color: '#1b212c',
    roughness: 0.7,
    metalness: 0.12,
  });

  const towerCores = new THREE.InstancedMesh(towerCoreGeometry, towerMaterial, maxCounts.towers);
  const towerWings = new THREE.InstancedMesh(towerWingGeometry, wingMaterial, maxCounts.annexes);
  const towerCrowns = new THREE.InstancedMesh(towerCrownGeometry, crownMaterial, maxCounts.towers);
  const windowBandsNorthSouth = new THREE.InstancedMesh(windowBandGeometry, windowMaterial, maxCounts.windowBands);
  const windowBandsEastWest = new THREE.InstancedMesh(windowBandGeometry, windowMaterial, maxCounts.windowBands);
  const rooftopUnits = new THREE.InstancedMesh(rooftopUnitGeometry, rooftopUnitMaterial, maxCounts.rooftopUnits);
  const crowds = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, maxCounts.crowds);
  const carBodies = new THREE.InstancedMesh(carBodyGeometry, carBodyMaterial, maxCounts.cars);
  const carCabins = new THREE.InstancedMesh(carCabinGeometry, carCabinMaterial, maxCounts.cars);
  const carWindshields = new THREE.InstancedMesh(carGlassGeometry, carGlassMaterial, maxCounts.cars * 2);
  const carFrontLeftWheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, maxCounts.cars);
  const carFrontRightWheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, maxCounts.cars);
  const carRearLeftWheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, maxCounts.cars);
  const carRearRightWheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, maxCounts.cars);
  const carHeadlights = new THREE.InstancedMesh(lightGeometry, headlightMaterial, maxCounts.cars * 2);
  const carTaillights = new THREE.InstancedMesh(lightGeometry, taillightMaterial, maxCounts.cars * 2);
  const helicopterBodies = new THREE.InstancedMesh(
    helicopterBodyGeometry,
    helicopterBodyMaterial,
    maxCounts.helicopters,
  );
  const helicopterCockpits = new THREE.InstancedMesh(
    helicopterCockpitGeometry,
    helicopterGlassMaterial,
    maxCounts.helicopters,
  );
  const helicopterTails = new THREE.InstancedMesh(
    helicopterTailGeometry,
    helicopterBodyMaterial,
    maxCounts.helicopters,
  );
  const helicopterFins = new THREE.InstancedMesh(
    helicopterFinGeometry,
    helicopterBodyMaterial,
    maxCounts.helicopters,
  );
  const helicopterLeftSkids = new THREE.InstancedMesh(
    helicopterSkidGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );
  const helicopterRightSkids = new THREE.InstancedMesh(
    helicopterSkidGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );
  const helicopterLeftStruts = new THREE.InstancedMesh(
    helicopterStrutGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );
  const helicopterRightStruts = new THREE.InstancedMesh(
    helicopterStrutGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );
  const helicopterRotors = new THREE.InstancedMesh(
    helicopterRotorGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );
  const helicopterTailRotors = new THREE.InstancedMesh(
    helicopterTailRotorGeometry,
    helicopterRotorMaterial,
    maxCounts.helicopters,
  );

  towerCores.castShadow = true;
  towerCores.receiveShadow = true;
  towerWings.castShadow = true;
  towerWings.receiveShadow = true;
  towerCrowns.castShadow = true;
  towerCrowns.receiveShadow = true;
  windowBandsNorthSouth.castShadow = true;
  windowBandsNorthSouth.receiveShadow = true;
  windowBandsEastWest.castShadow = true;
  windowBandsEastWest.receiveShadow = true;
  rooftopUnits.castShadow = true;
  rooftopUnits.receiveShadow = true;
  crowds.castShadow = true;
  crowds.receiveShadow = true;
  carBodies.castShadow = true;
  carBodies.receiveShadow = true;
  carCabins.castShadow = true;
  carCabins.receiveShadow = true;
  carWindshields.castShadow = true;
  carWindshields.receiveShadow = true;
  carFrontLeftWheels.castShadow = true;
  carFrontLeftWheels.receiveShadow = true;
  carFrontRightWheels.castShadow = true;
  carFrontRightWheels.receiveShadow = true;
  carRearLeftWheels.castShadow = true;
  carRearLeftWheels.receiveShadow = true;
  carRearRightWheels.castShadow = true;
  carRearRightWheels.receiveShadow = true;
  carHeadlights.castShadow = true;
  carHeadlights.receiveShadow = true;
  carTaillights.castShadow = true;
  carTaillights.receiveShadow = true;
  helicopterBodies.castShadow = true;
  helicopterBodies.receiveShadow = true;
  helicopterCockpits.castShadow = true;
  helicopterCockpits.receiveShadow = true;
  helicopterTails.castShadow = true;
  helicopterTails.receiveShadow = true;
  helicopterFins.castShadow = true;
  helicopterFins.receiveShadow = true;
  helicopterLeftSkids.castShadow = true;
  helicopterLeftSkids.receiveShadow = true;
  helicopterRightSkids.castShadow = true;
  helicopterRightSkids.receiveShadow = true;
  helicopterLeftStruts.castShadow = true;
  helicopterLeftStruts.receiveShadow = true;
  helicopterRightStruts.castShadow = true;
  helicopterRightStruts.receiveShadow = true;
  helicopterRotors.castShadow = true;
  helicopterRotors.receiveShadow = true;
  helicopterTailRotors.castShadow = true;
  helicopterTailRotors.receiveShadow = true;

  carBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carCabins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carWindshields.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carFrontLeftWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carFrontRightWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carRearLeftWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carRearRightWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carHeadlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carTaillights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterCockpits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterTails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterFins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterLeftSkids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterRightSkids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterLeftStruts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterRightStruts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterRotors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helicopterTailRotors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  group.add(
    towerCores,
    towerWings,
    towerCrowns,
    windowBandsNorthSouth,
    windowBandsEastWest,
    rooftopUnits,
    crowds,
    carBodies,
    carCabins,
    carWindshields,
    carFrontLeftWheels,
    carFrontRightWheels,
    carRearLeftWheels,
    carRearRightWheels,
    carHeadlights,
    carTaillights,
    helicopterBodies,
    helicopterCockpits,
    helicopterTails,
    helicopterFins,
    helicopterLeftSkids,
    helicopterRightSkids,
    helicopterLeftStruts,
    helicopterRightStruts,
    helicopterRotors,
    helicopterTailRotors,
  );

  return {
    towerCores,
    towerWings,
    towerCrowns,
    windowBandsNorthSouth,
    windowBandsEastWest,
    rooftopUnits,
    crowds,
    carBodies,
    carCabins,
    carWindshields,
    carFrontLeftWheels,
    carFrontRightWheels,
    carRearLeftWheels,
    carRearRightWheels,
    carHeadlights,
    carTaillights,
    helicopterBodies,
    helicopterCockpits,
    helicopterTails,
    helicopterFins,
    helicopterLeftSkids,
    helicopterRightSkids,
    helicopterLeftStruts,
    helicopterRightStruts,
    helicopterRotors,
    helicopterTailRotors,
    animations: {
      cars: [],
      helicopters: [],
    },
    dispose() {
      towerCoreGeometry.dispose();
      towerWingGeometry.dispose();
      towerCrownGeometry.dispose();
      windowBandGeometry.dispose();
      rooftopUnitGeometry.dispose();
      crowdGeometry.dispose();
      carBodyGeometry.dispose();
      carCabinGeometry.dispose();
      carGlassGeometry.dispose();
      wheelGeometry.dispose();
      lightGeometry.dispose();
      helicopterBodyGeometry.dispose();
      helicopterCockpitGeometry.dispose();
      helicopterTailGeometry.dispose();
      helicopterFinGeometry.dispose();
      helicopterSkidGeometry.dispose();
      helicopterStrutGeometry.dispose();
      helicopterRotorGeometry.dispose();
      helicopterTailRotorGeometry.dispose();
      towerMaterial.dispose();
      wingMaterial.dispose();
      crownMaterial.dispose();
      windowMaterial.dispose();
      rooftopUnitMaterial.dispose();
      crowdMaterial.dispose();
      carBodyMaterial.dispose();
      carCabinMaterial.dispose();
      carGlassMaterial.dispose();
      wheelMaterial.dispose();
      headlightMaterial.dispose();
      taillightMaterial.dispose();
      helicopterBodyMaterial.dispose();
      helicopterGlassMaterial.dispose();
      helicopterRotorMaterial.dispose();
    },
  };
}

function worldToLocal(worldX, worldY, worldZ, anchorX, anchorZ, target) {
  target.set(worldX - anchorX, worldY, worldZ - anchorZ);
  return target;
}

export function createTerrain(scene, rng, { mapTheme } = {}) {
  const theme = sanitizeMapTheme(mapTheme);
  const group = new THREE.Group();
  const chunkSize = CONFIG.world.chunkSize;
  const radius = CONFIG.world.activeChunkRadius;
  const renderExtent = chunkSize * (radius * 2 + 1);
  const maxChunkCount = (radius * 2 + 1) ** 2;
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const tempColor = new THREE.Color();
  const chunkAnchor = { x: Number.NaN, z: Number.NaN };
  const cityObstacles = [];

  const groundGeometry = new THREE.PlaneGeometry(renderExtent, renderExtent, 120, 120);
  groundGeometry.rotateX(-Math.PI / 2);
  const basePositions = [];
  const positions = groundGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    basePositions.push({
      x: positions.getX(i),
      z: positions.getZ(i),
    });
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: theme === MAP_THEMES.CITY ? 0.9 : 0.96,
    metalness: theme === MAP_THEMES.CITY ? 0.06 : 0.04,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  group.add(ground);

  const seaSubdivisions = 80;
  const seaGeometry = new THREE.PlaneGeometry(
    renderExtent * 1.2, renderExtent * 1.2,
    seaSubdivisions, seaSubdivisions,
  );
  // GPU wave displacement via TSL positionNode
  // Sea plane is rotated -PI/2 around X: local Z maps to world Y
  // Compute waves from world X/Z, displace in local Z
  const seaWavePosition = Fn(() => {
    const wx = positionWorld.x;
    const wz = positionWorld.z;

    const wave1 = sin(wx.mul(0.08).add(tslTime.mul(1.2))).mul(0.3);
    const wave2 = cos(wz.mul(0.06).add(tslTime.mul(0.8))).mul(0.25);
    const wave3 = sin(wx.add(wz).mul(0.12).add(tslTime.mul(1.6))).mul(0.15);

    const totalWave = wave1.add(wave2).add(wave3);
    return positionLocal.add(vec3(0, 0, totalWave));
  });

  const seaMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: theme === MAP_THEMES.CITY ? '#214f78' : '#195f93',
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.85,
    clearcoat: 0.9,
    clearcoatRoughness: 0.25,
  });
  seaMaterial.positionNode = seaWavePosition();

  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = CONFIG.world.seaLevel + 0.1;
  group.add(sea);

  // Track which ground vertices are sea-biome for wave displacement
  const groundSeaFlags = new Uint8Array(positions.count);

  const decor = theme === MAP_THEMES.CITY
    ? buildCityDecorMeshes(group, {
      towers: maxChunkCount * 10,
      annexes: maxChunkCount * 10,
      windowBands: maxChunkCount * 120,
      rooftopUnits: maxChunkCount * 36,
      crowds: maxChunkCount * 10,
      cars: maxChunkCount * 8,
      helicopters: maxChunkCount * 2,
    })
    : buildFrontierDecorMeshes(group, {
      trees: maxChunkCount * 12,
      rocks: maxChunkCount * 8,
      smallStones: maxChunkCount * 8 * 5,
      fallenLogs: maxChunkCount * 12,
      landmarks: maxChunkCount * 2,
      cloudBody: maxChunkCount * CLOUD_BODY_LOBES.length * 2,
      cloudWisp: maxChunkCount * CLOUD_WISP_LOBES.length * 2,
    });

  scene.add(group);

  const getSegmentObstacleHit = (start, end, radiusPadding = 0) => {
    if (theme !== MAP_THEMES.CITY) {
      return null;
    }

    let nearest = null;
    for (const obstacle of cityObstacles) {
      const hitT = segmentIntersectsCylinderAt(
        start,
        end,
        obstacle.center,
        obstacle.radius + radiusPadding,
        obstacle.halfHeight,
      );
      if (hitT === null) {
        continue;
      }
      if (!nearest || hitT < nearest.t) {
        nearest = { ...obstacle, t: hitT };
      }
    }
    return nearest;
  };

  const rebuildFrontierDecor = (anchorX, anchorZ) => {
    const speciesCounters = { pine: 0, oak: 0, birch: 0, deadTree: 0, bush: 0 };
    const rockVariantCounters = [0, 0, 0];
    let smallStoneIndex = 0;
    let fallenLogIndex = 0;
    let landmarkIndex = 0;
    let cloudBodyIndex = 0;
    let cloudWispIndex = 0;

    const sp = decor.treeSpecies;

    for (let chunkZ = -radius; chunkZ <= radius; chunkZ += 1) {
      for (let chunkX = -radius; chunkX <= radius; chunkX += 1) {
        const worldChunkX = anchorX + chunkX * chunkSize;
        const worldChunkZ = anchorZ + chunkZ * chunkSize;

        for (let i = 0; i < 12; i += 1) {
          const worldX = worldChunkX + hash2(worldChunkX + i * 17, worldChunkZ + i * 31) * chunkSize;
          const worldZ = worldChunkZ + hash2(worldChunkX - i * 13, worldChunkZ + i * 19) * chunkSize;
          const biome = getBiomeAt(worldX, worldZ, theme);
          if (biome === 'sea') {
            continue;
          }

          const height = getGroundHeightAt(worldX, worldZ, theme);
          const rotY = hash2(worldX + 7, worldZ - 5) * Math.PI * 2;

          // Select species based on cumulative weights
          const speciesRoll = hash2(worldX * 0.73, worldZ * 0.91);
          let speciesKey;
          if (speciesRoll < 0.35) speciesKey = 'pine';
          else if (speciesRoll < 0.60) speciesKey = 'oak';
          else if (speciesRoll < 0.80) speciesKey = 'birch';
          else if (speciesRoll < 0.90) speciesKey = 'deadTree';
          else speciesKey = 'bush';

          const idx = speciesCounters[speciesKey];

          // Per-instance variation
          const leanAngle = (hash2(worldX + 23, worldZ - 17) - 0.5) * 0.174; // +-5 degrees
          const leanDir = hash2(worldX - 31, worldZ + 41) * Math.PI * 2;
          const leanX = Math.sin(leanDir) * leanAngle;
          const leanZ = Math.cos(leanDir) * leanAngle;

          if (speciesKey === 'pine') {
            const s = 0.7 + hash2(worldX, worldZ) * 0.8; // 0.7-1.5
            setInstanceTransformWithLean(
              sp.pine.trunk, idx,
              worldToLocal(worldX, height + 3.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.pine.crowns[0], idx,
              worldToLocal(worldX, height + 3.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.pine.crowns[1], idx,
              worldToLocal(worldX, height + 6.0 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.pine.crowns[2], idx,
              worldToLocal(worldX, height + 8.0 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
          } else if (speciesKey === 'oak') {
            const s = 0.8 + hash2(worldX, worldZ) * 0.5; // 0.8-1.3
            setInstanceTransformWithLean(
              sp.oak.trunk, idx,
              worldToLocal(worldX, height + 2.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.oak.crowns[0], idx,
              worldToLocal(worldX, height + 5.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, 0.65 * s, s),
            );
          } else if (speciesKey === 'birch') {
            const s = 0.75 + hash2(worldX, worldZ) * 0.55; // 0.75-1.3
            setInstanceTransformWithLean(
              sp.birch.trunk, idx,
              worldToLocal(worldX, height + 4.0 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            // Spread crowns horizontally
            const spreadX = Math.cos(rotY) * 0.8 * s;
            const spreadZ = Math.sin(rotY) * 0.8 * s;
            setInstanceTransformWithLean(
              sp.birch.crowns[0], idx,
              worldToLocal(worldX - spreadX, height + 5.0 * s, worldZ - spreadZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.birch.crowns[1], idx,
              worldToLocal(worldX + spreadX * 0.5, height + 6.8 * s, worldZ + spreadZ * 0.5, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.birch.crowns[2], idx,
              worldToLocal(worldX + spreadX, height + 8.2 * s, worldZ + spreadZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s * 0.9, s * 0.9, s * 0.9),
            );
          } else if (speciesKey === 'deadTree') {
            const s = 0.7 + hash2(worldX, worldZ) * 0.6; // 0.7-1.3
            setInstanceTransformWithLean(
              sp.deadTree.trunk, idx,
              worldToLocal(worldX, height + 3.0 * s, worldZ, anchorX, anchorZ, scratchPosition),
              rotY, leanX, leanZ, scratchScale.set(s, s, s),
            );
            // Branches at different angles
            const branchAngle0 = rotY + 0.6;
            const branchAngle1 = rotY + 2.4;
            const branchAngle2 = rotY + 4.2;
            setInstanceTransformWithLean(
              sp.deadTree.crowns[0], idx,
              worldToLocal(worldX, height + 3.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              branchAngle0, 0.5, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.deadTree.crowns[1], idx,
              worldToLocal(worldX, height + 4.5 * s, worldZ, anchorX, anchorZ, scratchPosition),
              branchAngle1, -0.4, leanZ, scratchScale.set(s, s, s),
            );
            setInstanceTransformWithLean(
              sp.deadTree.crowns[2], idx,
              worldToLocal(worldX, height + 5.0 * s, worldZ, anchorX, anchorZ, scratchPosition),
              branchAngle2, 0.3, leanZ, scratchScale.set(s, s, s),
            );
          } else {
            // bush
            const s = 0.7 + hash2(worldX, worldZ) * 0.6; // 0.7-1.3
            const bSpreadX = Math.cos(rotY) * 1.2 * s;
            const bSpreadZ = Math.sin(rotY) * 1.2 * s;
            setInstanceTransform(
              sp.bush.crowns[0], idx,
              worldToLocal(worldX - bSpreadX * 0.5, height + 0.8 * s, worldZ - bSpreadZ * 0.5, anchorX, anchorZ, scratchPosition),
              rotY, scratchScale.set(s, s * 0.8, s),
            );
            setInstanceTransform(
              sp.bush.crowns[1], idx,
              worldToLocal(worldX + bSpreadX * 0.5, height + 0.6 * s, worldZ + bSpreadZ * 0.5, anchorX, anchorZ, scratchPosition),
              rotY, scratchScale.set(s * 0.9, s * 0.7, s * 0.9),
            );
          }

          speciesCounters[speciesKey] += 1;
        }

        for (let i = 0; i < 8; i += 1) {
          const worldX = worldChunkX + hash2(worldChunkX + i * 41, worldChunkZ + i * 7) * chunkSize;
          const worldZ = worldChunkZ + hash2(worldChunkX - i * 29, worldChunkZ + i * 23) * chunkSize;
          const biome = getBiomeAt(worldX, worldZ, theme);
          if (biome === 'sea') {
            continue;
          }

          const height = getGroundHeightAt(worldX, worldZ, theme);
          const rotY = hash2(worldX + 13, worldZ + 5) * Math.PI * 2;

          // Select rock variant using hash-based cumulative weight
          const variantRoll = hash2(worldX * 0.61, worldZ * 0.79);
          let variantIdx;
          if (variantRoll < 0.4) variantIdx = 0;        // boulders
          else if (variantRoll < 0.75) variantIdx = 1;   // flat slabs
          else variantIdx = 2;                            // round stones

          const baseScale = 0.7 + hash2(worldX + 9, worldZ + 11) * 1.7;
          let sx, sy, sz;
          if (variantIdx === 0) {
            // Boulders: non-uniform, tall-ish
            sx = baseScale * (0.8 + hash2(worldX + 21, worldZ + 33) * 0.4);
            sy = baseScale * (0.5 + hash2(worldX + 37, worldZ + 19) * 0.5);
            sz = baseScale * (0.8 + hash2(worldX + 43, worldZ + 27) * 0.4);
          } else if (variantIdx === 1) {
            // Flat slabs: wide and flat
            sx = baseScale * (1.0 + hash2(worldX + 21, worldZ + 33) * 0.8);
            sy = baseScale * (0.3 + hash2(worldX + 37, worldZ + 19) * 0.3);
            sz = baseScale * (1.0 + hash2(worldX + 43, worldZ + 27) * 0.5);
          } else {
            // Round stones: nearly uniform
            sx = baseScale * (0.9 + hash2(worldX + 21, worldZ + 33) * 0.2);
            sy = baseScale * (0.8 + hash2(worldX + 37, worldZ + 19) * 0.3);
            sz = baseScale * (0.9 + hash2(worldX + 43, worldZ + 27) * 0.2);
          }

          const vidx = rockVariantCounters[variantIdx];
          setInstanceTransform(
            decor.rockVariants[variantIdx],
            vidx,
            worldToLocal(worldX, height + 1.1 * sy, worldZ, anchorX, anchorZ, scratchPosition),
            rotY,
            scratchScale.set(sx, sy, sz),
          );
          rockVariantCounters[variantIdx] += 1;

          // Ground scatter: 3-5 small stones near each rock
          const stoneCount = 3 + Math.floor(hash2(worldX + 51, worldZ + 59) * 3);
          for (let s = 0; s < stoneCount; s += 1) {
            const stoneOffX = (hash2(worldX + s * 7 + 61, worldZ + s * 11 + 67) - 0.5) * 6;
            const stoneOffZ = (hash2(worldX + s * 13 + 71, worldZ + s * 17 + 73) - 0.5) * 6;
            const stoneX = worldX + stoneOffX;
            const stoneZ = worldZ + stoneOffZ;
            const stoneHeight = getGroundHeightAt(stoneX, stoneZ, theme);
            const stoneScale = 0.5 + hash2(stoneX + 3, stoneZ + 7) * 1.0;
            const stoneRotY = hash2(stoneX + 19, stoneZ + 23) * Math.PI * 2;
            setInstanceTransform(
              decor.smallStones,
              smallStoneIndex,
              worldToLocal(stoneX, stoneHeight + 0.15 * stoneScale, stoneZ, anchorX, anchorZ, scratchPosition),
              stoneRotY,
              scratchScale.set(stoneScale, stoneScale * 0.7, stoneScale),
            );
            smallStoneIndex += 1;
          }
        }

        // Fallen logs near tree positions (~15% chance per tree)
        for (let i = 0; i < 12; i += 1) {
          const treeWorldX = worldChunkX + hash2(worldChunkX + i * 17, worldChunkZ + i * 31) * chunkSize;
          const treeWorldZ = worldChunkZ + hash2(worldChunkX - i * 13, worldChunkZ + i * 19) * chunkSize;
          const logChance = hash2(treeWorldX * 0.53, treeWorldZ * 0.47);
          if (logChance > 0.15) {
            continue;
          }
          const logBiome = getBiomeAt(treeWorldX, treeWorldZ, theme);
          if (logBiome === 'sea') {
            continue;
          }
          const logOffX = (hash2(treeWorldX + 81, treeWorldZ + 83) - 0.5) * 4;
          const logOffZ = (hash2(treeWorldX + 87, treeWorldZ + 89) - 0.5) * 4;
          const logX = treeWorldX + logOffX;
          const logZ = treeWorldZ + logOffZ;
          const logHeight = getGroundHeightAt(logX, logZ, theme);
          const logRotY = hash2(logX + 91, logZ + 97) * Math.PI * 2;
          const logScale = 0.8 + hash2(logX + 101, logZ + 103) * 0.5;
          setInstanceTransformEuler(
            decor.fallenLogs,
            fallenLogIndex,
            worldToLocal(logX, logHeight + 0.2, logZ, anchorX, anchorZ, scratchPosition),
            0, logRotY, Math.PI / 2,
            scratchScale.set(logScale, logScale, logScale),
          );
          fallenLogIndex += 1;
        }

        const landmarkChance = hash2(worldChunkX * 0.25, worldChunkZ * 0.25);
        if (landmarkChance > 0.62) {
          const worldX = worldChunkX + chunkSize * 0.5;
          const worldZ = worldChunkZ + chunkSize * 0.5;
          if (getBiomeAt(worldX, worldZ, theme) !== 'sea') {
            const height = getGroundHeightAt(worldX, worldZ, theme);
            const scaleValue = 1.2 + landmarkChance * 1.8;
            setInstanceTransform(
              decor.landmarks,
              landmarkIndex,
              worldToLocal(worldX, height + 7 * scaleValue, worldZ, anchorX, anchorZ, scratchPosition),
              landmarkChance * Math.PI * 2,
              scratchScale.set(scaleValue, scaleValue, scaleValue),
            );
            landmarkIndex += 1;
          }
        }

        const cloudChance = hash2(worldChunkX * 0.17, worldChunkZ * 0.17);
        if (cloudChance > 0.18) {
          const worldX = worldChunkX + chunkSize * (0.12 + hash2(worldChunkX + 18, worldChunkZ - 7) * 0.76);
          const worldZ = worldChunkZ + chunkSize * (0.12 + hash2(worldChunkX - 11, worldChunkZ + 13) * 0.76);

          // Select cloud type using hash against cumulative weights
          const typeHash = hash2(worldChunkX * 0.53, worldChunkZ * 0.47);
          let cloudType = CLOUD_TYPES[0];
          if (typeHash > 0.4 && typeHash <= 0.7) cloudType = CLOUD_TYPES[1];
          else if (typeHash > 0.7 && typeHash <= 0.9) cloudType = CLOUD_TYPES[2];
          else if (typeHash > 0.9) cloudType = CLOUD_TYPES[3];

          // Altitude from the type's range
          const altHash = hash2(worldChunkX * 0.21, worldChunkZ * 0.19);
          const y = cloudType.altitudeRange[0] + altHash * (cloudType.altitudeRange[1] - cloudType.altitudeRange[0]);

          // Scale from the type's scaleRange
          const scaleHash = hash2(worldChunkX * 0.33, worldChunkZ * 0.29);
          const typeScale = cloudType.baseScale * (cloudType.scaleRange[0] + scaleHash * (cloudType.scaleRange[1] - cloudType.scaleRange[0]));

          const bankWidth = (1.5 + cloudChance * 2.1) * typeScale;
          const bankHeight = (1.1 + cloudChance * 0.85) * typeScale;
          const bankDepth = (1.2 + hash2(worldChunkX * 0.09, worldChunkZ * 0.09) * 0.85) * typeScale;
          const bankRotation = (hash2(worldChunkX + 91, worldChunkZ - 37) - 0.5) * 0.42;

          // Grey tint variation via slight scale jitter per cloud instance
          const tintJitter = 0.92 + hash2(worldChunkX * 0.61, worldChunkZ * 0.59) * 0.16;

          for (let i = 0; i < cloudType.lobes.length; i += 1) {
            const lobe = cloudType.lobes[i];
            const jitter = hash2(worldChunkX * (0.37 + i * 0.11), worldChunkZ * (0.31 + i * 0.07));
            const puffScale = (0.86 + jitter * 0.42) * tintJitter;
            setInstanceTransform(
              decor.cloudsBody,
              cloudBodyIndex,
              worldToLocal(
                worldX + lobe.x * bankWidth + (jitter - 0.5) * 4,
                y + lobe.y * bankHeight + (jitter - 0.5) * 1.8,
                worldZ + lobe.z * bankDepth + (0.5 - jitter) * 3,
                anchorX,
                anchorZ,
                scratchPosition,
              ),
              bankRotation,
              scratchScale.set(
                bankWidth * lobe.sx * puffScale,
                bankHeight * lobe.sy * puffScale,
                bankDepth * lobe.sz * puffScale,
              ),
            );
            cloudBodyIndex += 1;
          }

          for (let i = 0; i < cloudType.wisps.length; i += 1) {
            const lobe = cloudType.wisps[i];
            const jitter = hash2(worldChunkX * (0.43 + i * 0.09), worldChunkZ * (0.29 + i * 0.12));
            const puffScale = (0.92 + jitter * 0.34) * tintJitter;
            setInstanceTransform(
              decor.cloudsWisp,
              cloudWispIndex,
              worldToLocal(
                worldX + lobe.x * bankWidth + (jitter - 0.5) * 6,
                y + lobe.y * bankHeight + (jitter - 0.5) * 1.4,
                worldZ + lobe.z * bankDepth + (0.5 - jitter) * 4,
                anchorX,
                anchorZ,
                scratchPosition,
              ),
              bankRotation * 0.6,
              scratchScale.set(
                bankWidth * lobe.sx * puffScale,
                bankHeight * lobe.sy * puffScale,
                bankDepth * lobe.sz * puffScale,
              ),
            );
            cloudWispIndex += 1;
          }
        }
      }
    }

    // Hide remaining instances for all tree species
    const sp2 = decor.treeSpecies;
    hideRemainingInstances(sp2.pine.trunk, speciesCounters.pine, scratchPosition);
    for (const c of sp2.pine.crowns) hideRemainingInstances(c, speciesCounters.pine, scratchPosition);
    hideRemainingInstances(sp2.oak.trunk, speciesCounters.oak, scratchPosition);
    for (const c of sp2.oak.crowns) hideRemainingInstances(c, speciesCounters.oak, scratchPosition);
    hideRemainingInstances(sp2.birch.trunk, speciesCounters.birch, scratchPosition);
    for (const c of sp2.birch.crowns) hideRemainingInstances(c, speciesCounters.birch, scratchPosition);
    hideRemainingInstances(sp2.deadTree.trunk, speciesCounters.deadTree, scratchPosition);
    for (const c of sp2.deadTree.crowns) hideRemainingInstances(c, speciesCounters.deadTree, scratchPosition);
    for (const c of sp2.bush.crowns) hideRemainingInstances(c, speciesCounters.bush, scratchPosition);
    for (let v = 0; v < decor.rockVariants.length; v += 1) {
      hideRemainingInstances(decor.rockVariants[v], rockVariantCounters[v], scratchPosition);
    }
    hideRemainingInstances(decor.smallStones, smallStoneIndex, scratchPosition);
    hideRemainingInstances(decor.fallenLogs, fallenLogIndex, scratchPosition);
    hideRemainingInstances(decor.landmarks, landmarkIndex, scratchPosition);
    hideRemainingInstances(decor.cloudsBody, cloudBodyIndex, scratchPosition);
    hideRemainingInstances(decor.cloudsWisp, cloudWispIndex, scratchPosition);
  };

  const rebuildCityDecor = (anchorX, anchorZ) => {
    cityObstacles.length = 0;
    let towerIndex = 0;
    let wingIndex = 0;
    let crownIndex = 0;
    let windowNsIndex = 0;
    let windowEwIndex = 0;
    let rooftopIndex = 0;
    let crowdIndex = 0;
    decor.animations.cars.length = 0;
    decor.animations.helicopters.length = 0;

    for (let chunkZ = -radius; chunkZ <= radius; chunkZ += 1) {
      for (let chunkX = -radius; chunkX <= radius; chunkX += 1) {
        const worldChunkX = anchorX + chunkX * chunkSize;
        const worldChunkZ = anchorZ + chunkZ * chunkSize;

        for (let blockZ = 0; blockZ < 3; blockZ += 1) {
          for (let blockX = 0; blockX < 3; blockX += 1) {
            const baseX = worldChunkX + CITY_BLOCK_SIZE * 0.5 + blockX * CITY_BLOCK_SIZE;
            const baseZ = worldChunkZ + CITY_BLOCK_SIZE * 0.5 + blockZ * CITY_BLOCK_SIZE;
            const worldX = baseX + (hash2(baseX * 1.7, baseZ * 2.1) - 0.5) * 5.2;
            const worldZ = baseZ + (hash2(baseX * 2.3, baseZ * 1.3) - 0.5) * 5.2;
            if (getBiomeAt(worldX, worldZ, theme) !== 'land') {
              continue;
            }

            const height = getGroundHeightAt(worldX, worldZ, theme);
            const parkValue = sampleCityParkField(worldX * 0.95, worldZ * 0.95);
            const avenueBias = Math.min(
              distanceToGridLine(worldX, CITY_BLOCK_SIZE * 3),
              distanceToGridLine(worldZ, CITY_BLOCK_SIZE * 3),
            );
            const lotChance = hash2(worldX * 0.77, worldZ * 0.59);
            const districtDensity = THREE.MathUtils.clamp(
              0.32
                + (1 - Math.min(1, Math.abs(worldZ - getCityRiverOffset(worldX)) / 160)) * 0.32
                + parkValue * 0.12
                + hash2(worldX - 15, worldZ + 9) * 0.2,
              0.1,
              1,
            );
            const isParkLot = parkValue > 0.72 || (parkValue > 0.48 && lotChance > 0.58);
            const isPlazaLot = avenueBias < 3.2 || lotChance > 0.9;

            if (isParkLot || isPlazaLot) {
              if (hash2(worldX - 4, worldZ + 13) > 0.22) {
                const crowdHeight = 1.2 + hash2(worldX - 7, worldZ + 15) * 0.55;
                const crowdX = worldX + (hash2(worldX + 2, worldZ + 2) - 0.5) * 7;
                const crowdZ = worldZ + (hash2(worldX + 12, worldZ - 8) - 0.5) * 7;
                setInstanceTransform(
                  decor.crowds,
                  crowdIndex,
                  worldToLocal(crowdX, height + crowdHeight * 0.5, crowdZ, anchorX, anchorZ, scratchPosition),
                  hash2(worldX + 6, worldZ + 4) * Math.PI * 2,
                  scratchScale.set(0.95, crowdHeight, 0.95),
                );
                tempColor.setStyle(isParkLot ? '#d8e2d1' : '#cfc7bf');
                decor.crowds.setColorAt(crowdIndex, tempColor);
                crowdIndex += 1;
              }

              if (isPlazaLot && hash2(worldX + 5, worldZ + 8) > 0.45) {
                const kioskHeight = 1.6 + hash2(worldX + 2, worldZ - 5) * 2.4;
                setInstanceTransform(
                  decor.rooftopUnits,
                  rooftopIndex,
                  worldToLocal(worldX, height + kioskHeight * 0.5, worldZ, anchorX, anchorZ, scratchPosition),
                  hash2(worldX + 3, worldZ - 7) * 0.4 - 0.2,
                  scratchScale.set(2.2 + hash2(worldX, worldZ) * 1.2, kioskHeight, 1.8 + hash2(worldX + 11, worldZ + 13)),
                );
                tempColor.setStyle(isParkLot ? '#5c7552' : '#737780');
                decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
                rooftopIndex += 1;
              }

              continue;
            }

            const archetypeRoll = hash2(worldX - 21, worldZ + 33);
            let towerWidth;
            let towerDepth;
            let towerHeight;
            let wingMode = 'single';
            let crownScale = 0.72;
            let materialColor = '#7d8795';
            let sideWindowColor = '#98bed5';
            let frontWindowColor = '#c8ebff';
            if (archetypeRoll > 0.74) {
              towerWidth = 6 + hash2(worldX + 8, worldZ + 12) * 2.8;
              towerDepth = 6 + hash2(worldX - 9, worldZ + 4) * 2.8;
              towerHeight = 56 + hash2(worldX - 11, worldZ + 5) * 62;
              wingMode = 'setback';
              crownScale = 0.6;
              materialColor = '#aab2bc';
              frontWindowColor = '#d3efff';
              sideWindowColor = '#a9d4ef';
            } else if (archetypeRoll > 0.46) {
              towerWidth = 9 + hash2(worldX + 8, worldZ + 12) * 4.8;
              towerDepth = 7 + hash2(worldX - 9, worldZ + 4) * 3.6;
              towerHeight = 22 + hash2(worldX - 11, worldZ + 5) * 30;
              wingMode = 'broad';
              crownScale = 0.82;
              materialColor = '#8e857c';
              frontWindowColor = '#ffd9ae';
              sideWindowColor = '#d4b792';
            } else {
              towerWidth = 8 + hash2(worldX + 8, worldZ + 12) * 5.5;
              towerDepth = 8 + hash2(worldX - 9, worldZ + 4) * 5.2;
              towerHeight = 12 + hash2(worldX - 11, worldZ + 5) * 18;
              wingMode = 'lowrise';
              crownScale = 0.9;
              materialColor = '#6c7481';
              frontWindowColor = '#c1dfff';
              sideWindowColor = '#8db2c8';
            }
            if (districtDensity < 0.42) {
              towerHeight *= 0.82;
            }
            const towerRotation = hash2(worldX + 3, worldZ - 7) * 0.26 - 0.13;
            const base = { x: worldX, y: height + towerHeight * 0.5, z: worldZ };
            setInstanceTransform(
              decor.towerCores,
              towerIndex,
              worldToLocal(base.x, base.y, base.z, anchorX, anchorZ, scratchPosition),
              towerRotation,
              scratchScale.set(towerWidth, towerHeight, towerDepth),
            );
            tempColor.setStyle(materialColor);
            // Per-building facade tint variation
            const tintR = 1.0 + (hash2(worldX + 44.4, worldZ + 55.5) - 0.5) * 0.08;
            const tintG = 1.0 + (hash2(worldX + 66.6, worldZ + 77.7) - 0.5) * 0.08;
            const tintB = 1.0 + (hash2(worldX + 88.8, worldZ + 99.9) - 0.5) * 0.08;
            tempColor.r *= tintR;
            tempColor.g *= tintG;
            tempColor.b *= tintB;
            decor.towerCores.setColorAt(towerIndex, tempColor);
            cityObstacles.push({
              center: new THREE.Vector3(worldX, height + towerHeight * 0.5, worldZ),
              radius: Math.max(towerWidth, towerDepth) * 0.66,
              halfHeight: towerHeight * 0.5,
            });
            towerIndex += 1;

            const wingChance = hash2(worldX + 17, worldZ - 19);
            if (wingChance > 0.2 && wingMode !== 'lowrise') {
              const wingHeight = wingMode === 'setback'
                ? towerHeight * (0.42 + wingChance * 0.16)
                : towerHeight * (0.28 + wingChance * 0.18);
              const wingWidth = wingMode === 'broad'
                ? towerWidth * (0.52 + wingChance * 0.12)
                : towerWidth * (0.26 + wingChance * 0.16);
              const wingDepth = wingMode === 'broad'
                ? towerDepth * (0.36 + hash2(worldX + 21, worldZ + 9) * 0.18)
                : towerDepth * (0.78 + hash2(worldX + 21, worldZ + 9) * 0.22);
              const wingOffset = wingMode === 'broad'
                ? 0
                : towerWidth * 0.36;
              setLocalInstanceTransform(
                decor.towerWings,
                wingIndex,
                anchorX,
                anchorZ,
                base,
                towerRotation,
                {
                  x: wingOffset,
                  y: wingMode === 'setback' ? towerHeight * 0.12 : -(towerHeight - wingHeight) * 0.5,
                  z: 0,
                },
                scratchScale.set(wingWidth, wingHeight, wingDepth),
                scratchPosition,
              );
              tempColor.setStyle(wingMode === 'broad' ? '#7a7168' : wingChance > 0.62 ? '#5d6571' : '#6f7884');
              decor.towerWings.setColorAt(wingIndex, tempColor);
              cityObstacles.push({
                center: worldOffset(
                  base.x,
                  base.y,
                  base.z,
                  towerRotation,
                  wingOffset,
                  wingMode === 'setback' ? towerHeight * 0.12 : -(towerHeight - wingHeight) * 0.5,
                  0,
                  new THREE.Vector3(),
                ),
                radius: Math.max(wingWidth, wingDepth) * 0.62,
                halfHeight: wingHeight * 0.5,
              });
              wingIndex += 1;
            }

            if (towerHeight > 22) {
              const crownHeight = THREE.MathUtils.clamp(towerHeight * 0.12, 2.2, 8.5);
              setInstanceTransform(
                decor.towerCrowns,
                crownIndex,
                worldToLocal(worldX, height + towerHeight + crownHeight * 0.5, worldZ, anchorX, anchorZ, scratchPosition),
                towerRotation,
                scratchScale.set(towerWidth * crownScale, crownHeight, towerDepth * crownScale),
              );
              tempColor.setStyle(archetypeRoll > 0.46 && archetypeRoll <= 0.74 ? '#d7c6b7' : '#cad2db');
              decor.towerCrowns.setColorAt(crownIndex, tempColor);
              crownIndex += 1;
            }

            const windowRows = towerHeight > 70
              ? 5
              : towerHeight > 42
                ? 4
                : towerHeight > 24
                  ? 3
                  : 2;
            const rowGap = towerHeight / (windowRows + 2);
            const rowHeight = Math.max(1.2, Math.min(3.4, rowGap * 0.34));
            // Per-building window lit fraction — varies how many rows are illuminated
            const litFraction = 0.3 + hash2(worldX + 99.9, worldZ + 111.1) * 0.4;
            for (let row = 0; row < windowRows; row += 1) {
              const rowOffset = -towerHeight * 0.34 + rowGap * (row + 1);

              // Per-row window warmth variation
              const windowHash = hash2(worldX + row * 7.1, worldZ + row * 11.3);
              const isLit = windowHash < litFraction;
              let nsWindowColor;
              let ewWindowColor;
              if (isLit) {
                const warmth = 0.8 + hash2(worldX + row * 3.3, worldZ + row * 5.5) * 0.4;
                nsWindowColor = { r: warmth, g: warmth * 0.85, b: warmth * 0.65 };
                ewWindowColor = { r: warmth * 0.9, g: warmth * 0.78, b: warmth * 0.58 };
              } else {
                nsWindowColor = null; // use dark unlit
                ewWindowColor = null;
              }

              setLocalInstanceTransform(
                decor.windowBandsNorthSouth,
                windowNsIndex,
                anchorX,
                anchorZ,
                base,
                towerRotation,
                { x: 0, y: rowOffset, z: towerDepth * 0.5 + 0.16 },
                scratchScale.set(towerWidth * 0.82, rowHeight, 0.34),
                scratchPosition,
              );
              if (nsWindowColor) {
                tempColor.setRGB(nsWindowColor.r, nsWindowColor.g, nsWindowColor.b);
              } else {
                tempColor.set(0x112233);
              }
              decor.windowBandsNorthSouth.setColorAt(windowNsIndex, tempColor);
              windowNsIndex += 1;
              setLocalInstanceTransform(
                decor.windowBandsNorthSouth,
                windowNsIndex,
                anchorX,
                anchorZ,
                base,
                towerRotation,
                { x: 0, y: rowOffset, z: -(towerDepth * 0.5 + 0.16) },
                scratchScale.set(towerWidth * 0.82, rowHeight, 0.34),
                scratchPosition,
              );
              if (nsWindowColor) {
                const backWarmth = 0.8 + hash2(worldX + row * 4.7, worldZ + row * 9.1) * 0.4;
                const backLit = hash2(worldX + row * 13.1, worldZ + row * 17.3) < litFraction;
                if (backLit) {
                  tempColor.setRGB(backWarmth, backWarmth * 0.85, backWarmth * 0.65);
                } else {
                  tempColor.set(0x112233);
                }
              } else {
                tempColor.set(0x112233);
              }
              decor.windowBandsNorthSouth.setColorAt(windowNsIndex, tempColor);
              windowNsIndex += 1;
              setLocalInstanceTransform(
                decor.windowBandsEastWest,
                windowEwIndex,
                anchorX,
                anchorZ,
                base,
                towerRotation,
                { x: towerWidth * 0.5 + 0.16, y: rowOffset, z: 0 },
                scratchScale.set(0.34, rowHeight, towerDepth * 0.8),
                scratchPosition,
              );
              if (ewWindowColor) {
                tempColor.setRGB(ewWindowColor.r, ewWindowColor.g, ewWindowColor.b);
              } else {
                tempColor.set(0x112233);
              }
              decor.windowBandsEastWest.setColorAt(windowEwIndex, tempColor);
              windowEwIndex += 1;
              setLocalInstanceTransform(
                decor.windowBandsEastWest,
                windowEwIndex,
                anchorX,
                anchorZ,
                base,
                towerRotation,
                { x: -(towerWidth * 0.5 + 0.16), y: rowOffset, z: 0 },
                scratchScale.set(0.34, rowHeight, towerDepth * 0.8),
                scratchPosition,
              );
              if (ewWindowColor) {
                const sideWarmth = 0.8 + hash2(worldX + row * 6.1, worldZ + row * 8.7) * 0.4;
                const sideLit = hash2(worldX + row * 15.7, worldZ + row * 19.3) < litFraction;
                if (sideLit) {
                  tempColor.setRGB(sideWarmth * 0.9, sideWarmth * 0.78, sideWarmth * 0.58);
                } else {
                  tempColor.set(0x112233);
                }
              } else {
                tempColor.set(0x112233);
              }
              decor.windowBandsEastWest.setColorAt(windowEwIndex, tempColor);
              windowEwIndex += 1;
            }

            if (hash2(worldX + 5, worldZ + 8) > 0.38) {
              const rooftopHeight = 1.4 + hash2(worldX + 2, worldZ - 5) * 2.2;
              setLocalInstanceTransform(
                decor.rooftopUnits,
                rooftopIndex,
                anchorX,
                anchorZ,
                { x: worldX, y: height + towerHeight + rooftopHeight * 0.5, z: worldZ },
                towerRotation,
                {
                  x: towerWidth * 0.18,
                  y: 0,
                  z: towerDepth * 0.16,
                },
                scratchScale.set(towerWidth * 0.24, rooftopHeight, towerDepth * 0.18),
                scratchPosition,
              );
              tempColor.setStyle('#4f555e');
              decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
              rooftopIndex += 1;
            }

            // Enhanced rooftop features for tall buildings
            if (towerHeight > 22) {
              const roofFeatureHash = hash2(worldX + 31.1, worldZ + 43.7);
              // Antenna — tall thin element
              if (roofFeatureHash > 0.7) {
                const antennaH = 3 + hash2(worldX + 37.2, worldZ + 51.3) * 2;
                setLocalInstanceTransform(
                  decor.rooftopUnits,
                  rooftopIndex,
                  anchorX,
                  anchorZ,
                  { x: worldX, y: height + towerHeight + antennaH * 0.5, z: worldZ },
                  towerRotation,
                  {
                    x: towerWidth * 0.08,
                    y: 0,
                    z: -towerDepth * 0.12,
                  },
                  scratchScale.set(0.3, antennaH, 0.3),
                  scratchPosition,
                );
                tempColor.setStyle('#6b7178');
                decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
                rooftopIndex += 1;
              }
              // AC unit cluster — two squat boxes
              if (roofFeatureHash > 0.4) {
                const acH = 1 + hash2(worldX + 41.5, worldZ + 59.2) * 1;
                setLocalInstanceTransform(
                  decor.rooftopUnits,
                  rooftopIndex,
                  anchorX,
                  anchorZ,
                  { x: worldX, y: height + towerHeight + acH * 0.5, z: worldZ },
                  towerRotation,
                  {
                    x: -towerWidth * 0.22,
                    y: 0,
                    z: towerDepth * 0.24,
                  },
                  scratchScale.set(1.5, acH, 1.2),
                  scratchPosition,
                );
                tempColor.setStyle('#555d64');
                decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
                rooftopIndex += 1;
                // Second AC unit offset nearby
                setLocalInstanceTransform(
                  decor.rooftopUnits,
                  rooftopIndex,
                  anchorX,
                  anchorZ,
                  { x: worldX, y: height + towerHeight + acH * 0.5, z: worldZ },
                  towerRotation,
                  {
                    x: -towerWidth * 0.22 + 2.0,
                    y: 0,
                    z: towerDepth * 0.24,
                  },
                  scratchScale.set(1.3, acH * 0.85, 1.1),
                  scratchPosition,
                );
                tempColor.setStyle('#4d545b');
                decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
                rooftopIndex += 1;
              }
              // Water tower — wider, medium height
              if (roofFeatureHash > 0.2 && roofFeatureHash <= 0.4) {
                const wtH = 2 + hash2(worldX + 47.8, worldZ + 63.4) * 1;
                setLocalInstanceTransform(
                  decor.rooftopUnits,
                  rooftopIndex,
                  anchorX,
                  anchorZ,
                  { x: worldX, y: height + towerHeight + wtH * 0.5, z: worldZ },
                  towerRotation,
                  {
                    x: towerWidth * 0.26,
                    y: 0,
                    z: -towerDepth * 0.22,
                  },
                  scratchScale.set(2.0, wtH, 2.0),
                  scratchPosition,
                );
                tempColor.setStyle('#7a8088');
                decor.rooftopUnits.setColorAt(rooftopIndex, tempColor);
                rooftopIndex += 1;
              }
            }

            if (hash2(worldX - 4, worldZ + 13) > 0.35) {
              const crowdHeight = 1.25 + hash2(worldX - 7, worldZ + 15) * 0.65;
              const crowdX = worldX + THREE.MathUtils.clamp(towerWidth * 0.58, 3.6, 5.8);
              const crowdZ = worldZ + (hash2(worldX + 2, worldZ + 2) > 0.5 ? 5.2 : -5.2);
              setInstanceTransform(
                decor.crowds,
                crowdIndex,
                worldToLocal(crowdX, height + crowdHeight * 0.5, crowdZ, anchorX, anchorZ, scratchPosition),
                hash2(worldX + 6, worldZ + 4) * Math.PI * 2,
                scratchScale.set(0.95, crowdHeight, 0.95),
              );
              tempColor.setStyle(hash2(worldX + 29, worldZ - 11) > 0.45 ? '#d5dccc' : '#8f8b86');
              decor.crowds.setColorAt(crowdIndex, tempColor);
              crowdIndex += 1;
            }
          }
        }

        for (let lane = 0; lane < 3; lane += 1) {
          const laneZ = worldChunkZ + lane * CITY_BLOCK_SIZE;
          if (getBiomeAt(worldChunkX + chunkSize * 0.5, laneZ + 0.6, theme) !== 'sea') {
            const direction = hash2(worldChunkX + lane * 9, worldChunkZ - lane * 7) > 0.5 ? 1 : -1;
            decor.animations.cars.push({
              axis: 'x',
              laneValue: laneZ,
              startX: direction > 0 ? worldChunkX - 8 : worldChunkX + chunkSize + 8,
              direction,
              speed: 10 + hash2(worldChunkX + lane * 5, worldChunkZ + 18) * 10,
              phase: hash2(worldChunkX + lane * 27, worldChunkZ + 4) * (chunkSize + 16),
              color: CITY_CAR_COLORS[Math.floor(hash2(worldChunkX + lane, worldChunkZ + 2) * CITY_CAR_COLORS.length)],
            });
          }

          const laneX = worldChunkX + lane * CITY_BLOCK_SIZE;
          if (getBiomeAt(laneX + 0.6, worldChunkZ + chunkSize * 0.5, theme) !== 'sea') {
            const direction = hash2(worldChunkX - lane * 6, worldChunkZ + lane * 12) > 0.5 ? 1 : -1;
            decor.animations.cars.push({
              axis: 'z',
              laneValue: laneX,
              startZ: direction > 0 ? worldChunkZ - 8 : worldChunkZ + chunkSize + 8,
              direction,
              speed: 10 + hash2(worldChunkX + 11, worldChunkZ + lane * 14) * 9,
              phase: hash2(worldChunkX + lane * 17, worldChunkZ + 9) * (chunkSize + 16),
              color: CITY_CAR_COLORS[Math.floor(hash2(worldChunkX + 4, worldChunkZ + lane) * CITY_CAR_COLORS.length)],
            });
          }
        }

        const heliChance = hash2(worldChunkX * 0.45, worldChunkZ * 0.45);
        if (heliChance > 0.38) {
          const centerX = worldChunkX + chunkSize * (0.28 + heliChance * 0.38);
          const centerZ = worldChunkZ + chunkSize * (0.2 + hash2(worldChunkX + 14, worldChunkZ + 6) * 0.54);
          if (getBiomeAt(centerX, centerZ, theme) !== 'sea') {
            decor.animations.helicopters.push({
              centerX,
              centerZ,
              altitude: 30 + heliChance * 20,
              radius: 7 + heliChance * 12,
              phase: hash2(worldChunkX + 7, worldChunkZ + 12) * Math.PI * 2,
              orbitSpeed: 0.38 + heliChance * 0.45,
              tint: heliChance > 0.7 ? '#ffd166' : '#dfe7ef',
            });
          }
        }
      }
    }

    hideRemainingInstances(decor.towerCores, towerIndex, scratchPosition);
    hideRemainingInstances(decor.towerWings, wingIndex, scratchPosition);
    hideRemainingInstances(decor.towerCrowns, crownIndex, scratchPosition);
    hideRemainingInstances(decor.windowBandsNorthSouth, windowNsIndex, scratchPosition);
    hideRemainingInstances(decor.windowBandsEastWest, windowEwIndex, scratchPosition);
    hideRemainingInstances(decor.rooftopUnits, rooftopIndex, scratchPosition);
    hideRemainingInstances(decor.crowds, crowdIndex, scratchPosition);
    if (decor.towerCores.instanceColor) {
      decor.towerCores.instanceColor.needsUpdate = true;
    }
    if (decor.towerWings.instanceColor) {
      decor.towerWings.instanceColor.needsUpdate = true;
    }
    if (decor.towerCrowns.instanceColor) {
      decor.towerCrowns.instanceColor.needsUpdate = true;
    }
    if (decor.windowBandsNorthSouth.instanceColor) {
      decor.windowBandsNorthSouth.instanceColor.needsUpdate = true;
    }
    if (decor.windowBandsEastWest.instanceColor) {
      decor.windowBandsEastWest.instanceColor.needsUpdate = true;
    }
    if (decor.rooftopUnits.instanceColor) {
      decor.rooftopUnits.instanceColor.needsUpdate = true;
    }
    if (decor.crowds.instanceColor) {
      decor.crowds.instanceColor.needsUpdate = true;
    }
  };

  const updateCityAnimations = (anchorX, anchorZ, time) => {
    let carIndex = 0;
    let glassIndex = 0;
    let lightIndex = 0;
    for (const car of decor.animations.cars) {
      const travel = THREE.MathUtils.euclideanModulo(
        time * car.speed + car.phase,
        chunkSize + 16,
      );
      const worldX = car.axis === 'x'
        ? car.startX + travel * car.direction
        : car.laneValue;
      const worldZ = car.axis === 'z'
        ? car.startZ + travel * car.direction
        : car.laneValue;

      if (getBiomeAt(worldX, worldZ, theme) === 'sea') {
        continue;
      }

      const height = getGroundHeightAt(worldX, worldZ, theme) + 0.54;
      const rotationY = car.axis === 'x'
        ? (car.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5)
        : (car.direction > 0 ? 0 : Math.PI);
      const base = { x: worldX, y: height, z: worldZ };
      setInstanceTransform(
        decor.carBodies,
        carIndex,
        worldToLocal(worldX, height, worldZ, anchorX, anchorZ, scratchPosition),
        rotationY,
        scratchScale.set(1, 1, 1),
      );
      setLocalInstanceTransform(
        decor.carCabins,
        carIndex,
        anchorX,
        anchorZ,
        base,
        rotationY,
        { x: 0, y: 0.48, z: -0.12 },
        scratchScale.set(1, 1, 1),
        scratchPosition,
      );
      setLocalInstanceTransform(
        decor.carWindshields,
        glassIndex,
        anchorX,
        anchorZ,
        base,
        rotationY,
        { x: 0, y: 0.55, z: 0.76 },
        scratchScale.set(1, 1, 1),
        scratchPosition,
      );
      glassIndex += 1;
      setLocalInstanceTransform(
        decor.carWindshields,
        glassIndex,
        anchorX,
        anchorZ,
        base,
        rotationY,
        { x: 0, y: 0.55, z: -0.92 },
        scratchScale.set(1, 1, 1),
        scratchPosition,
      );
      glassIndex += 1;
      setLocalInstanceTransform(decor.carFrontLeftWheels, carIndex, anchorX, anchorZ, base, rotationY, { x: 0.92, y: -0.22, z: 1.28 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.carFrontRightWheels, carIndex, anchorX, anchorZ, base, rotationY, { x: -0.92, y: -0.22, z: 1.28 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.carRearLeftWheels, carIndex, anchorX, anchorZ, base, rotationY, { x: 0.92, y: -0.22, z: -1.18 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.carRearRightWheels, carIndex, anchorX, anchorZ, base, rotationY, { x: -0.92, y: -0.22, z: -1.18 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.carHeadlights, lightIndex, anchorX, anchorZ, base, rotationY, { x: 0.58, y: 0.04, z: 2.22 }, scratchScale.set(1, 1, 1), scratchPosition);
      lightIndex += 1;
      setLocalInstanceTransform(decor.carHeadlights, lightIndex, anchorX, anchorZ, base, rotationY, { x: -0.58, y: 0.04, z: 2.22 }, scratchScale.set(1, 1, 1), scratchPosition);
      lightIndex += 1;
      setLocalInstanceTransform(decor.carTaillights, (carIndex * 2), anchorX, anchorZ, base, rotationY, { x: 0.54, y: 0.04, z: -2.18 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.carTaillights, (carIndex * 2) + 1, anchorX, anchorZ, base, rotationY, { x: -0.54, y: 0.04, z: -2.18 }, scratchScale.set(1, 1, 1), scratchPosition);
      tempColor.setStyle(car.color);
      decor.carBodies.setColorAt(carIndex, tempColor);
      tempColor.offsetHSL(0, 0, 0.1);
      decor.carCabins.setColorAt(carIndex, tempColor);
      tempColor.setStyle('#9dd4f0');
      decor.carWindshields.setColorAt(glassIndex - 2, tempColor);
      decor.carWindshields.setColorAt(glassIndex - 1, tempColor);
      carIndex += 1;
    }

    let heliIndex = 0;
    for (const helicopter of decor.animations.helicopters) {
      const angle = helicopter.phase + time * helicopter.orbitSpeed;
      const worldX = helicopter.centerX + Math.cos(angle) * helicopter.radius;
      const worldZ = helicopter.centerZ + Math.sin(angle) * helicopter.radius * 0.72;
      const worldY = helicopter.altitude + Math.sin(time * 1.9 + helicopter.phase) * 1.8;
      const heading = -angle + Math.PI * 0.5;

      const base = { x: worldX, y: worldY, z: worldZ };
      setInstanceTransform(decor.helicopterBodies, heliIndex, worldToLocal(worldX, worldY, worldZ, anchorX, anchorZ, scratchPosition), heading, scratchScale.set(1, 1, 1));
      setLocalInstanceTransform(decor.helicopterCockpits, heliIndex, anchorX, anchorZ, base, heading, { x: 0, y: 0.16, z: 1.5 }, scratchScale.set(1, 0.82, 1.08), scratchPosition);
      setLocalInstanceTransform(decor.helicopterTails, heliIndex, anchorX, anchorZ, base, heading, { x: 0, y: 0.06, z: -3.1 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterFins, heliIndex, anchorX, anchorZ, base, heading, { x: 0, y: 0.56, z: -4.76 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterLeftSkids, heliIndex, anchorX, anchorZ, base, heading, { x: 0.72, y: -0.86, z: 0.12 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterRightSkids, heliIndex, anchorX, anchorZ, base, heading, { x: -0.72, y: -0.86, z: 0.12 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterLeftStruts, heliIndex, anchorX, anchorZ, base, heading, { x: 0.66, y: -0.46, z: 0.58 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterRightStruts, heliIndex, anchorX, anchorZ, base, heading, { x: -0.66, y: -0.46, z: 0.58 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterRotors, heliIndex, anchorX, anchorZ, { x: worldX, y: worldY + 0.78, z: worldZ }, heading + time * 22, { x: 0, y: 0, z: 0 }, scratchScale.set(1, 1, 1), scratchPosition);
      setLocalInstanceTransform(decor.helicopterTailRotors, heliIndex, anchorX, anchorZ, { x: worldX, y: worldY + 0.46, z: worldZ }, heading + time * 30, { x: 0, y: 0.26, z: -4.98 }, scratchScale.set(1, 1, 1), scratchPosition);
      tempColor.setStyle(helicopter.tint);
      decor.helicopterBodies.setColorAt(heliIndex, tempColor);
      tempColor.setStyle('#9dd0e4');
      decor.helicopterCockpits.setColorAt(heliIndex, tempColor);
      tempColor.setStyle('#bfc8d1');
      decor.helicopterTails.setColorAt(heliIndex, tempColor);
      decor.helicopterFins.setColorAt(heliIndex, tempColor);
      tempColor.setStyle('#1b212c');
      decor.helicopterLeftSkids.setColorAt(heliIndex, tempColor);
      decor.helicopterRightSkids.setColorAt(heliIndex, tempColor);
      decor.helicopterLeftStruts.setColorAt(heliIndex, tempColor);
      decor.helicopterRightStruts.setColorAt(heliIndex, tempColor);
      decor.helicopterRotors.setColorAt(heliIndex, tempColor);
      decor.helicopterTailRotors.setColorAt(heliIndex, tempColor);
      heliIndex += 1;
    }

    hideRemainingInstances(decor.carBodies, carIndex, scratchPosition);
    hideRemainingInstances(decor.carCabins, carIndex, scratchPosition);
    hideRemainingInstances(decor.carWindshields, glassIndex, scratchPosition);
    hideRemainingInstances(decor.carFrontLeftWheels, carIndex, scratchPosition);
    hideRemainingInstances(decor.carFrontRightWheels, carIndex, scratchPosition);
    hideRemainingInstances(decor.carRearLeftWheels, carIndex, scratchPosition);
    hideRemainingInstances(decor.carRearRightWheels, carIndex, scratchPosition);
    hideRemainingInstances(decor.carHeadlights, lightIndex, scratchPosition);
    hideRemainingInstances(decor.carTaillights, carIndex * 2, scratchPosition);
    hideRemainingInstances(decor.helicopterBodies, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterCockpits, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterTails, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterFins, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterLeftSkids, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterRightSkids, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterLeftStruts, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterRightStruts, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterRotors, heliIndex, scratchPosition);
    hideRemainingInstances(decor.helicopterTailRotors, heliIndex, scratchPosition);
    if (decor.carBodies.instanceColor) {
      decor.carBodies.instanceColor.needsUpdate = true;
    }
    if (decor.carCabins.instanceColor) {
      decor.carCabins.instanceColor.needsUpdate = true;
    }
    if (decor.carWindshields.instanceColor) {
      decor.carWindshields.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterBodies.instanceColor) {
      decor.helicopterBodies.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterCockpits.instanceColor) {
      decor.helicopterCockpits.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterTails.instanceColor) {
      decor.helicopterTails.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterFins.instanceColor) {
      decor.helicopterFins.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterRotors.instanceColor) {
      decor.helicopterRotors.instanceColor.needsUpdate = true;
    }
    if (decor.helicopterTailRotors.instanceColor) {
      decor.helicopterTailRotors.instanceColor.needsUpdate = true;
    }
  };

  const refreshTerrain = (center, time = 0) => {
    const snappedX = Math.floor(center.x / chunkSize) * chunkSize;
    const snappedZ = Math.floor(center.z / chunkSize) * chunkSize;

    if (snappedX !== chunkAnchor.x || snappedZ !== chunkAnchor.z) {
      chunkAnchor.x = snappedX;
      chunkAnchor.z = snappedZ;
      if (theme === MAP_THEMES.CITY) {
        rebuildCityDecor(snappedX, snappedZ);
      } else {
        rebuildFrontierDecor(snappedX, snappedZ);
      }
    }

    group.position.set(snappedX, 0, snappedZ);
    const colorAttribute = groundGeometry.getAttribute('color');
    for (let i = 0; i < positions.count; i += 1) {
      const local = basePositions[i];
      const worldX = snappedX + local.x;
      const worldZ = snappedZ + local.z;
      const height = getGroundHeightAt(worldX, worldZ, theme);
      positions.setY(i, height);
      tempColor.copy(getSurfaceColor(worldX, worldZ, height, theme));
      colorAttribute.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
      groundSeaFlags[i] = getBiomeAt(worldX, worldZ, theme) === 'sea' ? 1 : 0;
    }
    positions.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    if (theme === MAP_THEMES.CITY) {
      updateCityAnimations(snappedX, snappedZ, time);
      sea.position.set(0, CONFIG.world.seaLevel + Math.sin(time * 0.36) * 0.12, 0);
      sea.material.color.setStyle(
        Math.sin(time * 0.11) > 0
          ? '#355d7b'
          : '#214f78',
      );
    } else {
      sea.position.set(0, CONFIG.world.seaLevel + Math.sin(time * 0.55) * 0.18, 0);
      sea.material.color.setStyle(
        Math.sin(time * 0.15) > 0
          ? '#1f6e9f'
          : '#195f93',
      );
      decor.cloudsBody.position.set(Math.sin(time * 0.018) * 6, Math.sin(time * 0.042) * 0.9, Math.cos(time * 0.014) * 4);
      decor.cloudsWisp.position.set(Math.sin(time * 0.026) * 9, Math.sin(time * 0.038) * 1.2, Math.cos(time * 0.021) * 6);
    }
  };

  refreshTerrain(new THREE.Vector3(0, 0, 0), 0);

  // Sea plane waves are now GPU-driven via TSL positionNode on seaMaterial.
  // Only ground sea-biome vertices still need CPU animation.
  const updateWater = (time) => {
    const anchorX = chunkAnchor.x;
    const anchorZ = chunkAnchor.z;

    // Animate ground vertices that are in sea biome
    let hasSeaVerts = false;
    for (let i = 0; i < positions.count; i++) {
      if (!groundSeaFlags[i]) continue;
      hasSeaVerts = true;
      const local = basePositions[i];
      const wx = anchorX + local.x;
      const wz = anchorZ + local.z;

      const wave1 = Math.sin(wx * 0.08 + time * 1.2) * 0.3;
      const wave2 = Math.cos(wz * 0.06 + time * 0.8) * 0.25;
      const wave3 = Math.sin((wx + wz) * 0.12 + time * 1.6) * 0.15;

      positions.setY(i, CONFIG.world.seaLevel + wave1 + wave2 + wave3);
    }
    if (hasSeaVerts) {
      positions.needsUpdate = true;
      groundGeometry.computeVertexNormals();
    }
  };

  return {
    group,
    getBiomeAt: (x, z) => getBiomeAt(x, z, theme),
    getGroundHeight: (x, z) => getGroundHeightAt(x, z, theme),
    canOccupy: (type, x, z) => canOccupyAt(type, x, z, theme),
    hasLineOfSight(start, end, radiusPadding = 0) {
      return !getSegmentObstacleHit(start, end, radiusPadding);
    },
    getSegmentObstacleHit(start, end, radiusPadding = 0) {
      return getSegmentObstacleHit(start, end, radiusPadding);
    },
    clampToArena,
    update(center, time = 0) {
      refreshTerrain(center, time);
    },
    updateWater(time) {
      updateWater(time);
    },
    getSpawnPoint(type, playerPosition, options) {
      return resolveSpawnPosition(type, playerPosition, rng, theme, options);
    },
    dispose() {
      scene.remove(group);
      groundGeometry.dispose();
      groundMaterial.dispose();
      sea.geometry.dispose();
      sea.material.dispose();
      decor.dispose();
    },
  };
}
