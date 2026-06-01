# God Hand Desktop App

Tauri desktop shell for God Hand Control Center.

The actual React UI source lives in `../frontend`. This app loads that UI into a native desktop window instead of treating it as a standalone website.

## Run

```bash
cd frontend
npm install

cd ../ai_mouse_tauri
npm install
npm run dev
```

Rust is required for Tauri. Install it from `https://rustup.rs` if `cargo` is not available.

## Current Runtime Boundary

- `../frontend` owns the Korean UI and camera preview.
- `src-tauri` owns the native desktop window.
- Future OS mouse control commands should be added as Tauri commands in `src-tauri/src/lib.rs`.
