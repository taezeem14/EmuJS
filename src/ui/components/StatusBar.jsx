import React from 'https://esm.sh/react@18.3.1';

export function StatusBar({ status, system, romName, fps, message }) {
    return React.createElement(
        'header',
        { className: 'status-header glass-panel' },
        React.createElement('h1', null, 'WebEmu Platform'),
        React.createElement(
            'div',
            { className: 'status-items' },
            React.createElement('span', null, `Status: ${status || 'idle'}`),
            React.createElement('span', null, `System: ${(system || 'none').toUpperCase()}`),
            React.createElement('span', null, `ROM: ${romName || 'None'}`),
            React.createElement('span', null, `${(fps || 0).toFixed(1)} FPS`),
            React.createElement('span', { className: 'status-msg' }, message || 'Ready')
        )
    );
}
