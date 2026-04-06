import './style.css';
import { Game } from './game/Game.js';
import { loadPlayerName, savePlayerName } from './playerProfile.js';

const mount = document.querySelector('#app');
const startScreen = document.querySelector('#start-screen');
const startForm = document.querySelector('#start-form');
const playerNameInput = document.querySelector('#player-name-input');

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
};

let game = null;

const savedPlayerName = loadPlayerName();
if (savedPlayerName) {
  playerNameInput.value = savedPlayerName;
}

playerNameInput.focus();

playerNameInput.addEventListener('input', () => {
  playerNameInput.setCustomValidity('');
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
  hud.playerName.textContent = playerName;
  startScreen.classList.add('start-screen--hidden');

  if (!game) {
    game = new Game({ mount, hud });
    game.start();
  }
});
