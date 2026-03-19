import { CoreLoader } from './loader.js';

export default class GBACore {
    constructor(canvasElement, coreAssets, options = {}) {
        this.canvas = canvasElement;
        this.coreAssets = coreAssets;
        this.db = options.db;
        this.systemType = options.systemType || 'gba';
        this.romId = options.romId || null;
        this.isRunning = false;
        this.runtime = null;
        this.frameSkip = 0;
        this.fpsLimit = 60;
        this.lastFrameTs = performance.now();
        this.fps = 0;
    }

    async loadROM(buffer, filename) {
        console.log(`[GBA Core] Preparing ROM: ${filename}`);
        // GBA.js initialization and ROM buffer ingest logic
        await CoreLoader.injectScript(this.coreAssets.jsUrl, 'gba-script');

        this.runtime = window.Module || window.GBA || null;
        if (this.db) {
            await this.db.mountAndSyncFS(this.runtime, '/data').catch((error) => {
                console.warn('[GBA Core] IDBFS mount unavailable:', error?.message || error);
            });
        }

        if (this.runtime?.setCanvas) {
            this.runtime.setCanvas(this.canvas);
        }

        if (this.runtime?.loadROM) {
            this.runtime.loadROM(new Uint8Array(buffer), filename);
        }
    }

    async loadPersistentData() {
        if (this.db && this.runtime) {
            await this.db.syncfs(this.runtime, true).catch(() => {});
            await this.db.restoreBatteryFiles(this.runtime, this.romId).catch(() => {});
        }
    }

    start() {
        this.isRunning = true;
        console.log('[GBA Core] GBA Emulation loop started.');
        if (this.runtime?.run) {
            this.runtime.run();
        }
    }

    handleInput(action, pressed) {
        if (this.runtime?.setButtonState) {
            this.runtime.setButtonState(action, pressed);
        }
    }

    setFrameSkip(frameSkip) {
        this.frameSkip = Math.max(0, Number(frameSkip) || 0);
        if (this.runtime?.setFrameSkip) {
            this.runtime.setFrameSkip(this.frameSkip);
        }
    }

    setFpsLimit(fpsLimit) {
        this.fpsLimit = Math.max(15, Number(fpsLimit) || 60);
        if (this.runtime?.setFpsLimit) {
            this.runtime.setFpsLimit(this.fpsLimit);
        }
    }

    getFPS() {
        const now = performance.now();
        const delta = now - this.lastFrameTs;
        this.lastFrameTs = now;
        if (delta > 0) {
            this.fps = 1000 / delta;
        }
        return this.runtime?.getFPS ? this.runtime.getFPS() : this.fps;
    }

    async saveState(slot) {
        if (!this.db || !this.romId) return;
        if (!this.runtime?.serializeState) {
            throw new Error('Active GBA core does not expose serializeState()');
        }

        const raw = this.runtime.serializeState();
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        await this.db.saveState(this.systemType, this.romId, slot, blob, {
            system: this.systemType
        });
    }

    async loadState(slot) {
        if (!this.db || !this.romId || !this.runtime?.deserializeState) return;
        const row = await this.db.loadState(this.systemType, this.romId, slot);
        if (!row?.data) return;
        const buffer = await row.data.arrayBuffer();
        this.runtime.deserializeState(new Uint8Array(buffer));
    }

    async syncSaves() {
        if (this.db && this.runtime) {
            await this.db.syncfs(this.runtime, false);
            await this.db.persistBatteryFiles(this.runtime, this.systemType, this.romId);
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
            this.runtime?.pause?.();
        } else {
            this.runtime?.resume?.();
        }
    }

    async destroy() {
        await this.syncSaves().catch(() => {});
        this.runtime?.stop?.();
        this.isRunning = false;
        this.runtime = null;
        CoreLoader.revokeUrls(this.coreAssets);
        document.getElementById('gba-script')?.remove();
        delete window.Module;
    }
}
