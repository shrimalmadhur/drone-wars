import { describe, expect, it } from 'vitest';

import { findAimAssistTarget } from './math.js';

describe('aim assist target selection', () => {
  it('prefers aligned targets in front of the camera', () => {
    const target = findAimAssistTarget(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      [
        { type: 'tank', position: { x: 20, y: 0, z: 30 } },
        { type: 'drone', position: { x: 0, y: 0, z: 45 } },
      ],
      { minDot: 0.8 },
    );

    expect(target.type).toBe('drone');
  });

  it('ignores targets behind or outside the lock cone', () => {
    const target = findAimAssistTarget(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      [{ type: 'ship', position: { x: 40, y: 0, z: -20 } }],
      { minDot: 0.9 },
    );

    expect(target).toBeNull();
  });
});
