import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Hand,
  Monitor,
  MousePointer2,
  Pause,
  Play,
  Power,
  Radio,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

type ConnectionState = "disconnected" | "connecting" | "connected";

type LogEntry = {
  id: string;
  time: string;
  type: "system" | "gesture" | "command";
  title: string;
  detail: string;
};

type GesturePayload =
  | { gesture: string }
  | { gesture: "MOUSE_MOVE"; x: number; y: number };

type CameraState = "idle" | "loading" | "running" | "error";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";

const gestures = [
  { label: "위로 쓸기", value: "SWIPE_UP", icon: ArrowUp },
  { label: "아래로 쓸기", value: "SWIPE_DOWN", icon: ArrowDown },
  { label: "왼쪽으로 쓸기", value: "SWIPE_LEFT", icon: ArrowLeft },
  { label: "오른쪽으로 쓸기", value: "SWIPE_RIGHT", icon: ArrowRight },
  { label: "손 접기", value: "FOLD_HAND", icon: Hand },
];

const statusMeta = {
  connected: {
    label: "연결됨",
    tone: "bg-[#30D158]",
    glow: "shadow-[0_0_22px_rgba(48,209,88,0.42)]",
    icon: Wifi,
  },
  connecting: {
    label: "연결 중",
    tone: "bg-[#FFD60A]",
    glow: "shadow-[0_0_22px_rgba(255,214,10,0.34)]",
    icon: Radio,
  },
  disconnected: {
    label: "연결 안 됨",
    tone: "bg-[#FF453A]",
    glow: "shadow-[0_0_22px_rgba(255,69,58,0.32)]",
    icon: WifiOff,
  },
} satisfies Record<ConnectionState, { label: string; tone: string; glow: string; icon: typeof Wifi }>;

function nowLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function formatPayload(payload: unknown) {
  if (typeof payload === "string") return payload;

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Unserializable payload";
  }
}

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [coords, setCoords] = useState({ x: 0.5, y: 0.5 });
  const [lastCommand, setLastCommand] = useState("백엔드 명령 대기 중");
  const socketRef = useRef<Socket | null>(null);

  const addLog = (entry: Omit<LogEntry, "id" | "time">) => {
    setLogs((current) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        time: nowLabel(),
      },
      ...current,
    ].slice(0, 50));
  };

  const socket = useMemo(() => {
    const client = io(socketUrl, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    socketRef.current = client;
    return client;
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnectionState("connected");
      addLog({
        type: "system",
        title: "소켓 연결됨",
        detail: `${socketUrl}에 연결되었습니다.`,
      });
    };

    const onDisconnect = (reason: string) => {
      setConnectionState("disconnected");
      addLog({
        type: "system",
        title: "소켓 연결 해제",
        detail: reason,
      });
    };

    const onConnectError = (error: Error) => {
      setConnectionState("disconnected");
      addLog({
        type: "system",
        title: "연결 실패",
        detail: error.message,
      });
    };

    const onCommand = (payload: unknown) => {
      const detail = formatPayload(payload);
      setLastCommand(detail);
      addLog({
        type: "command",
        title: "명령 수신",
        detail,
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("command", onCommand);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("command", onCommand);
      socket.disconnect();
    };
  }, [socket]);

  const connect = () => {
    if (socket.connected || connectionState === "connecting") return;

    setConnectionState("connecting");
    addLog({
      type: "system",
      title: "소켓 연결 시도",
      detail: socketUrl,
    });
    socket.connect();
  };

  const disconnect = () => {
    socket.disconnect();
  };

  const emitGesture = (payload: GesturePayload, shouldLog = true) => {
    if (!socket.connected) {
      if (shouldLog) {
        addLog({
          type: "system",
          title: "제스처 전송 보류",
          detail: "제스처를 보내려면 먼저 백엔드에 연결해야 합니다.",
        });
      }
      return;
    }

    socket.emit("gesture", payload);
    if (shouldLog) {
      addLog({
        type: "gesture",
        title: payload.gesture,
        detail: formatPayload(payload),
      });
    }
  };

  const handleTrackpadMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const nextCoords = {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
    };

    setCoords(nextCoords);

    if (socket.connected) {
      socket.emit("gesture", {
        gesture: "MOUSE_MOVE",
        ...nextCoords,
      });
    }
  };

  const StatusIcon = statusMeta[connectionState].icon;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0F1115] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(10,132,255,0.22),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(48,209,88,0.12),transparent_28%),linear-gradient(145deg,#0F1115_0%,#141821_48%,#0A0C10_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/8 to-transparent" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNavigation
          connectionState={connectionState}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        <section className="grid flex-1 grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_180px] gap-6"
          >
            <HeroPanel connectionState={connectionState} />

            <div className="min-h-0">
              <CameraPanel connected={connectionState === "connected"} onGesture={emitGesture} />
            </div>

            <ActivityPanel logs={logs} onClear={() => setLogs([])} />
          </motion.div>

          <StatusPanel
            connectionState={connectionState}
            socketUrl={socketUrl}
            lastCommand={lastCommand}
            StatusIcon={StatusIcon}
          />
        </section>
      </div>
    </main>
  );
}

