export function createInputState() {
  return {
    keys: new Set(),
    justPressed: new Set(),
  };
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}

function shapeAnalogAxis(value, {
  deadzone = 0,
  exponent = 1,
  gain = 1,
} = {}) {
  const abs = Math.abs(value);
  if (abs <= deadzone) {
    return 0;
  }

  const normalized = (abs - deadzone) / (1 - deadzone);
  const curved = Math.pow(normalized, exponent);
  return clampAxis(Math.sign(value) * curved * gain);
}

export function createControlSnapshot(overrides = {}) {
  return {
    thrust: 0,
    yaw: 0,
    strafe: 0,
    pitch: 0,
    vertical: 0,
    fire: false,
    abilityPressed: false,
    mutePressed: false,
    restartPressed: false,
    pausePressed: false,
    ...overrides,
  };
}

export function combineControlSnapshots(...snapshots) {
  return snapshots.reduce((combined, snapshot) => {
    if (!snapshot) {
      return combined;
    }

    return {
      thrust: clampAxis(combined.thrust + snapshot.thrust),
      yaw: clampAxis(combined.yaw + snapshot.yaw),
      strafe: clampAxis(combined.strafe + snapshot.strafe),
      pitch: clampAxis(combined.pitch + snapshot.pitch),
      vertical: clampAxis(combined.vertical + snapshot.vertical),
      fire: combined.fire || snapshot.fire,
      abilityPressed: combined.abilityPressed || snapshot.abilityPressed,
      mutePressed: combined.mutePressed || snapshot.mutePressed,
      restartPressed: combined.restartPressed || snapshot.restartPressed,
      pausePressed: combined.pausePressed || snapshot.pausePressed,
    };
  }, createControlSnapshot());
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

  return createControlSnapshot({
    thrust: Number(down('KeyW')) - Number(down('KeyS')),
    yaw: Number(down('KeyD')) - Number(down('KeyA')),
    strafe: Number(down('ArrowRight')) - Number(down('ArrowLeft')),
    pitch: Number(down('ArrowUp')) - Number(down('ArrowDown')),
    vertical: Number(down('KeyE')) - Number(down('KeyQ')),
    fire: down('Space'),
    abilityPressed: consumePress('KeyF'),
    mutePressed: consumePress('KeyM'),
    restartPressed: consumePress('KeyR'),
    pausePressed: consumePress('KeyP'),
  });
}

export class KeyboardInputController {
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

function createStickState() {
  return {
    activeId: null,
    centerX: 0,
    centerY: 0,
    x: 0,
    y: 0,
  };
}

function updateStickPosition(stick, clientX, clientY, radius) {
  const dx = clientX - stick.centerX;
  const dy = clientY - stick.centerY;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) {
    stick.x = clampAxis(dx / radius);
    stick.y = clampAxis(dy / radius);
    return;
  }
  stick.x = dx / distance;
  stick.y = dy / distance;
}

