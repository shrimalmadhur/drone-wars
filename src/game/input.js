export function createInputState() {
  return {
    keys: new Set(),
    justPressed: new Set(),
  };
}

export function setKeyState(inputState, code, isDown) {
  if (isDown) {
    if (!inputState.keys.has(code)) {
      inputState.justPressed.add(code);
    }
    inputState.keys.add(code);
  } else {
    inputState.keys.delete(code);
  }
}

export function resetInputState(inputState) {
  inputState.keys.clear();
  inputState.justPressed.clear();
}

export function readInputSnapshot(inputState) {
  const down = (code) => inputState.keys.has(code);
  const consumePress = (code) => {
    const pressed = inputState.justPressed.has(code);
    inputState.justPressed.delete(code);
    return pressed;
  };

  return {
    thrust: Number(down('KeyW')) - Number(down('KeyS')),
    yaw: Number(down('KeyD')) - Number(down('KeyA')),
    strafe: Number(down('ArrowRight')) - Number(down('ArrowLeft')),
    pitch: Number(down('ArrowUp')) - Number(down('ArrowDown')),
    vertical: Number(down('KeyE')) - Number(down('KeyQ')),
    fire: down('Space'),
    mutePressed: consumePress('KeyM'),
    restartPressed: consumePress('KeyR'),
    pausePressed: consumePress('KeyP'),
  };
}

export class InputController {
  constructor(target = window, documentTarget = document) {
    this.target = target;
    this.documentTarget = documentTarget;
    this.state = createInputState();

    this.onKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
      }
      setKeyState(this.state, event.code, true);
    };

    this.onKeyUp = (event) => {
      setKeyState(this.state, event.code, false);
    };

    this.onBlur = () => {
      resetInputState(this.state);
    };

    this.onVisibility = () => {
      if (this.documentTarget.hidden) {
        resetInputState(this.state);
      }
    };

    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.documentTarget.addEventListener('visibilitychange', this.onVisibility);
  }

  snapshot() {
    return readInputSnapshot(this.state);
  }

  reset() {
    resetInputState(this.state);
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.documentTarget.removeEventListener('visibilitychange', this.onVisibility);
  }
}
