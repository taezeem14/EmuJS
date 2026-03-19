import { ROMDetector } from './utils/detector.js';
import { CoreLoader } from './core/loader.js';
import { EmulatorDB } from './storage/db.js';
import { InputController } from './controllers/input.js';

class EmulatorPlatform {
    constructor() {
        this.currentCore = null;
        this.currentSystem = null;
        this.currentRomId = null;
        this.autoSaveTimer = null;
        this.fpsTimer = null;
        this.db = new EmulatorDB();
        this.frameSkip = 0;
        this.fpsLimit = 60;
        
        this.ui = {
            romInput: document.getElementById('rom-input'),
            loading: document.getElementById('loading-indicator'),
            loadingText: document.getElementById('loading-text'),
            viewport: document.getElementById('viewport-container'),
            touchControls: document.getElementById('touch-controls'),
            canvases: {
                gba: document.getElementById('gba-canvas'),
                nds: document.getElementById('nds-container'),
                psp: document.getElementById('psp-canvas')
            },
            quickSave: document.getElementById('btn-quick-save'),
            quickLoad: document.getElementById('btn-quick-load'),
            exportSave: document.getElementById('btn-export-save'),
            settings: document.getElementById('btn-settings'),
            frameSkip: document.getElementById('frame-skip'),
            fpsLimit: document.getElementById('fps-limit'),
            stateSlot: document.getElementById('state-slot'),
            fpsValue: document.getElementById('fps-value'),
            systemInfo: document.getElementById('system-info')
        };

        this.input = new InputController({
            touchRoot: this.ui.touchControls,
            ndsBottomCanvas: document.getElementById('nds-bottom'),
            viewport: this.ui.viewport
        });

        this.bindEvents();
    }

    async init() {
        await this.db.init();
        await this.loadSavedSettings();
        this.bindInputHandlers();
        this.input.createTouchOverlay(this.ui.touchControls);
        this.input.mapStylusCanvas(document.getElementById('nds-bottom'));
        this.input.start();
    }

    bindEvents() {
        this.ui.romInput.addEventListener('change', (e) => this.handleROMUpload(e));
        document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
        this.ui.quickSave?.addEventListener('click', () => this.quickSave());
        this.ui.quickLoad?.addEventListener('click', () => this.quickLoad());
        this.ui.exportSave?.addEventListener('click', () => this.exportSaveData());
        this.ui.settings?.addEventListener('click', () => this.openRemapDialog());

        this.ui.frameSkip?.addEventListener('change', (event) => {
            this.frameSkip = Number(event.target.value || 0);
            this.db.setSetting('frameSkip', this.frameSkip).catch(console.warn);
            if (this.currentCore?.setFrameSkip) {
                this.currentCore.setFrameSkip(this.frameSkip);
            }
        });

        this.ui.fpsLimit?.addEventListener('change', (event) => {
            this.fpsLimit = Number(event.target.value || 60);
            this.db.setSetting('fpsLimit', this.fpsLimit).catch(console.warn);
            if (this.currentCore?.setFpsLimit) {
                this.currentCore.setFpsLimit(this.fpsLimit);
            }
        });
        
        // Auto-pause when tab is out of focus for performance
        document.addEventListener('visibilitychange', () => {
            if (this.currentCore && typeof this.currentCore.onVisibilityChange === 'function') {
                this.currentCore.onVisibilityChange(document.hidden);
            }
        });
    }

    bindInputHandlers() {
        this.input.onAction(async ({ action, pressed, value }) => {
            if (pressed && action === 'QUICK_SAVE') {
                await this.quickSave();
                return;
            }

            if (pressed && action === 'QUICK_LOAD') {
                await this.quickLoad();
                return;
            }

            if (this.currentCore?.handleInput) {
                this.currentCore.handleInput(action, pressed, value);
            }
        });

        this.input.onStylus((payload) => {
            if (this.currentCore?.handleStylus) {
                this.currentCore.handleStylus(payload);
            }
        });

        this.input.onAnalog((payload) => {
            if (this.currentCore?.handleAnalog) {
                this.currentCore.handleAnalog(payload);
            }
        });
    }

    async loadSavedSettings() {
        this.frameSkip = await this.db.getSetting('frameSkip', 0);
        this.fpsLimit = await this.db.getSetting('fpsLimit', 60);
        const inputMapping = await this.db.getSetting('inputMapping', null);
        if (inputMapping) {
            this.input.setMapping(inputMapping);
        }

        if (this.ui.frameSkip) {
            this.ui.frameSkip.value = String(this.frameSkip);
        }

        if (this.ui.fpsLimit) {
            this.ui.fpsLimit.value = String(this.fpsLimit);
        }
    }

    async openRemapDialog() {
        const action = prompt('Action to remap (A,B,X,Y,L,R,START,SELECT,UP,DOWN,LEFT,RIGHT,FAST_FORWARD,QUICK_SAVE,QUICK_LOAD):');
        if (!action) return;
        const normalized = action.trim().toUpperCase();

        alert(`Press a key now for action: ${normalized}`);
        const onKey = async (event) => {
            event.preventDefault();
            this.input.remapAction(normalized, event.code);
            await this.db.setSetting('inputMapping', this.input.mapping);
            window.removeEventListener('keydown', onKey, true);
        };

        window.addEventListener('keydown', onKey, true);
    }

    async handleROMUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const systemType = ROMDetector.getSystemType(file);
        
        if (systemType === 'unknown') {
            alert('Unsupported ROM format. Use .gba, .nds, .iso, or .cso.');
            return;
        }

