const DB_NAME = 'webemu-platform';
const DB_VERSION = 1;
const STORES = {
    SAVES: 'saves',
    STATES: 'states',
    SETTINGS: 'settings'
};

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
}

export class EmulatorDB {
    constructor() {
        this.db = null;
        this.mountedPaths = new Set();
    }

    async init() {
        if (this.db) return this.db;

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORES.SAVES)) {
                const saves = db.createObjectStore(STORES.SAVES, { keyPath: 'id' });
                saves.createIndex('byRom', 'romId', { unique: false });
                saves.createIndex('bySystem', 'system', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.STATES)) {
                const states = db.createObjectStore(STORES.STATES, { keyPath: 'id' });
                states.createIndex('byRom', 'romId', { unique: false });
                states.createIndex('bySlot', 'slot', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }
        };

        this.db = await requestToPromise(request);
        return this.db;
    }

    async put(storeName, value) {
        await this.init();
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        await txDone(tx);
        return value;
    }

    async get(storeName, key) {
        await this.init();
        const tx = this.db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        const value = await requestToPromise(request);
        await txDone(tx);
        return value;
    }

    async getAllByIndex(storeName, indexName, key) {
        await this.init();
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(key);
        const value = await requestToPromise(request);
        await txDone(tx);
        return value;
    }

    async setSetting(key, value) {
        return this.put(STORES.SETTINGS, {
            key,
            value,
            updatedAt: Date.now()
        });
    }

    async getSetting(key, defaultValue = null) {
        const row = await this.get(STORES.SETTINGS, key);
        return row ? row.value : defaultValue;
    }

    async saveBattery(system, romId, fileName, dataBlob) {
        const id = `${system}:${romId}:${fileName}`;
        return this.put(STORES.SAVES, {
            id,
            system,
            romId,
            fileName,
            data: dataBlob,
            updatedAt: Date.now()
        });
    }

    async listBatterySaves(romId) {
        return this.getAllByIndex(STORES.SAVES, 'byRom', romId);
    }

    async saveState(system, romId, slot, stateBlob, meta = {}) {
        const id = `${system}:${romId}:slot:${slot}`;
        return this.put(STORES.STATES, {
            id,
            system,
            romId,
            slot,
            data: stateBlob,
            updatedAt: Date.now(),
            meta
        });
    }

    async loadState(system, romId, slot) {
        const id = `${system}:${romId}:slot:${slot}`;
        return this.get(STORES.STATES, id);
    }

    async deleteState(system, romId, slot) {
        await this.init();
        const id = `${system}:${romId}:slot:${slot}`;
        const tx = this.db.transaction(STORES.STATES, 'readwrite');
        tx.objectStore(STORES.STATES).delete(id);
        await txDone(tx);
    }

    async renameState(system, romId, slot, label) {
        const row = await this.loadState(system, romId, slot);
        if (!row) return null;

        row.meta = {
            ...(row.meta || {}),
            label
        };
        row.updatedAt = Date.now();
        await this.put(STORES.STATES, row);
        return row;
    }

    async listStates(romId) {
        const rows = await this.getAllByIndex(STORES.STATES, 'byRom', romId);
        return rows.sort((a, b) => a.slot - b.slot);
    }

    getFS(moduleRef) {
        return moduleRef?.FS || globalThis.FS;
    }

    getIDBFS(moduleRef) {
        return moduleRef?.IDBFS || globalThis.IDBFS;
    }

    ensurePath(fs, path) {
        const parts = path.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current += `/${part}`;
            try {
                fs.mkdir(current);
            } catch (error) {
                // Ignore EEXIST.
            }
        }
    }

    ensureParentDir(fs, filePath) {
        const parts = filePath.split('/').filter(Boolean);
        if (parts.length <= 1) return;
        const parent = `/${parts.slice(0, -1).join('/')}`;
        this.ensurePath(fs, parent);
    }

    syncfs(moduleRef, populate = false) {
        const fs = this.getFS(moduleRef);
        if (!fs || typeof fs.syncfs !== 'function') {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            fs.syncfs(populate, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    async mountAndSyncFS(moduleRef, mountPath = '/data') {
        const fs = this.getFS(moduleRef);
        const idbfs = this.getIDBFS(moduleRef);

        if (!fs || !idbfs || typeof fs.mount !== 'function') {
            return false;
        }

        this.ensurePath(fs, mountPath);

        if (!this.mountedPaths.has(mountPath)) {
            try {
                fs.mount(idbfs, {}, mountPath);
            } catch (error) {
                const alreadyMounted = String(error?.message || '').toLowerCase().includes('busy');
                if (!alreadyMounted) {
                    throw error;
                }
            }
            this.mountedPaths.add(mountPath);
        }

        await this.syncfs(moduleRef, true);
        return true;
    }

    listFilesRecursive(fs, rootPath) {
        const out = [];
        const walk = (currentPath) => {
            let entries = [];
            try {
                entries = fs.readdir(currentPath);
            } catch (error) {
                return;
            }

            for (const entry of entries) {
                if (entry === '.' || entry === '..') continue;
                const fullPath = `${currentPath}/${entry}`.replace(/\/+/g, '/');
                let stat;
                try {
                    stat = fs.stat(fullPath);
                } catch (error) {
                    continue;
                }

                if (fs.isDir(stat.mode)) {
                    walk(fullPath);
                } else if (fs.isFile(stat.mode)) {
                    out.push(fullPath);
                }
            }
        };

        walk(rootPath);
        return out;
    }

    async persistBatteryFiles(moduleRef, system, romId, rootPath = '/data') {
        const fs = this.getFS(moduleRef);
        if (!fs || !romId) return;

        const candidates = this.listFilesRecursive(fs, rootPath);
        const saveExtensions = new Set(['.sav', '.srm', '.dsv', '.dat', '.bin']);

        for (const filePath of candidates) {
            const lower = filePath.toLowerCase();
            const isSave = [...saveExtensions].some((ext) => lower.endsWith(ext));
            if (!isSave) continue;

            let data;
            try {
                data = fs.readFile(filePath, { encoding: 'binary' });
            } catch (error) {
                continue;
            }

            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            await this.saveBattery(system, romId, filePath, blob);
        }
    }

    async restoreBatteryFiles(moduleRef, romId) {
        const fs = this.getFS(moduleRef);
        if (!fs || !romId) return;

        const rows = await this.listBatterySaves(romId);
        for (const row of rows) {
            if (!row?.fileName || !row?.data) continue;
            const buffer = await row.data.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const path = row.fileName.startsWith('/') ? row.fileName : `/${row.fileName}`;

            this.ensureParentDir(fs, path);
            try {
                fs.writeFile(path, bytes, { encoding: 'binary' });
            } catch (error) {
                // If file exists, overwrite by unlink + write.
                try {
                    fs.unlink(path);
                } catch (unlinkError) {
                    // Ignore missing file.
                }
                fs.writeFile(path, bytes, { encoding: 'binary' });
            }
        }
    }
}
