import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { randomRange } from '../math.js';

const UP = new THREE.Vector3(0, 1, 0);

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

export function getBiomeAt(x, z) {
  const field = sampleBiomeField(x, z);
  if (field < -0.72) {
    return 'sea';
  }
  if (field < -0.4) {
    return 'shore';
  }
  return 'land';
}

export function getGroundHeightAt(x, z) {
  const biome = getBiomeAt(x, z);
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

function getSurfaceColor(x, z, height) {
  const biome = getBiomeAt(x, z);
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

export function canOccupyAt(type, x, z) {
  return canOccupyBiome(type, getBiomeAt(x, z));
}

function validSpawn(type, x, z, playerPosition) {
  const dist = Math.hypot(x - playerPosition.x, z - playerPosition.z);
  if (dist < CONFIG.world.spawnMinDistance) {
    return false;
  }
  return canOccupyAt(type, x, z);
}

function createSpawnPosition(type, x, z, rng) {
  const y = type === 'drone'
    ? randomRange(rng, 18, 36)
    : type === 'missile'
      ? randomRange(rng, 20, 48)
      : getGroundHeightAt(x, z);
  return new THREE.Vector3(x, y, z);
}

function searchSpawnRings(type, playerPosition, rng, minRadius, maxRadius) {
  const angleOffset = randomRange(rng, -Math.PI, Math.PI);
  for (let radius = minRadius; radius <= maxRadius; radius += 8) {
    const sampleCount = Math.max(48, Math.ceil((Math.PI * 2 * radius) / 18));
    for (let step = 0; step < sampleCount; step += 1) {
      const angle = angleOffset + (step / sampleCount) * Math.PI * 2;
      const x = playerPosition.x + Math.cos(angle) * radius;
      const z = playerPosition.z + Math.sin(angle) * radius;
      if (validSpawn(type, x, z, playerPosition)) {
        return createSpawnPosition(type, x, z, rng);
      }
    }
  }
  return null;
}

function resolveSpawnPosition(type, playerPosition, rng) {
  const minRadius = CONFIG.world.spawnMinDistance + 24;
  const maxRadius = CONFIG.world.spawnMaxDistance;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const angle = randomRange(rng, -Math.PI, Math.PI);
    const radius = randomRange(rng, minRadius, maxRadius);
    const x = playerPosition.x + Math.cos(angle) * radius;
    const z = playerPosition.z + Math.sin(angle) * radius;

    if (!validSpawn(type, x, z, playerPosition)) {
      continue;
    }

    return createSpawnPosition(type, x, z, rng);
  }

  const exhaustive = searchSpawnRings(
    type,
    playerPosition,
    rng,
    minRadius,
    Math.min(CONFIG.world.enemyDespawnDistance - 16, maxRadius + CONFIG.world.chunkSize * 2),
  );
  if (exhaustive) {
    return exhaustive;
  }

  if (type === 'tank' || type === 'ship') {
    return null;
  }

  const fallback = new THREE.Vector3(
    playerPosition.x,
    0,
    playerPosition.z - CONFIG.world.spawnMinDistance - 18,
  );
  fallback.y = type === 'drone' || type === 'missile' ? 24 : getGroundHeightAt(fallback.x, fallback.z);
  return fallback;
}

function setInstanceTransform(mesh, index, position, rotationY, scale) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function hideRemainingInstances(mesh, startIndex, scratchPosition) {
  for (let index = startIndex; index < mesh.count; index += 1) {
    setInstanceTransform(mesh, index, scratchPosition, 0, new THREE.Vector3(0.0001, 0.0001, 0.0001));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function buildDecorMeshes(group, maxCounts) {
  const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.55, 6, 8);
  // Three tiers of foliage: bottom (widest), middle, top (narrowest)
  const crownBottomGeometry = new THREE.ConeGeometry(3.4, 4.5, 8);
  const crownMiddleGeometry = new THREE.ConeGeometry(2.6, 4.0, 8);
  const crownTopGeometry = new THREE.ConeGeometry(1.8, 3.5, 8);
  const rockGeometry = new THREE.DodecahedronGeometry(2.4, 0);
  const landmarkGeometry = new THREE.CylinderGeometry(0.9, 1.8, 14, 6);
  const cloudGeometry = new THREE.SphereGeometry(4, 8, 8);

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: '#4a2d1a',
    roughness: 1,
  });
  const crownBottomMaterial = new THREE.MeshStandardMaterial({
    color: '#1e5e2e',
    roughness: 0.92,
  });
  const crownMiddleMaterial = new THREE.MeshStandardMaterial({
    color: '#2b6b3e',
    roughness: 0.9,
  });
  const crownTopMaterial = new THREE.MeshStandardMaterial({
    color: '#358748',
    roughness: 0.88,
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#889077',
    roughness: 1,
  });
  const landmarkMaterial = new THREE.MeshStandardMaterial({
    color: '#8c6e56',
    roughness: 0.88,
    metalness: 0.08,
  });
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: '#edf4ff',
    transparent: true,
    opacity: 0.45,
    roughness: 1,
    depthWrite: false,
  });

  const treesTrunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, maxCounts.trees);
  const treesCrownBottom = new THREE.InstancedMesh(crownBottomGeometry, crownBottomMaterial, maxCounts.trees);
  const treesCrownMiddle = new THREE.InstancedMesh(crownMiddleGeometry, crownMiddleMaterial, maxCounts.trees);
  const treesCrownTop = new THREE.InstancedMesh(crownTopGeometry, crownTopMaterial, maxCounts.trees);
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, maxCounts.rocks);
  const landmarks = new THREE.InstancedMesh(landmarkGeometry, landmarkMaterial, maxCounts.landmarks);
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, maxCounts.clouds);

  treesTrunk.castShadow = true;
  treesTrunk.receiveShadow = true;
  treesCrownBottom.castShadow = true;
  treesCrownBottom.receiveShadow = true;
  treesCrownMiddle.castShadow = true;
  treesCrownMiddle.receiveShadow = true;
  treesCrownTop.castShadow = true;
  treesCrownTop.receiveShadow = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  landmarks.castShadow = true;
  landmarks.receiveShadow = true;

  group.add(treesTrunk, treesCrownBottom, treesCrownMiddle, treesCrownTop, rocks, landmarks, clouds);

  return {
    treesTrunk,
    treesCrownBottom,
    treesCrownMiddle,
    treesCrownTop,
    rocks,
    landmarks,
    clouds,
    dispose() {
      trunkGeometry.dispose();
      crownBottomGeometry.dispose();
      crownMiddleGeometry.dispose();
      crownTopGeometry.dispose();
      rockGeometry.dispose();
      landmarkGeometry.dispose();
      cloudGeometry.dispose();
      trunkMaterial.dispose();
      crownBottomMaterial.dispose();
      crownMiddleMaterial.dispose();
      crownTopMaterial.dispose();
      rockMaterial.dispose();
      landmarkMaterial.dispose();
      cloudMaterial.dispose();
    },
  };
}

