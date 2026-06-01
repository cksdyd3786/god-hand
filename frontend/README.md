# God Hand Control Center Frontend

React + TypeScript + Vite UI source for the God Hand desktop control surface.

This is not the final product by itself. The desktop app shell lives in `../ai_mouse_tauri` and loads this UI into a native Tauri window.

## Run

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`.

## Desktop App

```bash
cd ../ai_mouse_tauri
npm install
npm run dev
```

Tauri requires Rust/Cargo. If `npm run dev` reports that Rust is missing, install Rust from `https://rustup.rs` and run the command again.

## Scope

This folder owns only the UI layer:

- Camera Status Panel
- Gesture Recognition Panel
- Mouse Control Panel
- Calibration Panel
- Activity Log
- System Health
- Settings Panel

It does not create a Node/Express/Socket.IO backend. Runtime integration points live in `src/lib/integrationPorts.ts` so the UI can connect to `ai_mouse_tauri` or a Python bridge without rewriting the component tree.

## Structure

```text
frontend/
├─ package.json
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ components/
│  ├─ features/
│  ├─ lib/
│  └─ styles/
├─ README.md
└─ DESIGN.md
```
