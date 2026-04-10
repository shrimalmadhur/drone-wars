import { DEFAULT_ABILITY, sanitizeAbilityId } from './abilities.js';

export const DEFAULT_LOADOUT = Object.freeze({
  ability: DEFAULT_ABILITY,
  mutator: null,
});

export function sanitizeLoadout(loadout) {
  return {
    ability: sanitizeAbilityId(loadout?.ability),
    mutator: typeof loadout?.mutator === 'string' ? loadout.mutator : DEFAULT_LOADOUT.mutator,
  };
}

export function sanitizePreRunSelection(selection) {
  return {
    mutator: typeof selection?.mutator === 'string' ? selection.mutator : null,
  };
}
