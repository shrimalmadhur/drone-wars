import { AUDIO_CONSTANTS } from './constants.js';

const NOISE_CACHE = new WeakMap();

function disconnectNodes(...nodes) {
  for (const node of nodes) {
    node?.disconnect?.();
  }
}

function cacheNoiseBuffer(context, duration) {
  let cache = NOISE_CACHE.get(context);
  if (!cache) {
    cache = new Map();
    NOISE_CACHE.set(context, cache);
  }
  if (cache.has(duration)) {
    return cache.get(duration);
  }

  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2) - 1;
  }
  cache.set(duration, buffer);
  return buffer;
}

function scheduleDisconnect(source, ...nodes) {
  source.onended = () => disconnectNodes(source, ...nodes);
}

function rampGain(gainParam, now, peak, attack, release) {
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(0.0001, now);
  gainParam.linearRampToValueAtTime(peak, now + attack);
  gainParam.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function setFrequency(param, now, frequency, endFrequency, duration) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(frequency, now);
  if (endFrequency !== undefined) {
    param.exponentialRampToValueAtTime(Math.max(0.001, endFrequency), now + duration);
  }
}

function createToneBurst(context, destination, {
  type = 'sine',
  frequency,
  endFrequency,
  peak = 0.2,
  attack = 0.005,
  release = 0.12,
  filter = null,
  startAt = 0,
  detune = 0,
} = {}) {
  const now = context.currentTime + startAt;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  let output = gain;
  let filterNode = null;

  oscillator.type = type;
  oscillator.detune.value = detune;
  setFrequency(oscillator.frequency, now, frequency, endFrequency, attack + release);

  if (filter) {
    filterNode = context.createBiquadFilter();
    filterNode.type = filter.type ?? 'lowpass';
    filterNode.frequency.setValueAtTime(filter.frequency, now);
    filterNode.Q.value = filter.q ?? 1;
    oscillator.connect(filterNode);
    filterNode.connect(gain);
  } else {
    oscillator.connect(gain);
  }

  gain.connect(destination);
  rampGain(gain.gain, now, peak, attack, release);
  oscillator.start(now);
  oscillator.stop(now + attack + release + 0.02);
  scheduleDisconnect(oscillator, gain, filterNode);

  return attack + release;
}

function createNoiseBurst(context, destination, {
  duration = 0.2,
  peak = 0.2,
  attack = 0.003,
  release = 0.12,
  filter = null,
  startAt = 0,
  playbackRate = 1,
} = {}) {
  const now = context.currentTime + startAt;
  const source = context.createBufferSource();
  const gain = context.createGain();
  let filterNode = null;

  source.buffer = cacheNoiseBuffer(context, Math.max(duration, 0.25));
  source.playbackRate.setValueAtTime(playbackRate, now);

  if (filter) {
    filterNode = context.createBiquadFilter();
    filterNode.type = filter.type ?? 'bandpass';
    filterNode.frequency.setValueAtTime(filter.frequency, now);
    filterNode.Q.value = filter.q ?? 0.8;
    source.connect(filterNode);
    filterNode.connect(gain);
  } else {
    source.connect(gain);
  }

  gain.connect(destination);
  rampGain(gain.gain, now, peak, attack, release);
  source.start(now);
  source.stop(now + duration);
  scheduleDisconnect(source, gain, filterNode);

  return duration;
}

function createToneSequence(context, destination, notes, options = {}) {
  let elapsed = 0;
  for (const note of notes) {
    createToneBurst(context, destination, {
      ...options,
      frequency: note.frequency,
      endFrequency: note.endFrequency,
      peak: note.peak ?? options.peak,
      attack: note.attack ?? options.attack,
      release: note.release ?? options.release,
      type: note.type ?? options.type,
      filter: note.filter ?? options.filter,
      startAt: elapsed + (note.offset ?? 0),
    });
    elapsed += note.spacing ?? (note.attack ?? options.attack ?? 0.01) + (note.release ?? options.release ?? 0.12);
  }
  return elapsed;
}

