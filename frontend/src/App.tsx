import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ActivityLog } from "./features/activity/ActivityLog";
import { CalibrationPanel } from "./features/calibration/CalibrationPanel";
import { CameraStatusPanel } from "./features/camera/CameraStatusPanel";
import { GestureRecognitionPanel } from "./features/gesture/GestureRecognitionPanel";
import { MouseControlPanel } from "./features/mouse/MouseControlPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { SystemHealthPanel } from "./features/system/SystemHealthPanel";
import { io } from "socket.io-client";
import type {
  ActivityEvent,
  CalibrationRuntimeState,
  CameraRuntimeState,
  MouseRuntimeState,
  VisionRuntimeState,
} from "./lib/controlCenterTypes";

const socket = io("http://localhost:3000");

const initialCamera: CameraRuntimeState = {
  status: "idle",
  device: "선택된 카메라 없음",
  resolution: "-",
  frameRate: null,
  error: null,
};

const initialVision: VisionRuntimeState = {
  status: "idle",
  gesture: "대기",
  landmarks: 0,
  confidence: null,
  pinchDistance: null,
  error: null,
};

const initialMouse: MouseRuntimeState = {
  enabled: false,
  bridge: "checking",
  screen: null,
  position: null,
  lastAction: "없음",
  error: null,
};

