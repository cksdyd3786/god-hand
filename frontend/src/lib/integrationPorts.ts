export type CameraSnapshot = {
  deviceLabel: string;
  isStreaming: boolean;
  width: number;
  height: number;
  fps: number;
};

export type GestureSnapshot = {
  gestureName: string;
  confidence: number;
  landmarks: number;
  intentionGate: boolean;
};

export type MouseSnapshot = {
  enabled: boolean;
  screenX: number;
  screenY: number;
  action: "none" | "move" | "click" | "drag";
};

export type GodHandRuntimePort = {
  getCameraSnapshot(): Promise<CameraSnapshot>;
  getGestureSnapshot(): Promise<GestureSnapshot>;
  getMouseSnapshot(): Promise<MouseSnapshot>;
  updateSettings(settings: Record<string, unknown>): Promise<void>;
};

export const runtimePortNotes = {
  tauri: "Map this port to Tauri invoke commands inside ai_mouse_tauri.",
  python: "Map this port to a backend bridge only after the Python core exposes a stable API.",
};
