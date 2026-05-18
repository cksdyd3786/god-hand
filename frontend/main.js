const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

let mainWindow = null;
let cameraProcess = null;
let backendProcess = null;
let cameraStopRequested = false;
let backendStopRequested = false;
let cameraStatus = "대기 중";
let backendStatus = "확인 중";

const CAMERA_STATUS = {
  idle: "대기 중",
  running: "카메라 실행 중",
  stopped: "카메라 종료됨",
  error: "오류 발생",
};

const BACKEND_STATUS = {
  checking: "확인 중",
  connected: "연결됨",
  disconnected: "연결 안 됨",
  running: "백엔드 실행 중",
  stopped: "백엔드 종료됨",
  error: "오류 발생",
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#F1F5F9",
    title: "god-hand",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendLog(source, type, message) {
  send("app:log", {
    source,
    type,
    message: String(message),
    time: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
  });
}

function setCameraStatus(status) {
  cameraStatus = status;
  send("camera:status", status);
}

function setBackendStatus(status) {
  backendStatus = status;
  send("backend:status", status);
}

function getProjectRoot() {
  return path.resolve(__dirname, "..");
}

function getCameraPaths() {
  const cameraDir = path.join(getProjectRoot(), "camera");

  return {
    cameraDir,
    pythonPath: path.join(cameraDir, "venv", "Scripts", "python.exe"),
    scriptPath: path.join(cameraDir, "main.py"),
  };
}

function getBackendPaths() {
  const backendDir = path.join(getProjectRoot(), "backend");

  return {
    backendDir,
    appPath: path.join(backendDir, "app.js"),
  };
}

function isProcessRunning(child) {
  return Boolean(child && !child.killed && child.exitCode === null);
}

function stopChildProcess(child, label, onFallback) {
  if (!isProcessRunning(child)) {
    return;
  }

  const pid = child.pid;
  sendLog(label, "info", `Stopping ${label} process (PID ${pid}).`);

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      shell: false,
    }).on("error", (error) => {
      sendLog(label, "error", `taskkill failed: ${error.message}`);
      onFallback();
    });
  } else {
    child.kill("SIGTERM");
  }
}

function startCamera() {
  if (isProcessRunning(cameraProcess)) {
    sendLog("camera", "info", "Camera process is already running. Duplicate start was ignored.");
    return { ok: true, status: cameraStatus };
  }

  const { cameraDir, pythonPath, scriptPath } = getCameraPaths();

  if (!fs.existsSync(pythonPath)) {
    const message = `Python executable was not found: ${pythonPath}`;
    setCameraStatus(CAMERA_STATUS.error);
    sendLog("camera", "error", message);
    return { ok: false, status: cameraStatus, error: message };
  }

  if (!fs.existsSync(scriptPath)) {
    const message = `Camera entry file was not found: ${scriptPath}`;
    setCameraStatus(CAMERA_STATUS.error);
    sendLog("camera", "error", message);
    return { ok: false, status: cameraStatus, error: message };
  }

  cameraStopRequested = false;
  cameraProcess = spawn(pythonPath, [scriptPath], {
    cwd: cameraDir,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
    windowsHide: true,
    shell: false,
  });

  setCameraStatus(CAMERA_STATUS.running);
  sendLog("camera", "info", `Started camera process (PID ${cameraProcess.pid}).`);

  cameraProcess.stdout.on("data", (data) => {
    sendLog("camera", "stdout", data.toString());
  });

  cameraProcess.stderr.on("data", (data) => {
    sendLog("camera", "stderr", data.toString());
  });

  cameraProcess.on("error", (error) => {
    setCameraStatus(CAMERA_STATUS.error);
    sendLog("camera", "error", error.message);
  });

  cameraProcess.on("exit", (code, signal) => {
    const wasError = !cameraStopRequested && code !== 0 && code !== null;
    const summary = `Camera process exited${code !== null ? ` with code ${code}` : ""}${signal ? `, signal ${signal}` : ""}.`;

    sendLog("camera", wasError ? "error" : "info", summary);
    cameraProcess = null;
    cameraStopRequested = false;
    setCameraStatus(wasError ? CAMERA_STATUS.error : CAMERA_STATUS.stopped);
  });

  return { ok: true, status: cameraStatus };
}

