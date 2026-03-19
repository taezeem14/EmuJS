import React from 'react';

export function EmulatorScreen({ currentSystem, refs, isLoading, loadingMessage, progress }) {
    const hidden = 'emulator-canvas hidden';
    const shown = 'emulator-canvas';

    return React.createElement(
        'div',
        { className: 'emulator-screen', ref: refs.viewportRef },
        React.createElement('canvas', {
            id: 'gba-canvas',
            ref: refs.gbaCanvasRef,
            className: currentSystem === 'gba' ? shown : hidden
        }),
        React.createElement(
            'div',
            {
                id: 'nds-container',
                ref: refs.ndsContainerRef,
                className: currentSystem === 'nds' ? '' : 'hidden'
            },
            React.createElement('canvas', {
                id: 'nds-top',
                ref: refs.ndsTopRef,
                className: 'emulator-canvas'
            }),
            React.createElement('canvas', {
                id: 'nds-bottom',
                ref: refs.ndsBottomRef,
                className: 'emulator-canvas touch-active'
            })
        ),
        React.createElement('canvas', {
            id: 'psp-canvas',
            ref: refs.pspCanvasRef,
            className: currentSystem === 'psp' ? shown : hidden
        }),
        isLoading
            ? React.createElement(
                  'div',
                  { className: 'loading-overlay' },
                  React.createElement('div', { className: 'spinner' }),
                  React.createElement('div', { className: 'loading-text' }, loadingMessage || 'Loading...'),
                  React.createElement(
                      'div',
                      { className: 'progress-bar' },
                      React.createElement('div', {
                          className: 'progress-fill',
                          style: { width: `${Math.max(0, Math.min(100, progress || 0))}%` }
                      })
                  )
              )
            : null
    );
}
