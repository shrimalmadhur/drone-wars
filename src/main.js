import './style.css';
import { InputController, KeyboardInputController, MobileInputController } from './game/input.js';
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
import { ARCHETYPE_DEFINITIONS } from './game/meta/archetypes.js';
import {
  CHALLENGE_MODES,
  createDailyChallenge,
  createRandomSeed,
} from './game/meta/challenges.js';
import {
  getNewUnlocks,
  getOnboardingChecklist,
  getPreflightGuidance,
  shouldShowOnboarding,
} from './game/meta/onboarding.js';
import { MUTATOR_DEFINITIONS } from './game/meta/mutators.js';
import { getUpgradeCost, UPGRADE_DEFINITIONS } from './game/meta/upgrades.js';
import { getPortalContext } from './game/portal.js';
import { MAP_THEME_DETAILS, MAP_THEMES } from './mapThemes.js';
import {
  createDefaultPlayerName,
  loadMapTheme,
  loadPlayerName,
  loadPlayerProgress,
  purchaseUpgrade,
  recordRunComplete,
  recordRunStart,
  setEquippedArchetype,
  setEquippedAbility,
  setEquippedMutator,
  setPreRunSelection,
  saveMapTheme,
  savePlayerName,
} from './playerProfile.js';

const mount = document.querySelector('#app');
const startScreen = document.querySelector('#start-screen');
const startSetupView = document.querySelector('#start-setup-view');
const startPlayButton = document.querySelector('#start-play-button');
const startForm = document.querySelector('#start-form');
const playerNameInput = document.querySelector('#player-name-input');
const challengeModeInputs = Array.from(document.querySelectorAll('input[name="challengeMode"]'));
const mapThemeInputs = Array.from(document.querySelectorAll('input[name="mapTheme"]'));
const abilityInputs = Array.from(document.querySelectorAll('input[name="ability"]'));
const archetypeInputs = Array.from(document.querySelectorAll('input[name="archetype"]'));
const mutatorInputs = Array.from(document.querySelectorAll('input[name="mutator"]'));
const onboardingPanel = document.querySelector('#onboarding-panel');
const onboardingLead = document.querySelector('#onboarding-lead');
const onboardingChecklist = document.querySelector('#onboarding-checklist');
const challengeNote = document.querySelector('#challenge-note');
const archetypeNote = document.querySelector('#archetype-note');
const abilityUnlockNote = document.querySelector('#ability-unlock-note');
const mutatorNote = document.querySelector('#mutator-note');
const startCurrency = document.querySelector('#start-currency');
const hangarCurrency = document.querySelector('#hangar-currency');
const upgradeShop = document.querySelector('#upgrade-shop');
const mapThemeNote = document.querySelector('#map-theme-note');
const controlsDrawer = document.querySelector('#controls-drawer');
const controlsDrawerToggle = document.querySelector('#controls-drawer-toggle');
const missionDrawer = document.querySelector('#mission-drawer');
const missionDrawerToggle = document.querySelector('#mission-drawer-toggle');
const HUD_DRAWER_AUTO_COLLAPSE_MS = 5000;
const mobileControlsRoot = document.querySelector('#mobile-controls');
const mobileMoveStick = document.querySelector('#mobile-move-stick');
const mobileMoveThumb = document.querySelector('#mobile-move-thumb');
const mobileAimStick = document.querySelector('#mobile-aim-stick');
const mobileAimThumb = document.querySelector('#mobile-aim-thumb');
const mobileFireButton = document.querySelector('#mobile-fire-button');
const mobileAbilityButton = document.querySelector('#mobile-ability-button');
const mobileAscendButton = document.querySelector('#mobile-ascend-button');
const mobileDescendButton = document.querySelector('#mobile-descend-button');
const mobilePauseButton = document.querySelector('#mobile-pause-button');
const mobileMotionToggle = document.querySelector('#mobile-motion-toggle');

