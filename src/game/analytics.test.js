import { describe, expect, it, vi } from 'vitest';

import { trackRunCompleted, trackRunStarted, trackUpgradePurchased } from './analytics.js';

describe('analytics', () => {
  it('is a safe no-op when gtag is unavailable', () => {
    const previousGtag = globalThis.gtag;
    const previousWindow = globalThis.window;
    delete globalThis.gtag;
    delete globalThis.window;

    expect(() => {
      trackRunStarted({ runId: 'run-1' });
      trackRunCompleted({ runId: 'run-1' });
    }).not.toThrow();

    globalThis.gtag = previousGtag;
    globalThis.window = previousWindow;
  });

  it('forwards events when gtag is present', () => {
    const gtag = vi.fn();
    const previousGtag = globalThis.gtag;
    globalThis.gtag = gtag;

    trackUpgradePurchased({ profileId: 'pilot-1', upgradeId: 'hull', newLevel: 1, cost: 120 });

    expect(gtag).toHaveBeenCalledWith('event', 'upgrade_purchased', expect.objectContaining({
      profile_id: 'pilot-1',
      upgrade_id: 'hull',
      new_level: 1,
      upgrade_cost: 120,
    }));

    globalThis.gtag = previousGtag;
  });
});
