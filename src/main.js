import './style.css';
import { Game } from './game/Game.js';

const mount = document.querySelector('#app');

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
};

const game = new Game({ mount, hud });
game.start();
