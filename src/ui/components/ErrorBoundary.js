import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error('React UI error boundary:', error);
    }

    render() {
        if (this.state.error) {
            return React.createElement(
                'div',
                { className: 'error-boundary glass-panel' },
                React.createElement('h2', null, 'UI Error'),
                React.createElement('p', null, this.state.error.message || 'An unexpected error occurred.'),
                React.createElement(
                    'button',
                    {
                        className: 'btn',
                        onClick: () => window.location.reload()
                    },
                    'Reload App'
                )
            );
        }

        return this.props.children;
    }
}