function stopCamera() {
  if (!isProcessRunning(cameraProcess)) {
    setCameraStatus(cameraStatus === CAMERA_STATUS.idle ? CAMERA_STATUS.idle : CAMERA_STATUS.stopped);
    sendLog("camera", "info", "No running camera process to stop.");
    return { ok: true, status: cameraStatus };
  }

  cameraStopRequested = true;
  stopChildProcess(cameraProcess, "camera", () => cameraProcess?.kill());
  return { ok: true, status: cameraStatus };
}

function checkBackendStatus() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: "/",
        timeout: 1200,
      },
      (response) => {
        response.resume();
        const ok = response.statusCode >= 200 && response.statusCode < 500;
        const status = ok ? BACKEND_STATUS.connected : BACKEND_STATUS.disconnected;
        setBackendStatus(status);
        resolve({ ok, status, port: 3000 });
      },
    );

    request.on("timeout", () => {
      request.destroy();
    });

    request.on("error", () => {
      const status = isProcessRunning(backendProcess) ? BACKEND_STATUS.running : BACKEND_STATUS.disconnected;
      setBackendStatus(status);
      resolve({ ok: false, status, port: 3000 });
    });
  });
}

function startBackend() {
  if (isProcessRunning(backendProcess)) {
    sendLog("backend", "info", "Backend process is already running. Duplicate start was ignored.");
    return { ok: true, status: backendStatus };
  }

  const { backendDir, appPath } = getBackendPaths();

  if (!fs.existsSync(appPath)) {
    const message = `Backend entry file was not found: ${appPath}`;
    setBackendStatus(BACKEND_STATUS.error);
    sendLog("backend", "error", message);
    return { ok: false, status: backendStatus, error: message };
  }

  backendStopRequested = false;
  backendProcess = spawn("node", [appPath], {
    cwd: backendDir,
    env: process.env,
    windowsHide: true,
    shell: false,
  });

  setBackendStatus(BACKEND_STATUS.running);
  sendLog("backend", "info", `Started backend process (PID ${backendProcess.pid}).`);

  backendProcess.stdout.on("data", (data) => {
    sendLog("backend", "stdout", data.toString());
  });

  backendProcess.stderr.on("data", (data) => {
    sendLog("backend", "stderr", data.toString());
  });

  backendProcess.on("error", (error) => {
    setBackendStatus(BACKEND_STATUS.error);
    sendLog("backend", "error", error.message);
  });

  backendProcess.on("exit", (code, signal) => {
    const wasError = !backendStopRequested && code !== 0 && code !== null;
    const summary = `Backend process exited${code !== null ? ` with code ${code}` : ""}${signal ? `, signal ${signal}` : ""}.`;

    sendLog("backend", wasError ? "error" : "info", summary);
    backendProcess = null;
    backendStopRequested = false;
    setBackendStatus(wasError ? BACKEND_STATUS.error : BACKEND_STATUS.stopped);
  });

  return { ok: true, status: backendStatus };
}

function stopBackend() {
  if (!isProcessRunning(backendProcess)) {
    setBackendStatus(BACKEND_STATUS.stopped);
    sendLog("backend", "info", "No managed backend process to stop.");
    return { ok: true, status: backendStatus };
  }

  backendStopRequested = true;
  stopChildProcess(backendProcess, "backend", () => backendProcess?.kill());
  return { ok: true, status: backendStatus };
}

ipcMain.handle("camera:start", () => startCamera());
ipcMain.handle("camera:stop", () => stopCamera());
ipcMain.handle("camera:get-status", () => ({
  status: cameraStatus,
  running: isProcessRunning(cameraProcess),
}));

ipcMain.handle("backend:check", () => checkBackendStatus());
ipcMain.handle("backend:start", () => startBackend());
ipcMain.handle("backend:stop", () => stopBackend());
ipcMain.handle("backend:get-status", () => ({
  status: backendStatus,
  running: isProcessRunning(backendProcess),
}));

app.whenReady().then(() => {
  createWindow();
  checkBackendStatus();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (isProcessRunning(cameraProcess)) {
    cameraStopRequested = true;
    stopChildProcess(cameraProcess, "camera", () => cameraProcess?.kill());
  }

  if (isProcessRunning(backendProcess)) {
    backendStopRequested = true;
    stopChildProcess(backendProcess, "backend", () => backendProcess?.kill());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
