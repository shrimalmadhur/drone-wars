import { CONFIG } from '../config.js';
import { DEFAULT_UPGRADES, sanitizeUpgradeLevels } from './upgrades.js';

export function createDefaultRunModifiers() {
  return {
    maxHealth: CONFIG.player.maxHealth,
    pulseCooldown: CONFIG.player.pulseCooldown,
    collectionRadius: CONFIG.powerUps.collectionRadius,
    spreadAngle: CONFIG.player.spreadAngle,
  };
}

export function createRunModifiers(progress) {
  const modifiers = createDefaultRunModifiers();
  const upgrades = sanitizeUpgradeLevels(progress?.upgrades ?? DEFAULT_UPGRADES);

  modifiers.maxHealth += upgrades.hull * 12;
  modifiers.pulseCooldown = Math.max(4, modifiers.pulseCooldown - upgrades.pulse * 0.85);
  modifiers.collectionRadius += upgrades.magnet * 1.6;
  modifiers.spreadAngle = Math.max(0.07, modifiers.spreadAngle - upgrades.stabilizer * 0.018);

  return modifiers;
}
