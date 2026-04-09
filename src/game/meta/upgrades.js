export const UPGRADE_DEFINITIONS = {
  hull: {
    id: 'hull',
    label: 'Hull Plating',
    description: 'Increase max hull integrity for every run.',
    maxLevel: 3,
    costs: [120, 180, 260],
  },
  pulse: {
    id: 'pulse',
    label: 'Pulse Capacitors',
    description: 'Reduce pulse cooldown between EMP bursts.',
    maxLevel: 3,
    costs: [140, 220, 320],
  },
  magnet: {
    id: 'magnet',
    label: 'Pickup Magnet',
    description: 'Increase pickup collection radius.',
    maxLevel: 3,
    costs: [90, 140, 210],
  },
  stabilizer: {
    id: 'stabilizer',
    label: 'Spread Stabilizer',
    description: 'Tighten weapon spread for cleaner volleys.',
    maxLevel: 3,
    costs: [110, 170, 250],
  },
};

export const DEFAULT_UPGRADES = Object.freeze(
  Object.fromEntries(Object.keys(UPGRADE_DEFINITIONS).map((id) => [id, 0])),
);

export function sanitizeUpgradeLevels(levels) {
  const sanitized = { ...DEFAULT_UPGRADES };
  for (const [id, definition] of Object.entries(UPGRADE_DEFINITIONS)) {
    const value = Math.max(0, Math.min(definition.maxLevel, Number(levels?.[id]) || 0));
    sanitized[id] = value;
  }
  return sanitized;
}

export function getUpgradeDefinition(id) {
  return UPGRADE_DEFINITIONS[id] ?? null;
}

export function getUpgradeCost(id, currentLevel) {
  const definition = getUpgradeDefinition(id);
  if (!definition || currentLevel >= definition.maxLevel) {
    return null;
  }
  return definition.costs[currentLevel] ?? null;
}

export function canPurchaseUpgrade(progress, id) {
  const definition = getUpgradeDefinition(id);
  if (!definition) {
    return { ok: false, reason: 'Unknown upgrade.' };
  }

  const upgrades = sanitizeUpgradeLevels(progress?.upgrades);
  const currentLevel = upgrades[id];
  if (currentLevel >= definition.maxLevel) {
    return { ok: false, reason: 'Upgrade already maxed.' };
  }

  const cost = getUpgradeCost(id, currentLevel);
  const currency = Math.max(0, Number(progress?.currency) || 0);
  if (cost === null || currency < cost) {
    return { ok: false, reason: 'Insufficient salvage.' };
  }

  return { ok: true, cost, nextLevel: currentLevel + 1 };
}