export function playPlayerFire(context, destination) {
  createNoiseBurst(context, destination, {
    duration: 0.035,
    peak: 0.12,
    attack: 0.001,
    release: 0.028,
    filter: { type: 'bandpass', frequency: 3400, q: 2.2 },
  });
  createToneBurst(context, destination, {
    type: 'square',
    frequency: 1480,
    endFrequency: 820,
    peak: 0.09,
    attack: 0.001,
    release: 0.045,
    filter: { type: 'bandpass', frequency: 2100, q: 1.6 },
  });
  return createToneBurst(context, destination, {
    type: 'triangle',
    frequency: 180,
    endFrequency: 110,
    peak: 0.028,
    attack: 0.001,
    release: 0.05,
    filter: { type: 'lowpass', frequency: 520, q: 0.9 },
  });
}

export function playEnemyFire(context, destination) {
  createNoiseBurst(context, destination, {
    duration: 0.03,
    peak: 0.07,
    attack: 0.001,
    release: 0.025,
    filter: { type: 'bandpass', frequency: 1800, q: 1.4 },
  });
  return createToneBurst(context, destination, {
    type: 'square',
    frequency: 420,
    endFrequency: 250,
    peak: 0.08,
    attack: 0.001,
    release: 0.055,
    filter: { type: 'bandpass', frequency: 900, q: 1.1 },
  });
}

export function playImpact(context, destination) {
  createNoiseBurst(context, destination, {
    duration: 0.12,
    peak: 0.14,
    attack: 0.002,
    release: 0.08,
    filter: { type: 'bandpass', frequency: 2200, q: 1.1 },
  });
  return createToneBurst(context, destination, {
    type: 'triangle',
    frequency: 120,
    endFrequency: 72,
    peak: 0.1,
    attack: 0.002,
    release: 0.12,
    filter: { type: 'lowpass', frequency: 420, q: 0.8 },
  });
}

export function playPlayerHit(context, destination) {
  createNoiseBurst(context, destination, {
    duration: 0.22,
    peak: 0.18,
    attack: 0.003,
    release: 0.18,
    filter: { type: 'lowpass', frequency: 900, q: 1.2 },
    playbackRate: 0.85,
  });
  return createToneBurst(context, destination, {
    type: 'sawtooth',
    frequency: 84,
    endFrequency: 44,
    peak: 0.11,
    attack: 0.01,
    release: 0.28,
    filter: { type: 'lowpass', frequency: 260, q: 1.3 },
  });
}

export function playExplosion(context, destination) {
  createNoiseBurst(context, destination, {
    duration: 0.35,
    peak: 0.28,
    attack: 0.002,
    release: 0.32,
    filter: { type: 'bandpass', frequency: 780, q: 0.75 },
  });
  return createToneBurst(context, destination, {
    type: 'triangle',
    frequency: 76,
    endFrequency: 34,
    peak: 0.18,
    attack: 0.008,
    release: 0.58,
    filter: { type: 'lowpass', frequency: 240, q: 1.4 },
  });
}

export function playMissileFlyby(context, destination) {
  return createToneBurst(context, destination, {
    type: 'sine',
    frequency: 840,
    endFrequency: 210,
    peak: 0.08,
    attack: 0.01,
    release: 0.32,
    filter: { type: 'bandpass', frequency: 1400, q: 2.4 },
  });
}

export function playLockOn(context, destination) {
  return createToneSequence(context, destination, [
    { frequency: 740, endFrequency: 860, peak: 0.08, attack: 0.005, release: 0.06, spacing: 0.08 },
    { frequency: 920, endFrequency: 1180, peak: 0.08, attack: 0.005, release: 0.07, spacing: 0.08 },
  ], {
    type: 'sine',
    filter: { type: 'lowpass', frequency: 1800, q: 0.8 },
  });
}

export function playWaveComplete(context, destination) {
  return createToneSequence(context, destination, [
    { frequency: 392, peak: 0.09, attack: 0.01, release: 0.18, spacing: 0.14 },
    { frequency: 523.25, peak: 0.1, attack: 0.01, release: 0.2, spacing: 0.16 },
    { frequency: 659.25, peak: 0.12, attack: 0.01, release: 0.3, spacing: 0.18 },
  ], {
    type: 'sine',
  });
}