function TopNavigation({
  connectionState,
  onConnect,
  onDisconnect,
}: {
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const meta = statusMeta[connectionState];

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between px-6 py-5"
    >
      <div className="flex items-center gap-4">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="grid h-12 w-12 place-items-center rounded-[20px] bg-white/10 shadow-glow ring-1 ring-white/10 backdrop-blur-2xl"
        >
          <Sparkles className="h-5 w-5 text-[#0A84FF]" />
        </motion.div>
        <div>
          <p className="text-[13px] text-[#A1A8B3]">제스처 제어 시스템</p>
          <h1 className="text-[32px] font-bold leading-tight tracking-normal text-white">God Hand</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <motion.div
          layout
          className="hidden items-center gap-3 rounded-[28px] bg-white/8 px-4 py-3 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl md:flex"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${meta.tone} ${meta.glow}`} />
          <span className="text-sm text-[#A1A8B3]">{meta.label}</span>
        </motion.div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={connectionState === "connected" ? onDisconnect : onConnect}
          className="inline-flex h-12 items-center gap-2 rounded-[20px] bg-white px-5 text-sm font-semibold text-[#0F1115] shadow-glass transition hover:bg-white/90"
        >
          {connectionState === "connected" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {connectionState === "connected" ? "연결 해제" : "연결"}
        </motion.button>
      </div>
    </motion.header>
  );
}

function HeroPanel({ connectionState }: { connectionState: ConnectionState }) {
  return (
    <motion.section
      layout
      className="rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
      whileHover={{ scale: 1.002 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.16em] text-[#0A84FF]">
            미래형 휴먼 인터페이스
          </p>
          <h2 className="text-[36px] font-bold leading-[1.06] tracking-normal text-white">
            손 제스처를 AI 마우스로 변환합니다.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#A1A8B3]">
            카메라가 손을 추적하고, 엄지와 손가락의 거리를 읽어 마우스 이동, 클릭, 드래그, 우클릭 상태를 확인하는 제어 센터입니다.
          </p>
        </div>
        <ConnectionOrb state={connectionState} />
      </div>
    </motion.section>
  );
}

function ConnectionOrb({ state }: { state: ConnectionState }) {
  const meta = statusMeta[state];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      className="relative grid h-40 w-40 shrink-0 place-items-center rounded-full bg-white/8 ring-1 ring-white/10 backdrop-blur-2xl"
      animate={{ scale: state === "connecting" ? [1, 1.04, 1] : 1 }}
      transition={{ duration: 1.6, repeat: state === "connecting" ? Infinity : 0 }}
    >
      <div className={`absolute inset-6 rounded-full ${meta.tone} opacity-10 blur-xl`} />
      <div className={`grid h-20 w-20 place-items-center rounded-full ${meta.tone} ${meta.glow}`}>
        <Icon className="h-8 w-8 text-[#0F1115]" />
      </div>
    </motion.div>
  );
}

function TrackpadPanel({
  coords,
  onPointerMove,
}: {
  coords: { x: number; y: number };
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-[330px] flex-col rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <PanelTitle icon={MousePointer2} title="가상 트랙패드" caption="마우스 이동 좌표 테스트" />
      <motion.div
        onPointerMove={onPointerMove}
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.15 }}
        className="relative mt-6 flex-1 cursor-crosshair overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.035))] shadow-inner ring-1 ring-white/10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.16),transparent_45%)]" />
        <div className="absolute inset-8 rounded-[20px] border border-white/10" />
        <motion.div
          animate={{ left: `${coords.x * 100}%`, top: `${coords.y * 100}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_30px_rgba(255,255,255,0.55)]"
        />
        <div className="absolute bottom-5 left-5 rounded-[20px] bg-[#0F1115]/45 px-4 py-3 backdrop-blur-xl ring-1 ring-white/10">
          <p className="text-[13px] text-[#A1A8B3]">마우스 이동</p>
          <p className="mt-1 font-mono text-[18px] text-white">
            x {coords.x.toFixed(3)} / y {coords.y.toFixed(3)}
          </p>
        </div>
      </motion.div>
    </motion.section>
  );
}

