const DEFAULT_MAPPING = {
    A: 'KeyX',
    B: 'KeyZ',
    X: 'KeyS',
    Y: 'KeyA',
    L: 'KeyQ',
    R: 'KeyW',
    START: 'Enter',
    SELECT: 'ShiftRight',
    UP: 'ArrowUp',
    DOWN: 'ArrowDown',
    LEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight',
    FAST_FORWARD: 'Tab',
    QUICK_SAVE: 'F5',
    QUICK_LOAD: 'F8'
};

const GAMEPAD_BUTTON_MAP = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'L',
    5: 'R',
    8: 'SELECT',
    9: 'START',
    12: 'UP',
    13: 'DOWN',
    14: 'LEFT',
    15: 'RIGHT'
};

export class InputController {
    constructor(options = {}) {
        this.mapping = { ...DEFAULT_MAPPING, ...(options.mapping || {}) };
        this.keyToAction = this.buildKeyReverseMap(this.mapping);
        this.activeActions = new Map();
        this.handlers = {
            action: new Set(),
            stylus: new Set(),
            analog: new Set()
        };

        this.touchRoot = options.touchRoot || null;
        this.ndsBottomCanvas = options.ndsBottomCanvas || null;
        this.viewport = options.viewport || null;
        this.currentSystem = null;

        this.polling = false;
        this.pollRaf = 0;
        this.lastPollTs = 0;
        this.pollIntervalMs = 16;

        this.boundKeyDown = (event) => this.onKeyDown(event);
        this.boundKeyUp = (event) => this.onKeyUp(event);
        this.boundTouchMovePrevent = (event) => event.preventDefault();
    }

    buildKeyReverseMap(mapping) {
        const keyToAction = new Map();
        for (const [action, keyCode] of Object.entries(mapping)) {
            keyToAction.set(keyCode, action);
        }
        return keyToAction;
    }

    setMapping(nextMapping) {
        this.mapping = { ...this.mapping, ...nextMapping };
        this.keyToAction = this.buildKeyReverseMap(this.mapping);
    }

    remapAction(action, code) {
        this.mapping[action] = code;
        this.keyToAction = this.buildKeyReverseMap(this.mapping);
    }

    onAction(handler) {
        this.handlers.action.add(handler);
        return () => this.handlers.action.delete(handler);
    }

    onStylus(handler) {
        this.handlers.stylus.add(handler);
        return () => this.handlers.stylus.delete(handler);
    }

    onAnalog(handler) {
        this.handlers.analog.add(handler);
        return () => this.handlers.analog.delete(handler);
    }

    emitAction(action, pressed, value = 1) {
        const previous = this.activeActions.get(action);
        if (previous === pressed && value === 1) return;

        this.activeActions.set(action, pressed);
        for (const handler of this.handlers.action) {
            handler({ action, pressed, value });
        }
    }

    emitStylus(payload) {
        for (const handler of this.handlers.stylus) {
            handler(payload);
        }
    }

    emitAnalog(payload) {
        for (const handler of this.handlers.analog) {
            handler(payload);
        }
    }

    onKeyDown(event) {
        if (event.repeat) return;
        const action = this.keyToAction.get(event.code);
        if (!action) return;

        event.preventDefault();
        this.emitAction(action, true);
    }

    onKeyUp(event) {
        const action = this.keyToAction.get(event.code);
        if (!action) return;

        event.preventDefault();
        this.emitAction(action, false);
    }

    startKeyboard() {
        window.addEventListener('keydown', this.boundKeyDown, { passive: false });
        window.addEventListener('keyup', this.boundKeyUp, { passive: false });
    }

    stopKeyboard() {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
    }

    startGamepadPolling() {
        if (this.polling) return;
        this.polling = true;

        const poll = (ts) => {
            if (!this.polling) return;
            if (ts - this.lastPollTs >= this.pollIntervalMs) {
                this.lastPollTs = ts;
                this.pollGamepads();
            }
            this.pollRaf = requestAnimationFrame(poll);
        };

        this.pollRaf = requestAnimationFrame(poll);
    }

    stopGamepadPolling() {
        this.polling = false;
        if (this.pollRaf) {
            cancelAnimationFrame(this.pollRaf);
            this.pollRaf = 0;
        }
    }

