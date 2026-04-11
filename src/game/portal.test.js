import { describe, expect, it } from 'vitest';

import { getPortalContext } from './portal.js';

describe('portal context', () => {
  it('treats all non-portal params as optional', () => {
    expect(getPortalContext('?portal=true')).toMatchObject({
      active: true,
      ref: null,
      username: '',
      color: '8af4ff',
      hp: null,
      speed: 0,
      speedX: 0,
      speedY: 0,
      speedZ: 0,
      rotationY: Math.PI,
    });
  });

  it('parses forwarded continuity values when present', () => {
    const context = getPortalContext(
      '?portal=true&ref=https%3A%2F%2Fexample.com&username=ace&color=red&hp=75&speed=9&speed_x=1.5&speed_y=2.5&speed_z=3.5&rotation_y=1.2&team=blue',
    );

    expect(context).toMatchObject({
      active: true,
      ref: 'https://example.com',
      username: 'ace',
      color: 'red',
      hp: 75,
      speed: 9,
      speedX: 1.5,
      speedY: 2.5,
      speedZ: 3.5,
      rotationY: 1.2,
      team: 'blue',
    });
  });

  it('clamps health into the supported range', () => {
    expect(getPortalContext('?portal=true&hp=150').hp).toBe(100);
    expect(getPortalContext('?portal=true&hp=-5').hp).toBe(1);
  });
});