function GesturePanel({
  onGesture,
  connected,
}: {
  onGesture: (payload: GesturePayload) => void;
  connected: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, delay: 0.04 }}
      className="flex h-full min-h-[520px] flex-col rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <PanelTitle icon={Hand} title="제스처 테스트" caption="백엔드 제스처 이벤트 직접 전송" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 min-[1200px]:grid-cols-3">
        {gestures.map((gesture, index) => {
          const Icon = gesture.icon;
          return (
            <motion.button
              key={gesture.value}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.035 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onGesture({ gesture: gesture.value })}
              className="group min-h-[132px] rounded-[20px] bg-white/7 p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.18)] ring-1 ring-white/10 transition hover:bg-white/12"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-white/10 text-[#0A84FF] transition group-hover:bg-[#0A84FF] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[13px] text-[#A1A8B3]">{connected ? "전송 가능" : "오프라인"}</span>
              </div>
              <p className="mt-5 text-[18px] font-semibold">{gesture.label}</p>
              <p className="mt-1 font-mono text-[13px] text-[#A1A8B3]">{gesture.value}</p>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

function CameraPanel({
  connected,
  onGesture,
}: {
  connected: boolean;
  onGesture: (payload: GesturePayload, shouldLog?: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastGestureRef = useRef({ name: "", time: 0 });
  const lastMoveEmitRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [cameraCoords, setCameraCoords] = useState({ x: 0.5, y: 0.5 });
  const [cameraGesture, setCameraGesture] = useState("손을 카메라 앞에 보여주세요");

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    setCameraState("idle");
    setCameraGesture("카메라 대기 중");
  };

  const startCamera = async () => {
    try {
      setCameraState("loading");
      setCameraError("");

      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
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
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();
      setCameraState("running");
      detectHands();
    } catch (error) {
      setCameraState("error");
      setCameraError(error instanceof Error ? error.message : "카메라를 시작할 수 없습니다.");
    }
  };

  const detectHands = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(detectHands);
      return;
    }

    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 540;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0];

    if (landmarks) {
      drawLandmarks(context, landmarks, canvas.width, canvas.height);
      handleLandmarks(landmarks);
    } else {
      setCameraGesture("손을 카메라 앞에 보여주세요");
    }

    animationRef.current = requestAnimationFrame(detectHands);
  };

  const handleLandmarks = (landmarks: NormalizedLandmark[]) => {
    const thumb = landmarks[4];
    const index = landmarks[8];
    const wrist = landmarks[0];
    const center = {
      x: Number(((thumb.x + index.x) / 2).toFixed(3)),
      y: Number(((thumb.y + index.y) / 2).toFixed(3)),
    };
    const mirrored = {
      x: Number((1 - center.x).toFixed(3)),
      y: center.y,
    };

    setCameraCoords(mirrored);

    const now = performance.now();
    if (now - lastMoveEmitRef.current > 80) {
      onGesture({ gesture: "MOUSE_MOVE", ...mirrored }, false);
      lastMoveEmitRef.current = now;
    }

    const folded = isFoldedHand(landmarks);
    const swipeGesture = detectSwipe(wrist.x, wrist.y, now);
    const nextGesture = folded ? "FOLD_HAND" : swipeGesture;

    if (nextGesture) {
      emitCameraGesture(nextGesture, now);
    } else {
      setCameraGesture("마우스 이동 추적 중");
    }
  };

  const emitCameraGesture = (gesture: string, now: number) => {
    if (lastGestureRef.current.name === gesture && now - lastGestureRef.current.time < 900) {
      return;
    }

    lastGestureRef.current = { name: gesture, time: now };
    setCameraGesture(gestureLabel(gesture));
    onGesture({ gesture });
  };

  const detectSwipe = (x: number, y: number, now: number) => {
    if (!swipeRef.current || now - swipeRef.current.time > 700) {
      swipeRef.current = { x, y, time: now };
      return "";
    }

    const deltaX = x - swipeRef.current.x;
    const deltaY = y - swipeRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (Math.max(absX, absY) < 0.24) return "";

    swipeRef.current = { x, y, time: now };
    if (absX > absY) return deltaX > 0 ? "SWIPE_RIGHT" : "SWIPE_LEFT";
    return deltaY > 0 ? "SWIPE_DOWN" : "SWIPE_UP";
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 }}
      className="rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <PanelTitle icon={Camera} title="카메라 제스처 입력" caption="브라우저 카메라로 손을 추적해 백엔드에 전송" />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={cameraState === "running" ? stopCamera : startCamera}
            className="rounded-[16px] bg-white px-4 py-2 text-[13px] font-semibold text-[#0F1115] shadow-glass transition hover:bg-white/90"
          >
            {cameraState === "running" ? "카메라 끄기" : "카메라 켜기"}
          </motion.button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[24px] bg-[#161A20]/70 ring-1 ring-white/10">
          <video ref={videoRef} className="h-full min-h-[380px] w-full scale-x-[-1] object-cover opacity-80" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full scale-x-[-1]" />
          <div className="absolute bottom-4 left-4 rounded-[18px] bg-[#0F1115]/55 px-4 py-3 backdrop-blur-xl ring-1 ring-white/10">
            <p className="text-[13px] text-[#A1A8B3]">인식 상태</p>
            <p className="mt-1 text-[16px] font-semibold">{cameraStateLabel(cameraState, cameraGesture)}</p>
          </div>
        </div>

        {cameraError ? (
          <p className="rounded-[18px] bg-[#FF453A]/10 px-4 py-3 text-[13px] leading-5 text-[#FFB4AE] ring-1 ring-[#FF453A]/25">
            {cameraError}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <FlowStep icon={Camera} title="카메라" detail={cameraState === "running" ? "손 추적 실행 중" : "카메라 권한 필요"} />
          <FlowStep icon={Hand} title="제스처" detail={cameraGesture} />
          <FlowStep
            icon={Monitor}
            title="백엔드 전송"
            detail={connected ? `x ${cameraCoords.x.toFixed(3)} / y ${cameraCoords.y.toFixed(3)}` : "소켓 연결 필요"}
          />
        </div>
      </div>
    </motion.section>
  );
}

function ControlModelPanel() {
  return (
    <motion.section
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <PanelTitle icon={MousePointer2} title="AI 마우스 모델" caption="camera 폴더의 실제 조작 방식" />

      <div className="mt-6 grid gap-4">
        <ControlCard title="마우스 이동" detail="엄지 끝과 검지 끝의 중간점을 화면 좌표로 변환합니다." />
        <ControlCard title="왼쪽 클릭" detail="엄지와 검지를 붙였다 떼면 왼쪽 클릭으로 처리합니다." />
        <ControlCard title="드래그" detail="엄지와 검지를 붙인 상태를 유지하면 왼쪽 버튼을 누른 채 이동합니다." />
        <ControlCard title="오른쪽 클릭" detail="엄지와 중지를 붙이면 오른쪽 클릭을 실행합니다." />
        <ControlCard title="더블 클릭" detail="짧은 시간 안에 왼쪽 클릭이 반복되면 더블 클릭으로 처리합니다." />
      </div>

      <div className="mt-6 rounded-[20px] bg-[#0A84FF]/10 p-4 text-[13px] leading-6 text-[#BBD9FF] ring-1 ring-[#0A84FF]/20">
        가상 트랙패드와 제스처 버튼은 메인 기능이 아니라 개발 중 백엔드 이벤트를 확인하기 위한 보조 도구입니다.
      </div>
    </motion.section>
  );
}

function ControlCard({ title, detail }: { title: string; detail: string }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
      className="rounded-[20px] bg-white/7 p-4 ring-1 ring-white/10"
    >
      <p className="text-[16px] font-semibold text-white">{title}</p>
      <p className="mt-2 text-[13px] leading-5 text-[#A1A8B3]">{detail}</p>
    </motion.div>
  );
}

function ActivityPanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 }}
      className="min-h-0 rounded-[28px] bg-white/8 p-5 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between gap-4">
        <PanelTitle icon={Activity} title="활동 로그" caption="명령 이벤트와 제스처 전송 기록" />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClear}
          className="rounded-[16px] bg-white/8 px-3 py-2 text-[13px] text-[#A1A8B3] ring-1 ring-white/10 transition hover:bg-white/12"
        >
          지우기
        </motion.button>
      </div>

      <div className="mt-4 grid max-h-[126px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-[20px] bg-white/7 p-4 text-[13px] leading-6 text-[#A1A8B3] ring-1 ring-white/10 md:col-span-2"
            >
              아직 이벤트가 없습니다. 백엔드에 연결한 뒤 제스처를 보내면 여기에 기록됩니다.
            </motion.div>
          ) : (
            logs.map((log) => <LogCard key={log.id} log={log} />)
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function StatusPanel({
  connectionState,
  socketUrl,
  lastCommand,
  StatusIcon,
}: {
  connectionState: ConnectionState;
  socketUrl: string;
  lastCommand: string;
  StatusIcon: typeof Wifi;
}) {
  const meta = statusMeta[connectionState];

  return (
    <motion.aside
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-0 flex-col rounded-[28px] bg-white/8 p-6 shadow-glass ring-1 ring-white/10 backdrop-blur-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <PanelTitle icon={Power} title="상태" caption="백엔드 연결" />
        <motion.div layout className={`h-3 w-3 rounded-full ${meta.tone} ${meta.glow}`} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={connectionState}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mt-6 rounded-[24px] bg-[#161A20]/70 p-5 ring-1 ring-white/10"
        >
          <div className="flex items-center gap-3">
            <StatusIcon className="h-5 w-5 text-[#0A84FF]" />
            <p className="text-[24px] font-semibold">{meta.label}</p>
          </div>
          <p className="mt-3 break-all text-[13px] leading-6 text-[#A1A8B3]">{socketUrl}</p>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 rounded-[24px] bg-white/7 p-5 ring-1 ring-white/10">
        <p className="text-[13px] text-[#A1A8B3]">최근 명령</p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-white">
          {lastCommand}
        </pre>
      </div>

      <div className="mt-6 rounded-[24px] bg-white/7 p-5 ring-1 ring-white/10">
        <p className="text-[13px] text-[#A1A8B3]">프로젝트 핵심 기능</p>
        <p className="mt-2 text-[20px] font-semibold leading-7">카메라 손 추적 기반 AI 마우스</p>
        <p className="mt-3 text-[13px] leading-6 text-[#A1A8B3]">
          프론트엔드는 이 기능의 상태와 인식 흐름을 보여주는 제어 센터 역할을 하고, 실제 OS 조작은 camera 모듈의
          Python 코드가 담당합니다.
        </p>
      </div>
    </motion.aside>
  );
}

function LogCard({ log }: { log: LogEntry }) {
  const tone =
    log.type === "command"
      ? "text-[#30D158]"
      : log.type === "gesture"
        ? "text-[#0A84FF]"
        : "text-[#A1A8B3]";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="mb-3 rounded-[20px] bg-white/7 p-4 ring-1 ring-white/10"
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[13px] font-semibold ${tone}`}>{log.title}</p>
        <time className="shrink-0 text-[12px] text-[#A1A8B3]">{log.time}</time>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-[#A1A8B3]">
        {log.detail}
      </pre>
    </motion.article>
  );
}

function FlowStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Camera;
  title: string;
  detail: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
      className="rounded-[20px] bg-[#161A20]/70 p-4 ring-1 ring-white/10"
    >
      <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-white/10 text-[#0A84FF]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[18px] font-semibold">{title}</p>
      <p className="mt-1 text-[13px] leading-5 text-[#A1A8B3]">{detail}</p>
    </motion.div>
  );
}

function drawLandmarks(
  context: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  const connections = [
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
  ];

  context.strokeStyle = "rgba(10, 132, 255, 0.9)";
  context.lineWidth = 3;
  connections.forEach(([start, end]) => {
    context.beginPath();
    context.moveTo(landmarks[start].x * width, landmarks[start].y * height);
    context.lineTo(landmarks[end].x * width, landmarks[end].y * height);
    context.stroke();
  });

  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  landmarks.forEach((point) => {
    context.beginPath();
    context.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    context.fill();
  });
}

function isFoldedHand(landmarks: NormalizedLandmark[]) {
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];
  return fingerTips.every((tip, index) => landmarks[tip].y > landmarks[fingerPips[index]].y + 0.035);
}

function gestureLabel(gesture: string) {
  const labels: Record<string, string> = {
    SWIPE_UP: "위로 쓸기 감지",
    SWIPE_DOWN: "아래로 쓸기 감지",
    SWIPE_LEFT: "왼쪽으로 쓸기 감지",
    SWIPE_RIGHT: "오른쪽으로 쓸기 감지",
    FOLD_HAND: "손 접기 감지",
  };

  return labels[gesture] ?? gesture;
}

function cameraStateLabel(state: CameraState, gesture: string) {
  if (state === "loading") return "카메라와 손 추적 모델을 준비 중";
  if (state === "running") return gesture;
  if (state === "error") return "카메라 시작 실패";
  return "카메라 대기 중";
}

function PanelTitle({
  icon: Icon,
  title,
  caption,
}: {
  icon: typeof Activity;
  title: string;
  caption: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-white/10 text-[#0A84FF] ring-1 ring-white/10">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-[18px] font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[13px] text-[#A1A8B3]">{caption}</p>
      </div>
    </div>
  );
}