export function playGameOver(context, destination) {
  const now = context.currentTime;
  const frequencies = [293.66, 349.23, 440];
  for (const [index, frequency] of frequencies.entries()) {
    createToneBurst(context, destination, {
      type: 'triangle',
      frequency,
      endFrequency: frequency * 0.45,
      peak: 0.08,
      attack: 0.01,
      release: 0.7,
      startAt: index * 0.02,
      filter: { type: 'lowpass', frequency: 640, q: 0.9 },
    });
  }
  const rumble = context.createOscillator();
  const rumbleGain = context.createGain();
  rumble.type = 'sine';
  rumble.frequency.setValueAtTime(42, now);
  rumble.frequency.exponentialRampToValueAtTime(24, now + 1.1);
  rumble.connect(rumbleGain);
  rumbleGain.connect(destination);
  rampGain(rumbleGain.gain, now, 0.08, 0.03, 1.15);
  rumble.start(now);
  rumble.stop(now + 1.2);
  scheduleDisconnect(rumble, rumbleGain);
  return 1.2;
}

export function playLowHealthWarning(context, destination) {
  return createToneBurst(context, destination, {
    type: 'square',
    frequency: 620,
    endFrequency: 580,
    peak: 0.05,
    attack: 0.004,
    release: 0.09,
    filter: { type: 'bandpass', frequency: 1400, q: 2 },
  });
}

