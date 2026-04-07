import './style.css';
import { Game } from './game/Game.js';
import { MAP_THEME_DETAILS } from './mapThemes.js';
import { loadMapTheme, loadPlayerName, saveMapTheme, savePlayerName } from './playerProfile.js';
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
  targetName: document.querySelector('#target-name'),
  targetHealth: document.querySelector('#target-health'),
  radar: document.querySelector('#radar'),
  playerName: document.querySelector('#player-name-value'),
  mapTheme: document.querySelector('#map-theme-value'),
};

let game = null;

const savedPlayerName = loadPlayerName();
const savedMapTheme = loadMapTheme();
if (savedPlayerName) {
  playerNameInput.value = savedPlayerName;
}
for (const input of mapThemeInputs) {
  input.checked = input.value === savedMapTheme;
}
hud.mapTheme.textContent = MAP_THEME_DETAILS[savedMapTheme].label;

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
    game = new Game({ mount, hud, mapTheme });
    game.start();
    trackGameStart(playerName, mapTheme);
  }
});
