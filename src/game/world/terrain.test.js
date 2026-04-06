import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createRng } from '../math.js';
import { canOccupyBiome, createTerrain, getBiomeAt, getGroundHeightAt } from './terrain.js';

describe('terrain helpers', () => {
  it('separates land, shore, and sea zones across the infinite field', () => {
    expect(getBiomeAt(-1000, 800)).toBe('sea');
    expect(getBiomeAt(-800, 0)).toBe('shore');
    expect(getBiomeAt(0, 20)).toBe('land');
  });

  it('keeps sea height flat and land height varied', () => {
    expect(getGroundHeightAt(-1000, 800)).toBe(-2);
    expect(getGroundHeightAt(20, 30)).not.toBe(-2);
  });

  it('only spawns terrain-locked enemies on valid biomes', () => {
    const terrain = createTerrain(new THREE.Scene(), createRng(1337));

    const shipSpawn = terrain.getSpawnPoint('ship', new THREE.Vector3(-1000, 0, 800));
    expect(shipSpawn).not.toBeNull();
    expect(canOccupyBiome('ship', getBiomeAt(shipSpawn.x, shipSpawn.z))).toBe(true);

    const tankSpawn = terrain.getSpawnPoint('tank', new THREE.Vector3(0, 0, 0));
    expect(tankSpawn).not.toBeNull();
    expect(canOccupyBiome('tank', getBiomeAt(tankSpawn.x, tankSpawn.z))).toBe(true);

    terrain.dispose();
  });

  it('returns no spawn point when required terrain is unavailable nearby', () => {
    const terrain = createTerrain(new THREE.Scene(), createRng(1337));

    expect(terrain.getSpawnPoint('ship', new THREE.Vector3(0, 0, 0))).toBeNull();

    terrain.dispose();
  });
});
