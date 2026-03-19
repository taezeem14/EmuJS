import React from 'https://esm.sh/react@18.3.1';

function formatTime(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString();
}

export function SaveManager({
    states,
    onLoadState,
    onSaveState,
    onDeleteState,
    onRenameState,
    slot,
    setSlot
}) {
    return React.createElement(
        'section',
        { className: 'panel glass-panel' },
        React.createElement('h3', null, 'Save Manager'),
        React.createElement(
            'div',
            { className: 'row-wrap' },
            React.createElement(
                'button',
                {
                    className: 'btn',
                    onClick: () => onSaveState(slot)
                },
                `Save Slot ${slot}`
            ),
            React.createElement(
                'button',
                {
                    className: 'btn',
                    onClick: () => onLoadState(slot)
                },
                `Load Slot ${slot}`
            )
        ),
        React.createElement(
            'ul',
            { className: 'save-list' },
            states.length
                ? states.map((state) =>
                      React.createElement(
                          'li',
                          { key: state.id, className: 'save-item' },
                          React.createElement(
                              'div',
                              { className: 'save-meta' },
                              React.createElement('strong', null, `Slot ${state.slot}`),
                              React.createElement('span', null, state.meta?.label || 'Unnamed State'),
                              React.createElement('small', null, formatTime(state.updatedAt))
                          ),
                          React.createElement(
                              'div',
                              { className: 'save-actions' },
                              React.createElement(
                                  'button',
                                  { className: 'btn', onClick: () => onLoadState(state.slot) },
                                  'Load'
                              ),
                              React.createElement(
                                  'button',
                                  {
                                      className: 'btn',
                                      onClick: async () => {
                                          const label = prompt('Rename save state:', state.meta?.label || '');
                                          if (label == null) return;
                                          await onRenameState(state.slot, label.trim());
                                      }
                                  },
                                  'Rename'
                              ),
                              React.createElement(
                                  'button',
                                  { className: 'btn', onClick: () => onDeleteState(state.slot) },
                                  'Delete'
                              )
                          )
                      )
                  )
                : React.createElement('li', { className: 'save-empty' }, 'No save states yet.')
        ),
        React.createElement(
            'label',
            { className: 'slot-label' },
            'Active Slot',
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
        )
    );
}