const runSummary = document.querySelector('#run-summary');
const summaryScore = document.querySelector('#summary-score');
const summaryWave = document.querySelector('#summary-wave');
const summaryKills = document.querySelector('#summary-kills');
const summaryPickups = document.querySelector('#summary-pickups');
const summaryDamage = document.querySelector('#summary-damage');
const summaryPulse = document.querySelector('#summary-pulse');
const summaryAchievements = document.querySelector('#summary-achievements');
const summaryAchievementCopy = document.querySelector('#summary-achievement-copy');
const summaryAwardsDetail = document.querySelector('#summary-awards-detail');
const summaryCurrency = document.querySelector('#summary-currency');
const summaryUnlocks = document.querySelector('#summary-unlocks');
const summaryOutcome = document.querySelector('#summary-outcome');
const summaryMission = document.querySelector('#summary-mission');
const summaryMissionCopy = document.querySelector('#summary-mission-copy');
const summaryAbility = document.querySelector('#summary-ability');
const summaryMutator = document.querySelector('#summary-mutator');
const summaryChallenge = document.querySelector('#summary-challenge');
const summaryScoreDelta = document.querySelector('#summary-score-delta');
const summaryWaveDelta = document.querySelector('#summary-wave-delta');
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
  empVignette: document.querySelector('#emp-vignette'),
  shieldVignette: document.querySelector('#shield-vignette'),
  hitChevrons: document.querySelector('#hit-chevrons'),
  playerName: document.querySelector('#player-name-value'),
  mapTheme: document.querySelector('#map-theme-value'),
  challenge: document.querySelector('#challenge-value'),
  bestScore: document.querySelector('#best-score-value'),
  bestWave: document.querySelector('#best-wave-value'),
  achievements: document.querySelector('#achievement-count-value'),
  powerup: document.querySelector('#powerup-value'),
  pulse: document.querySelector('#ability-value'),
  mutator: document.querySelector('#mutator-value'),
  missionName: document.querySelector('#mission-name'),
  missionProgress: document.querySelector('#mission-progress'),
  missionProgressFill: document.querySelector('#mission-progress-fill'),
  bonusObjectiveName: document.querySelector('#bonus-objective-name'),
  bonusObjectiveProgress: document.querySelector('#bonus-objective-progress'),
  waveDirectiveName: document.querySelector('#directive-name'),
  waveDirectiveCopy: document.querySelector('#directive-copy'),
  startBestScore: document.querySelector('#start-best-score'),
  startBestWave: document.querySelector('#start-best-wave'),
  startAchievements: document.querySelector('#start-achievement-count'),
  fpsCounter: document.querySelector('#fps-counter'),
};

let game = null;
let GameClass = null;
let gameModulePromise = null;
let playerProgress = loadPlayerProgress();
let activeRunContext = null;
let lastCompletedRunContext = null;
let drawerAutoCollapseTimer = null;
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const inputController = new InputController({
  keyboard: new KeyboardInputController(window, document),
  mobile: isTouchDevice && mobileControlsRoot
    ? new MobileInputController({
      root: mobileControlsRoot,
      moveStick: mobileMoveStick,
      moveThumb: mobileMoveThumb,
      aimStick: mobileAimStick,
      aimThumb: mobileAimThumb,
      fireButton: mobileFireButton,
      abilityButton: mobileAbilityButton,
      ascendButton: mobileAscendButton,
      descendButton: mobileDescendButton,
      pauseButton: mobilePauseButton,
      motionButton: mobileMotionToggle,
      target: window,
      documentTarget: document,
    })
    : null,
});

const savedPlayerName = loadPlayerName();
const initialPlayerName = savedPlayerName || createDefaultPlayerName();
const savedMapTheme = loadMapTheme();
const portalContext = getPortalContext();
let currentMapTheme = savedMapTheme;

if (portalContext.active) {
  startScreen.classList.add('start-screen--hidden');
}

if (isTouchDevice && mobileControlsRoot) {
  document.body.classList.add('mobile-device');
  mobileControlsRoot.hidden = false;
  mobileControlsRoot.setAttribute('aria-hidden', 'false');
}

function chooseRandomMapTheme() {
  const mapThemes = Object.values(MAP_THEMES);
  return mapThemes[Math.floor(Math.random() * mapThemes.length)] ?? savedMapTheme;
}

