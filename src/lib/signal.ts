import type {
  ApproachDirection,
  MovementType,
  SignalPhaseState,
} from "@/types/traffic";

/**
 * Pure helpers for translating KLID signal phase values into the
 * green / yellow / red model used by the UI.
 */

export const PHASE_LABELS: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "신호",
  "protected-clearance": "황색",
  "stop-And-Remain": "적색",
};

export const PHASE_HINTS: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "안전하게 진행하세요.",
  "protected-clearance": "신호 변경 중입니다.",
  "stop-And-Remain": "정지 후 대기하세요.",
};

export type SignalColor = "green" | "yellow" | "red";

export const PHASE_COLOR: Record<SignalPhaseState, SignalColor> = {
  "protected-Movement-Allowed": "green",
  "protected-clearance": "yellow",
  "stop-And-Remain": "red",
};

export const SIGNAL_TEXT_CLASS: Record<SignalColor, string> = {
  green: "text-signal-green",
  yellow: "text-signal-yellow",
  red: "text-signal-red",
};

export const SIGNAL_BG_CLASS: Record<SignalColor, string> = {
  green: "bg-signal-green",
  yellow: "bg-signal-yellow",
  red: "bg-signal-red",
};

export const SIGNAL_BORDER_CLASS: Record<SignalColor, string> = {
  green: "border-signal-green",
  yellow: "border-signal-yellow",
  red: "border-signal-red",
};

export const SIGNAL_SOFT_BG_CLASS: Record<SignalColor, string> = {
  green: "bg-signal-green/10",
  yellow: "bg-signal-yellow/10",
  red: "bg-signal-red/10",
};

export const SIGNAL_INDICATOR_CLASS: Record<SignalColor, string> = {
  green: "[&_[data-slot=progress-indicator]]:bg-signal-green",
  yellow: "[&_[data-slot=progress-indicator]]:bg-signal-yellow",
  red: "[&_[data-slot=progress-indicator]]:bg-signal-red",
};

export const SIGNAL_RING_CLASS: Record<SignalColor, string> = {
  green: "ring-signal-green/40",
  yellow: "ring-signal-yellow/40",
  red: "ring-signal-red/40",
};

export const MOVEMENT_ICONS: Record<
  MovementType,
  "ArrowUp" | "ArrowRight" | "ArrowLeft" | "Footprints" | "Bus" | "Bike" | "CornerDownLeft"
> = {
  Straight: "ArrowUp",
  "Left Turn": "ArrowLeft",
  "Right Turn": "ArrowRight",
  "U Turn": "CornerDownLeft",
  Pedestrian: "Footprints",
  Bus: "Bus",
  Bicycle: "Bike",
};

export const MOVEMENT_LABELS_KO: Record<MovementType, string> = {
  Straight: "직진",
  "Left Turn": "좌회전",
  "Right Turn": "우회전",
  "U Turn": "유턴",
  Pedestrian: "보행",
  Bus: "버스",
  Bicycle: "자전거",
};

export const DIRECTION_LABELS_KO: Record<ApproachDirection, string> = {
  North: "북",
  East: "동",
  South: "남",
  West: "서",
  NorthEast: "북동",
  SouthEast: "남동",
  SouthWest: "남서",
  NorthWest: "북서",
};

export function dominantColor(colors: SignalColor[]): SignalColor {
  if (colors.length === 0) return "red";
  const counts: Record<SignalColor, number> = { green: 0, yellow: 0, red: 0 };
  for (const c of colors) counts[c] += 1;
  if (counts.green >= counts.red && counts.green >= counts.yellow) return "green";
  if (counts.yellow >= counts.red) return "yellow";
  return "red";
}

export function phaseColor(phase: SignalPhaseState): SignalColor {
  return PHASE_COLOR[phase];
}

export function phaseProgress(remainingSeconds: number | undefined, cycleSeconds: number): number | undefined {
  if (remainingSeconds === undefined || cycleSeconds <= 0) return undefined;
  const elapsed = cycleSeconds - remainingSeconds;
  return Math.min(1, Math.max(0, elapsed / cycleSeconds));
}
