import { CoreLoader } from './loader.js';

export default class PSPCore {
    constructor(canvasElement, coreAssets, options = {}) {
        this.canvas = canvasElement;
        this.coreAssets = coreAssets;
        this.db = options.db;
        this.systemType = options.systemType || 'psp';
        this.romId = options.romId || null;
        this.wasmModule = null;
        this.isRunning = false;
        this.frameSkip = 0;
        this.fpsLimit = 60;
        this.lastFrameTs = performance.now();
        this.fps = 0;
        
        // Disable standard context menu to prevent game interruptions
        this.canvas.oncontextmenu = (e) => e.preventDefault();
    }

    async loadROM(buffer, filename) {
        console.log(`[PSP Core] Mounting ISO: ${filename}`);
        
        // This integrates the real PPSSPP WASM entrypoint bindings.
        // Tell Emscripten where to find the matched WASM file based on Blob URL.
        window.Module = {
            canvas: this.canvas,
            locateFile: (path) => {
                if (path.endsWith('.wasm')) return this.coreAssets.wasmUrl;
                return path;
            },
            arguments: [
                '--fullscreen',
                filename
            ],
            print: (text) => console.log('[PPSSPP]', text),
            printErr: (text) => console.error('[PPSSPP]', text),
            // Called by PPSSPP emscripten loader right before setup
            preRun: [() => {
                // Mount the uploaded ISO content to the virtual filesystem root '/'
                console.log("[PSP Core] Injecting ISO into Emscripten MEMFS ...");
                FS.createDataFile('/', filename, new Uint8Array(buffer), true, true);
            }],
            onRuntimeInitialized: () => {
                console.log("[PSP Core] WASM runtime ready.");
            }
        };

        await CoreLoader.injectScript(this.coreAssets.jsUrl, 'psp-script');
        this.wasmModule = window.Module;

        if (this.db) {
            await this.db.mountAndSyncFS(this.wasmModule, '/data').catch((error) => {
                console.warn('[PSP Core] IDBFS mount unavailable:', error?.message || error);
            });
        }
    }

    async loadPersistentData() {
        if (this.db && this.wasmModule) {
            await this.db.syncfs(this.wasmModule, true).catch(() => {});
            await this.db.restoreBatteryFiles(this.wasmModule, this.romId).catch(() => {});
        }
    }

    start() {
        this.isRunning = true;
        console.log('[PSP Core] Control given to WebGL PPSSPP loop.');
        this.wasmModule?.run?.();
    }

    handleInput(action, pressed, value = 1) {
        if (this.wasmModule?.setButtonState) {
            this.wasmModule.setButtonState(action, pressed, value);
        }
    }

    handleAnalog({ x, y }) {
        if (this.wasmModule?.setAnalog) {
            this.wasmModule.setAnalog(x, y);
        }
    }

    setFrameSkip(frameSkip) {
        this.frameSkip = Math.max(0, Number(frameSkip) || 0);
        if (this.wasmModule?.setFrameSkip) {
            this.wasmModule.setFrameSkip(this.frameSkip);
        }
    }

    setFpsLimit(fpsLimit) {
        this.fpsLimit = Math.max(15, Number(fpsLimit) || 60);
        if (this.wasmModule?.setFpsLimit) {
            this.wasmModule.setFpsLimit(this.fpsLimit);
        }
    }

    getFPS() {
        const now = performance.now();
        const delta = now - this.lastFrameTs;
        this.lastFrameTs = now;
        if (delta > 0) {
            this.fps = 1000 / delta;
        }
        return this.wasmModule?.getFPS ? this.wasmModule.getFPS() : this.fps;
    }

    async saveState(slot) {
        if (!this.db || !this.romId) return;
        if (!this.wasmModule?.serializeState) {
            throw new Error('Active PSP core does not expose serializeState()');
        }

        const raw = this.wasmModule.serializeState();
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        await this.db.saveState(this.systemType, this.romId, slot, blob, {
            system: this.systemType
        });
    }

    async loadState(slot) {
        if (!this.db || !this.romId || !this.wasmModule?.deserializeState) return;
        const row = await this.db.loadState(this.systemType, this.romId, slot);
        if (!row?.data) return;
        const buffer = await row.data.arrayBuffer();
        this.wasmModule.deserializeState(new Uint8Array(buffer));
    }

    async syncSaves() {
        if (this.db && this.wasmModule) {
            await this.db.syncfs(this.wasmModule, false);
            await this.db.persistBatteryFiles(this.wasmModule, this.systemType, this.romId);
        }
    }

    async exportSaveData() {
        if (!this.db || !this.romId) return null;
        const saves = await this.db.listBatterySaves(this.romId);
        if (!saves.length) return null;
        return new Blob(saves.map((s) => s.data), { type: 'application/octet-stream' });
    }

    async destroy() {
        await this.syncSaves().catch(() => {});
        this.isRunning = false;
        if (this.wasmModule && this.wasmModule.exit) {
            try { this.wasmModule.exit(); } catch(e) {}
        }
        
        // Let the event loop run briefly to allow WebGL/audio threads to close gracefully
        await new Promise(r => setTimeout(r, 100));

        // Free WebGL Context
        const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        if (gl) {
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }

        // Clean up memory blob references
        CoreLoader.revokeUrls(this.coreAssets);

        const scriptEl = document.getElementById('psp-script');
        if (scriptEl) scriptEl.remove();
        
        // Destruct the intense global namespace hooks
        delete window.Module;
        this.wasmModule = null;
    }

    onVisibilityChange(isHidden) {
        if (this.wasmModule && this.wasmModule.pauseMainLoop) {
            if (isHidden) {
                console.log("[PSP] Tab hidden, pausing emulation loop.");
                this.wasmModule.pauseMainLoop();
            } else {
                console.log("[PSP] Tab visible, resuming emulation loop.");
                this.wasmModule.resumeMainLoop();
            }
        }
    }
}
