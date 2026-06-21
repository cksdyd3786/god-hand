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
import type {
  ActivityEvent,
  CalibrationRuntimeState,
  CameraRuntimeState,
  MouseRuntimeState,
  VisionRuntimeState,
} from "./lib/controlCenterTypes";

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

const LEFT_PINCH_THRESHOLD = 0.055;
const RIGHT_PINCH_THRESHOLD = 0.065;
const DRAG_HOLD_MS = 300;
const SCROLL_STEP_PIXELS = 32;
const MAX_SCROLL_STEPS = 4;

type Gesture = {
  name: string;
  isLeftPinching: boolean;
  isRightPinching: boolean;
  isFist: boolean;
  pinchDistance: number;
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const lastMoveRef = useRef(0);
  const wasPinchingRef = useRef(false);
  const mouseRef = useRef<MouseRuntimeState>(initialMouse);
  const leftPinchStartedAtRef = useRef<number | null>(null);
  const dragActiveRef = useRef(false);
  const wasRightPinchingRef = useRef(false);
  const scrollAnchorYRef = useRef<number | null>(null);
  const calibrationBoundsRef = useRef<CalibrationRuntimeState["bounds"]>(null);

  const [camera, setCamera] = useState<CameraRuntimeState>(initialCamera);
  const [vision, setVision] = useState<VisionRuntimeState>(initialVision);
  const [mouse, setMouse] = useState<MouseRuntimeState>(initialMouse);
  const [calibration, setCalibration] = useState<CalibrationRuntimeState>(initialCalibration);
  const [events, setEvents] = useState<ActivityEvent[]>([
    createEvent("데스크톱 앱이 준비되었습니다. 카메라를 시작해 주세요.", "neutral"),
  ]);

  useEffect(() => {
    checkNativeBridge();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    mouseRef.current = mouse;
  }, [mouse]);

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
    void cancelGestureControls();
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
      void cancelGestureControls();
      clearCanvas();
      frameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const gesture = readAdvancedGesture(landmarks);
    const target = mapToScreen(gesture.isFist ? landmarks[9] : landmarks[8]);
    drawHand(landmarks, gesture.isLeftPinching || gesture.isRightPinching || gesture.isFist);
    updateCalibration(landmarks[8]);
    await driveGesture(target.x, target.y, gesture);

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

  // Kept temporarily as a comparison point for the previous single-pinch behavior.
  const legacyDriveMouse = async (x: number, y: number, isPinching: boolean) => {
    if (!mouse.enabled || mouse.bridge !== "ready") return;

    const now = performance.now();
    if (now - lastMoveRef.current > 24) {
      await invoke("move_mouse", { x: Math.round(x), y: Math.round(y) }).catch((error) => {
        setMouse((current) => ({ ...current, error: String(error), bridge: "unavailable" }));
      });
      lastMoveRef.current = now;
      setMouse((current) => ({
        ...current,
        position: { x: Math.round(x), y: Math.round(y) },
        lastAction: "이동",
      }));
    }

    if (isPinching && !wasPinchingRef.current) {
      await invoke("click_mouse", { button: "left" }).catch((error) => {
        setMouse((current) => ({ ...current, error: String(error), bridge: "unavailable" }));
      });
      setMouse((current) => ({ ...current, lastAction: "왼쪽 클릭" }));
      pushEvent("핀치 제스처로 왼쪽 클릭을 실행했습니다.", "blue");
    }

    wasPinchingRef.current = isPinching;
  };

  const driveGesture = async (x: number, y: number, gesture: Gesture) => {
    const currentMouse = mouseRef.current;
    if (!currentMouse.enabled || currentMouse.bridge !== "ready") return;

    const now = performance.now();

    if (gesture.isFist) {
      await completeLeftPinch();
      wasRightPinchingRef.current = false;
      await scrollFromFist(y);
      return;
    }

    scrollAnchorYRef.current = null;

    if (gesture.isLeftPinching) {
      if (leftPinchStartedAtRef.current === null) {
        await movePointer(x, y, true);
        leftPinchStartedAtRef.current = now;
        setMouse((current) => ({ ...current, lastAction: "핀치 준비" }));
      } else if (!dragActiveRef.current && now - leftPinchStartedAtRef.current >= DRAG_HOLD_MS) {
        await invoke("set_drag", { active: true }).catch(markBridgeUnavailable);
        dragActiveRef.current = true;
        setMouse((current) => ({ ...current, lastAction: "드래그 시작" }));
        pushEvent("핀치 유지로 드래그를 시작했습니다.", "blue");
      }
    } else {
      await completeLeftPinch();
      await movePointer(x, y);
    }

    if (gesture.isRightPinching && !gesture.isLeftPinching) {
      if (!wasRightPinchingRef.current) {
        await invoke("click_mouse", { button: "right" }).catch(markBridgeUnavailable);
        setMouse((current) => ({ ...current, lastAction: "우클릭" }));
        pushEvent("중지 핀치로 우클릭을 실행했습니다.", "blue");
      }
      wasRightPinchingRef.current = true;
    } else {
      wasRightPinchingRef.current = false;
    }
  };

  const movePointer = async (x: number, y: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastMoveRef.current <= 24) return;

    await invoke("move_mouse", { x: Math.round(x), y: Math.round(y) }).catch(markBridgeUnavailable);
    lastMoveRef.current = now;
    setMouse((current) => ({
      ...current,
      position: { x: Math.round(x), y: Math.round(y) },
      lastAction: "이동",
    }));
  };

  const completeLeftPinch = async () => {
    if (leftPinchStartedAtRef.current === null) return;

    if (dragActiveRef.current) {
      await invoke("set_drag", { active: false }).catch(markBridgeUnavailable);
      setMouse((current) => ({ ...current, lastAction: "드롭" }));
      pushEvent("핀치 해제로 드래그를 종료했습니다.", "blue");
    } else {
      await invoke("click_mouse", { button: "left" }).catch(markBridgeUnavailable);
      setMouse((current) => ({ ...current, lastAction: "좌클릭" }));
      pushEvent("검지 핀치로 좌클릭을 실행했습니다.", "blue");
    }

    leftPinchStartedAtRef.current = null;
    dragActiveRef.current = false;
  };

  const scrollFromFist = async (y: number) => {
    if (scrollAnchorYRef.current === null) {
      scrollAnchorYRef.current = y;
      setMouse((current) => ({ ...current, lastAction: "스크롤 모드" }));
      return;
    }

    const distanceY = scrollAnchorYRef.current - y;
    const rawSteps = Math.trunc(distanceY / SCROLL_STEP_PIXELS);
    const steps = clamp(rawSteps, -MAX_SCROLL_STEPS, MAX_SCROLL_STEPS);
    if (steps === 0) return;

    await invoke("scroll_mouse", { delta: steps }).catch(markBridgeUnavailable);
    scrollAnchorYRef.current -= steps * SCROLL_STEP_PIXELS;
    setMouse((current) => ({ ...current, lastAction: steps > 0 ? "위로 스크롤" : "아래로 스크롤" }));
  };

  const cancelGestureControls = async () => {
    scrollAnchorYRef.current = null;
    wasRightPinchingRef.current = false;
    leftPinchStartedAtRef.current = null;

    if (dragActiveRef.current && mouseRef.current.bridge === "ready") {
      await invoke("set_drag", { active: false }).catch(markBridgeUnavailable);
    }
    dragActiveRef.current = false;
  };

  const markBridgeUnavailable = (error: unknown) => {
    setMouse((current) => ({ ...current, error: String(error), bridge: "unavailable" }));
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
    if (mouseRef.current.enabled) void cancelGestureControls();
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

function readLegacyGesture(landmarks: NormalizedLandmark[]) {
  const pinchDistance = distance(landmarks[4], landmarks[8]);
  const indexOpen = landmarks[8].y < landmarks[6].y;
  const middleOpen = landmarks[12].y < landmarks[10].y;
  const ringOpen = landmarks[16].y < landmarks[14].y;
  const pinkyOpen = landmarks[20].y < landmarks[18].y;
  const openCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

  if (pinchDistance < 0.055) {
    return { name: "핀치 클릭", isPinching: true, pinchDistance };
  }

  if (openCount >= 3) {
    return { name: "손바닥 이동", isPinching: false, pinchDistance };
  }

  if (indexOpen) {
    return { name: "포인터 이동", isPinching: false, pinchDistance };
  }

  return { name: "휴식", isPinching: false, pinchDistance };
}

function readAdvancedGesture(landmarks: NormalizedLandmark[]): Gesture {
  const pinchDistance = distance(landmarks[4], landmarks[8]);
  const middlePinchDistance = distance(landmarks[4], landmarks[12]);
  const palmSize = Math.max(distance(landmarks[0], landmarks[5]), 0.001);
  const foldedCount = [
    distance(landmarks[8], landmarks[5]) < palmSize * 0.65,
    distance(landmarks[12], landmarks[9]) < palmSize * 0.65,
    distance(landmarks[16], landmarks[13]) < palmSize * 0.65,
    distance(landmarks[20], landmarks[17]) < palmSize * 0.65,
  ].filter(Boolean).length;
  const isLeftPinching = pinchDistance < LEFT_PINCH_THRESHOLD;
  const isRightPinching = !isLeftPinching && middlePinchDistance < RIGHT_PINCH_THRESHOLD;
  const isFist = !isLeftPinching && !isRightPinching && foldedCount >= 3;

  if (isFist) {
    return { name: "주먹 스크롤", isLeftPinching, isRightPinching, isFist, pinchDistance };
  }
  if (isLeftPinching) {
    return { name: "검지 핀치", isLeftPinching, isRightPinching, isFist, pinchDistance };
  }
  if (isRightPinching) {
    return { name: "중지 핀치", isLeftPinching, isRightPinching, isFist, pinchDistance };
  }

  const indexOpen = landmarks[8].y < landmarks[6].y;
  const middleOpen = landmarks[12].y < landmarks[10].y;
  const ringOpen = landmarks[16].y < landmarks[14].y;
  const pinkyOpen = landmarks[20].y < landmarks[18].y;
  const openCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

  return {
    name: openCount >= 3 ? "손바닥 이동" : indexOpen ? "검지 이동" : "휴식",
    isLeftPinching,
    isRightPinching,
    isFist,
    pinchDistance,
  };
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
