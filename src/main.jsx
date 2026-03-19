import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import { App } from './App.jsx';
import { EmulatorProvider } from './ui/context/EmulatorContext.jsx';

const root = createRoot(document.getElementById('root'));
root.render(
    React.createElement(
        React.StrictMode,
        null,
        React.createElement(EmulatorProvider, null, React.createElement(App))
    )
);
