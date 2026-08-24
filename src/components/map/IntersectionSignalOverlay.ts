import type { ApproachDirection, Intersection, SignalPhaseState, TrafficSignal, ViewMode } from "@/types/traffic";
import type { IntersectionRoadGeometry, RoadApproach } from "@/services/roadGeometryService";

const DIRECTION_ORDER: ApproachDirection[] = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"];
const DIRECTION_LABEL: Record<ApproachDirection, string> = { North: "북", NorthEast: "북동", East: "동", SouthEast: "남동", South: "남", SouthWest: "남서", West: "서", NorthWest: "북서" };
const DIRECTION_ANGLE: Record<ApproachDirection, number> = { North: 0, NorthEast: 45, East: 90, SouthEast: 135, South: 180, SouthWest: 225, West: 270, NorthWest: 315 };
const STATE_COLOR: Record<SignalPhaseState, string> = { "protected-Movement-Allowed": "var(--color-signal-green)", "protected-clearance": "var(--color-signal-yellow)", "stop-And-Remain": "var(--color-signal-red)" };
const MOVEMENT_LABEL: Partial<Record<TrafficSignal["movement"], string>> = { Straight: "직진", "Left Turn": "좌회전", "Right Turn": "우회전", "U Turn": "유턴", Pedestrian: "보행", Bus: "버스", Bicycle: "자전거" };
const GEOMETRY_CONFIDENCE_THRESHOLD = 0.58;