export class MobileInputController {
  constructor({
    root,
    moveStick,
    moveThumb,
    aimStick,
    aimThumb,
    fireButton,
    abilityButton,
    ascendButton,
    descendButton,
    pauseButton,
    motionButton,
    target = window,
    documentTarget = document,
  }) {
    this.root = root;
    this.target = target;
    this.documentTarget = documentTarget;
    this.moveStick = moveStick;
    this.moveThumb = moveThumb;
    this.aimStick = aimStick;
    this.aimThumb = aimThumb;
    this.fireButton = fireButton;
    this.abilityButton = abilityButton;
    this.ascendButton = ascendButton;
    this.descendButton = descendButton;
    this.pauseButton = pauseButton;
    this.motionButton = motionButton;
    this.move = createStickState();
    this.aim = createStickState();
    this.fireHeld = false;
    this.abilityQueued = false;
    this.pauseQueued = false;
    this.ascendHeld = false;
    this.descendHeld = false;
    this.motionEnabled = false;
    this.motionAvailable = typeof this.target.DeviceOrientationEvent !== 'undefined';
    this.motionPermissionState = this.motionAvailable ? 'prompt' : 'unsupported';
    this.motionNeedsCalibration = false;
    this.motionGamma = 0;
    this.motionBeta = 0;
    this.motionBaseGamma = 0;
    this.motionBaseBeta = 0;
    this.lastOrientation = null;
    this.stickRadius = 44;

    this.onMotion = (event) => {
      if (typeof event.gamma === 'number') {
        this.motionGamma = event.gamma;
      }
      if (typeof event.beta === 'number') {
        this.motionBeta = event.beta;
      }
      if (this.motionNeedsCalibration && typeof event.gamma === 'number' && typeof event.beta === 'number') {
        this.calibrateMotion();
      }
      this.lastOrientation = event;
    };

    this.onBlur = () => {
      this.reset();
    };

    this.boundMoveDown = (event) => this.onStickDown(event, this.move, this.moveStick, this.moveThumb);
    this.boundMoveMove = (event) => this.onStickMove(event, this.move, this.moveThumb);
    this.boundMoveUp = (event) => this.onStickUp(event, this.move, this.moveThumb);
    this.boundAimDown = (event) => this.onStickDown(event, this.aim, this.aimStick, this.aimThumb);
    this.boundAimMove = (event) => this.onStickMove(event, this.aim, this.aimThumb);
    this.boundAimUp = (event) => this.onStickUp(event, this.aim, this.aimThumb);

    this.onHoldDown = (setter) => (event) => {
      event.preventDefault();
      setter(true);
    };
    this.onHoldUp = (setter) => (event) => {
      event.preventDefault();
      setter(false);
    };
    this.onTap = (setter) => (event) => {
      event.preventDefault();
      setter();
    };

    this.bindStick(this.moveStick, this.boundMoveDown, this.boundMoveMove, this.boundMoveUp);
    this.bindStick(this.aimStick, this.boundAimDown, this.boundAimMove, this.boundAimUp);
    this.bindHoldButton(this.fireButton, (value) => { this.fireHeld = value; });
    this.bindHoldButton(this.ascendButton, (value) => { this.ascendHeld = value; });
    this.bindHoldButton(this.descendButton, (value) => { this.descendHeld = value; });
    this.bindTapButton(this.abilityButton, this.onTap(() => { this.abilityQueued = true; }));
    this.bindTapButton(this.pauseButton, this.onTap(() => { this.pauseQueued = true; }));

    if (this.motionButton) {
      this.motionButton.hidden = !this.motionAvailable;
      this.motionButton.addEventListener('click', () => {
        void this.toggleMotion();
      });
      this.updateMotionButton();
    }

    this.target.addEventListener('blur', this.onBlur);
  }

  bindStick(element, down, move, up) {
    if (!element) {
      return;
    }
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  }

  bindButton(element, down, up) {
    if (!element) {
      return;
    }
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('pointerleave', up);
  }

  bindHoldButton(element, setter) {
    if (!element) {
      return;
    }

    let activePointerId = null;
    const release = (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      event.preventDefault();
      activePointerId = null;
      setter(false);
    };

    element.addEventListener('pointerdown', (event) => {
      if (activePointerId !== null) {
        return;
      }
      event.preventDefault();
      activePointerId = event.pointerId;
      setter(true);
      element.setPointerCapture?.(event.pointerId);
    });
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
  }

  bindTapButton(element, handler) {
    if (!element) {
      return;
    }
    element.addEventListener('pointerdown', handler);
  }

  onStickDown(event, stick, element, thumb) {
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    stick.activeId = event.pointerId;
    stick.centerX = rect.left + rect.width / 2;
    stick.centerY = rect.top + rect.height / 2;
    updateStickPosition(stick, event.clientX, event.clientY, this.stickRadius);
    this.renderThumb(stick, thumb);
    element.setPointerCapture?.(event.pointerId);
  }

