import { describe, expect, it } from 'vitest';

import { clamp, createRng, projectRadarContact, segmentIntersectsSphere } from './math.js';

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

  it('projects radar contacts into player-relative space', () => {
    const contact = projectRadarContact(
      { x: 0, y: 0, z: 0 },
      Math.PI / 2,
      { x: 12, y: 0, z: 0 },
      180,
    );

    expect(contact.lateral).toBeCloseTo(0);
    expect(contact.forward).toBeCloseTo(12);
    expect(contact.distance).toBe(12);
    expect(contact.outOfRange).toBe(false);
  });

  it('clamps off-range radar contacts to the radar edge while preserving bearing', () => {
    const contact = projectRadarContact(
      { x: 0, y: 0, z: 0 },
      0,
      { x: 90, y: 0, z: 240 },
      180,
    );

    expect(contact.distance).toBeCloseTo(Math.hypot(90, 240));
    expect(contact.outOfRange).toBe(true);
    expect(Math.hypot(contact.lateral, contact.forward)).toBeCloseTo(180);
    expect(contact.lateral / contact.forward).toBeCloseTo(90 / 240);
  });
});
