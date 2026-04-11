import { DEFAULT_ABILITY, sanitizeAbilityId } from './abilities.js';
import { DEFAULT_MUTATOR, sanitizeMutatorId } from './mutators.js';

export const DEFAULT_LOADOUT = Object.freeze({
  ability: DEFAULT_ABILITY,
  mutator: DEFAULT_MUTATOR,
});

export function sanitizeLoadout(loadout) {
  return {
    ability: sanitizeAbilityId(loadout?.ability),
    mutator: sanitizeMutatorId(loadout?.mutator),
  };
}

export function sanitizePreRunSelection(selection) {
  return {
    mutator: sanitizeMutatorId(selection?.mutator),
  };
}
