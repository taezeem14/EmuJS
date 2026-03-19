# WebEmu Platform

Multi-console browser emulator platform with dynamic runtime core loading, WebAssembly support, IndexedDB persistence, and a React UI layer.

## Features

- Dynamic core loading with CDN fallback for GBA, NDS, and PSP
- WebAssembly loading with `locateFile` support and blob-script injection
- Core caching with Cache API, progress reporting, and idle preloading
- IndexedDB persistence:
  - Battery saves
  - Save states (multi-slot)
  - User settings
- IDBFS integration (`FS.mount(IDBFS, {}, '/data')` + `FS.syncfs`)
- Unified input controller:
  - Keyboard
  - Gamepad API
  - Mobile touch controls
  - NDS stylus mapping
  - PSP analog touch joystick
- Performance controls:
  - Frame skip
  - FPS limiter
  - Visibility-based pause
  - Autosave every 20 seconds
- React-based UI architecture with context + hooks

## Current Architecture

- `src/core`: emulator core wrappers and dynamic core loader
- `src/storage`: IndexedDB and IDBFS helper layer
- `src/controllers`: input abstraction
- `src/ui`: React components, hooks, and context
- `src/App.jsx`: top-level application composition
- `src/main.jsx`: React bootstrap entry

## File Map

- `src/core/loader.js`: core fetch, fallback, cache, and script injection
- `src/core/gba.js`: GBA core wrapper lifecycle
- `src/core/nds.js`: NDS core wrapper lifecycle
- `src/core/psp.js`: PSP core wrapper lifecycle (WebGL)
- `src/storage/db.js`: IndexedDB stores (`saves`, `states`, `settings`) + IDBFS sync helpers
- `src/controllers/input.js`: keyboard/gamepad/touch/stylus input system
- `src/ui/hooks/useEmulator.js`: React controller hook bridging UI and emulator engine
- `src/ui/context/EmulatorContext.jsx`: shared emulator state context
- `src/ui/components/*`: UI modules (screen, controls, save manager, settings, status, touch overlay)

## ROM Support

System detection is extension-based:

- `.gba`, `.agb`, `.bin` -> GBA
- `.nds`, `.srl` -> NDS
- `.iso`, `.cso` -> PSP

## Persistence Model

IndexedDB database: `webemu-platform`

Object stores:

- `saves`: battery save blobs per ROM/system/file
- `states`: save-state blobs per ROM/slot
- `settings`: UI and input preferences

Runtime flow:

1. Core mounts IDBFS at `/data`
2. `syncfs(true)` hydrates file system
3. Battery files are restored into FS
4. Autosave periodically flushes FS (`syncfs(false)`)
5. Battery files are mirrored into IndexedDB for robust recovery

## Controls

Default keyboard mapping (customizable from settings):

- A: `KeyX`
- B: `KeyZ`
- X: `KeyS`
- Y: `KeyA`
- L: `KeyQ`
- R: `KeyW`
- Start: `Enter`
- Select: `ShiftRight`
- D-pad: Arrow keys
- Fast forward: `Tab`
- Quick save: `F5`
- Quick load: `F8`

## React UI Modules

- `StatusBar`: status, system, ROM, FPS
- `EmulatorScreen`: active canvas rendering + load overlay
- `ControlsPanel`: ROM load, pause/resume, reset, quick actions
- `SaveManager`: save-state listing, load, rename, delete
- `SettingsPanel`: frame skip, FPS limit, remapping
- `TouchOverlay`: mobile control visibility and mount point

## Running

This project currently uses browser-native ES modules and React via ESM CDN in `src/main.jsx`.

### Local static server (example)

Use any static server that serves the workspace root with proper CORS and WASM headers.

- Ensure `.wasm` is served as `application/wasm`
- Keep cross-origin isolation headers for multithreaded cores where required

## Deploy (Netlify)

`netlify.toml` is included and configures:

- publish root
- cross-origin isolation headers
- wasm content type and caching

## Notes

- React is used only for UI/controller concerns.
- Emulator core logic remains in `src/core`.
- If a specific upstream emulator build does not expose optional APIs (`serializeState`, `setFrameSkip`, etc.), dependent UI actions degrade gracefully.

## Next Recommended Improvements

1. Add a bundler build (Vite) for fully offline-packaged React runtime
2. Add service worker precaching for React modules and static assets
3. Add ROM library metadata and thumbnail extraction
4. Add integrity/hash checks for downloaded core binaries