        await this.loadSystem(systemType, file);
    }

    async loadSystem(systemType, romFile) {
        this.ui.loading.classList.remove('hidden');
        this.updateLoadingText(`Initializing ${systemType.toUpperCase()} module...`);
        this.hideAllCanvases();

        try {
            // Unload previous core state to prevent memory leaks
            if (this.currentCore) {
                this.updateLoadingText("Cleaning up previous session memory...");
                await this.stopAutoSave();
                await this.currentCore.destroy();
                this.currentCore = null;
            }

            this.currentRomId = this.getRomId(systemType, romFile);
            this.input.setSystem(systemType);

            // Fetch core files (JS + WASM) from CDN or Cache with progress tracking
            const coreAssets = await CoreLoader.loadCore(systemType, (msg) => {
                this.updateLoadingText(msg);
            });

            // Dynamically import the core driver class
            const coreModule = await import(`./core/${systemType}.js`);
            const EmulatorCore = coreModule.default;
            
            // Un-hide the appropriate canvas tag
            this.ui.canvases[systemType].classList.remove('hidden');

            this.currentCore = new EmulatorCore(this.ui.canvases[systemType], coreAssets, {
                db: this.db,
                systemType,
                romId: this.currentRomId
            });
            this.currentSystem = systemType;
            this.updateSystemInfo();

            // Load binary
            this.updateLoadingText(`Loading ROM: ${romFile.name}...`);
            const buffer = await romFile.arrayBuffer();
            
            // Non-blocking initialization
            await new Promise(r => setTimeout(r, 50)); 
            
            await this.currentCore.loadROM(buffer, romFile.name);
            if (this.currentCore.loadPersistentData) {
                await this.currentCore.loadPersistentData();
            }

            this.applyPerformanceSettings();
            
            this.currentCore.start();
            this.startAutoSave();
            this.startFpsUpdater();
            this.preloadIdleCores(systemType);
        } catch (error) {
            console.error('Failed to load system:', error);
            alert(`Error loading ${systemType.toUpperCase()} emulator core: ${error.message}`);
        } finally {
            this.ui.loading.classList.add('hidden');
        }
    }

    getRomId(systemType, romFile) {
        return `${systemType}:${romFile.name}:${romFile.size}:${romFile.lastModified}`;
    }

    applyPerformanceSettings() {
        if (!this.currentCore) return;
        if (this.currentCore.setFrameSkip) {
            this.currentCore.setFrameSkip(this.frameSkip);
        }
        if (this.currentCore.setFpsLimit) {
            this.currentCore.setFpsLimit(this.fpsLimit);
        }
    }

    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        this.autoSaveTimer = setInterval(async () => {
            if (!this.currentCore?.syncSaves) return;
            try {
                await this.currentCore.syncSaves();
            } catch (error) {
                console.warn('Auto-save sync failed:', error);
            }
        }, 20000);
    }

    async stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }

        if (this.currentCore?.syncSaves) {
            await this.currentCore.syncSaves();
        }
    }

    startFpsUpdater() {
        if (this.fpsTimer) {
            clearInterval(this.fpsTimer);
        }

        this.fpsTimer = setInterval(() => {
            const fps = this.currentCore?.getFPS ? this.currentCore.getFPS() : null;
            if (this.ui.fpsValue) {
                this.ui.fpsValue.textContent = fps ? `${fps.toFixed(1)} FPS` : '-- FPS';
            }
        }, 500);
    }

    async quickSave() {
        if (!this.currentCore?.saveState || !this.currentRomId) return;
        const slot = Number(this.ui.stateSlot?.value || 1);
        try {
            await this.currentCore.saveState(slot);
        } catch (error) {
            alert(`Quick save failed: ${error.message}`);
        }
    }

    async quickLoad() {
        if (!this.currentCore?.loadState || !this.currentRomId) return;
        const slot = Number(this.ui.stateSlot?.value || 1);
        try {
            await this.currentCore.loadState(slot);
        } catch (error) {
            alert(`Quick load failed: ${error.message}`);
        }
    }

    async exportSaveData() {
        if (!this.currentCore?.exportSaveData) return;
        const blob = await this.currentCore.exportSaveData();
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const safeName = String(this.currentRomId || 'save').replace(/[^a-z0-9._-]+/gi, '_');
        anchor.download = `${safeName}.sav.bin`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    preloadIdleCores(activeSystem) {
        const systems = ['gba', 'nds', 'psp'].filter((s) => s !== activeSystem);
        const run = async () => {
            for (const system of systems) {
                try {
                    await CoreLoader.loadCore(system, () => {});
                } catch (error) {
                    console.warn(`Idle preload failed for ${system}:`, error?.message || error);
                }
            }
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => run(), { timeout: 8000 });
        } else {
            setTimeout(run, 2000);
        }
    }

    updateSystemInfo() {
        if (!this.ui.systemInfo) return;
        const label = this.currentSystem ? this.currentSystem.toUpperCase() : 'NONE';
        this.ui.systemInfo.textContent = `System: ${label}`;
    }

    updateLoadingText(text) {
        if (this.ui.loadingText) {
            this.ui.loadingText.innerText = text;
        }
    }

    hideAllCanvases() {
        Object.values(this.ui.canvases).forEach(el => el.classList.add('hidden'));
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

window.onload = () => {
    const platform = new EmulatorPlatform();
    platform.init().catch((error) => {
        console.error('Platform initialization failed:', error);
        alert(`Startup failed: ${error.message}`);
    });
    window.platform = platform;
};
