import { CONFIG } from '../config.js';
import { getMutatorDefinition, sanitizeMutatorId } from './mutators.js';
import { DEFAULT_UPGRADES, sanitizeUpgradeLevels } from './upgrades.js';

export function createDefaultRunModifiers() {
  const defaultMutator = getMutatorDefinition(sanitizeMutatorId());
  return {
    maxHealth: CONFIG.player.maxHealth,
    pulseCooldown: CONFIG.player.pulseCooldown,
    collectionRadius: CONFIG.powerUps.collectionRadius,
    spreadAngle: CONFIG.player.spreadAngle,
    playerDamageMultiplier: 1,
    pickupSpawnIntervalMultiplier: 1,
    rewardMultiplier: 1,
    enemySpeedMultiplier: 1,
    enemyProjectileSpeedMultiplier: 1,
    mutatorId: defaultMutator.id,
    mutatorLabel: defaultMutator.label,
    mutatorSummary: defaultMutator.summary,
  };
}

export function createRunModifiers(progress) {
  const modifiers = createDefaultRunModifiers();
  const upgrades = sanitizeUpgradeLevels(progress?.upgrades ?? DEFAULT_UPGRADES);
  const mutator = getMutatorDefinition(progress?.preRunSelection?.mutator ?? progress?.loadout?.mutator);

  modifiers.maxHealth += upgrades.hull * 12;
  modifiers.pulseCooldown = Math.max(4, modifiers.pulseCooldown - upgrades.pulse * 0.85);
  modifiers.collectionRadius += upgrades.magnet * 1.6;
  modifiers.spreadAngle = Math.max(0.07, modifiers.spreadAngle - upgrades.stabilizer * 0.018);
  modifiers.mutatorId = mutator.id;
  modifiers.mutatorLabel = mutator.label;
  modifiers.mutatorSummary = mutator.summary;

  if (mutator.id === 'highRisk') {
    modifiers.enemySpeedMultiplier = 1.18;
    modifiers.enemyProjectileSpeedMultiplier = 1.08;
    modifiers.rewardMultiplier = 1.35;
  } else if (mutator.id === 'scavenger') {
    modifiers.maxHealth = Math.max(55, modifiers.maxHealth - 20);
    modifiers.pickupSpawnIntervalMultiplier = 0.69;
    modifiers.rewardMultiplier = 1.2;
  } else if (mutator.id === 'pulsePilot') {
    modifiers.pulseCooldown = Math.max(2.8, modifiers.pulseCooldown * 0.6);
    modifiers.playerDamageMultiplier = 0.78;
    modifiers.rewardMultiplier = 1.15;
  }

  return modifiers;
}
