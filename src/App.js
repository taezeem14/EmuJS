import React, { useContext } from 'react';
import { EmulatorContext } from './ui/context/EmulatorContext.js';
import { EmulatorScreen } from './ui/components/EmulatorScreen.js';
import { ControlsPanel } from './ui/components/ControlsPanel.js';
import { SaveManager } from './ui/components/SaveManager.js';
import { SettingsPanel } from './ui/components/SettingsPanel.js';
import { StatusBar } from './ui/components/StatusBar.js';
import { ErrorBoundary } from './ui/components/ErrorBoundary.js';
import { TouchOverlay } from './ui/components/TouchOverlay.js';

export function App() {
    const emulator = useContext(EmulatorContext);

    return React.createElement(
        ErrorBoundary,
        null,
        React.createElement(
            'div',
            { className: 'react-app dark-theme app-shell' },
            React.createElement(StatusBar, {
                status: emulator.status,
                system: emulator.currentSystem,
                romName: emulator.currentRom?.name || 'No ROM loaded',
                fps: emulator.fps,
                message: emulator.loadingMessage
            }),
            React.createElement(
                'div',
                { className: 'layout-grid app-grid' },
                React.createElement(
                    'section',
                    { className: 'viewport-pane glass-panel surface-main' },
                    React.createElement(EmulatorScreen, {
                        currentSystem: emulator.currentSystem,
                        refs: emulator.refs,
                        isLoading: emulator.isLoading,
                        loadingMessage: emulator.loadingMessage,
                        progress: emulator.progress
                    }),
                    React.createElement(TouchOverlay, {
                        touchVisible: emulator.touchVisible,
                        onToggle: emulator.toggleTouchOverlay,
                        touchRootRef: emulator.refs.touchRootRef
                    })
                ),
                React.createElement(
                    'aside',
                    { className: 'sidebar-pane surface-stack' },
                    React.createElement(ControlsPanel, {
                        onRomFile: emulator.loadRom,
                        onPauseResume: emulator.togglePause,
                        onReset: emulator.reset,
                        onQuickSave: emulator.quickSave,
                        onQuickLoad: emulator.quickLoad,
                        onExport: emulator.exportSaveData,
                        onRetry: emulator.retryLastLoad,
                        paused: emulator.paused,
                        status: emulator.status,
                        slot: emulator.stateSlot,
                        setSlot: emulator.setStateSlot,
                        error: emulator.error
                    }),
                    React.createElement(SaveManager, {
                        states: emulator.states,
                        onLoadState: emulator.loadState,
                        onSaveState: emulator.saveState,
                        onDeleteState: emulator.deleteState,
                        onRenameState: emulator.renameState,
                        slot: emulator.stateSlot,
                        setSlot: emulator.setStateSlot
                    }),
                    React.createElement(SettingsPanel, {
                        settings: emulator.settings,
                        onUpdateSettings: emulator.updateSettings,
                        mapping: emulator.mapping,
                        onRemap: emulator.remapAction
                    })
                )
            )
        )
    );
}
