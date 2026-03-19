import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'https://esm.sh/react@18.3.1';

import { ROMDetector } from '../../utils/detector.js';
import { CoreLoader } from '../../core/loader.js';
import { EmulatorDB } from '../../storage/db.js';
import { InputController } from '../../controllers/input.js';

const DEFAULT_SETTINGS = {
    frameSkip: 0,
    fpsLimit: 60
};

function getRomId(systemType, romFile) {
    return `${systemType}:${romFile.name}:${romFile.size}:${romFile.lastModified}`;
}

async function resumeAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!window.__webemuAudioCtx) {
        window.__webemuAudioCtx = new Ctx();
    }
    if (window.__webemuAudioCtx.state === 'suspended') {
        await window.__webemuAudioCtx.resume();
    }
    return window.__webemuAudioCtx;
}

export function useEmulator() {
    const refs = useMemo(() => ({
        viewportRef: { current: null },
        gbaCanvasRef: { current: null },
        pspCanvasRef: { current: null },
        ndsContainerRef: { current: null },
        ndsTopRef: { current: null },
        ndsBottomRef: { current: null },
        touchRootRef: { current: null }
    }), []);

    const dbRef = useRef(new EmulatorDB());
    const inputRef = useRef(null);
    const coreRef = useRef(null);
    const lastLoadRef = useRef(null);
    const autoSaveRef = useRef(0);
    const fpsRef = useRef(0);
    const romBufferRef = useRef(null);

    const [currentSystem, setCurrentSystem] = useState(null);
    const [currentRom, setCurrentRom] = useState(null);
    const [romId, setRomId] = useState(null);
    const [status, setStatus] = useState('idle');
    const [paused, setPaused] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Ready');
    const [progress, setProgress] = useState(0);
    const [fps, setFps] = useState(0);
    const [error, setError] = useState(null);
    const [touchVisible, setTouchVisible] = useState(false);
    const [states, setStates] = useState([]);
    const [stateSlot, setStateSlot] = useState(1);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [mapping, setMapping] = useState({});

    const stopTimers = useCallback(async () => {
        if (autoSaveRef.current) {
            clearInterval(autoSaveRef.current);
            autoSaveRef.current = 0;
        }
        if (fpsRef.current) {
            clearInterval(fpsRef.current);
            fpsRef.current = 0;
        }
    }, []);

    const refreshStates = useCallback(async (activeRomId) => {
        if (!activeRomId) return;
        try {
            const rows = await dbRef.current.listStates(activeRomId);
            setStates(rows);
        } catch (err) {
            console.warn('State list refresh failed:', err);
        }
    }, []);

    const applyPerformanceSettings = useCallback(() => {
        const core = coreRef.current;
        if (!core) return;
        core.setFrameSkip?.(settings.frameSkip);
        core.setFpsLimit?.(settings.fpsLimit);
    }, [settings]);

    const destroyCurrentCore = useCallback(async () => {
        await stopTimers();
        const core = coreRef.current;
        if (!core) return;

        try {
            await core.syncSaves?.();
            await core.destroy?.();
        } finally {
            coreRef.current = null;
            setPaused(false);
            setCurrentSystem(null);
        }
    }, [stopTimers]);

    const setupInput = useCallback(() => {
        if (inputRef.current) return;

        inputRef.current = new InputController({
            touchRoot: refs.touchRootRef.current,
            ndsBottomCanvas: refs.ndsBottomRef.current,
            viewport: refs.viewportRef.current
        });

        inputRef.current.onAction(async ({ action, pressed, value }) => {
            const core = coreRef.current;
            if (pressed && action === 'QUICK_SAVE') {
                await saveState(stateSlot);
                return;
            }
            if (pressed && action === 'QUICK_LOAD') {
                await loadState(stateSlot);
                return;
            }
            if (pressed && action === 'FAST_FORWARD') {
                core?.setFpsLimit?.(120);
                return;
            }
            if (!pressed && action === 'FAST_FORWARD') {
                core?.setFpsLimit?.(settings.fpsLimit);
                return;
            }
            core?.handleInput?.(action, pressed, value);
        });

        inputRef.current.onStylus((payload) => {
            coreRef.current?.handleStylus?.(payload);
        });

        inputRef.current.onAnalog((payload) => {
            coreRef.current?.handleAnalog?.(payload);
        });

        inputRef.current.start();
    }, [refs, settings.fpsLimit, stateSlot]);

    const loadPersistedUiSettings = useCallback(async () => {
        const frameSkip = await dbRef.current.getSetting('frameSkip', DEFAULT_SETTINGS.frameSkip);
        const fpsLimit = await dbRef.current.getSetting('fpsLimit', DEFAULT_SETTINGS.fpsLimit);
        const savedMapping = await dbRef.current.getSetting('inputMapping', {});

        setSettings({ frameSkip, fpsLimit });
        setMapping(savedMapping || {});
    }, []);

    const startRuntimeObservers = useCallback((activeRomId) => {
        autoSaveRef.current = setInterval(async () => {
            try {
                await coreRef.current?.syncSaves?.();
            } catch (err) {
                console.warn('Autosave failed:', err);
            }
        }, 20000);

        fpsRef.current = setInterval(() => {
            const value = coreRef.current?.getFPS?.() ?? 0;
            setFps(Number.isFinite(value) ? value : 0);
        }, 500);

        refreshStates(activeRomId).catch(() => {});
    }, [refreshStates]);

    const preloadIdleCores = useCallback((activeSystem) => {
        const systems = ['gba', 'nds', 'psp'].filter((x) => x !== activeSystem);
        const run = async () => {
            for (const systemType of systems) {
                try {
                    await CoreLoader.loadCore(systemType, () => {});
                } catch (err) {
                    console.warn(`Idle preload failed for ${systemType}:`, err?.message || err);
                }
            }
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => run(), { timeout: 10000 });
        } else {
            setTimeout(run, 1800);
        }
    }, []);

    const loadRom = useCallback(async (file) => {
        if (!file) return;

        setError(null);
        setIsLoading(true);
        setStatus('loading');
        setLoadingMessage('Detecting system...');
        setProgress(0);

        await resumeAudioContext();

        const systemType = ROMDetector.getSystemType(file);
        if (systemType === 'unknown') {
            const err = new Error('Unsupported ROM format. Use .gba, .nds, .iso, or .cso.');
            setError(err.message);
            setStatus('error');
            setIsLoading(false);
            throw err;
        }

        const nextRomId = getRomId(systemType, file);
        lastLoadRef.current = { file };

        try {
            await destroyCurrentCore();

            setLoadingMessage(`Fetching ${systemType.toUpperCase()} core...`);
            const coreAssets = await CoreLoader.loadCore(systemType, (msg) => {
                setLoadingMessage(msg);
                const m = msg.match(/(\d+)%/);
                if (m) {
                    setProgress(Number(m[1]));
                }
            });

            setLoadingMessage('Initializing core wrapper...');
            const module = await import(`../../core/${systemType}.js`);
            const EmulatorCore = module.default;

            let target;
            if (systemType === 'gba') target = refs.gbaCanvasRef.current;
            if (systemType === 'nds') target = refs.ndsContainerRef.current;
            if (systemType === 'psp') target = refs.pspCanvasRef.current;

            const emulator = new EmulatorCore(target, coreAssets, {
                db: dbRef.current,
                systemType,
                romId: nextRomId
            });

            const buffer = await file.arrayBuffer();
            romBufferRef.current = buffer;

            setLoadingMessage('Loading ROM binary...');
            await emulator.loadROM(buffer, file.name);
            await emulator.loadPersistentData?.();

            coreRef.current = emulator;
            setCurrentSystem(systemType);
            setCurrentRom({
                name: file.name,
                size: file.size,
                lastModified: file.lastModified
            });
            setRomId(nextRomId);

            if (inputRef.current) {
                inputRef.current.setSystem(systemType);
                inputRef.current.mapStylusCanvas(refs.ndsBottomRef.current);
                inputRef.current.createTouchOverlay(refs.touchRootRef.current);
                if (Object.keys(mapping).length) {
                    inputRef.current.setMapping(mapping);
                }
            }

            applyPerformanceSettings();

            emulator.start();
            setStatus('running');
            setPaused(false);
            setLoadingMessage('Ready');
            setProgress(100);
            startRuntimeObservers(nextRomId);
            preloadIdleCores(systemType);
        } catch (err) {
            setStatus('error');
            setError(err?.message || 'Failed to load ROM');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [applyPerformanceSettings, destroyCurrentCore, mapping, preloadIdleCores, refs, startRuntimeObservers]);

    const retryLastLoad = useCallback(async () => {
        if (!lastLoadRef.current?.file) return;
        await loadRom(lastLoadRef.current.file);
    }, [loadRom]);

    const togglePause = useCallback(async () => {
        const core = coreRef.current;
        if (!core) return;

        const nextPaused = !paused;
        setPaused(nextPaused);
        setStatus(nextPaused ? 'paused' : 'running');

        if (nextPaused) {
            core.onVisibilityChange?.(true);
            try {
                await window.__webemuAudioCtx?.suspend?.();
            } catch (err) {
                console.warn('Audio suspend failed:', err);
            }
        } else {
            core.onVisibilityChange?.(false);
            await resumeAudioContext();
        }
    }, [paused]);

    const reset = useCallback(async () => {
        if (!currentRom || !currentSystem || !romBufferRef.current) return;

        try {
            setStatus('loading');
            setLoadingMessage('Resetting emulator...');
            const core = coreRef.current;
            await core?.syncSaves?.();
            await core?.destroy?.();

            const module = await import(`../../core/${currentSystem}.js`);
            const EmulatorCore = module.default;
            const assets = await CoreLoader.loadCore(currentSystem, () => {});

            let target;
            if (currentSystem === 'gba') target = refs.gbaCanvasRef.current;
            if (currentSystem === 'nds') target = refs.ndsContainerRef.current;
            if (currentSystem === 'psp') target = refs.pspCanvasRef.current;

            const emulator = new EmulatorCore(target, assets, {
                db: dbRef.current,
                systemType: currentSystem,
                romId
            });

            await emulator.loadROM(romBufferRef.current, currentRom.name);
            await emulator.loadPersistentData?.();
            applyPerformanceSettings();
            emulator.start();
            coreRef.current = emulator;
            setPaused(false);
            setStatus('running');
        } catch (err) {
            setStatus('error');
            setError(err?.message || 'Reset failed');
        }
    }, [applyPerformanceSettings, currentRom, currentSystem, refs, romId]);

    const saveState = useCallback(async (slot) => {
        if (!coreRef.current || !romId) return;
        await coreRef.current.saveState?.(slot);
        await refreshStates(romId);
    }, [refreshStates, romId]);

    const loadState = useCallback(async (slot) => {
        if (!coreRef.current || !romId) return;
        await coreRef.current.loadState?.(slot);
    }, [romId]);

    const quickSave = useCallback(async () => {
        await saveState(stateSlot);
    }, [saveState, stateSlot]);

    const quickLoad = useCallback(async () => {
        await loadState(stateSlot);
    }, [loadState, stateSlot]);

    const deleteState = useCallback(async (slot) => {
        if (!romId || !currentSystem) return;
        await dbRef.current.deleteState(currentSystem, romId, slot);
        await refreshStates(romId);
    }, [currentSystem, refreshStates, romId]);

    const renameState = useCallback(async (slot, label) => {
        if (!romId || !currentSystem) return;
        await dbRef.current.renameState(currentSystem, romId, slot, label);
        await refreshStates(romId);
    }, [currentSystem, refreshStates, romId]);

    const exportSaveData = useCallback(async () => {
        const blob = await coreRef.current?.exportSaveData?.();
        if (!blob) return;

        const safeName = String(romId || 'save').replace(/[^a-z0-9._-]+/gi, '_');
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeName}.sav.bin`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [romId]);

    const updateSettings = useCallback(async (nextSettings) => {
        const merged = { ...settings, ...nextSettings };
        setSettings(merged);

        await dbRef.current.setSetting('frameSkip', merged.frameSkip);
        await dbRef.current.setSetting('fpsLimit', merged.fpsLimit);

        coreRef.current?.setFrameSkip?.(merged.frameSkip);
        coreRef.current?.setFpsLimit?.(merged.fpsLimit);
    }, [settings]);

    const remapAction = useCallback(async (action, code) => {
        const next = { ...mapping, [action]: code };
        setMapping(next);
        await dbRef.current.setSetting('inputMapping', next);
        inputRef.current?.setMapping(next);
    }, [mapping]);

    const toggleTouchOverlay = useCallback(() => {
        setTouchVisible((value) => !value);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            await dbRef.current.init();
            await loadPersistedUiSettings();
            if (!active) return;
            setupInput();
        })().catch((err) => {
            setStatus('error');
            setError(err?.message || 'Initialization failed');
        });

        return () => {
            active = false;
            stopTimers().catch(() => {});
            destroyCurrentCore().catch(() => {});
            inputRef.current?.stop?.();
        };
    }, [destroyCurrentCore, loadPersistedUiSettings, setupInput, stopTimers]);

    useEffect(() => {
        const onVisibility = () => {
            coreRef.current?.onVisibilityChange?.(document.hidden);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    return {
        refs,
        emulatorRef: coreRef,
        loadRom,
        retryLastLoad,
        togglePause,
        reset,
        saveState,
        loadState,
        quickSave,
        quickLoad,
        deleteState,
        renameState,
        exportSaveData,
        updateSettings,
        remapAction,
        toggleTouchOverlay,
        setStateSlot,
        currentSystem,
        currentRom,
        status,
        paused,
        isLoading,
        loadingMessage,
        progress,
        fps,
        error,
        touchVisible,
        states,
        stateSlot,
        settings,
        mapping
    };
}
