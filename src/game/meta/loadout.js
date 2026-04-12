import { DEFAULT_ABILITY, sanitizeAbilityId } from './abilities.js';
import { DEFAULT_ARCHETYPE, sanitizeArchetypeId } from './archetypes.js';
import { DEFAULT_MUTATOR, sanitizeMutatorId } from './mutators.js';

export const DEFAULT_LOADOUT = Object.freeze({
  archetype: DEFAULT_ARCHETYPE,
  ability: DEFAULT_ABILITY,
  mutator: DEFAULT_MUTATOR,
});

export function sanitizeLoadout(loadout) {
  return {
    archetype: sanitizeArchetypeId(loadout?.archetype),
    ability: sanitizeAbilityId(loadout?.ability),
    mutator: sanitizeMutatorId(loadout?.mutator),
  };
}

export function sanitizePreRunSelection(selection) {
  return {
    archetype: sanitizeArchetypeId(selection?.archetype),
    mutator: sanitizeMutatorId(selection?.mutator),
  };
}