function createRunId() {
  const cryptoApi = globalThis?.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `run-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadGameClass() {
  if (GameClass) {
    return GameClass;
  }
  if (!gameModulePromise) {
    gameModulePromise = import('./game/Game.js').then((module) => {
      GameClass = module.Game;
      return GameClass;
    });
  }
  return gameModulePromise;
}

function preloadGameRuntime() {
  void loadGameClass().catch(() => {});
}

function getChallengeMode() {
  return playerProgress.preRunSelection?.challengeMode ?? CHALLENGE_MODES.STANDARD;
}

function getDailyChallengeConfig() {
  return createDailyChallenge(new Date());
}

function getSelectedSetupTheme() {
  return game
    ? getCurrentMapTheme()
    : (new FormData(startForm).get('mapTheme') ?? savedMapTheme);
}

function getRunPlan({ forcedMapTheme } = {}) {
  const challengeMode = getChallengeMode();
  if (challengeMode === CHALLENGE_MODES.DAILY) {
    const challenge = getDailyChallengeConfig();
    const runProfile = {
      ...playerProgress,
      preRunSelection: {
        ...playerProgress.preRunSelection,
        archetype: challenge.loadout.archetype,
        mutator: challenge.loadout.mutator,
        challengeMode,
      },
      loadout: {
        ...playerProgress.loadout,
        ...challenge.loadout,
      },
    };

    return {
      challenge,
      challengeMode,
      mapTheme: challenge.mapTheme,
      seed: challenge.seed,
      runProfile,
    };
  }

  return {
    challenge: null,
    challengeMode,
    mapTheme: forcedMapTheme ?? getSelectedSetupTheme(),
    seed: createRandomSeed(),
    runProfile: playerProgress,
  };
}

function setChallengeReadout(challenge) {
  hud.challenge.textContent = challenge
    ? `${challenge.shortLabel} · Seed ${challenge.seed}`
    : 'Standard sortie';
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

function focusSetupSection() {
  startSetupView?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    playerNameInput.focus();
  }, 120);
}

function setMapThemeLock(locked) {
  const challenge = getChallengeMode() === CHALLENGE_MODES.DAILY ? getDailyChallengeConfig() : null;
  for (const input of mapThemeInputs) {
    input.disabled = locked || Boolean(challenge);
    if (challenge) {
      input.checked = input.value === challenge.mapTheme;
    }
  }
  mapThemeNote.hidden = false;
  const selectedTheme = challenge?.mapTheme ?? (game ? getCurrentMapTheme() : new FormData(startForm).get('mapTheme'));
  const details = MAP_THEME_DETAILS[selectedTheme] ?? MAP_THEME_DETAILS[MAP_THEMES.FRONTIER];
  mapThemeNote.textContent = challenge
    ? `${details.gameplaySummary} Daily challenge locks the battlefield and seed for everyone on ${challenge.dateKey}.`
    : locked
    ? `${details.gameplaySummary} Map changes only apply on a full relaunch. Between runs, upgrades and loadout changes apply immediately.`
    : details.gameplaySummary;
}

function hideRunSummary() {
  runSummary.hidden = true;
}

function setDrawerExpanded(drawer, toggle, expanded) {
  if (!drawer || !toggle) {
    return;
  }
  drawer.classList.toggle('hud-drawer--collapsed', !expanded);
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function clearDrawerAutoCollapse() {
  if (!drawerAutoCollapseTimer) {
    return;
  }
  clearTimeout(drawerAutoCollapseTimer);
  drawerAutoCollapseTimer = null;
}

function autoCollapseHudDrawers() {
  setDrawerExpanded(controlsDrawer, controlsDrawerToggle, false);
  setDrawerExpanded(missionDrawer, missionDrawerToggle, false);
  clearDrawerAutoCollapse();
}

function primeHudDrawersForRun() {
  clearDrawerAutoCollapse();
  setDrawerExpanded(controlsDrawer, controlsDrawerToggle, true);
  setDrawerExpanded(missionDrawer, missionDrawerToggle, true);
  drawerAutoCollapseTimer = window.setTimeout(() => {
    autoCollapseHudDrawers();
  }, HUD_DRAWER_AUTO_COLLAPSE_MS);
}

function wireDrawer(drawer, toggle) {
  if (!drawer || !toggle) {
    return;
  }
  toggle.addEventListener('click', () => {
    clearDrawerAutoCollapse();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setDrawerExpanded(drawer, toggle, !expanded);
  });
}

function formatRecordDelta(current, previous, noun) {
  if (current > previous) {
    return `New personal best: +${current - previous} ${noun}`;
  }
  return 'No new record this run';
}

function buildMissionSummary(mission) {
  if (!mission) {
    return {
      title: 'No objective',
      copy: 'No mission was active for this run.',
      progressWidth: '0%',
      outcome: 'Run complete',
    };
  }

  const ratio = mission.target > 0 ? mission.progress / mission.target : 0;
  return {
    title: mission.chainDepth > 0 ? `${mission.label} // Chain ${mission.chainDepth + 1}` : mission.label,
    copy: mission.completed
      ? `${mission.description} completed at ${mission.progress}/${mission.target}. Bonus contracts cleared: ${mission.bonusCompletedCount ?? 0}.`
      : `${mission.description} finished at ${mission.progress}/${mission.target}. Bonus contracts cleared: ${mission.bonusCompletedCount ?? 0}.`,
    progressWidth: `${Math.max(8, ratio * 100)}%`,
    outcome: mission.completed ? 'Mission accomplished' : 'Run complete',
  };
}

