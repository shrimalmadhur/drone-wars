import { describe, expect, it } from 'vitest';

import { clamp, createRng, segmentIntersectsSphere } from './math.js';

describe('math helpers', () => {
  it('clamps values into range', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it('creates deterministic RNG sequences', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('detects segment and sphere intersections', () => {
    expect(
      segmentIntersectsSphere(
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
        1,
      ),
    ).toBe(true);
    expect(
      segmentIntersectsSphere(
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 5, y: 3, z: 0 },
        1,
      ),
    ).toBe(false);
  });
});
