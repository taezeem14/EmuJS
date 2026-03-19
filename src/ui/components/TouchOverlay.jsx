import React from 'https://esm.sh/react@18.3.1';

export function TouchOverlay({ touchVisible, onToggle, touchRootRef }) {
    return React.createElement(
        'div',
        { className: 'touch-overlay-wrapper' },
        React.createElement(
            'button',
            { className: 'btn touch-toggle', onClick: onToggle },
            touchVisible ? 'Hide Touch Controls' : 'Show Touch Controls'
        ),
        React.createElement('div', {
            ref: touchRootRef,
            id: 'touch-controls',
            className: touchVisible ? 'glass-panel touch-controls-mounted' : 'hidden'
        })
    );
}
