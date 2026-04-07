export const AUDIO_CONSTANTS = {
  missileFlybyDistance: 30,
  missileFlybyCooldown: 2,
  lowHealthIntervalMs: 800,
  panner: {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    rolloffFactor: 1.4,
  },
  engine: {
    baseFrequency: 54,
    harmonicFrequency: 82,
    filterBase: 240,
    filterRange: 480,
    gain: 0.05,
  },
  wind: {
    noiseDuration: 2,
    gain: 0.035,
    filterBase: 500,
    filterDepth: 900,
    lfoRate: 0.08,
  },
};
