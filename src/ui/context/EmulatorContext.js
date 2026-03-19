import React, { createContext } from 'react';
import { useEmulator } from '../hooks/useEmulator.js';

export const EmulatorContext = createContext(null);

export function EmulatorProvider({ children }) {
    const emulator = useEmulator();
    return React.createElement(EmulatorContext.Provider, { value: emulator }, children);
}
