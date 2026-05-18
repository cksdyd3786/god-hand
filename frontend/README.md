# god-hand frontend

Electron desktop dashboard for controlling the existing `camera` and `backend` runtimes without modifying either folder.

## Run

```powershell
cd frontend
npm install
npm start
```

## Runtime references

- Camera start uses `child_process.spawn` with `../camera/venv/Scripts/python.exe` and `../camera/main.py`.
- Backend status checks `http://localhost:3000`.
- Backend start uses `child_process.spawn` with `node ../backend/app.js`.

All paths are resolved in Electron's main process with Node.js `path.join`, so Windows paths with spaces are handled correctly.