function showRunSummary(result, previousProgress) {
  const { runSummary: stats, newAchievements, currencyEarned } = result;
  const newUnlocks = getNewUnlocks(previousProgress, playerProgress);
  const missionSummary = buildMissionSummary(stats.mission);
  summaryScore.textContent = stats.score.toString();
  summaryWave.textContent = stats.highestWave.toString();
  summaryKills.textContent = stats.kills.toString();
  summaryPickups.textContent = stats.pickupsCollected.toString();
  summaryDamage.textContent = Math.round(stats.damageTaken ?? 0).toString();
  summaryPulse.textContent = (stats.maxPulseHits ?? 0).toString();
  summaryAchievements.textContent = newAchievements.length.toString();
  summaryAchievementCopy.textContent = `${newAchievements.length} new award${newAchievements.length === 1 ? '' : 's'}`;
  summaryAwardsDetail.textContent = newAchievements.length > 0
    ? newAchievements.join(', ')
    : 'No new awards unlocked';
  summaryCurrency.textContent = currencyEarned.toString();
  summaryOutcome.textContent = missionSummary.outcome;
  summaryAbility.textContent = stats.ability?.label ?? ABILITY_DEFINITIONS.pulse.label;
  summaryMutator.textContent = stats.mutator?.label ?? MUTATOR_DEFINITIONS.highRisk.label;
  summaryChallenge.textContent = stats.challenge
    ? `${stats.challenge.shortLabel} · Seed ${stats.challenge.seed}`
    : 'Standard sortie';
  summaryMission.textContent = missionSummary.title;
  summaryMissionCopy.textContent = missionSummary.copy;
  summaryMissionFill.style.width = missionSummary.progressWidth;
  summaryScoreDelta.textContent = formatRecordDelta(stats.score, previousProgress.bestScore, 'score');
  summaryWaveDelta.textContent = formatRecordDelta(stats.highestWave, previousProgress.bestWave, 'waves');
  summaryHeadline.textContent = stats.mission?.completed
    ? 'Mission contract cleared. You can press the advantage with another run or pivot into upgrades.'
    : newAchievements.length > 0
      ? `New awards unlocked: ${newAchievements.join(', ')}.`
      : 'Review the weak spots, spend salvage if needed, and relaunch with a stronger build.';
  summaryUnlocks.hidden = newUnlocks.length === 0;
  summaryUnlocks.textContent = newUnlocks.length > 0
    ? `New unlocks: ${newUnlocks.map((unlock) => `${unlock.label} (${unlock.summary})`).join(' · ')}`
    : '';
  runSummary.hidden = false;
  document.body.classList.remove('run-active');
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
  const challenge = getChallengeMode() === CHALLENGE_MODES.DAILY ? getDailyChallengeConfig() : null;
  const equippedAbility = playerProgress.loadout?.ability ?? ABILITY_DEFINITIONS.pulse.id;
  for (const input of abilityInputs) {
    const unlocked = isAbilityUnlocked(input.value, playerProgress);
    const isChallengeAbility = challenge?.loadout.ability === input.value;
    input.disabled = challenge ? true : !unlocked;
    input.checked = challenge ? isChallengeAbility : unlocked && input.value === equippedAbility;
    const card = input.closest('.map-option')?.querySelector('.map-option__card');
    const eyebrow = card?.querySelector('.map-option__eyebrow');
    const copy = card?.querySelector('.map-option__copy');
    const definition = ABILITY_DEFINITIONS[input.value];
    if (eyebrow && definition) {
      eyebrow.textContent = challenge
        ? (isChallengeAbility ? 'Daily loadout' : 'Challenge locked')
        : unlocked
          ? 'Ready'
          : `Unlock wave ${definition.unlockWave}`;
    }
    if (copy && definition) {
      copy.textContent = challenge
        ? (isChallengeAbility ? `${definition.summary} Daily challenge overrides the normal picker.` : definition.summary)
        : unlocked
        ? definition.summary
        : `${definition.summary} Unlocks at wave ${definition.unlockWave}.`;
    }
  }

  const unlockedAbilities = getUnlockedAbilities(playerProgress);
  const nextUnlock = Object.values(ABILITY_DEFINITIONS)
    .filter((ability) => !isAbilityUnlocked(ability.id, playerProgress))
    .sort((a, b) => a.unlockWave - b.unlockWave)[0];

  abilityUnlockNote.textContent = challenge
    ? `Daily challenge equips ${ABILITY_DEFINITIONS[challenge.loadout.ability]?.label ?? challenge.loadout.ability} and ignores normal unlock gating for the run.`
    : nextUnlock
    ? `Next ability unlocks at wave ${nextUnlock.unlockWave}: ${nextUnlock.label}.`
    : `All abilities unlocked. Equipped: ${unlockedAbilities.find((ability) => ability.id === equippedAbility)?.label ?? ABILITY_DEFINITIONS.pulse.label}.`;
}

