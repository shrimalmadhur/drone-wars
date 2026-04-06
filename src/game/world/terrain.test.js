import { describe, expect, it } from 'vitest';

import { getBiomeAt, getGroundHeightAt } from './terrain.js';

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
});
