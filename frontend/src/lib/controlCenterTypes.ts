export type CameraRuntimeState = {
  status: "idle" | "requesting" | "streaming" | "error";
  device: string;
  resolution: string;
  frameRate: number | null;
  error: string | null;
};

export type VisionRuntimeState = {
  status: "idle" | "loading" | "ready" | "detecting" | "error";
  gesture: string;
  landmarks: number;
  confidence: number | null;
  pinchDistance: number | null;
  error: string | null;
};

export type MouseRuntimeState = {
  enabled: boolean;
  bridge: "checking" | "ready" | "unavailable";
  screen: { width: number; height: number } | null;
  position: { x: number; y: number } | null;
  lastAction: string;
  error: string | null;
};

export type CalibrationRuntimeState = {
  active: boolean;
  samples: number;
  progress: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
};

export type ActivityEvent = {
  id: string;
  time: string;
  message: string;
  tone: "blue" | "green" | "orange" | "neutral";
};
