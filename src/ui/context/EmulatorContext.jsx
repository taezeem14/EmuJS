import React, { createContext } from 'https://esm.sh/react@18.3.1';
import { useEmulator } from '../hooks/useEmulator.js';

export const EmulatorContext = createContext(null);

export function EmulatorProvider({ children }) {
    const emulator = useEmulator();
    return React.createElement(EmulatorContext.Provider, { value: emulator }, children);
}