function renderOnboarding() {
  const visible = shouldShowOnboarding(playerProgress);
  onboardingPanel.hidden = !visible;
  onboardingLead.textContent = getPreflightGuidance(playerProgress);
  onboardingChecklist.innerHTML = '';
  for (const item of getOnboardingChecklist(playerProgress)) {
    const element = document.createElement('li');
    element.className = 'onboarding-checklist__item';
    element.dataset.complete = item.complete ? 'true' : 'false';
    element.textContent = `${item.complete ? 'Complete' : 'Next'}: ${item.label}`;
    onboardingChecklist.appendChild(element);
  }
}

function renderArchetypePicker() {
  const challenge = getChallengeMode() === CHALLENGE_MODES.DAILY ? getDailyChallengeConfig() : null;
  const selectedArchetype = challenge?.loadout.archetype
    ?? playerProgress.preRunSelection?.archetype
    ?? playerProgress.loadout?.archetype;
  for (const input of archetypeInputs) {
    input.disabled = Boolean(challenge);
    input.checked = input.value === selectedArchetype;
  }
  const definition = ARCHETYPE_DEFINITIONS[selectedArchetype] ?? ARCHETYPE_DEFINITIONS.control;
  archetypeNote.textContent = challenge
    ? `Daily challenge frame: ${definition.label}. ${definition.summary} ${definition.detail}.`
    : `${definition.summary} ${definition.detail}.`;
}

