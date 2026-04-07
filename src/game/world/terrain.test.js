import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from '../../mapThemes.js';
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

  it('exposes a separate city biome layout with a river corridor', () => {
    expect(getBiomeAt(0, 8, MAP_THEMES.CITY)).toBe('sea');
    expect(getBiomeAt(0, 20, MAP_THEMES.CITY)).toBe('shore');
    expect(getBiomeAt(0, 80, MAP_THEMES.CITY)).toBe('land');
    expect(getGroundHeightAt(0, 80, MAP_THEMES.CITY)).not.toBe(-2);
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

  it('keeps city-map ship spawns near the river and out of inland districts', () => {
    const terrain = createTerrain(new THREE.Scene(), createRng(1337), { mapTheme: MAP_THEMES.CITY });

    const shipSpawn = terrain.getSpawnPoint('ship', new THREE.Vector3(0, 0, 80));
    expect(shipSpawn).not.toBeNull();
    expect(canOccupyBiome('ship', getBiomeAt(shipSpawn.x, shipSpawn.z, MAP_THEMES.CITY))).toBe(true);

    expect(terrain.getSpawnPoint('ship', new THREE.Vector3(0, 0, 320))).toBeNull();

    terrain.dispose();
  });

  it('builds collision obstacles for city towers that block line of sight', () => {
    const terrain = createTerrain(new THREE.Scene(), createRng(1337), { mapTheme: MAP_THEMES.CITY });
    let obstacleHit = null;

    for (let x = -60; x <= 60 && !obstacleHit; x += 4) {
      for (let z = -60; z <= 60 && !obstacleHit; z += 4) {
        obstacleHit = terrain.getSegmentObstacleHit(
          { x, y: 0, z },
          { x, y: 120, z },
          0,
        );
      }
    }

    expect(obstacleHit).not.toBeNull();
    expect(
      terrain.hasLineOfSight(
        { x: obstacleHit.center.x - obstacleHit.radius - 5, y: obstacleHit.center.y, z: obstacleHit.center.z },
        { x: obstacleHit.center.x + obstacleHit.radius + 5, y: obstacleHit.center.y, z: obstacleHit.center.z },
        0.5,
      ),
    ).toBe(false);

    terrain.dispose();
  });

  it('keeps a mix of open city parcels and built-up blocks', () => {
    const terrain = createTerrain(new THREE.Scene(), createRng(1337), { mapTheme: MAP_THEMES.CITY });
    let openLots = 0;
    let builtLots = 0;

    for (let x = -80; x <= 80; x += 8) {
      for (let z = -80; z <= 80; z += 8) {
        if (getBiomeAt(x, z, MAP_THEMES.CITY) !== 'land') {
          continue;
        }
        const hit = terrain.getSegmentObstacleHit(
          { x, y: 0, z },
          { x, y: 120, z },
          0,
        );
        if (hit) {
          builtLots += 1;
        } else {
          openLots += 1;
        }
      }
    }

    expect(openLots).toBeGreaterThan(20);
    expect(builtLots).toBeGreaterThan(20);

    terrain.dispose();
  });
});