  onStickMove(event, stick, thumb) {
    if (stick.activeId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    updateStickPosition(stick, event.clientX, event.clientY, this.stickRadius);
    this.renderThumb(stick, thumb);
  }

  onStickUp(event, stick, thumb) {
    if (stick.activeId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    stick.activeId = null;
    stick.x = 0;
    stick.y = 0;
    this.renderThumb(stick, thumb);
  }

  renderThumb(stick, thumb) {
    if (!thumb) {
      return;
    }
    thumb.style.transform = `translate(${Math.round(stick.x * this.stickRadius)}px, ${Math.round(stick.y * this.stickRadius)}px)`;
  }

  calibrateMotion() {
    this.motionBaseGamma = this.motionGamma;
    this.motionBaseBeta = this.motionBeta;
    this.motionNeedsCalibration = false;
  }

  async toggleMotion() {
    if (!this.motionAvailable) {
      return false;
    }

    if (this.motionEnabled) {
      this.motionEnabled = false;
      this.motionNeedsCalibration = false;
      this.target.removeEventListener('deviceorientation', this.onMotion);
      this.updateMotionButton();
      return false;
    }

    const orientationApi = this.target.DeviceOrientationEvent;
    try {
      if (typeof orientationApi?.requestPermission === 'function') {
        const result = await orientationApi.requestPermission();
        this.motionPermissionState = result === 'granted' ? 'granted' : 'denied';
        if (result !== 'granted') {
          this.updateMotionButton();
          return false;
        }
      } else {
        this.motionPermissionState = 'granted';
      }
    } catch {
      this.motionPermissionState = 'denied';
      this.updateMotionButton();
      return false;
    }

    this.motionNeedsCalibration = true;
    this.target.addEventListener('deviceorientation', this.onMotion);
    this.motionEnabled = true;
    if (this.lastOrientation && typeof this.lastOrientation.gamma === 'number' && typeof this.lastOrientation.beta === 'number') {
      this.motionGamma = this.lastOrientation.gamma;
      this.motionBeta = this.lastOrientation.beta;
      this.calibrateMotion();
    }
    this.updateMotionButton();
    return true;
  }

  updateMotionButton() {
    if (!this.motionButton) {
      return;
    }
    if (!this.motionAvailable) {
      this.motionButton.hidden = true;
      return;
    }

    if (this.motionEnabled) {
      this.motionButton.textContent = 'Motion On';
      return;
    }

    if (this.motionPermissionState === 'denied') {
      this.motionButton.textContent = 'Motion Blocked';
      return;
    }

    this.motionButton.textContent = 'Enable Motion';
  }

  snapshot() {
    const mobileThrust = shapeAnalogAxis(-this.move.y, {
      deadzone: 0.08,
      exponent: 0.78,
      gain: 1.18,
    });
    const mobileStrafe = shapeAnalogAxis(this.move.x, {
      deadzone: 0.08,
      exponent: 0.9,
      gain: 1.05,
    });
    const yaw = this.motionEnabled && !this.motionNeedsCalibration
      ? clampAxis((this.motionGamma - this.motionBaseGamma) / 24)
      : this.aim.x;
    const pitch = this.motionEnabled && !this.motionNeedsCalibration
      ? clampAxis((this.motionBeta - this.motionBaseBeta) / 20)
      : -this.aim.y;

    const snapshot = createControlSnapshot({
      thrust: mobileThrust,
      strafe: mobileStrafe,
      yaw,
      pitch,
      vertical: Number(this.ascendHeld) - Number(this.descendHeld),
      fire: this.fireHeld,
      abilityPressed: this.abilityQueued,
      pausePressed: this.pauseQueued,
    });

    this.abilityQueued = false;
    this.pauseQueued = false;
    return snapshot;
  }

  reset() {
    this.move.activeId = null;
    this.move.x = 0;
    this.move.y = 0;
    this.aim.activeId = null;
    this.aim.x = 0;
    this.aim.y = 0;
    this.fireHeld = false;
    this.abilityQueued = false;
    this.pauseQueued = false;
    this.ascendHeld = false;
    this.descendHeld = false;
    this.renderThumb(this.move, this.moveThumb);
    this.renderThumb(this.aim, this.aimThumb);
  }

  dispose() {
    this.reset();
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('deviceorientation', this.onMotion);
  }
}

export class InputController {
  constructor({ keyboard = null, mobile = null } = {}) {
    this.keyboard = keyboard ?? new KeyboardInputController(window, document);
    this.mobile = mobile ?? null;
  }

  snapshot() {
    return combineControlSnapshots(
      this.keyboard?.snapshot?.(),
      this.mobile?.snapshot?.(),
    );
  }

  reset() {
    this.keyboard?.reset?.();
    this.mobile?.reset?.();
  }

  dispose() {
    this.keyboard?.dispose?.();
    this.mobile?.dispose?.();
  }
}
