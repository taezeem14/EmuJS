import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { EmulatorProvider } from './ui/context/EmulatorContext.js';

const root = createRoot(document.getElementById('root'));
root.render(
    React.createElement(
        React.StrictMode,
        null,
        React.createElement(EmulatorProvider, null, React.createElement(App))
    )
);
