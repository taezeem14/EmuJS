import React from 'react';

const ACTIONS = [
    'A', 'B', 'X', 'Y', 'L', 'R',
    'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT',
    'FAST_FORWARD', 'QUICK_SAVE', 'QUICK_LOAD'
];

export function SettingsPanel({ settings, onUpdateSettings, mapping, onRemap }) {
    return React.createElement(
        'section',
        { className: 'panel glass-panel' },
        React.createElement('h3', null, 'Settings'),
        React.createElement('p', { className: 'panel-note' }, 'Tune for smoothness on low-end hardware and remap controls.'),
        React.createElement(
            'label',
            { className: 'range-row' },
            React.createElement('span', null, `Frame Skip: ${settings.frameSkip}`),
            React.createElement('input', {
                type: 'range',
                min: 0,
                max: 5,
                value: settings.frameSkip,
                onChange: (event) => onUpdateSettings({ frameSkip: Number(event.target.value) })
            })
        ),
        React.createElement(
            'label',
            { className: 'range-row' },
            React.createElement('span', null, `FPS Limit: ${settings.fpsLimit}`),
            React.createElement('input', {
                type: 'range',
                min: 15,
                max: 120,
                step: 5,
                value: settings.fpsLimit,
                onChange: (event) => onUpdateSettings({ fpsLimit: Number(event.target.value) })
            })
        ),
        React.createElement('h4', null, 'Input Remapping'),
        React.createElement(
            'div',
            { className: 'mapping-grid' },
            ACTIONS.map((action) =>
                React.createElement(
                    'button',
                    {
                        key: action,
                        className: 'btn btn-secondary remap-btn',
                        onClick: () => {
                            const code = prompt(`Set key code for ${action} (e.g. KeyX, ArrowUp):`, mapping[action] || '');
                            if (!code) return;
                            onRemap(action, code.trim());
                        }
                    },
                    `${action}: ${mapping[action] || 'default'}`
                )
            )
        )
    );
}
