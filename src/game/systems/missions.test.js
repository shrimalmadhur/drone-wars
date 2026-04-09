import { describe, expect, it } from 'vitest';

import {
  classifyEnemyForMissions,
  createMissionForRun,
  createMissionForWave,
  updateMissionOnEnemyDestroyed,
  updateMissionOnWaveStart,
} from './missions.js';

describe('missions', () => {
  it('creates survival missions for early waves', () => {
    expect(createMissionForWave(1)).toMatchObject({
      id: 'survival',
      target: 3,
      progress: 1,
    });
  });

  it('creates hunter missions for mid waves', () => {
    expect(createMissionForWave(2)).toMatchObject({
      id: 'hunter',
      target: 5,
    });
  });

  it('creates demolition missions for later waves', () => {
    expect(createMissionForWave(4)).toMatchObject({
      id: 'demolition',
      target: 4,
    });
  });

  it('selects one run mission from the supported mission pool', () => {
    expect(createMissionForRun(() => 0)).toMatchObject({ id: 'survival' });
    expect(createMissionForRun(() => 0.4)).toMatchObject({ id: 'hunter' });
    expect(createMissionForRun(() => 0.9)).toMatchObject({ id: 'demolition' });
  });

  it('classifies mission enemy groups deterministically', () => {
    expect(classifyEnemyForMissions('drone')).toEqual({ airborne: true, heavy: false });
    expect(classifyEnemyForMissions('tank')).toEqual({ airborne: false, heavy: true });
    expect(classifyEnemyForMissions('boss')).toEqual({ airborne: true, heavy: true });
  });

  it('updates survival mission progress on wave start', () => {
    const mission = updateMissionOnWaveStart(createMissionForWave(1), 3);
    expect(mission.completed).toBe(true);
  });

  it('updates kill-based missions only for matching enemy classes', () => {
    const hunter = updateMissionOnEnemyDestroyed(createMissionForWave(2), 'drone');
    const unchanged = updateMissionOnEnemyDestroyed(createMissionForWave(2), 'tank');
    const demolition = updateMissionOnEnemyDestroyed(createMissionForWave(4), 'ship');

    expect(hunter.progress).toBe(1);
    expect(unchanged.progress).toBe(0);
    expect(demolition.progress).toBe(1);
  });
});
