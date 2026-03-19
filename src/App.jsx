import React, { useContext } from 'https://esm.sh/react@18.3.1';
import { EmulatorContext } from './ui/context/EmulatorContext.jsx';
import { EmulatorScreen } from './ui/components/EmulatorScreen.jsx';
import { ControlsPanel } from './ui/components/ControlsPanel.jsx';
import { SaveManager } from './ui/components/SaveManager.jsx';
import { SettingsPanel } from './ui/components/SettingsPanel.jsx';
import { StatusBar } from './ui/components/StatusBar.jsx';
import { ErrorBoundary } from './ui/components/ErrorBoundary.jsx';
import { TouchOverlay } from './ui/components/TouchOverlay.jsx';

export function App() {
    const emulator = useContext(EmulatorContext);

    return React.createElement(
        ErrorBoundary,
        null,
        React.createElement(
            'div',
            { className: 'react-app dark-theme' },
            React.createElement(StatusBar, {
                status: emulator.status,
                system: emulator.currentSystem,
                romName: emulator.currentRom?.name || 'No ROM loaded',
                fps: emulator.fps,
                message: emulator.loadingMessage
            }),
            React.createElement(
                'div',
                { className: 'layout-grid' },
                React.createElement(
                    'section',
                    { className: 'viewport-pane glass-panel' },
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
                    { className: 'sidebar-pane' },
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
