import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { createRng } from '../math.js';
import { TankEnemy } from './TankEnemy.js';

describe('TankEnemy', () => {
  it('does not drive into invalid terrain', () => {
    const scene = new THREE.Scene();
    const tank = new TankEnemy(scene, new THREE.Vector3(0, 0, 0), createRng(7));
    tank.heading = 0;
    tank.turnTimer = 10;
    tank.fireCooldown = 10;

    tank.update(1, {
      player: {
        group: {
          position: new THREE.Vector3(0, 0, 100),
        },
      },
      terrain: {
        canOccupy() {
          return false;
        },
        clampToArena() {},
        getGroundHeight() {
          return 3;
        },
      },
    });

    expect(tank.group.position.x).toBe(0);
    expect(tank.group.position.z).toBe(0);
    expect(tank.group.position.y).toBe(3);

    tank.dispose();
  });

  it('does not fire when a building blocks line of sight', () => {
    const scene = new THREE.Scene();
    const tank = new TankEnemy(scene, new THREE.Vector3(0, 0, 0), createRng(7));
    tank.turnTimer = 10;
    tank.fireCooldown = 0;

    const events = tank.update(0.1, {
      player: {
        group: {
          position: new THREE.Vector3(0, 0, 40),
        },
      },
      terrain: {
        canOccupy() {
          return true;
        },
        clampToArena() {},
        getGroundHeight() {
          return 0;
        },
        hasLineOfSight() {
          return false;
        },
      },
    });

    expect(events).toEqual([]);
    expect(tank.fireCooldown).toBe(0.35);

    tank.dispose();
  });
});
