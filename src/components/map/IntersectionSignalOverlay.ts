import type { ApproachDirection, Intersection, SignalPhaseState, TrafficSignal } from "@/types/traffic";

const DIRECTION_ORDER: ApproachDirection[] = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"];
const DIRECTION_ARROW: Record<ApproachDirection, string> = { North: "↑", NorthEast: "↗", East: "→", SouthEast: "↘", South: "↓", SouthWest: "↙", West: "←", NorthWest: "↖" };
const DIRECTION_POSITION: Record<ApproachDirection, string> = {
  North: "left:50%;top:0;transform:translate(-50%,-125%);",
  NorthEast: "right:0;top:18%;transform:translate(70%,-50%);",
  East: "right:0;top:50%;transform:translate(125%,-50%);",
  SouthEast: "right:0;bottom:18%;transform:translate(70%,50%);",
  South: "left:50%;bottom:0;transform:translate(-50%,125%);",
  SouthWest: "left:0;bottom:18%;transform:translate(-70%,50%);",
  West: "left:0;top:50%;transform:translate(-125%,-50%);",
  NorthWest: "left:0;top:18%;transform:translate(-70%,-50%);",
};
const STATE_COLOR: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "var(--color-signal-green)",
  "protected-clearance": "var(--color-signal-yellow)",
  "stop-And-Remain": "var(--color-signal-red)",
};
const MOVEMENT_LABEL: Partial<Record<TrafficSignal["movement"], string>> = {
  Straight: "직진", "Left Turn": "좌회전", "Right Turn": "우회전", "U Turn": "유턴", Pedestrian: "보행", Bus: "버스", Bicycle: "자전거",
};

function formatSeconds(value: number | undefined): string { return value === undefined ? "—" : `${Math.max(0, value)}초`; }

function buildSignalChip(signal: TrafficSignal): string {
  const color = STATE_COLOR[signal.state];
  const movement = MOVEMENT_LABEL[signal.movement];
  return `<div aria-label="${movement ?? "신호"} ${formatSeconds(signal.remainingSeconds)}" style="display:flex;align-items:center;gap:5px;min-height:28px;padding:4px 7px;border:1px solid color-mix(in srgb,var(--border) 55%,transparent);border-radius:9999px;background:color-mix(in srgb,var(--card) 92%,transparent);box-shadow:0 4px 14px rgba(15,23,42,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);white-space:nowrap;">
    <span aria-hidden="true" style="display:block;width:9px;height:9px;flex:0 0 auto;border-radius:9999px;background:${color};box-shadow:0 0 0 3px color-mix(in srgb,${color} 16%,transparent);"></span>
    <span style="font-size:18px;font-weight:800;line-height:1;color:var(--foreground);">${DIRECTION_ARROW[signal.direction]}</span>
    <span style="font-size:12px;font-weight:800;line-height:1;color:var(--foreground);">${formatSeconds(signal.remainingSeconds)}</span>
    ${movement && movement !== "직진" ? `<span style="font-size:9px;font-weight:700;color:var(--muted-foreground);">${movement}</span>` : ""}
  </div>`;
}

function buildDirectionGroup(direction: ApproachDirection, signals: TrafficSignal[]): string {
  if (signals.length === 0) return "";
  return `<div data-signal-direction="${direction}" style="position:absolute;${DIRECTION_POSITION[direction]}display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;">${signals.map(buildSignalChip).join("")}</div>`;
}

function buildInnerHTML(intersection: Intersection): string {
  const groups = DIRECTION_ORDER.map((direction) => buildDirectionGroup(direction, intersection.signals.filter((signal) => signal.direction === direction))).join("");
  return `<div style="position:relative;width:2px;height:2px;pointer-events:none;">
    <span aria-hidden="true" style="position:absolute;left:50%;top:50%;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:9999px;background:var(--card);border:2px solid var(--foreground);box-shadow:0 2px 8px rgba(15,23,42,.22);"></span>
    ${groups}
  </div>`;
}

export function createIntersectionSignalOverlayElement(intersection: Intersection): HTMLElement {
  const element = document.createElement("div");
  element.style.cssText = "position:relative;width:2px;height:2px;pointer-events:none;z-index:15;";
  element.innerHTML = buildInnerHTML(intersection);
  return element;
}

export function updateIntersectionSignalOverlayElement(element: HTMLElement, intersection: Intersection): void {
  element.innerHTML = buildInnerHTML(intersection);
}
