import React from 'https://esm.sh/react@18.3.1';

export function ControlsPanel({
    onRomFile,
    onPauseResume,
    onReset,
    onQuickSave,
    onQuickLoad,
    onExport,
    onRetry,
    paused,
    status,
    slot,
    setSlot,
    error
}) {
    const onFileInput = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await onRomFile(file);
    };

    return React.createElement(
        'section',
        { className: 'panel glass-panel' },
        React.createElement('h3', null, 'Controls'),
        React.createElement(
            'label',
            { className: 'btn file-upload' },
            'Load ROM',
            React.createElement('input', {
                type: 'file',
                hidden: true,
                accept: '.gba,.agb,.nds,.srl,.iso,.cso',
                onChange: onFileInput
            })
        ),
        React.createElement(
            'div',
            { className: 'row-wrap' },
            React.createElement(
                'button',
                { className: 'btn', onClick: onPauseResume, disabled: status !== 'running' && status !== 'paused' },
                paused ? 'Resume' : 'Pause'
            ),
            React.createElement('button', { className: 'btn', onClick: onReset }, 'Reset')
        ),
        React.createElement(
            'div',
            { className: 'row-wrap' },
            React.createElement(
                'label',
                { className: 'slot-label' },
                'Slot',
                React.createElement(
                    'select',
                    {
                        value: String(slot),
                        onChange: (event) => setSlot(Number(event.target.value))
                    },
                    [1, 2, 3, 4, 5].map((value) =>
                        React.createElement('option', { key: value, value: String(value) }, `Slot ${value}`)
                    )
                )
            ),
            React.createElement('button', { className: 'btn', onClick: onQuickSave }, 'Quick Save'),
            React.createElement('button', { className: 'btn', onClick: onQuickLoad }, 'Quick Load')
        ),
        React.createElement(
            'div',
            { className: 'row-wrap' },
            React.createElement('button', { className: 'btn', onClick: onExport }, 'Export Saves'),
            React.createElement('button', { className: 'btn', onClick: onRetry }, 'Retry Load')
        ),
        error
            ? React.createElement(
                  'div',
                  { className: 'panel-error' },
                  React.createElement('span', null, error)
              )
            : null
    );
}
