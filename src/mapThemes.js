export const MAP_THEMES = {
  FRONTIER: 'frontier',
  CITY: 'city',
};

export const DEFAULT_MAP_THEME = MAP_THEMES.FRONTIER;

export const MAP_THEME_DETAILS = {
  [MAP_THEMES.FRONTIER]: {
    label: 'Frontier Archipelago',
    blurb: 'Emerald ridgelines, coves, and naval routes.',
  },
  [MAP_THEMES.CITY]: {
    label: 'Siege City',
    blurb: 'Dense towers, traffic, crowds, and rooftop helicopters.',
  },
};

export function sanitizeMapTheme(theme) {
  return Object.hasOwn(MAP_THEME_DETAILS, theme)
    ? theme
    : DEFAULT_MAP_THEME;
}
