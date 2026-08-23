import type { ApproachDirection, Intersection, SignalPhaseState, TrafficSignal, ViewMode } from "@/types/traffic";

const DIRECTION_ORDER: ApproachDirection[] = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"];

const DIRECTION_ARROW: Record<ApproachDirection, string> = {
  North: "↑",
  NorthEast: "↗",
  East: "→",
  SouthEast: "↘",
  South: "↓",
  SouthWest: "↙",
  West: "←",
  NorthWest: "↖",
};

const DIRECTION_GRID_AREA: Record<ApproachDirection, string> = {
  North: "north",
  NorthEast: "northEast",
  East: "east",
  SouthEast: "southEast",
  South: "south",
  SouthWest: "southWest",
  West: "west",
  NorthWest: "northWest",
};

const STATE_COLOR: Record<SignalPhaseState, string> = {
  "protected-Movement-Allowed": "var(--color-signal-green)",
  "protected-clearance": "var(--color-signal-yellow)",
  "stop-And-Remain": "var(--color-signal-red)",
};

const MOVEMENT_LABEL: Partial<Record<TrafficSignal["movement"], string>> = {
  Straight: "직진",
  "Left Turn": "좌회전",
  "Right Turn": "우회전",
  "U Turn": "유턴",
  Pedestrian: "보행",
  Bus: "버스",
  Bicycle: "자전거",
};

function formatSeconds(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.floor(Math.max(0, value))}`;
}

function filterSignalsForMode(signals: TrafficSignal[], viewMode: ViewMode): TrafficSignal[] {
  return signals.filter((signal) => viewMode === "pedestrian" ? signal.movement === "Pedestrian" : signal.movement !== "Pedestrian");
}

function getSignalArrow(signal: TrafficSignal): string {
  // Driver signals represent the approach direction. Pedestrian signals represent
  // the crossing flow visually, so they intentionally use a bidirectional arrow.
  return signal.movement === "Pedestrian" ? "↔" : DIRECTION_ARROW[signal.direction];
}

function buildSignalChip(signal: TrafficSignal): string {
  const color = STATE_COLOR[signal.state];
  const movement = MOVEMENT_LABEL[signal.movement];
  const arrow = getSignalArrow(signal);
  const seconds = formatSeconds(signal.remainingSeconds);

  return `<div class="signal-chip" aria-label="${movement ?? "신호"} ${seconds}초">
    <span class="signal-dot" aria-hidden="true" style="--signal-color:${color};"></span>
    <span class="signal-arrow" aria-hidden="true">${arrow}</span>
    <span class="signal-seconds">${seconds}</span>
    ${movement && movement !== "직진" ? `<span class="signal-movement">${movement}</span>` : ""}
  </div>`;
}

function buildDirectionGroup(direction: ApproachDirection, signals: TrafficSignal[]): string {
  if (signals.length === 0) return "";

  return `<div class="signal-direction signal-direction-${DIRECTION_GRID_AREA[direction]}" data-signal-direction="${direction}">
    ${signals.map(buildSignalChip).join("")}
  </div>`;
}

function buildStyles(): string {
  return `<style>
    .signal-overlay-root {
      --overlay-size: clamp(172px, 24vw, 236px);
      --cell-gap: clamp(5px, 0.8vw, 10px);
      width: var(--overlay-size);
      height: var(--overlay-size);
      position: relative;
      pointer-events: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(34px, .55fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) minmax(34px, .55fr) minmax(0, 1fr);
      grid-template-areas:
        "northWest north northEast"
        "west center east"
        "southWest south southEast";
      place-items: center;
      overflow: visible;
    }

    .signal-direction {
      min-width: 0;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--cell-gap);
      place-self: center;
    }

    .signal-direction-north,
    .signal-direction-south,
    .signal-direction-east,
    .signal-direction-west,
    .signal-direction-northEast,
    .signal-direction-southEast,
    .signal-direction-southWest,
    .signal-direction-northWest {
      width: max-content;
    }

    .signal-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-width: 48px;
      min-height: 28px;
      padding: 4px 7px;
      border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
      border-radius: 9999px;
      background: color-mix(in srgb, var(--card) 94%, transparent);
      box-shadow: 0 4px 14px rgba(15,23,42,.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      white-space: nowrap;
      box-sizing: border-box;
    }

    .signal-dot {
      display: block;
      width: 8px;
      height: 8px;
      flex: 0 0 auto;
      border-radius: 9999px;
      background: var(--signal-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--signal-color) 16%, transparent);
    }

    .signal-arrow {
      display: block;
      flex: 0 0 auto;
      min-width: 17px;
      text-align: center;
      font-size: 17px;
      font-weight: 850;
      line-height: 1;
      color: var(--foreground);
    }

    .signal-seconds {
      display: block;
      flex: 0 0 auto;
      min-width: 16px;
      font-size: 12px;
      font-weight: 850;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--foreground);
    }

    .signal-movement {
      display: block;
      max-width: 34px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
      color: var(--muted-foreground);
    }

    .signal-center {
      grid-area: center;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      background: color-mix(in srgb, var(--card) 96%, transparent);
      border: 2px solid var(--foreground);
      box-shadow: 0 2px 8px rgba(15,23,42,.24);
      z-index: 2;
    }

    .signal-direction-north { grid-area: north; }
    .signal-direction-northEast { grid-area: northEast; }
    .signal-direction-east { grid-area: east; }
    .signal-direction-southEast { grid-area: southEast; }
    .signal-direction-south { grid-area: south; }
    .signal-direction-southWest { grid-area: southWest; }
    .signal-direction-west { grid-area: west; }
    .signal-direction-northWest { grid-area: northWest; }

    @media (max-width: 640px) {
      .signal-overlay-root {
        --overlay-size: 164px;
        --cell-gap: 4px;
        grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) 28px minmax(0, 1fr);
      }

      .signal-chip {
        min-width: 42px;
        min-height: 25px;
        gap: 4px;
        padding: 3px 5px;
      }

      .signal-dot {
        width: 7px;
        height: 7px;
      }

      .signal-arrow {
        min-width: 15px;
        font-size: 15px;
      }

      .signal-seconds {
        min-width: 14px;
        font-size: 11px;
      }

      .signal-movement {
        display: none;
      }

      .signal-center {
        width: 17px;
        height: 17px;
      }
    }
  </style>`;
}

function buildInnerHTML(intersection: Intersection, viewMode: ViewMode): string {
  const signals = filterSignalsForMode(intersection.signals, viewMode);
  const groups = DIRECTION_ORDER
    .map((direction) => buildDirectionGroup(
      direction,
      signals.filter((signal) => signal.direction === direction),
    ))
    .join("");

  return `${buildStyles()}
    <div class="signal-overlay-root" aria-label="선택한 교차로 ${viewMode === "pedestrian" ? "보행자" : "운전자"} 신호" style="display:${signals.length > 0 ? "grid" : "none"};">
      <div class="signal-center" aria-hidden="true"></div>
      ${groups}
    </div>`;
}

export function createIntersectionSignalOverlayElement(intersection: Intersection, viewMode: ViewMode): HTMLElement {
  const element = document.createElement("div");
  element.style.cssText = "position:relative;pointer-events:none;z-index:15;overflow:visible;";
  element.innerHTML = buildInnerHTML(intersection, viewMode);
  return element;
}

export function updateIntersectionSignalOverlayElement(element: HTMLElement, intersection: Intersection, viewMode: ViewMode): void {
  element.innerHTML = buildInnerHTML(intersection, viewMode);
}
