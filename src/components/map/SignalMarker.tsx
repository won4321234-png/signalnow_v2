/**
 * Factory utilities for Kakao Maps CustomOverlay signal markers.
 * The selected intersection pin stays visually clean; intersection text is
 * intentionally not rendered on top of the live lane/signal overlay.
 */

import type { Intersection, ViewMode } from "@/types/traffic";
import { dominantColor, phaseColor } from "@/lib/signal";

type SignalColor = "green" | "yellow" | "red";

function buildPinSVG(color: SignalColor, isSelected: boolean, pedestrian: boolean): string {
  const fill = `var(--color-signal-${color})`;
  const opacity = isSelected ? "1" : "0.92";
  const glow = isSelected ? `filter:drop-shadow(0 0 10px color-mix(in srgb,${fill} 42%,transparent));` : "";
  const inner = pedestrian
    ? `<text x="18" y="21" text-anchor="middle" font-size="10" font-weight="900" fill="${fill}">🚶</text>`
    : `<circle cx="18" cy="17" r="4" style="fill:${fill};"/>`;
  return `<span style="position:relative;display:flex;width:36px;height:44px;align-items:center;justify-content:center;${glow}">
    <svg viewBox="0 0 36 44" width="36" height="44" fill="none" style="display:block;">
      <path d="M18 1C8.6 1 1 8.6 1 18c0 10.5 17 25 17 25s17-14.5 17-25C35 8.6 27.4 1 18 1Z" style="fill:${fill};fill-opacity:${opacity};"/>
      <circle cx="18" cy="17" r="7.5" fill="white"/>
      ${inner}
    </svg>
  </span>`;
}

function buildFavoriteBadge(): string {
  return `<span style="position:absolute;top:-4px;right:-4px;z-index:10;width:16px;height:16px;background:var(--color-signal-yellow);border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;line-height:1;">★</span>`;
}

// Never render the old intersection-name / pedestrian-status pill below the
// selected pin. It occupied the exact space used by live signal chips.
function buildLabel(): string { return ""; }

function buildInnerHTML(intersection: Intersection, isSelected: boolean, isFavorite: boolean, viewMode: ViewMode = "driver"): string {
  const pedestrianSignals = intersection.signals.filter((signal) => signal.movement === "Pedestrian");
  const modeSignals = viewMode === "pedestrian"
    ? pedestrianSignals
    : intersection.signals.filter((signal) => signal.movement !== "Pedestrian");
  const color = dominantColor(modeSignals.map((signal) => phaseColor(signal.state)));
  const scale = isSelected ? "scale(1.25)" : "scale(1)";
  const pedestrian = viewMode === "pedestrian";
  return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:${scale};transform-origin:bottom center;transition:transform 0.2s ease;">
      ${buildPinSVG(color, isSelected, pedestrian)}
      ${isFavorite ? buildFavoriteBadge() : ""}
    </div>${buildLabel()}`;
}

export function createMarkerElement(intersection: Intersection, isSelected: boolean, isFavorite: boolean, viewMode: ViewMode = "driver"): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;outline:none;";
  el.innerHTML = buildInnerHTML(intersection, isSelected, isFavorite, viewMode);
  return el;
}

export function updateMarkerState(element: HTMLElement, isSelected: boolean, isFavorite: boolean, intersection: Intersection, viewMode: ViewMode = "driver"): void {
  element.innerHTML = buildInnerHTML(intersection, isSelected, isFavorite, viewMode);
}
