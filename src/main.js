import './style.css';
import { Game } from './game/Game.js';
import { MAP_THEME_DETAILS } from './mapThemes.js';
import { loadMapTheme, loadPlayerName, loadPlayerProgress, recordPlayerRun, saveMapTheme, savePlayerName } from './playerProfile.js';
import { trackGameStart } from './game/analytics.js';

const mount = document.querySelector('#app');
const startScreen = document.querySelector('#start-screen');
const startForm = document.querySelector('#start-form');
const playerNameInput = document.querySelector('#player-name-input');
const mapThemeInputs = Array.from(document.querySelectorAll('input[name="mapTheme"]'));

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
  pulse: document.querySelector('#pulse-value'),
  startBestScore: document.querySelector('#start-best-score'),
  startBestWave: document.querySelector('#start-best-wave'),
  startAchievements: document.querySelector('#start-achievement-count'),
};

let game = null;

const savedPlayerName = loadPlayerName();
const savedMapTheme = loadMapTheme();
let playerProgress = loadPlayerProgress();
if (savedPlayerName) {
  playerNameInput.value = savedPlayerName;
}
for (const input of mapThemeInputs) {
  input.checked = input.value === savedMapTheme;
}
hud.mapTheme.textContent = MAP_THEME_DETAILS[savedMapTheme].label;
hud.bestScore.textContent = playerProgress.bestScore.toString();
hud.bestWave.textContent = playerProgress.bestWave.toString();
hud.achievements.textContent = playerProgress.achievements.length.toString();
hud.startBestScore.textContent = playerProgress.bestScore.toString();
hud.startBestWave.textContent = playerProgress.bestWave.toString();
hud.startAchievements.textContent = playerProgress.achievements.length.toString();

playerNameInput.focus();

playerNameInput.addEventListener('input', () => {
  playerNameInput.setCustomValidity('');
});

startForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const playerName = savePlayerName(playerNameInput.value);
  const mapTheme = saveMapTheme(new FormData(startForm).get('mapTheme'));
  if (!playerName) {
    playerNameInput.setCustomValidity('Enter a player name to launch.');
    startForm.reportValidity();
    return;
  }

  playerNameInput.value = playerName;
  hud.playerName.textContent = playerName;
  hud.mapTheme.textContent = MAP_THEME_DETAILS[mapTheme].label;
  startScreen.classList.add('start-screen--hidden');

  if (!game) {
    game = new Game({
      mount,
      hud,
      mapTheme,
      playerProgress,
      onRunComplete(runSummary) {
        const result = recordPlayerRun(runSummary);
        playerProgress = result.progress;
        hud.bestScore.textContent = playerProgress.bestScore.toString();
        hud.bestWave.textContent = playerProgress.bestWave.toString();
        hud.achievements.textContent = playerProgress.achievements.length.toString();
        hud.startBestScore.textContent = playerProgress.bestScore.toString();
        hud.startBestWave.textContent = playerProgress.bestWave.toString();
        hud.startAchievements.textContent = playerProgress.achievements.length.toString();
        return result;
      },
    });
  }

  void game.resumeAudio().catch(() => {});
  if (!game.frame) {
    game.start();
    trackGameStart(playerName, mapTheme);
  }
});
