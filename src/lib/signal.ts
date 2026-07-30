import type {
  ApproachDirection,
  MovementType,
  SignalPhaseState,
} from "@/types/traffic";

/**
 * Pure helpers for translating KLID signal phase values into the
 * green / yellow / red model used by the UI. Centralizing this mapping keeps
 * the UI components decoupled from the raw API string values.
 */

/** Friendly Korean label for each KLID phase, shown to the user. */
export const PHASE_LABELS: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "신호",
  "protected-clearance": "황색",
  "stop-And-Remain": "정지",
};

/** Short Korean hint text describing what the driver/pedestrian should do. */
export const PHASE_HINTS: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "안전하게 진행하세요",
  "protected-clearance": "정지 준비하세요",
  "stop-And-Remain": "완전히 정지하세요",
};

/** UI color bucket for each KLID phase. */
export type SignalColor = "green" | "yellow" | "red";

/** Maps a KLID phase to the UI color bucket used by markers and cards. */
export const PHASE_COLOR: Record<SignalPhaseState, SignalColor> = {
  "protected-Movement-Allowed": "green",
  "protected-clearance": "yellow",
  "stop-And-Remain": "red",
};

/** Tailwind text color class for each signal color. */
export const SIGNAL_TEXT_CLASS: Record<SignalColor, string> = {
  green: "text-signal-green",
  yellow: "text-signal-yellow",
  red: "text-signal-red",
};

/** Tailwind background color class (solid) for each signal color. */
export const SIGNAL_BG_CLASS: Record<SignalColor, string> = {
  green: "bg-signal-green",
  yellow: "bg-signal-yellow",
  red: "bg-signal-red",
};

/** Tailwind border color class for each signal color. */
export const SIGNAL_BORDER_CLASS: Record<SignalColor, string> = {
  green: "border-signal-green",
  yellow: "border-signal-yellow",
  red: "border-signal-red",
};

/** Soft tinted background (low opacity) for each signal color. */
export const SIGNAL_SOFT_BG_CLASS: Record<SignalColor, string> = {
  green: "bg-signal-green/10",
  yellow: "bg-signal-yellow/10",
  red: "bg-signal-red/10",
};

/** Data-slot selector that recolors the shadcn Progress indicator per signal color. */
export const SIGNAL_INDICATOR_CLASS: Record<SignalColor, string> = {
  green: "[&_[data-slot=progress-indicator]]:bg-signal-green",
  yellow: "[&_[data-slot=progress-indicator]]:bg-signal-yellow",
  red: "[&_[data-slot=progress-indicator]]:bg-signal-red",
};

/** Ring (glow) class for the active/selected marker, per color. */
export const SIGNAL_RING_CLASS: Record<SignalColor, string> = {
  green: "ring-signal-green/40",
  yellow: "ring-signal-yellow/40",
  red: "ring-signal-red/40",
};

/** Lucide icon name to render for each movement type. */
export const MOVEMENT_ICONS: Record<MovementType, "ArrowUp" | "ArrowRight" | "ArrowLeft" | "Footprints"> = {
  Straight: "ArrowUp",
  "Left Turn": "ArrowLeft",
  "Right Turn": "ArrowRight",
  Pedestrian: "Footprints",
};

/** Korean label for each movement type, shown to the user. */
export const MOVEMENT_LABELS_KO: Record<MovementType, string> = {
  Straight: "직진",
  "Left Turn": "좌회전",
  "Right Turn": "우회전",
  Pedestrian: "횡단보도",
};

/** Korean label for each compass direction, shown to the user. */
export const DIRECTION_LABELS_KO: Record<ApproachDirection, string> = {
  North: "북측",
  East: "동측",
  South: "남측",
  West: "서측",
};

/** Determines the dominant signal color for an intersection (used by markers). */
export function dominantColor(
  colors: SignalColor[]
): SignalColor {
  if (colors.length === 0) return "red";
  const counts: Record<SignalColor, number> = { green: 0, yellow: 0, red: 0 };
  for (const c of colors) counts[c] += 1;
  if (counts.green >= counts.red && counts.green >= counts.yellow) return "green";
  if (counts.yellow >= counts.red) return "yellow";
  return "red";
}

/** Converts a phase to its UI color bucket. */
export function phaseColor(phase: SignalPhaseState): SignalColor {
  return PHASE_COLOR[phase];
}

/** Returns 0–1 progress of the current phase within its cycle. */
export function phaseProgress(remainingSeconds: number, cycleSeconds: number): number {
  if (cycleSeconds <= 0) return 0;
  const elapsed = cycleSeconds - remainingSeconds;
  return Math.min(1, Math.max(0, elapsed / cycleSeconds));
}
