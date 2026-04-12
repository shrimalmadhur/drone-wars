import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createRng } from '../math.js';
import { BossEnemy } from './BossEnemy.js';

function createContext(playerPosition = new THREE.Vector3(0, 12, 40)) {
  return {
    player: {
      group: {
        position: playerPosition,
      },
    },
    terrain: {},
  };
}

describe('BossEnemy', () => {
  it('announces phase transitions and updates the HUD label', () => {
    const scene = new THREE.Scene();
    const boss = new BossEnemy(scene, new THREE.Vector3(0, 20, 0), createRng(7));
    boss.health = boss.maxHealth * 0.6;
    boss.attackCooldown = 99;

    const events = boss.update(0.1, createContext());

    expect(events.some((event) => event.type === 'status' && event.message.includes('phase 2 engaged'))).toBe(true);
    expect(boss.getHudLabel()).toBe('COMMAND CARRIER // PHASE 2');

    boss.dispose();
  });

  it('fires a plasma fan after its telegraph warmup', () => {
    const scene = new THREE.Scene();
    const boss = new BossEnemy(scene, new THREE.Vector3(0, 20, 0), createRng(7));

    const startEvents = boss.startAttack('plasmaFan');
    expect(startEvents[0].message).toContain('plasma fan incoming');

    const events = boss.update(0.7, createContext());
    const projectileEvents = events.filter((event) => event.type === 'spawnProjectile');

    expect(projectileEvents).toHaveLength(5);
    expect(boss.currentAttack).toBe(null);

    boss.dispose();
  });

  it('executes a multi-burst crossfire sweep in later phases', () => {
    const scene = new THREE.Scene();
    const boss = new BossEnemy(scene, new THREE.Vector3(0, 20, 0), createRng(7));
    boss.health = boss.maxHealth * 0.3;
    boss.currentPhase = boss.getPhaseForHealth();
    boss.startAttack('crossfireSweep');

    const firstBurst = boss.update(0.85, createContext());
    const secondBurst = boss.update(0.3, createContext());

    expect(firstBurst.filter((event) => event.type === 'spawnProjectile')).toHaveLength(7);
    expect(secondBurst.filter((event) => event.type === 'spawnProjectile')).toHaveLength(7);

    boss.dispose();
  });

  it('launches repeated missile barrages in phase 3', () => {
    const scene = new THREE.Scene();
    const boss = new BossEnemy(scene, new THREE.Vector3(0, 20, 0), createRng(7));
    boss.health = boss.maxHealth * 0.25;
    boss.currentPhase = boss.getPhaseForHealth();
    boss.startAttack('missileBarrage');

    const firstBurst = boss.update(1.0, createContext());
    const secondBurst = boss.update(0.5, createContext());
    const thirdBurst = boss.update(0.5, createContext());

    expect(firstBurst.filter((event) => event.type === 'spawnEnemy' && event.enemyType === 'missile')).toHaveLength(5);
    expect(secondBurst.filter((event) => event.type === 'spawnEnemy' && event.enemyType === 'missile')).toHaveLength(5);
    expect(thirdBurst.filter((event) => event.type === 'spawnEnemy' && event.enemyType === 'missile')).toHaveLength(5);

    boss.dispose();
  });
});