function worldToLocal(worldX, worldY, worldZ, anchorX, anchorZ, target) {
  target.set(worldX - anchorX, worldY, worldZ - anchorZ);
  return target;
}

export function createTerrain(scene, rng) {
  const group = new THREE.Group();
  const chunkSize = CONFIG.world.chunkSize;
  const radius = CONFIG.world.activeChunkRadius;
  const renderExtent = chunkSize * (radius * 2 + 1);
  const maxChunkCount = (radius * 2 + 1) ** 2;
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const tempColor = new THREE.Color();
  const chunkAnchor = { x: Number.NaN, z: Number.NaN };

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
    roughness: 0.96,
    metalness: 0.04,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(renderExtent * 1.2, renderExtent * 1.2, 1, 1),
    new THREE.MeshPhysicalMaterial({
      color: '#1e6da2',
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72,
      clearcoat: 0.9,
      clearcoatRoughness: 0.25,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = CONFIG.world.seaLevel + 0.1;
  group.add(sea);

  const decor = buildDecorMeshes(group, {
    trees: maxChunkCount * 12,
    rocks: maxChunkCount * 8,
    landmarks: maxChunkCount * 2,
    clouds: maxChunkCount * 4,
  });

  scene.add(group);

  const rebuildDecor = (anchorX, anchorZ) => {
    let treeIndex = 0;
    let rockIndex = 0;
    let landmarkIndex = 0;
    let cloudIndex = 0;

    for (let chunkZ = -radius; chunkZ <= radius; chunkZ += 1) {
      for (let chunkX = -radius; chunkX <= radius; chunkX += 1) {
        const worldChunkX = anchorX + chunkX * chunkSize;
        const worldChunkZ = anchorZ + chunkZ * chunkSize;

        for (let i = 0; i < 12; i += 1) {
          const worldX = worldChunkX + hash2(worldChunkX + i * 17, worldChunkZ + i * 31) * chunkSize;
          const worldZ = worldChunkZ + hash2(worldChunkX - i * 13, worldChunkZ + i * 19) * chunkSize;
          const biome = getBiomeAt(worldX, worldZ);
          if (biome === 'sea') {
            continue;
          }

          const height = getGroundHeightAt(worldX, worldZ);
          const treeHeight = 0.9 + hash2(worldX, worldZ) * 1.2;
          const rotY = hash2(worldX + 7, worldZ - 5) * Math.PI * 2;

          // Trunk — taller, tapered
          const trunkScale = scratchScale.set(1, treeHeight, 1);
          setInstanceTransform(
            decor.treesTrunk,
            treeIndex,
            worldToLocal(worldX, height + 3 * treeHeight, worldZ, anchorX, anchorZ, scratchPosition),
            rotY,
            trunkScale,
          );

          // Bottom tier — widest
          const s = 0.85 + treeHeight * 0.25;
          setInstanceTransform(
            decor.treesCrownBottom,
            treeIndex,
            worldToLocal(worldX, height + 5.2 * treeHeight, worldZ, anchorX, anchorZ, scratchPosition),
            rotY,
            scratchScale.set(s, s, s),
          );

          // Middle tier
          setInstanceTransform(
            decor.treesCrownMiddle,
            treeIndex,
            worldToLocal(worldX, height + 7.4 * treeHeight, worldZ, anchorX, anchorZ, scratchPosition),
            rotY,
            scratchScale.set(s * 0.9, s * 0.95, s * 0.9),
          );

          // Top tier — narrowest
          setInstanceTransform(
            decor.treesCrownTop,
            treeIndex,
            worldToLocal(worldX, height + 9.2 * treeHeight, worldZ, anchorX, anchorZ, scratchPosition),
            rotY,
            scratchScale.set(s * 0.75, s * 0.85, s * 0.75),
          );

          treeIndex += 1;
        }

        for (let i = 0; i < 8; i += 1) {
          const worldX = worldChunkX + hash2(worldChunkX + i * 41, worldChunkZ + i * 7) * chunkSize;
          const worldZ = worldChunkZ + hash2(worldChunkX - i * 29, worldChunkZ + i * 23) * chunkSize;
          const biome = getBiomeAt(worldX, worldZ);
          if (biome === 'sea') {
            continue;
          }

          const height = getGroundHeightAt(worldX, worldZ);
          const scaleValue = 0.7 + hash2(worldX + 9, worldZ + 11) * 1.7;
          setInstanceTransform(
            decor.rocks,
            rockIndex,
            worldToLocal(worldX, height + 1.1 * scaleValue, worldZ, anchorX, anchorZ, scratchPosition),
            hash2(worldX + 13, worldZ + 5) * Math.PI * 2,
            scratchScale.set(scaleValue * 1.1, scaleValue, scaleValue * 0.9),
          );
          rockIndex += 1;
        }

        const landmarkChance = hash2(worldChunkX * 0.25, worldChunkZ * 0.25);
        if (landmarkChance > 0.62) {
          const worldX = worldChunkX + chunkSize * 0.5;
          const worldZ = worldChunkZ + chunkSize * 0.5;
          if (getBiomeAt(worldX, worldZ) !== 'sea') {
            const height = getGroundHeightAt(worldX, worldZ);
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
        if (cloudChance > 0.28) {
          const worldX = worldChunkX + chunkSize * (0.2 + cloudChance * 0.6);
          const worldZ = worldChunkZ + chunkSize * (0.1 + hash2(worldChunkX + 4, worldChunkZ + 8) * 0.8);
          const y = 54 + cloudChance * 16;
          const scaleValue = 1.8 + cloudChance * 2.4;
          setInstanceTransform(
            decor.clouds,
            cloudIndex,
            worldToLocal(worldX, y, worldZ, anchorX, anchorZ, scratchPosition),
            0,
            scratchScale.set(scaleValue * 2.8, scaleValue, scaleValue * 1.5),
          );
          cloudIndex += 1;
        }
      }
    }

    hideRemainingInstances(decor.treesTrunk, treeIndex, scratchPosition);
    hideRemainingInstances(decor.treesCrownBottom, treeIndex, scratchPosition);
    hideRemainingInstances(decor.treesCrownMiddle, treeIndex, scratchPosition);
    hideRemainingInstances(decor.treesCrownTop, treeIndex, scratchPosition);
    hideRemainingInstances(decor.rocks, rockIndex, scratchPosition);
    hideRemainingInstances(decor.landmarks, landmarkIndex, scratchPosition);
    hideRemainingInstances(decor.clouds, cloudIndex, scratchPosition);
  };

  const refreshTerrain = (center, time = 0) => {
    const snappedX = Math.floor(center.x / chunkSize) * chunkSize;
    const snappedZ = Math.floor(center.z / chunkSize) * chunkSize;

    if (snappedX !== chunkAnchor.x || snappedZ !== chunkAnchor.z) {
      chunkAnchor.x = snappedX;
      chunkAnchor.z = snappedZ;
      rebuildDecor(snappedX, snappedZ);
    }

    group.position.set(snappedX, 0, snappedZ);
    const colorAttribute = groundGeometry.getAttribute('color');
    for (let i = 0; i < positions.count; i += 1) {
      const local = basePositions[i];
      const worldX = snappedX + local.x;
      const worldZ = snappedZ + local.z;
      const height = getGroundHeightAt(worldX, worldZ);
      positions.setY(i, height);
      tempColor.copy(getSurfaceColor(worldX, worldZ, height));
      colorAttribute.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
    }
    positions.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    sea.position.set(0, CONFIG.world.seaLevel + Math.sin(time * 0.55) * 0.18, 0);
    sea.material.color.setStyle(
      Math.sin(time * 0.15) > 0
        ? '#1f6e9f'
        : '#195f93',
    );
  };

  refreshTerrain(new THREE.Vector3(0, 0, 0), 0);

  return {
    group,
    getBiomeAt,
    getGroundHeight: getGroundHeightAt,
    canOccupy: canOccupyAt,
    clampToArena,
    update(center, time = 0) {
      refreshTerrain(center, time);
    },
    getSpawnPoint(type, playerPosition) {
      return resolveSpawnPosition(type, playerPosition, rng);
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
