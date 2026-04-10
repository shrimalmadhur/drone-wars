import './style.css';
import { Game } from './game/Game.js';
import {
  trackGameStart,
  trackRunCompleted,
  trackRunRestartedFromSummary,
  trackRunStarted,
  trackRunSummaryViewed,
  trackUpgradePurchased,
} from './game/analytics.js';
import { createRunModifiers } from './game/meta/runModifiers.js';
import { ABILITY_DEFINITIONS, getUnlockedAbilities, isAbilityUnlocked } from './game/meta/abilities.js';
import { getUpgradeCost, UPGRADE_DEFINITIONS } from './game/meta/upgrades.js';
import { MAP_THEME_DETAILS } from './mapThemes.js';
import {
  loadMapTheme,
  loadPlayerName,
  loadPlayerProgress,
  purchaseUpgrade,
  recordRunComplete,
  recordRunStart,
  setEquippedAbility,
  saveMapTheme,
  savePlayerName,
} from './playerProfile.js';

const mount = document.querySelector('#app');
const startScreen = document.querySelector('#start-screen');
const startForm = document.querySelector('#start-form');
const playerNameInput = document.querySelector('#player-name-input');
const mapThemeInputs = Array.from(document.querySelectorAll('input[name="mapTheme"]'));
const abilityInputs = Array.from(document.querySelectorAll('input[name="ability"]'));
const abilityUnlockNote = document.querySelector('#ability-unlock-note');
const startCurrency = document.querySelector('#start-currency');
const hangarCurrency = document.querySelector('#hangar-currency');
const upgradeShop = document.querySelector('#upgrade-shop');
const mapThemeNote = document.querySelector('#map-theme-note');

const runSummary = document.querySelector('#run-summary');
const summaryScore = document.querySelector('#summary-score');
const summaryWave = document.querySelector('#summary-wave');
const summaryKills = document.querySelector('#summary-kills');
const summaryPickups = document.querySelector('#summary-pickups');
const summaryAchievements = document.querySelector('#summary-achievements');
const summaryCurrency = document.querySelector('#summary-currency');
const summaryMission = document.querySelector('#summary-mission');
const summaryAbility = document.querySelector('#summary-ability');
const summaryMissionFill = document.querySelector('#summary-mission-fill');
const summaryHeadline = document.querySelector('#summary-headline');
const summaryRerunButton = document.querySelector('#summary-rerun');
const summaryHangarButton = document.querySelector('#summary-hangar');

const hud = {
  score: document.querySelector('#score-value'),
  wave: document.querySelector('#wave-value'),
  enemyCount: document.querySelector('#enemy-count'),
  healthValue: document.querySelector('#health-value'),
  healthFill: document.querySelector('#health-fill'),
  status: document.querySelector('#status-panel'),
  reticle: document.querySelector('#reticle'),
  reticleLabel: document.querySelector('#reticle-label'),
  hitMarker: document.querySelector('#hit-marker'),
  pickupBanner: document.querySelector('#pickup-banner'),
  pickupBannerTitle: document.querySelector('#pickup-banner-title'),
  pickupBannerCopy: document.querySelector('#pickup-banner-copy'),
  targetName: document.querySelector('#target-name'),
  targetHealth: document.querySelector('#target-health'),
  radar: document.querySelector('#radar'),
  hitVignette: document.querySelector('#hit-vignette'),
  hitChevrons: document.querySelector('#hit-chevrons'),
  playerName: document.querySelector('#player-name-value'),
  mapTheme: document.querySelector('#map-theme-value'),
  bestScore: document.querySelector('#best-score-value'),
  bestWave: document.querySelector('#best-wave-value'),
  achievements: document.querySelector('#achievement-count-value'),
  powerup: document.querySelector('#powerup-value'),
  pulse: document.querySelector('#ability-value'),
  missionName: document.querySelector('#mission-name'),
  missionProgress: document.querySelector('#mission-progress'),
  missionProgressFill: document.querySelector('#mission-progress-fill'),
  startBestScore: document.querySelector('#start-best-score'),
  startBestWave: document.querySelector('#start-best-wave'),
  startAchievements: document.querySelector('#start-achievement-count'),
};

let game = null;
let playerProgress = loadPlayerProgress();
let activeRunContext = null;
let lastCompletedRunContext = null;

const savedPlayerName = loadPlayerName();
const savedMapTheme = loadMapTheme();

