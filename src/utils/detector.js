export class ROMDetector {
    /**
     * Determines the console type based on file extension
     * @param {File} file 
     * @returns {string} 'gba', 'nds', 'psp', or 'unknown'
     */
    static getSystemType(file) {
        const name = file.name.toLowerCase();
        
        if (name.endsWith('.gba') || name.endsWith('.agb') || name.endsWith('.bin')) {
            return 'gba';
        }
        if (name.endsWith('.nds') || name.endsWith('.srl')) {
            return 'nds';
        }
        if (name.endsWith('.iso') || name.endsWith('.cso')) {
            return 'psp';
        }

        return 'unknown';
    }
}
