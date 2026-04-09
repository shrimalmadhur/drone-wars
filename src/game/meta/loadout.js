export const DEFAULT_LOADOUT = Object.freeze({
  ability: 'pulse',
  mutator: null,
});

export function sanitizeLoadout(loadout) {
  return {
    ability: typeof loadout?.ability === 'string' ? loadout.ability : DEFAULT_LOADOUT.ability,
    mutator: typeof loadout?.mutator === 'string' ? loadout.mutator : DEFAULT_LOADOUT.mutator,
  };
}

export function sanitizePreRunSelection(selection) {
  return {
    mutator: typeof selection?.mutator === 'string' ? selection.mutator : null,
  };
}