function createRunId() {
  const cryptoApi = globalThis?.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `run-${Math.random().toString(36).slice(2, 10)}`;
}

function updateProfileReadouts() {
  hud.bestScore.textContent = playerProgress.bestScore.toString();
  hud.bestWave.textContent = playerProgress.bestWave.toString();
  hud.achievements.textContent = playerProgress.achievements.length.toString();
  hud.startBestScore.textContent = playerProgress.bestScore.toString();
  hud.startBestWave.textContent = playerProgress.bestWave.toString();
  hud.startAchievements.textContent = playerProgress.achievements.length.toString();
  startCurrency.textContent = playerProgress.currency.toString();
  hangarCurrency.textContent = playerProgress.currency.toString();
}

function setMapThemeLock(locked) {
  for (const input of mapThemeInputs) {
    input.disabled = locked;
  }
  mapThemeNote.hidden = !locked;
}

function hideRunSummary() {
  runSummary.hidden = true;
}

function showRunSummary(result) {
  const { runSummary: stats, newAchievements, currencyEarned } = result;
  summaryScore.textContent = stats.score.toString();
  summaryWave.textContent = stats.highestWave.toString();
  summaryKills.textContent = stats.kills.toString();
  summaryPickups.textContent = stats.pickupsCollected.toString();
  summaryAchievements.textContent = newAchievements.length.toString();
  summaryCurrency.textContent = currencyEarned.toString();
  summaryAbility.textContent = stats.ability?.label ?? ABILITY_DEFINITIONS.pulse.label;
  summaryMission.textContent = stats.mission
    ? `${stats.mission.label} ${stats.mission.progress}/${stats.mission.target}${stats.mission.completed ? ' complete' : ''}`
    : 'No objective';
  summaryMissionFill.style.width = stats.mission
    ? `${Math.max(8, (stats.mission.progress / stats.mission.target) * 100)}%`
    : '0%';
  summaryHeadline.textContent = newAchievements.length > 0
    ? `New awards unlocked: ${newAchievements.join(', ')}.`
    : 'No new awards this time. Spend your salvage and relaunch.';
  runSummary.hidden = false;
}

