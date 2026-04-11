import { describe, expect, it } from 'vitest';

import {
  combineControlSnapshots,
  createControlSnapshot,
  createInputState,
  readInputSnapshot,
  resetInputState,
  setKeyState,
} from './input.js';

describe('input state', () => {
  it('maps keys into a control snapshot', () => {
    const state = createInputState();
    setKeyState(state, 'KeyW', true);
    setKeyState(state, 'KeyD', true);
    setKeyState(state, 'ArrowLeft', true);
    setKeyState(state, 'Space', true);
    setKeyState(state, 'KeyM', true);
    setKeyState(state, 'KeyP', true);

    const snapshot = readInputSnapshot(state);
    expect(snapshot.thrust).toBe(1);
    expect(snapshot.yaw).toBe(1);
    expect(snapshot.strafe).toBe(-1);
    expect(snapshot.fire).toBe(true);
    expect(snapshot.mutePressed).toBe(true);
    expect(snapshot.pausePressed).toBe(true);
    expect(readInputSnapshot(state).mutePressed).toBe(false);
    expect(readInputSnapshot(state).pausePressed).toBe(false);
  });

  it('resets held keys cleanly', () => {
    const state = createInputState();
    setKeyState(state, 'KeyW', true);
    setKeyState(state, 'Space', true);
    resetInputState(state);
    const snapshot = readInputSnapshot(state);
    expect(snapshot.thrust).toBe(0);
    expect(snapshot.fire).toBe(false);
  });

  it('combines keyboard and mobile snapshots without exceeding analog bounds', () => {
    const combined = combineControlSnapshots(
      createControlSnapshot({ thrust: 1, yaw: 0.75, fire: true }),
      createControlSnapshot({ thrust: 0.5, yaw: -0.25, pausePressed: true }),
    );

    expect(combined.thrust).toBe(1);
    expect(combined.yaw).toBe(0.5);
    expect(combined.fire).toBe(true);
    expect(combined.pausePressed).toBe(true);
  });
});
