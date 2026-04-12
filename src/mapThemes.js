export const MAP_THEMES = {
  FRONTIER: 'frontier',
  CITY: 'city',
};

export const DEFAULT_MAP_THEME = MAP_THEMES.FRONTIER;

export const MAP_THEME_DETAILS = {
  [MAP_THEMES.FRONTIER]: {
    label: 'Frontier Archipelago',
    blurb: 'Emerald ridgelines, coves, and naval routes.',
    gameplaySummary: 'Longer radar reach, more airborne contacts, lighter hazard pressure.',
    gameplay: {
      radarRangeMultiplier: 1.08,
      pickupSpawnIntervalMultiplier: 0.94,
      hazardCountBonus: -1,
      hazardRadiusMultiplier: 0.92,
      waveBias: 'airborne',
    },
  },
  [MAP_THEMES.CITY]: {
    label: 'Siege City',
    blurb: 'Dense towers, traffic, crowds, and rooftop helicopters.',
    gameplaySummary: 'Tighter radar, heavier armor columns, denser hazards and salvage.',
    gameplay: {
      radarRangeMultiplier: 0.92,
      pickupSpawnIntervalMultiplier: 0.88,
      hazardCountBonus: 1,
      hazardRadiusMultiplier: 1.08,
      waveBias: 'heavy',
    },
  },
};

export function sanitizeMapTheme(theme) {
  return Object.hasOwn(MAP_THEME_DETAILS, theme)
    ? theme
    : DEFAULT_MAP_THEME;
}

export function getMapThemeGameplay(theme) {
  const sanitized = sanitizeMapTheme(theme);
  return MAP_THEME_DETAILS[sanitized].gameplay;
}
