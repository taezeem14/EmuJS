import React from 'react';

export function StatusBar({ status, system, romName, fps, message }) {
    const normalizedStatus = (status || 'idle').toUpperCase();
    const normalizedSystem = (system || 'none').toUpperCase();

    return React.createElement(
        'header',
        { className: 'status-header glass-panel' },
        React.createElement(
            'div',
            { className: 'status-brand' },
            React.createElement('h1', null, 'WebEmu Platform'),
            React.createElement('span', { className: 'status-subtitle' }, 'Multi-console emulator dashboard')
        ),
        React.createElement(
            'div',
            { className: 'status-items' },
            React.createElement('span', { className: 'chip chip-status' }, `Status ${normalizedStatus}`),
            React.createElement('span', { className: 'chip' }, `System ${normalizedSystem}`),
            React.createElement('span', { className: 'chip chip-rom', title: romName || 'None' }, `ROM ${romName || 'None'}`),
            React.createElement('span', { className: 'chip chip-fps' }, `${(fps || 0).toFixed(1)} FPS`),
            React.createElement('span', { className: 'status-msg' }, message || 'Ready')
        )
    );
}