    pollGamepads() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gamepad of gamepads) {
            if (!gamepad) continue;

            for (const [indexStr, action] of Object.entries(GAMEPAD_BUTTON_MAP)) {
                const index = Number(indexStr);
                const button = gamepad.buttons[index];
                if (!button) continue;
                this.emitAction(action, button.pressed, button.value ?? 1);
            }

            const x = gamepad.axes[0] || 0;
            const y = gamepad.axes[1] || 0;
            if (Math.abs(x) > 0.08 || Math.abs(y) > 0.08) {
                this.emitAnalog({ x, y, source: 'gamepad' });
            }
        }
    }

    mapStylusCanvas(ndsBottomCanvas) {
        this.ndsBottomCanvas = ndsBottomCanvas;
        if (!this.ndsBottomCanvas) return;

        const toCoords = (event) => {
            const rect = this.ndsBottomCanvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
            return {
                x: x / rect.width,
                y: y / rect.height
            };
        };

        const stylusDown = (event) => {
            const { x, y } = toCoords(event);
            this.emitStylus({ down: true, x, y, source: 'touch' });
        };

        const stylusMove = (event) => {
            if ((event.buttons & 1) !== 1 && event.pointerType === 'mouse') return;
            const { x, y } = toCoords(event);
            this.emitStylus({ down: true, x, y, source: 'touch' });
        };

        const stylusUp = () => {
            this.emitStylus({ down: false, x: 0, y: 0, source: 'touch' });
        };

        this.ndsBottomCanvas.addEventListener('pointerdown', stylusDown, { passive: true });
        this.ndsBottomCanvas.addEventListener('pointermove', stylusMove, { passive: true });
        this.ndsBottomCanvas.addEventListener('pointerup', stylusUp, { passive: true });
        this.ndsBottomCanvas.addEventListener('pointercancel', stylusUp, { passive: true });
    }

    createTouchOverlay(touchRoot) {
        if (!touchRoot) return;
        this.touchRoot = touchRoot;

        touchRoot.innerHTML = `
            <div class="touch-left">
                <button data-action="UP">▲</button>
                <div class="touch-row">
                    <button data-action="LEFT">◀</button>
                    <button data-action="DOWN">▼</button>
                    <button data-action="RIGHT">▶</button>
                </div>
            </div>
            <div class="touch-right">
                <button data-action="Y">Y</button>
                <button data-action="X">X</button>
                <button data-action="B">B</button>
                <button data-action="A">A</button>
                <button data-action="START">Start</button>
                <button data-action="SELECT">Select</button>
            </div>
            <div class="touch-analog" id="touch-analog">
                <div class="knob"></div>
            </div>
        `;

        const press = (event) => {
            const action = event.target?.dataset?.action;
            if (!action) return;
            event.preventDefault();
            this.emitAction(action, true);
        };

        const release = (event) => {
            const action = event.target?.dataset?.action;
            if (!action) return;
            event.preventDefault();
            this.emitAction(action, false);
        };

        touchRoot.querySelectorAll('button[data-action]').forEach((button) => {
            button.addEventListener('touchstart', press, { passive: false });
            button.addEventListener('touchend', release, { passive: false });
            button.addEventListener('touchcancel', release, { passive: false });
        });

        const analog = touchRoot.querySelector('#touch-analog');
        const knob = analog?.querySelector('.knob');
        if (analog && knob) {
            let active = false;

            const onMove = (event) => {
                if (!active) return;
                const touch = event.touches[0];
                const rect = analog.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = (touch.clientX - cx) / (rect.width / 2);
                const dy = (touch.clientY - cy) / (rect.height / 2);
                const x = Math.max(-1, Math.min(1, dx));
                const y = Math.max(-1, Math.min(1, dy));

                knob.style.transform = `translate(${x * 24}px, ${y * 24}px)`;
                this.emitAnalog({ x, y, source: 'touch' });
            };

            analog.addEventListener('touchstart', (event) => {
                event.preventDefault();
                active = true;
                onMove(event);
            }, { passive: false });

            analog.addEventListener('touchmove', (event) => {
                event.preventDefault();
                onMove(event);
            }, { passive: false });

            analog.addEventListener('touchend', (event) => {
                event.preventDefault();
                active = false;
                knob.style.transform = 'translate(0px, 0px)';
                this.emitAnalog({ x: 0, y: 0, source: 'touch' });
            }, { passive: false });
        }
    }

    setSystem(systemType) {
        this.currentSystem = systemType;
    }

    start() {
        this.startKeyboard();
        this.startGamepadPolling();

        if (this.viewport) {
            this.viewport.addEventListener('touchmove', this.boundTouchMovePrevent, { passive: false });
        }
    }

    stop() {
        this.stopKeyboard();
        this.stopGamepadPolling();

        if (this.viewport) {
            this.viewport.removeEventListener('touchmove', this.boundTouchMovePrevent);
        }
    }
}