export function createEngineHum(context, destination, pitchRange) {
  const baseOscillator = context.createOscillator();
  const lowHarmonicOscillator = context.createOscillator();
  const presenceOscillator = context.createOscillator();
  const whineOscillator = context.createOscillator();
  const shimmerOscillator = context.createOscillator();
  const airOscillator = context.createOscillator();
  const noiseSource = context.createBufferSource();
  const baseGain = context.createGain();
  const lowHarmonicGain = context.createGain();
  const presenceGain = context.createGain();
  const whineGain = context.createGain();
  const shimmerGain = context.createGain();
  const airGain = context.createGain();
  const noiseGain = context.createGain();
  const noiseBandpass = context.createBiquadFilter();
  const tonalBandpass = context.createBiquadFilter();
  const highpass = context.createBiquadFilter();
  const flutterLfo = context.createOscillator();
  const flutterDepth = context.createGain();
  const noiseFlutterLfo = context.createOscillator();
  const noiseFlutterDepth = context.createGain();
  const gain = context.createGain();

  baseOscillator.type = 'sine';
  lowHarmonicOscillator.type = 'triangle';
  presenceOscillator.type = 'triangle';
  whineOscillator.type = 'sawtooth';
  shimmerOscillator.type = 'triangle';
  airOscillator.type = 'sine';
  noiseSource.buffer = cacheNoiseBuffer(context, AUDIO_CONSTANTS.wind.noiseDuration);
  noiseSource.loop = true;
  tonalBandpass.type = 'bandpass';
  tonalBandpass.Q.value = 1.4;
  noiseBandpass.type = 'bandpass';
  noiseBandpass.Q.value = 0.9;
  highpass.type = 'highpass';
  highpass.frequency.value = AUDIO_CONSTANTS.engine.highpassCutoff;
  flutterLfo.type = 'sine';
  flutterLfo.frequency.value = AUDIO_CONSTANTS.engine.flutterRate;
  flutterDepth.gain.value = AUDIO_CONSTANTS.engine.flutterDepth;
  noiseFlutterLfo.type = 'sine';
  noiseFlutterLfo.frequency.value = AUDIO_CONSTANTS.engine.noiseFlutterRate;
  noiseFlutterDepth.gain.value = AUDIO_CONSTANTS.engine.noiseFlutterDepth;
  gain.gain.value = AUDIO_CONSTANTS.engine.gain;
  baseGain.gain.value = AUDIO_CONSTANTS.engine.lowGain;
  lowHarmonicGain.gain.value = AUDIO_CONSTANTS.engine.lowGain * 0.85;
  presenceGain.gain.value = AUDIO_CONSTANTS.engine.presenceGain;
  whineGain.gain.value = AUDIO_CONSTANTS.engine.whineGain;
  shimmerGain.gain.value = AUDIO_CONSTANTS.engine.shimmerGain;
  airGain.gain.value = AUDIO_CONSTANTS.engine.shimmerGain * 0.55;
  noiseGain.gain.value = AUDIO_CONSTANTS.engine.noiseGain;

  baseOscillator.connect(baseGain);
  lowHarmonicOscillator.connect(lowHarmonicGain);
  presenceOscillator.connect(presenceGain);
  whineOscillator.connect(whineGain);
  shimmerOscillator.connect(shimmerGain);
  airOscillator.connect(airGain);
  noiseSource.connect(noiseBandpass);
  noiseBandpass.connect(noiseGain);
  baseGain.connect(tonalBandpass);
  lowHarmonicGain.connect(tonalBandpass);
  presenceGain.connect(tonalBandpass);
  whineGain.connect(tonalBandpass);
  shimmerGain.connect(tonalBandpass);
  airGain.connect(tonalBandpass);
  tonalBandpass.connect(highpass);
  noiseGain.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  flutterLfo.connect(flutterDepth);
  flutterDepth.connect(presenceGain.gain);
  flutterDepth.connect(whineGain.gain);
  noiseFlutterLfo.connect(noiseFlutterDepth);
  noiseFlutterDepth.connect(noiseGain.gain);

  baseOscillator.start();
  lowHarmonicOscillator.start();
  presenceOscillator.start();
  whineOscillator.start();
  shimmerOscillator.start();
  airOscillator.start();
  noiseSource.start();
  flutterLfo.start();
  noiseFlutterLfo.start();

  const setSpeed = (normalized) => {
    const clamped = Math.min(Math.max(normalized, 0), 1);
    const pitch = pitchRange.min + (pitchRange.max - pitchRange.min) * clamped;
    const now = context.currentTime;
    baseOscillator.frequency.setTargetAtTime(AUDIO_CONSTANTS.engine.baseFrequency * pitch, now, 0.08);
    lowHarmonicOscillator.frequency.setTargetAtTime(AUDIO_CONSTANTS.engine.lowHarmonicFrequency * pitch, now, 0.08);
    presenceOscillator.frequency.setTargetAtTime(AUDIO_CONSTANTS.engine.presenceFrequency * pitch, now, 0.08);
    whineOscillator.frequency.setTargetAtTime(AUDIO_CONSTANTS.engine.whineFrequency * pitch, now, 0.08);
    shimmerOscillator.frequency.setTargetAtTime(AUDIO_CONSTANTS.engine.shimmerFrequency * pitch, now, 0.08);
    airOscillator.frequency.setTargetAtTime((AUDIO_CONSTANTS.engine.shimmerFrequency + 540) * pitch, now, 0.08);
    tonalBandpass.frequency.setTargetAtTime(
      AUDIO_CONSTANTS.engine.filterBase + AUDIO_CONSTANTS.engine.filterRange * clamped,
      now,
      0.12,
    );
    noiseBandpass.frequency.setTargetAtTime(
      AUDIO_CONSTANTS.engine.noiseBandBase + AUDIO_CONSTANTS.engine.noiseBandRange * clamped,
      now,
      0.16,
    );
  };

  setSpeed(0);

  return {
    setSpeed,
    stop() {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value || AUDIO_CONSTANTS.engine.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      baseOscillator.stop(now + 0.1);
      lowHarmonicOscillator.stop(now + 0.1);
      presenceOscillator.stop(now + 0.1);
      whineOscillator.stop(now + 0.1);
      shimmerOscillator.stop(now + 0.1);
      airOscillator.stop(now + 0.1);
      noiseSource.stop(now + 0.1);
      flutterLfo.stop(now + 0.1);
      noiseFlutterLfo.stop(now + 0.1);
      scheduleDisconnect(
        baseOscillator,
        lowHarmonicOscillator,
        presenceOscillator,
        whineOscillator,
        shimmerOscillator,
        airOscillator,
        noiseSource,
        flutterLfo,
        flutterDepth,
        noiseFlutterLfo,
        noiseFlutterDepth,
        baseGain,
        lowHarmonicGain,
        presenceGain,
        whineGain,
        shimmerGain,
        airGain,
        noiseGain,
        noiseBandpass,
        tonalBandpass,
        highpass,
        gain,
      );
    },
  };
}

export function createWindLoop(context, destination) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();

  source.buffer = cacheNoiseBuffer(context, AUDIO_CONSTANTS.wind.noiseDuration);
  source.loop = true;
  filter.type = 'lowpass';
  filter.frequency.value = AUDIO_CONSTANTS.wind.filterBase;
  gain.gain.value = AUDIO_CONSTANTS.wind.gain;
  lfo.type = 'sine';
  lfo.frequency.value = AUDIO_CONSTANTS.wind.lfoRate;
  lfoDepth.gain.value = AUDIO_CONSTANTS.wind.filterDepth;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);

  source.start();
  lfo.start();

  return {
    stop() {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value || AUDIO_CONSTANTS.wind.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      source.stop(now + 0.14);
      lfo.stop(now + 0.14);
      scheduleDisconnect(source, filter, gain, lfo, lfoDepth);
    },
  };
}
