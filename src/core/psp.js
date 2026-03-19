import { CoreLoader } from './loader.js';

export default class PSPCore {
    constructor(canvasElement, coreAssets, options = {}) {
        this.canvas = canvasElement;
        this.coreAssets = coreAssets;
        this.db = options.db;
        this.systemType = options.systemType || 'psp';
        this.romId = options.romId || null;
        this.isRunning = false;
        
        this.canvas.style.display = 'none';

        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        this.iframe.style.outline = 'none';
        this.iframe.style.background = '#000';
        this.iframe.src = '/cores/psp.html';
        this.canvas.parentNode.appendChild(this.iframe);

        this.iframe.onload = () => {
            console.log('[PSP Core] jspspemu iframe ready');
            this.iframeLoaded = true;
            if (this.pendingLoad) {
                this.loadROM(this.pendingLoad.buffer, this.pendingLoad.filename);
                this.pendingLoad = null;
            }
        };
    }

    async loadROM(buffer, filename) {
        console.log("[PSP Core] Queueing ISO: ${filename}");
        if (!this.iframeLoaded) {
            this.pendingLoad = { buffer, filename };
            return;
        }

        console.log("[PSP Core] Mounting ISO to jspspemu iframe: ${filename}");
        this.iframe.contentWindow.postMessage({ type: 'loadROM', buffer, filename }, '*');
        this.iframe.focus();
    }

    async loadPersistentData() {}

    start() {
        this.isRunning = true;
        console.log('[PSP Core] Started.');
    }

    handleInput(action, pressed, value) {
        if (!this.iframeLoaded || !this.iframe.contentWindow) return;
        this.iframe.contentWindow.postMessage({ type: 'input', action, pressed, value }, '*');
    }

    handleAnalog({ x, y }) {}

    setFrameSkip(frameSkip) {}
    
    setFpsLimit(limit) {}

    getFPS() { return 60; }

    async saveState(slot) {}
    async loadState(slot) {}
    async syncSaves() {}
    async exportSaveData() { return null; }

    async destroy() {
        this.isRunning = false;
        if (this.iframe && this.iframe.parentNode) {
            this.iframe.parentNode.removeChild(this.iframe);
        }
        this.canvas.style.display = '';
        this.iframe = null;
    }

    onVisibilityChange(isHidden) {}
}
