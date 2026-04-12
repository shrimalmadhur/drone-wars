import { describe, expect, it } from 'vitest';

import {
  classifyEnemyForMissions,
  createMissionForRun,
  createMissionForWave,
  updateMissionOnEnemyDestroyed,
  updateMissionOnPickupCollected,
  updateMissionOnWaveCleared,
  updateMissionOnWaveStart,
  updateMissionOnWaveStartWithRng,
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

  it('creates salvager and priority strike missions for later milestone waves', () => {
    expect(createMissionForWave(3)).toMatchObject({
      id: 'salvager',
      target: 4,
    });
    expect(createMissionForWave(6)).toMatchObject({
      id: 'priorityStrike',
      target: 3,
    });
  });

  it('selects one run mission from the supported mission pool', () => {
    expect(createMissionForRun(() => 0)).toMatchObject({ id: 'survival' });
    expect(createMissionForRun(() => 0.25)).toMatchObject({ id: 'hunter' });
    expect(createMissionForRun(() => 0.4)).toMatchObject({ id: 'demolition' });
    expect(createMissionForRun(() => 0.9)).toMatchObject({ id: 'priorityStrike' });
  });

  it('classifies mission enemy groups deterministically', () => {
    expect(classifyEnemyForMissions('drone')).toEqual({ airborne: true, heavy: false, specialist: false, missile: false });
    expect(classifyEnemyForMissions('tank')).toEqual({ airborne: false, heavy: true, specialist: false, missile: false });
    expect(classifyEnemyForMissions('boss')).toEqual({ airborne: true, heavy: true, specialist: true, missile: false });
  });

  it('updates survival mission progress on wave start', () => {
    const mission = updateMissionOnWaveStart(createMissionForWave(1), 3);
    expect(mission.id).toBe('hunter');
    expect(mission.chainDepth).toBe(1);
    expect(mission.completedContract).toMatchObject({ id: 'survival' });
  });

  it('updates kill-based missions only for matching enemy classes', () => {
    const hunter = updateMissionOnEnemyDestroyed(createMissionForWave(2), 'drone');
    const unchanged = updateMissionOnEnemyDestroyed(createMissionForWave(2), 'tank');
    const demolition = updateMissionOnEnemyDestroyed(createMissionForWave(4), 'ship');
    const priority = updateMissionOnEnemyDestroyed(createMissionForWave(6), 'droneSupport');

    expect(hunter.progress).toBe(1);
    expect(unchanged.progress).toBe(0);
    expect(demolition.progress).toBe(1);
    expect(priority.progress).toBe(1);
  });

  it('assigns a rotating bonus objective when a new wave starts', () => {
    const mission = updateMissionOnWaveStartWithRng(createMissionForWave(2), 2, () => 0);

    expect(mission.bonusObjective).toMatchObject({
      id: 'cleanSweep',
      wave: 2,
    });
  });

  it('updates pickup-based bonus objectives independently of the primary mission', () => {
    const mission = updateMissionOnWaveStartWithRng(createMissionForWave(2), 3, () => 0.6);
    const progressed = updateMissionOnPickupCollected(updateMissionOnPickupCollected(mission));

    expect(progressed.bonusObjective).toMatchObject({
      id: 'scavengeRun',
      progress: 2,
      completed: true,
    });
    expect(progressed.progress).toBe(0);
  });

  it('advances salvager missions from pickup collection and chains into a follow-up contract', () => {
    let mission = createMissionForWave(3);
    mission = updateMissionOnPickupCollected(mission);
    mission = updateMissionOnPickupCollected(mission);
    mission = updateMissionOnPickupCollected(mission);
    mission = updateMissionOnPickupCollected(mission);

    expect(mission.id).toBe('priorityStrike');
    expect(mission.chainDepth).toBe(1);
    expect(mission.completedContract).toMatchObject({
      id: 'salvager',
      rewardScore: 220,
    });
  });

  it('can assign specialist and missile bonus objectives on later waves', () => {
    const priorityBonus = updateMissionOnWaveStartWithRng(createMissionForWave(4), 4, () => 0.8);
    const missileBonus = updateMissionOnWaveStartWithRng(createMissionForWave(4), 4, () => 0.99);

    expect(priorityBonus.bonusObjective?.id).toBe('priorityTarget');
    expect(missileBonus.bonusObjective?.id).toBe('missileScreen');
  });

  it('completes clean-sweep bonus objectives when a wave ends without damage', () => {
    const mission = updateMissionOnWaveStartWithRng(createMissionForWave(1), 2, () => 0);
    const completed = updateMissionOnWaveCleared(mission, 0);

    expect(completed.bonusObjective?.completed).toBe(true);
  });
});
