import { CoreLoader } from './loader.js';

export default class NDSCore {
    constructor(canvasContainerElement, coreAssets, options = {}) {
        this.topCanvas = canvasContainerElement.querySelector('#nds-top');
        this.bottomCanvas = canvasContainerElement.querySelector('#nds-bottom');
        this.coreAssets = coreAssets;
        this.db = options.db;
        this.systemType = options.systemType || 'nds';
        this.romId = options.romId || null;
        this.wasmModule = null;
        this.isRunning = false;
        this.frameSkip = 0;
        this.fpsLimit = 60;
        this.lastFrameTs = performance.now();
        this.fps = 0;
    }

    async loadROM(buffer, filename) {
        console.log(`[NDS Core] Preparing ROM: ${filename}`);
        // MelonDS / DeSmuME WASM integration logic goes here
        
        window.Module = {
            canvas: this.topCanvas,
            locateFile: (path) => {
                if (path.endsWith('.wasm')) return this.coreAssets.wasmUrl;
                return path;
            },
        };

        await CoreLoader.injectScript(this.coreAssets.jsUrl, 'nds-script');
        this.wasmModule = window.Module;

        if (this.db) {
            await this.db.mountAndSyncFS(this.wasmModule, '/data').catch((error) => {
                console.warn('[NDS Core] IDBFS mount unavailable:', error?.message || error);
            });
        }

        if (this.wasmModule?.loadROM) {
            this.wasmModule.loadROM(new Uint8Array(buffer), filename);
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
        console.log('[NDS Core] Emulation started. Dual screen output active.');
        this.wasmModule?.run?.();
    }

    handleInput(action, pressed) {
        if (this.wasmModule?.setButtonState) {
            this.wasmModule.setButtonState(action, pressed);
        }
    }

    handleStylus({ down, x, y }) {
        if (this.wasmModule?.setStylus) {
            this.wasmModule.setStylus(down, x, y);
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
            throw new Error('Active NDS core does not expose serializeState()');
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

    onVisibilityChange(isHidden) {
        if (isHidden) {
            this.wasmModule?.pauseMainLoop?.();
        } else {
            this.wasmModule?.resumeMainLoop?.();
        }
    }

    async destroy() {
        await this.syncSaves().catch(() => {});
        this.wasmModule?.exit?.();
        this.isRunning = false;
        this.wasmModule = null;
        CoreLoader.revokeUrls(this.coreAssets);
        document.getElementById('nds-script')?.remove();
        delete window.Module;
    }
}
