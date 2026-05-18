const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("godHand", {
  camera: {
    start: () => ipcRenderer.invoke("camera:start"),
    stop: () => ipcRenderer.invoke("camera:stop"),
    getStatus: () => ipcRenderer.invoke("camera:get-status"),
    onStatus: (callback) => subscribe("camera:status", callback),
  },
  backend: {
    check: () => ipcRenderer.invoke("backend:check"),
    start: () => ipcRenderer.invoke("backend:start"),
    stop: () => ipcRenderer.invoke("backend:stop"),
    getStatus: () => ipcRenderer.invoke("backend:get-status"),
    onStatus: (callback) => subscribe("backend:status", callback),
  },
  logs: {
    onEntry: (callback) => subscribe("app:log", callback),
  },
});