function renderMutatorPicker() {
  const challenge = getChallengeMode() === CHALLENGE_MODES.DAILY ? getDailyChallengeConfig() : null;
  const selectedMutator = challenge?.loadout.mutator
    ?? playerProgress.preRunSelection?.mutator
    ?? playerProgress.loadout?.mutator;
  for (const input of mutatorInputs) {
    input.disabled = Boolean(challenge);
    input.checked = input.value === selectedMutator;
  }
  const definition = MUTATOR_DEFINITIONS[selectedMutator] ?? MUTATOR_DEFINITIONS.highRisk;
  mutatorNote.textContent = challenge
    ? `Daily challenge mutator: ${definition.label}. ${definition.summary} ${definition.detail}.`
    : `${definition.summary} ${definition.detail}.`;
}

function renderChallengeModePicker() {
  const challengeMode = getChallengeMode();
  const challenge = challengeMode === CHALLENGE_MODES.DAILY ? getDailyChallengeConfig() : null;
  for (const input of challengeModeInputs) {
    input.checked = input.value === challengeMode;
  }

  challengeNote.textContent = challenge
    ? `Daily challenge ${challenge.dateKey}: ${MAP_THEME_DETAILS[challenge.mapTheme].label}, ${challenge.summary}. Seed ${challenge.seed}.`
    : 'Standard sortie uses your selected battlefield and current hangar build.';
}

function applyIdentity(playerName, mapTheme) {
  playerNameInput.value = playerName;
  hud.playerName.textContent = playerName || 'Awaiting registration';
  hud.mapTheme.textContent = MAP_THEME_DETAILS[mapTheme].label;
  setChallengeReadout(activeRunContext?.challenge ?? null);
}

function getCurrentMapTheme() {
  return currentMapTheme;
}

async function createGameInstance(mapTheme, playerName, { runProfile = playerProgress, seed, challenge = null } = {}) {
  if (game) {
    game.dispose();
  }
  const LoadedGame = await loadGameClass();
  currentMapTheme = mapTheme;
  const initialRunModifiers = createRunModifiers(runProfile);
  const initialLoadout = runProfile.loadout;
  game = new LoadedGame({
    mount,
    hud,
    mapTheme,
    playerProgress: runProfile,
    runModifiers: initialRunModifiers,
    loadout: initialLoadout,
    seed,
    challenge,
    portalContext,
    playerName,
    inputController,
    onRestartRequested() {
      if (!startScreen.classList.contains('start-screen--hidden')) {
        return;
      }
      void beginRun({ fromSummary: true });
    },
    onRunComplete(runStats) {
      const previousProgress = playerProgress;
      const result = recordRunComplete(runStats);
      playerProgress = result.progress;
      updateProfileReadouts();
      renderUpgradeShop();
      renderOnboarding();
      renderArchetypePicker();
      renderAbilityPicker();
      renderMutatorPicker();

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

      showRunSummary(result, previousProgress);
      return result;
    },
  });
  game.start();
  trackGameStart(playerName, mapTheme);
  setMapThemeLock(true);
}

async function beginRun({ fromSummary = false, forcedPlayerName, forcedMapTheme } = {}) {
  const playerName = savePlayerName(forcedPlayerName ?? playerNameInput.value);
  if (!playerName) {
    playerNameInput.setCustomValidity('Enter a player name to launch.');
    startForm.reportValidity();
    return;
  }
  playerProgress = recordRunStart().progress;
  updateProfileReadouts();
  renderUpgradeShop();
  renderChallengeModePicker();
  renderOnboarding();
  renderArchetypePicker();
  renderAbilityPicker();
  renderMutatorPicker();

  const runPlan = getRunPlan({ forcedMapTheme });
  const previousMapTheme = currentMapTheme;
  const mapTheme = game ? runPlan.mapTheme : saveMapTheme(runPlan.mapTheme);
  currentMapTheme = mapTheme;
  applyIdentity(playerName, mapTheme);
  if (!game || previousMapTheme !== mapTheme) {
    await createGameInstance(mapTheme, playerName, {
      runProfile: runPlan.runProfile,
      seed: runPlan.seed,
      challenge: runPlan.challenge,
    });
  }

  const runModifiers = createRunModifiers(runPlan.runProfile);
  const loadout = runPlan.runProfile.loadout;
  activeRunContext = {
    profileId: playerProgress.profileId,
    runId: createRunId(),
    runIndex: playerProgress.lifetimeStats.runsStarted,
    mapTheme,
    challengeId: runPlan.challenge?.id ?? null,
    challengeMode: runPlan.challengeMode,
    seed: runPlan.seed,
    challenge: runPlan.challenge,
  };
  setChallengeReadout(runPlan.challenge);

  hideRunSummary();
  startScreen.classList.add('start-screen--hidden');
  document.body.classList.add('run-active');
  game.restartRun({
    playerProgress: runPlan.runProfile,
    runModifiers,
    loadout,
    seed: runPlan.seed,
    challenge: runPlan.challenge,
  });
  primeHudDrawersForRun();
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
  document.body.classList.remove('run-active');
  focusSetupSection();
}