function formatSeconds(value: number | undefined): string { return value === undefined ? "—" : `${Math.floor(Math.max(0, value))}`; }
function normalizeAngle(value: number): number { return ((value % 360) + 360) % 360; }
function readableRotation(bearing: number): number { const normalized = normalizeAngle(bearing); return normalized > 90 && normalized < 270 ? normalized - 180 : normalized; }
function filterSignalsForMode(signals: TrafficSignal[], viewMode: ViewMode): TrafficSignal[] {
  const modeSignals = signals.filter((signal) => viewMode === "pedestrian" ? signal.movement === "Pedestrian" : signal.movement !== "Pedestrian");
  const seen = new Set<string>();
  return modeSignals.filter((signal) => { const key = [signal.direction, signal.movement, signal.state, signal.remainingSeconds ?? "undefined", signal.cycleSeconds].join("|"); if (seen.has(key)) return false; seen.add(key); return true; });
}
function approachForDirection(geometry: IntersectionRoadGeometry | null | undefined, direction: ApproachDirection): RoadApproach | undefined {
  if (!geometry || geometry.confidence < GEOMETRY_CONFIDENCE_THRESHOLD) return undefined;
  return geometry.directionMatches[direction];
}
function movementArrowAngle(approach: RoadApproach | undefined, direction: ApproachDirection, movement: TrafficSignal["movement"]): number {
  const outward = approach?.bearing ?? DIRECTION_ANGLE[direction];
  const travel = normalizeAngle(outward + 180);
  if (movement === "Left Turn") return normalizeAngle(travel - 90);
  if (movement === "Right Turn") return normalizeAngle(travel + 90);
  return travel;
}
function buildSignalChip(signal: TrafficSignal, approach: RoadApproach | undefined): string {
  const color = STATE_COLOR[signal.state];
  const movement = MOVEMENT_LABEL[signal.movement] ?? "신호";
  const arrowAngle = movementArrowAngle(approach, signal.direction, signal.movement);
  const seconds = formatSeconds(signal.remainingSeconds);
  const direction = DIRECTION_LABEL[signal.direction];
  const arrow = `<span class="signal-arrow-glyph" style="transform:rotate(${arrowAngle}deg);">↑</span>`;
  return `<div class="signal-chip" aria-label="${direction} ${movement} ${seconds}초"><span class="signal-dot" aria-hidden="true" style="--signal-color:${color};"></span><span class="signal-arrow" aria-hidden="true">${arrow}</span><span class="signal-chip-body"><span class="signal-movement">${movement}</span><span class="signal-seconds">${seconds}<small>초</small></span></span></div>`;
}
function buildDirectionGroup(direction: ApproachDirection, signals: TrafficSignal[], geometry: IntersectionRoadGeometry | null | undefined): string {
  if (signals.length === 0) return "";
  const directionLabel = DIRECTION_LABEL[direction];
  const approach = approachForDirection(geometry, direction);
  const positionAngle = approach?.bearing ?? DIRECTION_ANGLE[direction];
  const labelRotation = readableRotation(positionAngle);
  const geometryAttribute = approach ? ` data-road-bearing="${approach.bearing.toFixed(2)}" data-road-way="${approach.wayId}"` : "";
  return `<div class="signal-direction" data-signal-direction="${direction}" data-direction-angle="${positionAngle}"${geometryAttribute} style="--direction-angle:${positionAngle}deg;--label-rotation:${labelRotation}deg;"><div class="signal-direction-content"><div class="signal-direction-label"><span>${directionLabel}</span><span class="signal-direction-arrow" aria-hidden="true">↑</span></div><div class="signal-direction-signals">${signals.map((signal) => buildSignalChip(signal, approach)).join("")}</div></div></div>`;
}
function buildStyles(): string { return `<style>.signal-overlay-root{--overlay-size:clamp(210px,27vw,280px);--direction-radius:calc(var(--overlay-size)*.38);width:var(--overlay-size);height:var(--overlay-size);position:relative;pointer-events:none;overflow:visible}.signal-direction{position:absolute;left:50%;top:50%;width:46%;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%) rotate(var(--direction-angle)) translateY(calc(-1 * var(--direction-radius)));transform-origin:center center}.signal-direction-content{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transform:rotate(calc(-1 * var(--direction-angle)));transform-origin:center center}.signal-direction-label{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:40px;padding:2px 7px;border-radius:9999px;background:color-mix(in srgb,var(--foreground) 88%,transparent);color:var(--background);font-size:10px;font-weight:850;line-height:1.1;box-shadow:0 2px 8px rgba(15,23,42,.18);transform:rotate(calc(var(--direction-angle) + var(--label-rotation)));transform-origin:center center}.signal-direction-arrow{display:inline-block;font-size:12px;line-height:1;font-weight:900}.signal-direction-signals{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}.signal-chip{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:76px;min-height:38px;padding:5px 8px;border:1px solid color-mix(in srgb,var(--border) 65%,transparent);border-radius:11px;background:color-mix(in srgb,var(--card) 96%,transparent);box-shadow:0 5px 16px rgba(15,23,42,.18);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);white-space:nowrap;box-sizing:border-box}.signal-dot{display:block;width:8px;height:8px;flex:0 0 auto;border-radius:9999px;background:var(--signal-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--signal-color) 16%,transparent)}.signal-arrow{display:block;flex:0 0 auto;width:20px;height:20px;text-align:center;font-size:18px;font-weight:900;line-height:20px;color:var(--foreground)}.signal-arrow-glyph{display:block;width:20px;height:20px;line-height:20px;transform-origin:50% 50%}.signal-chip-body{display:inline-flex;min-width:30px;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}.signal-movement{display:block;max-width:42px;overflow:hidden;text-overflow:ellipsis;font-size:9px;font-weight:750;line-height:1;color:var(--muted-foreground)}.signal-seconds{display:block;min-width:30px;font-size:14px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;font-feature-settings:"tnum";color:var(--foreground)}.signal-seconds small{margin-left:2px;font-size:8px;font-weight:750;color:var(--muted-foreground)}.signal-center{position:absolute;left:50%;top:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:color-mix(in srgb,var(--card) 96%,transparent);border:2px solid var(--foreground);box-shadow:0 2px 8px rgba(15,23,42,.24);transform:translate(-50%,-50%);z-index:2}@media (max-width:640px){.signal-overlay-root{--overlay-size:190px;--direction-radius:calc(var(--overlay-size)*.38)}.signal-direction-label{min-width:34px;padding:2px 5px;font-size:9px}.signal-chip{min-width:66px;min-height:34px;gap:4px;padding:4px 6px}.signal-dot{width:7px;height:7px}.signal-arrow{width:17px;height:17px;font-size:16px;line-height:17px}.signal-arrow-glyph{width:17px;height:17px;line-height:17px}.signal-seconds{min-width:27px;font-size:12px}.signal-seconds small{font-size:7px}.signal-movement{max-width:36px;font-size:8px}.signal-center{width:18px;height:18px}}</style>`; }
function buildInnerHTML(intersection: Intersection, viewMode: ViewMode, geometry?: IntersectionRoadGeometry | null): string {
  const signals = filterSignalsForMode(intersection.signals, viewMode);
  const geometryCandidate = geometry && geometry.confidence >= GEOMETRY_CONFIDENCE_THRESHOLD ? geometry : null;
  const geometryMatchesAllSignals = Boolean(geometryCandidate && DIRECTION_ORDER.every((direction) => signals.every((signal) => signal.direction !== direction || Boolean(geometryCandidate.directionMatches[direction]))));
  const layoutGeometry = geometryMatchesAllSignals ? geometryCandidate : null;
  const content = `<div class="signal-center" aria-hidden="true"></div>${DIRECTION_ORDER.map((direction) => buildDirectionGroup(direction, signals.filter((signal) => signal.direction === direction), layoutGeometry)).join("")}`;
  return `${buildStyles()}<div class="signal-overlay-root" aria-label="선택한 교차로 ${viewMode === "pedestrian" ? "보행자" : "운전자"} 신호" style="display:${signals.length > 0 ? "block" : "none"};">${content}</div>`;
}
export function createIntersectionSignalOverlayElement(intersection: Intersection, viewMode: ViewMode, geometry?: IntersectionRoadGeometry | null): HTMLElement { const element = document.createElement("div"); element.style.cssText = "position:relative;pointer-events:none;z-index:15;overflow:visible;"; element.innerHTML = buildInnerHTML(intersection, viewMode, geometry); return element; }
export function updateIntersectionSignalOverlayElement(element: HTMLElement, intersection: Intersection, viewMode: ViewMode, geometry?: IntersectionRoadGeometry | null): void { element.innerHTML = buildInnerHTML(intersection, viewMode, geometry); }
