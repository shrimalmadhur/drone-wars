export const MUTATOR_DEFINITIONS = Object.freeze({
  highRisk: {
    id: 'highRisk',
    label: 'High Risk',
    summary: 'Faster hostiles and richer salvage payouts.',
    detail: '+18% enemy speed, +35% salvage',
  },
  scavenger: {
    id: 'scavenger',
    label: 'Scavenger',
    summary: 'More frequent pickups at the cost of a lighter hull.',
    detail: '+45% pickup frequency, -20 hull',
  },
  pulsePilot: {
    id: 'pulsePilot',
    label: 'Pulse Pilot',
    summary: 'EMP specialist loadout with weaker primary weapons.',
    detail: '-40% EMP cooldown, -22% weapon damage',
  },
});

export const DEFAULT_MUTATOR = MUTATOR_DEFINITIONS.highRisk.id;

export function sanitizeMutatorId(mutatorId = DEFAULT_MUTATOR) {
  return typeof mutatorId === 'string' && MUTATOR_DEFINITIONS[mutatorId]
    ? mutatorId
    : DEFAULT_MUTATOR;
}

export function getMutatorDefinition(mutatorId) {
  return MUTATOR_DEFINITIONS[sanitizeMutatorId(mutatorId)];
}