function renderUpgradeShop() {
  upgradeShop.innerHTML = Object.values(UPGRADE_DEFINITIONS).map((upgrade) => {
    const level = playerProgress.upgrades[upgrade.id];
    const cost = getUpgradeCost(upgrade.id, level);
    const isMaxed = level >= upgrade.maxLevel;
    const disabled = isMaxed || playerProgress.currency < (cost ?? 0);
    const buttonLabel = isMaxed ? 'Fully upgraded' : `Upgrade for ${cost} salvage`;
    return `
      <article class="upgrade-card">
        <div>
          <h3 class="upgrade-card__title">${upgrade.label}</h3>
          <p class="upgrade-card__copy">${upgrade.description}</p>
        </div>
        <div class="upgrade-card__meta">
          <span class="upgrade-card__level">Upgrade level ${level} of ${upgrade.maxLevel}</span>
          <button
            class="upgrade-card__button"
            type="button"
            data-upgrade-id="${upgrade.id}"
            ${disabled ? 'disabled' : ''}
          >${buttonLabel}</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAbilityPicker() {
  const equippedAbility = playerProgress.loadout?.ability ?? ABILITY_DEFINITIONS.pulse.id;
  for (const input of abilityInputs) {
    const unlocked = isAbilityUnlocked(input.value, playerProgress);
    input.disabled = !unlocked;
    input.checked = unlocked && input.value === equippedAbility;
  }

  const unlockedAbilities = getUnlockedAbilities(playerProgress);
  const nextUnlock = Object.values(ABILITY_DEFINITIONS)
    .filter((ability) => !isAbilityUnlocked(ability.id, playerProgress))
    .sort((a, b) => a.unlockWave - b.unlockWave)[0];

  abilityUnlockNote.textContent = nextUnlock
    ? `Next ability unlocks at wave ${nextUnlock.unlockWave}: ${nextUnlock.label}.`
    : `All abilities unlocked. Equipped: ${unlockedAbilities.find((ability) => ability.id === equippedAbility)?.label ?? ABILITY_DEFINITIONS.pulse.label}.`;
}

function applyIdentity(playerName, mapTheme) {
  playerNameInput.value = playerName;
  hud.playerName.textContent = playerName || 'Awaiting registration';
  hud.mapTheme.textContent = MAP_THEME_DETAILS[mapTheme].label;
}

function getCurrentMapTheme() {
  return loadMapTheme();
}

function beginRun({ fromSummary = false } = {}) {
  const playerName = savePlayerName(playerNameInput.value);
  const mapTheme = game ? getCurrentMapTheme() : saveMapTheme(new FormData(startForm).get('mapTheme'));
  if (!playerName) {
    playerNameInput.setCustomValidity('Enter a player name to launch.');
    startForm.reportValidity();
    return;
  }

  applyIdentity(playerName, mapTheme);
  playerProgress = recordRunStart().progress;
  updateProfileReadouts();
  renderUpgradeShop();
  renderAbilityPicker();

  const runModifiers = createRunModifiers(playerProgress);
  const loadout = playerProgress.loadout;
  activeRunContext = {
    profileId: playerProgress.profileId,
    runId: createRunId(),
    runIndex: playerProgress.lifetimeStats.runsStarted,
    mapTheme,
  };

  hideRunSummary();
  startScreen.classList.add('start-screen--hidden');
  game.restartRun({ playerProgress, runModifiers, loadout });
  void game.resumeAudio().catch(() => {});

  trackRunStarted(activeRunContext);
  if (fromSummary && lastCompletedRunContext) {
    trackRunRestartedFromSummary(lastCompletedRunContext);
  }
}

function openHangar() {
  hideRunSummary();
  renderUpgradeShop();
  startScreen.classList.remove('start-screen--hidden');
}

if (savedPlayerName) {
  playerNameInput.value = savedPlayerName;
}
for (const input of mapThemeInputs) {
  input.checked = input.value === savedMapTheme;
}
applyIdentity(savedPlayerName, savedMapTheme);
updateProfileReadouts();
renderUpgradeShop();
renderAbilityPicker();
setMapThemeLock(false);
playerNameInput.focus();

playerNameInput.addEventListener('input', () => {
  playerNameInput.setCustomValidity('');
});

upgradeShop.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upgrade-id]');
  if (!button) {
    return;
  }

  const upgradeId = button.dataset.upgradeId;
  const result = purchaseUpgrade(upgradeId);
  playerProgress = result.progress;
  updateProfileReadouts();
  renderUpgradeShop();
  renderAbilityPicker();

  if (result.ok) {
    trackUpgradePurchased({
      profileId: playerProgress.profileId,
      upgradeId,
      newLevel: playerProgress.upgrades[upgradeId],
      cost: result.cost,
    });
  }
});

for (const input of abilityInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }
    playerProgress = setEquippedAbility(input.value);
    renderAbilityPicker();
  });
}

summaryRerunButton.addEventListener('click', () => {
  beginRun({ fromSummary: true });
});

summaryHangarButton.addEventListener('click', () => {
  openHangar();
});

startForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const playerName = savePlayerName(playerNameInput.value);
  if (!playerName) {
    playerNameInput.setCustomValidity('Enter a player name to launch.');
    startForm.reportValidity();
    return;
  }
  playerNameInput.value = playerName;

  if (!game) {
    const initialMapTheme = saveMapTheme(new FormData(startForm).get('mapTheme'));
    const initialRunModifiers = createRunModifiers(playerProgress);
    const initialLoadout = playerProgress.loadout;
    game = new Game({
      mount,
      hud,
      mapTheme: initialMapTheme,
      playerProgress,
      runModifiers: initialRunModifiers,
      loadout: initialLoadout,
      onRestartRequested() {
        if (!startScreen.classList.contains('start-screen--hidden')) {
          return;
        }
        beginRun({ fromSummary: true });
      },
      onRunComplete(runStats) {
        const result = recordRunComplete(runStats);
        playerProgress = result.progress;
        updateProfileReadouts();
        renderUpgradeShop();
        renderAbilityPicker();

        if (activeRunContext) {
          lastCompletedRunContext = activeRunContext;
          trackRunCompleted({
            ...activeRunContext,
            score: runStats.score,
            wave: runStats.highestWave,
            currencyEarned: result.currencyEarned,
          });
          trackRunSummaryViewed(activeRunContext);
        }

        showRunSummary(result);
        return result;
      },
    });
    game.start();
    trackGameStart(playerName, initialMapTheme);
    setMapThemeLock(true);
  }

  beginRun();
});
