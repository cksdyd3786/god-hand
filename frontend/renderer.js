const cameraStartButton = document.getElementById("cameraStartButton");
const cameraStopButton = document.getElementById("cameraStopButton");
const backendCheckButton = document.getElementById("backendCheckButton");
const backendStartButton = document.getElementById("backendStartButton");
const backendStopButton = document.getElementById("backendStopButton");
const clearLogButton = document.getElementById("clearLogButton");

const cameraPill = document.getElementById("cameraPill");
const cameraPillText = document.getElementById("cameraPillText");
const cameraState = document.getElementById("cameraState");
const cameraCopy = document.getElementById("cameraCopy");

const backendPill = document.getElementById("backendPill");
const backendPillText = document.getElementById("backendPillText");
const backendState = document.getElementById("backendState");
const backendCopy = document.getElementById("backendCopy");

const logOutput = document.getElementById("logOutput");

const cameraStatusMeta = {
  "대기 중": {
    key: "idle",
    copy: "카메라 프로세스가 아직 실행되지 않았습니다.",
  },
  "카메라 실행 중": {
    key: "running",
    copy: "손 제스처 인식용 Python 프로세스가 실행 중입니다.",
  },
  "카메라 종료됨": {
    key: "stopped",
    copy: "카메라 프로세스가 종료되었습니다.",
  },
  "오류 발생": {
    key: "error",
    copy: "오류가 발생했습니다. 아래 로그를 확인하세요.",
  },
};

const backendStatusMeta = {
  "확인 중": {
    key: "checking",
    copy: "localhost:3000 연결 상태를 확인합니다.",
  },
  "연결됨": {
    key: "running",
    copy: "localhost:3000 백엔드 서버에 연결할 수 있습니다.",
  },
  "연결 안 됨": {
    key: "stopped",
    copy: "localhost:3000에서 응답이 없습니다.",
  },
  "백엔드 실행 중": {
    key: "running",
    copy: "Electron이 백엔드 프로세스를 실행했습니다.",
  },
  "백엔드 종료됨": {
    key: "stopped",
    copy: "Electron이 관리하던 백엔드 프로세스가 종료되었습니다.",
  },
  "오류 발생": {
    key: "error",
    copy: "백엔드 처리 중 오류가 발생했습니다. 로그를 확인하세요.",
  },
};

function setCameraStatus(status) {
  const meta = cameraStatusMeta[status] ?? cameraStatusMeta["대기 중"];

  cameraPillText.textContent = status;
  cameraState.textContent = status;
  cameraCopy.textContent = meta.copy;
  cameraPill.dataset.status = meta.key;

  const isRunning = status === "카메라 실행 중";
  cameraStartButton.disabled = isRunning;
  cameraStopButton.disabled = !isRunning;
}

function setBackendStatus(status) {
  const meta = backendStatusMeta[status] ?? backendStatusMeta["확인 중"];

  backendPillText.textContent = status;
  backendState.textContent = status;
  backendCopy.textContent = meta.copy;
  backendPill.dataset.status = meta.key;

  const isRunning = status === "백엔드 실행 중" || status === "연결됨";
  backendStartButton.disabled = status === "백엔드 실행 중";
  backendStopButton.disabled = !isRunning;
}

function getNow() {
  return new Date().toLocaleTimeString("ko-KR", { hour12: false });
}

function appendLog(log) {
  const source = log.source.toUpperCase().padEnd(7, " ");
  const type = log.type.toUpperCase().padEnd(6, " ");
  const message = String(log.message).trimEnd();
  const lines = message.length ? message.split(/\r?\n/) : [""];
  const entry = lines.map((line) => `[${log.time}] ${source} ${type} ${line}`).join("\n");

  logOutput.textContent += `${entry}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function appendUiLog(message) {
  appendLog({
    source: "ui",
    type: "info",
    time: getNow(),
    message,
  });
}

cameraStartButton.addEventListener("click", async () => {
  appendUiLog("카메라 시작 요청");
  await window.godHand.camera.start();
});

cameraStopButton.addEventListener("click", async () => {
  appendUiLog("카메라 중지 요청");
  await window.godHand.camera.stop();
});

backendCheckButton.addEventListener("click", async () => {
  appendUiLog("백엔드 상태 확인 요청");
  setBackendStatus("확인 중");
  await window.godHand.backend.check();
});

backendStartButton.addEventListener("click", async () => {
  appendUiLog("백엔드 시작 요청");
  await window.godHand.backend.start();
});

backendStopButton.addEventListener("click", async () => {
  appendUiLog("백엔드 중지 요청");
  await window.godHand.backend.stop();
});

clearLogButton.addEventListener("click", () => {
  logOutput.textContent = "";
});

window.godHand.camera.onStatus(setCameraStatus);
window.godHand.backend.onStatus(setBackendStatus);
window.godHand.logs.onEntry(appendLog);

window.godHand.camera.getStatus().then(({ status }) => {
  setCameraStatus(status);
});

window.godHand.backend.getStatus().then(({ status }) => {
  setBackendStatus(status);
  return window.godHand.backend.check();
});