const initialCalibration: CalibrationRuntimeState = {
  active: false,
  samples: 0,
  progress: 0,
  bounds: null,
};

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const;

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const lastMoveRef = useRef(0);
  const wasPinchingRef = useRef(false);
  const calibrationBoundsRef = useRef<CalibrationRuntimeState["bounds"]>(null);
  const pinchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const smoothedPosRef = useRef({ x: -1, y: -1 }); 
  const toggleTimerRef = useRef(0);

  const [camera, setCamera] = useState<CameraRuntimeState>(initialCamera);
  const [vision, setVision] = useState<VisionRuntimeState>(initialVision);
  const [mouse, setMouse] = useState<MouseRuntimeState>(initialMouse);
  const [calibration, setCalibration] = useState<CalibrationRuntimeState>(initialCalibration);
  const [events, setEvents] = useState<ActivityEvent[]>([
    createEvent("데스크톱 앱이 준비되었습니다. 카메라를 시작해 주세요.", "neutral"),
  ]);  

  useEffect(() => {

    socket.on("connect", () => {
      pushEvent("갓핸드 중앙 백엔드 서버(Socket)와 연결되었습니다!", "green");
    });

    checkNativeBridge();
    return () => {
      socket.off("connect");
      stopCamera();
    }; 
  }, []);

  const pushEvent = (message: string, tone: ActivityEvent["tone"] = "neutral") => {
    setEvents((current) => [createEvent(message, tone), ...current].slice(0, 10));
  };

  const checkNativeBridge = async () => {
    try {
      const screen = await invoke<{ width: number; height: number }>("screen_size");
      setMouse((current) => ({ ...current, bridge: "ready", screen, error: null }));
      pushEvent(`Tauri IPC 연결 완료: ${screen.width} x ${screen.height}`, "green");
    } catch (error) {
      setMouse((current) => ({
        ...current,
        bridge: "unavailable",
        error: error instanceof Error ? error.message : "Tauri IPC를 사용할 수 없습니다.",
      }));
      pushEvent("Tauri IPC 연결에 실패했습니다.", "orange");
    }
  };

  const startCamera = async () => {
    try {
      setCamera((current) => ({ ...current, status: "requesting", error: null }));
      setVision((current) => ({ ...current, status: "loading", error: null }));
      pushEvent("카메라와 MediaPipe WASM을 준비하는 중입니다.", "blue");

      if (!landmarkerRef.current) {
        const visionFiles = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(visionFiles, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const label = track.label || "사용 중인 카메라";

      setCamera({
        status: "streaming",
        device: label,
        resolution: `${settings.width ?? video.videoWidth} x ${settings.height ?? video.videoHeight}`,
        frameRate: typeof settings.frameRate === "number" ? Math.round(settings.frameRate) : null,
        error: null,
      });
      setVision((current) => ({ ...current, status: "ready", error: null }));
      pushEvent(`${label} 카메라 스트림을 시작했습니다.`, "green");
      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (error) {
      const message = error instanceof Error ? error.message : "카메라 또는 MediaPipe를 시작할 수 없습니다.";
      setCamera((current) => ({ ...current, status: "error", error: message }));
      setVision((current) => ({ ...current, status: "error", error: message }));
      pushEvent(`실행 오류: ${message}`, "orange");
    }
  };

  const stopCamera = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    clearCanvas();
    wasPinchingRef.current = false;
    setCamera(initialCamera);
    setVision(initialVision);
  };

  const detectFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0];
    const handedness = result.handednesses?.[0]?.[0];

    if (!landmarks) {
      setVision((current) => ({
        ...current,
        status: "ready",
        gesture: "손 없음",
        landmarks: 0,
        confidence: null,
        pinchDistance: null,
      }));
      wasPinchingRef.current = false;
      clearCanvas();
      frameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const anchorPoint = landmarks[9];
    const gesture = readGesture(landmarks);
    const target = mapToScreen(anchorPoint);
    // 처음 손이 인식됐을 때는 현재 위치로 즉시 세팅
    if (smoothedPosRef.current.x === -1) {
      smoothedPosRef.current = { x: target.x, y: target.y };
    }
    
    // 현재 마우스 위치와 목표 위치 사이의 거리 계산
    const dx = target.x - smoothedPosRef.current.x;
    const dy = target.y - smoothedPosRef.current.y;
    const distance = Math.hypot(dx, dy);

    // 1. 데드존 (Deadzone): 3픽셀 이하의 미세한 흔들림은 무시 (마우스 완전 고정)
    if (distance > 3) {
      
      // 2. 동적 가중치 계산 (거리에 비례하여 반응 속도 조절)
      // - 거리가 100 이상(빠른 이동): alpha가 0.6까지 올라가 딜레이 없이 휙 따라감
      // - 거리가 15 이하(미세 조정): alpha가 0.15까지 떨어져 묵직하게 떨림을 잡아줌
      const adaptiveAlpha = Math.min(Math.max(distance / 100, 0.15), 0.6);

      smoothedPosRef.current.x += dx * adaptiveAlpha;
      smoothedPosRef.current.y += dy * adaptiveAlpha;
    }
    drawHand(landmarks, gesture.isPinching);
    updateCalibration(anchorPoint);
    await driveMouse(target.x, target.y, gesture.isPinching, gesture.dbKey);  
    setVision({
      status: "detecting",
      gesture: gesture.name,
      landmarks: landmarks.length,
      confidence: typeof handedness?.score === "number" ? handedness.score : null,
      pinchDistance: gesture.pinchDistance,
      error: null,
    });

    frameRef.current = requestAnimationFrame(detectFrame);
  };

  const driveMouse = async (x: number, y: number, isPinching: boolean, dbKey: string) => {
    if (!mouse.enabled) return;

    const now = performance.now();

    // 1. 실시간 마우스 포인터 좌표 이동
    if (now - lastMoveRef.current > 24) {
      socket.emit("gesture", { action: "MOVE", x: Math.round(x), y: Math.round(y) });
      lastMoveRef.current = now;
      setMouse((current) => ({
        ...current,
        position: { x: Math.round(x), y: Math.round(y) },
        lastAction: isDraggingRef.current ? "드래그 이동" : "이동",
      }));
    }

    // 2. 핀치 타이밍 판정 (단발 클릭 vs 지속 드래그)
    if (isPinching && !wasPinchingRef.current) {
      // 핀치를 시작한 순간의 시간 기록
      pinchStartTimeRef.current = now;
    } 
    else if (isPinching && wasPinchingRef.current) {
      // 핀치 상태 유지 중: 200ms(0.2초) 넘게 꾹 쥐고 있으면 드래그 모드 발동!
      if (now - pinchStartTimeRef.current > 200 && !isDraggingRef.current) {
        isDraggingRef.current = true;
        socket.emit("gesture", { gesture: "DRAG_START" });
        setMouse((current) => ({ ...current, lastAction: "드래그 시작" }));
        pushEvent("🔒 드래그 시작 (꾹 누르기)", "blue");
      }
    } 
    else if (!isPinching && wasPinchingRef.current) {
      // 손가락을 펼쳤을 때 (Release)
      if (isDraggingRef.current) {
        // 드래그 중이었다면 드래그 종료 신호 전송
        isDraggingRef.current = false;
        socket.emit("gesture", { gesture: "DRAG_END" });
        setMouse((current) => ({ ...current, lastAction: "드래그 종료" }));
        pushEvent("🔓 드래그 종료 (손가락 뗌)", "neutral");
      } else {
        // 200ms 이내에 뗐다면 단순 클릭으로 판정!
        socket.emit("gesture", { gesture: "LEFT_CLICK" });
        setMouse((current) => ({ ...current, lastAction: "왼쪽 클릭" }));
        pushEvent("⚡ 일반 클릭 실행", "green");
      }
    }

    wasPinchingRef.current = isPinching;
  };

    const mapToScreen = (point: NormalizedLandmark) => {
    const screen = mouse.screen ?? { width: window.screen.width, height: window.screen.height };
    const bounds = calibrationBoundsRef.current;
    const sourceX = 1 - point.x;
    const sourceY = point.y;

    if (bounds && bounds.maxX - bounds.minX > 0.1 && bounds.maxY - bounds.minY > 0.1) {
      return {
        x: clamp(((sourceX - bounds.minX) / (bounds.maxX - bounds.minX)) * screen.width, 0, screen.width - 1),
        y: clamp(((sourceY - bounds.minY) / (bounds.maxY - bounds.minY)) * screen.height, 0, screen.height - 1),
      };
    }

    return {
      x: clamp(sourceX * screen.width, 0, screen.width - 1),
      y: clamp(sourceY * screen.height, 0, screen.height - 1),
    };
  };

  const updateCalibration = (point: NormalizedLandmark) => {
    setCalibration((current) => {
      if (!current.active) return current;

      const sourceX = 1 - point.x;
      const sourceY = point.y;
      const bounds = current.bounds ?? { minX: sourceX, maxX: sourceX, minY: sourceY, maxY: sourceY };
      const next = {
        minX: Math.min(bounds.minX, sourceX),
        maxX: Math.max(bounds.maxX, sourceX),
        minY: Math.min(bounds.minY, sourceY),
        maxY: Math.max(bounds.maxY, sourceY),
      };
      calibrationBoundsRef.current = next;

      const samples = current.samples + 1;
      return {
        active: samples < 180,
        samples,
        progress: Math.min(100, Math.round((samples / 180) * 100)),
        bounds: next,
      };
    });
  };

  const toggleMouse = () => {
    setMouse((current) => {
      const enabled = !current.enabled;
      pushEvent(enabled ? "마우스 제어를 켰습니다." : "마우스 제어를 껐습니다.", enabled ? "green" : "neutral");
      return { ...current, enabled, lastAction: enabled ? "대기" : "없음" };
    });
  };

  const startCalibration = () => {
    calibrationBoundsRef.current = null;
    setCalibration({ active: true, samples: 0, progress: 0, bounds: null });
    pushEvent("캘리브레이션을 시작했습니다. 손을 화면 네 모서리 방향으로 움직여 주세요.", "blue");
  };

  const resetCalibration = () => {
    calibrationBoundsRef.current = null;
    setCalibration(initialCalibration);
    pushEvent("캘리브레이션 값을 초기화했습니다.", "neutral");
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const drawHand = (landmarks: NormalizedLandmark[], isPinching: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = isPinching ? "#ff9500" : "#007aff";
    ctx.fillStyle = "#ffffff";

    HAND_CONNECTIONS.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.moveTo((1 - landmarks[start].x) * canvas.width, landmarks[start].y * canvas.height);
      ctx.lineTo((1 - landmarks[end].x) * canvas.width, landmarks[end].y * canvas.height);
      ctx.stroke();
    });

    landmarks.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc((1 - point.x) * canvas.width, point.y * canvas.height, index === 8 ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="window-controls" aria-hidden="true">
          <span className="window-control window-control--close" />
          <span className="window-control window-control--minimize" />
          <span className="window-control window-control--zoom" />
        </div>

        <div className="hero-copy">
          <p className="eyebrow">God Hand</p>
          <h1>God Hand Control Center</h1>
          <p>MediaPipe WASM으로 손을 인식하고 Tauri IPC를 통해 Rust가 Windows 마우스를 제어합니다.</p>
        </div>

        <div className="hero-actions">
          <button
            className="primary-button"
            onClick={camera.status === "streaming" ? stopCamera : startCamera}
            disabled={camera.status === "requesting" || vision.status === "loading"}
          >
            {camera.status === "streaming" ? "카메라 중지" : "카메라 시작"}
          </button>
          <button
            className="secondary-button"
            onClick={toggleMouse}
            disabled={mouse.bridge !== "ready" || vision.status === "idle"}
          >
            {mouse.enabled ? "마우스 제어 끄기" : "마우스 제어 켜기"}
          </button>
        </div>
      </section>

      <section className="camera-workspace">
        <div className="live-camera">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hand-overlay" />
          {camera.status !== "streaming" ? (
            <div className="camera-empty">
              <strong>카메라가 아직 켜지지 않았습니다.</strong>
              <span>카메라 시작을 누르면 실제 영상과 손 랜드마크가 표시됩니다.</span>
            </div>
          ) : null}
        </div>
        <CameraStatusPanel camera={camera} />
      </section>

      <section className="dashboard-grid" aria-label="제어 센터 패널">
        <GestureRecognitionPanel vision={vision} />
        <MouseControlPanel mouse={mouse} onToggle={toggleMouse} />
        <CalibrationPanel
          calibration={calibration}
          isCameraActive={camera.status === "streaming"}
          onStart={startCalibration}
          onReset={resetCalibration}
        />
        <ActivityLog events={events} />
        <SystemHealthPanel cameraStatus={camera.status} visionStatus={vision.status} mouse={mouse} />
        <SettingsPanel mouse={mouse} />
      </section>
    </main>
  );
}

function readGesture(landmarks: NormalizedLandmark[]) {
  const pinchDistance = distance(landmarks[4], landmarks[8]);
  const indexOpen = landmarks[8].y < landmarks[6].y;
  const middleOpen = landmarks[12].y < landmarks[10].y;
  const ringOpen = landmarks[16].y < landmarks[14].y;
  const pinkyOpen = landmarks[20].y < landmarks[18].y;
  const openCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

  if (pinchDistance < 0.055) {
    return { name: "핀치 클릭", isPinching: true, dbKey: "PINCH", pinchDistance };
  }

  if (openCount >= 3) {
    return { name: "손바닥 이동", isPinching: false, dbKey: "OPEN_PALM", pinchDistance };
  }

  if (indexOpen) {
    return { name: "포인터 이동", isPinching: false, dbKey: "POINTER", pinchDistance };
  }

  return { name: "휴식", isPinching: false, dbKey: "IDLE", pinchDistance };
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createEvent(message: string, tone: ActivityEvent["tone"]): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    time: new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date()),
    message,
    tone,
  };
}

export default App;