playerNameInput.value = initialPlayerName;
for (const input of mapThemeInputs) {
  input.checked = input.value === savedMapTheme;
  input.addEventListener('change', () => setMapThemeLock(Boolean(game)));
}
applyIdentity(initialPlayerName, savedMapTheme);
updateProfileReadouts();
renderUpgradeShop();
renderChallengeModePicker();
renderOnboarding();
renderArchetypePicker();
renderAbilityPicker();
renderMutatorPicker();
setMapThemeLock(false);
wireDrawer(controlsDrawer, controlsDrawerToggle);
wireDrawer(missionDrawer, missionDrawerToggle);

if (!portalContext.active) {
  startPlayButton?.focus();
}

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
  renderOnboarding();
  renderArchetypePicker();
  renderAbilityPicker();
  renderMutatorPicker();

  if (result.ok) {
    trackUpgradePurchased({
      profileId: playerProgress.profileId,
      upgradeId,
      newLevel: playerProgress.upgrades[upgradeId],
      cost: result.cost,
    });
  }
});

for (const input of archetypeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }
    playerProgress = setEquippedArchetype(input.value);
    renderArchetypePicker();
  });
}

for (const input of challengeModeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }
    playerProgress = setPreRunSelection({ challengeMode: input.value });
    renderChallengeModePicker();
    renderArchetypePicker();
    renderAbilityPicker();
    renderMutatorPicker();
    setMapThemeLock(Boolean(game));
  });
}

for (const input of abilityInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }
    playerProgress = setEquippedAbility(input.value);
    renderAbilityPicker();
  });
}

for (const input of mutatorInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }
    playerProgress = setEquippedMutator(input.value);
    renderMutatorPicker();
  });
}

summaryRerunButton.addEventListener('click', () => {
  void beginRun({ fromSummary: true });
});

summaryHangarButton.addEventListener('click', () => {
  openHangar();
});

startPlayButton?.addEventListener('click', () => {
  if (typeof startForm.requestSubmit === 'function') {
    startForm.requestSubmit();
    return;
  }
  startForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});
startPlayButton?.addEventListener('pointerenter', preloadGameRuntime, { once: true });
startPlayButton?.addEventListener('focus', preloadGameRuntime, { once: true });

startForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const playerName = savePlayerName(playerNameInput.value);
  if (!playerName) {
    playerNameInput.setCustomValidity('Enter a player name to launch.');
    startForm.reportValidity();
    return;
  }
  playerNameInput.value = playerName;
  playerProgress = setEquippedArchetype(new FormData(startForm).get('archetype'));
  playerProgress = setEquippedMutator(new FormData(startForm).get('mutator'));
  playerProgress = setPreRunSelection({ challengeMode: new FormData(startForm).get('challengeMode') });

  await beginRun();
});

if (portalContext.active) {
  const autoPlayerName = portalContext.username || savedPlayerName || 'Portal Pilot';
  const autoMapTheme = chooseRandomMapTheme();
  playerNameInput.value = autoPlayerName;
  applyIdentity(autoPlayerName, autoMapTheme);
  startScreen.classList.add('start-screen--hidden');
  await createGameInstance(autoMapTheme, autoPlayerName, {
    runProfile: playerProgress,
    seed: createRandomSeed(),
    challenge: null,
  });
  await beginRun({
    forcedPlayerName: autoPlayerName,
    forcedMapTheme: autoMapTheme,
  });
}
