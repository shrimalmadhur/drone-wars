export const ARCHETYPE_DEFINITIONS = Object.freeze({
  control: {
    id: 'control',
    label: 'Control Pilot',
    summary: 'Sharper EMP control with steadier handling and lighter gun damage.',
    detail: '-12% weapon damage, -22% EMP cooldown, +10% radar reach',
  },
  interceptor: {
    id: 'interceptor',
    label: 'Interceptor',
    summary: 'Faster flight and shorter dash cycles for aggressive pursuit.',
    detail: '+14% flight speed, +12% yaw, -18% dash cooldown',
  },
  bruiser: {
    id: 'bruiser',
    label: 'Bruiser',
    summary: 'Heavier armor and stronger gun bursts at the cost of agility.',
    detail: '+24 hull, +14% weapon damage, -10% flight speed',
  },
});

export const DEFAULT_ARCHETYPE = ARCHETYPE_DEFINITIONS.control.id;

export function sanitizeArchetypeId(archetypeId = DEFAULT_ARCHETYPE) {
  return typeof archetypeId === 'string' && ARCHETYPE_DEFINITIONS[archetypeId]
    ? archetypeId
    : DEFAULT_ARCHETYPE;
}

export function getArchetypeDefinition(archetypeId) {
  return ARCHETYPE_DEFINITIONS[sanitizeArchetypeId(archetypeId)];
}
