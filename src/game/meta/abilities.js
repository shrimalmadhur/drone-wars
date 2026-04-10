export const ABILITY_DEFINITIONS = Object.freeze({
  pulse: {
    id: 'pulse',
    label: 'EMP Pulse',
    summary: 'Close-range EMP blast that damages nearby enemies.',
    unlockWave: 0,
  },
  dash: {
    id: 'dash',
    label: 'Vector Dash',
    summary: 'Short evasive burst with brief invulnerability.',
    unlockWave: 4,
  },
});

export const DEFAULT_ABILITY = ABILITY_DEFINITIONS.pulse.id;

export function sanitizeAbilityId(abilityId) {
  return typeof abilityId === 'string' && ABILITY_DEFINITIONS[abilityId]
    ? abilityId
    : DEFAULT_ABILITY;
}

export function getAbilityDefinition(abilityId) {
  return ABILITY_DEFINITIONS[sanitizeAbilityId(abilityId)];
}

export function isAbilityUnlocked(abilityId, progress) {
  const definition = getAbilityDefinition(abilityId);
  return Math.max(0, Number(progress?.bestWave) || 0) >= definition.unlockWave;
}

export function getUnlockedAbilities(progress) {
  return Object.values(ABILITY_DEFINITIONS)
    .filter((ability) => isAbilityUnlocked(ability.id, progress));
}
