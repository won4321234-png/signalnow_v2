/**
 * Factory utilities for Kakao Maps CustomOverlay signal markers.
 * Pedestrian information is surfaced on the map marker itself so the
 * pedestrian mode is never visually indistinguishable from driver mode.
 */

import type { Intersection, ViewMode } from "@/types/traffic";
import { dominantColor, phaseColor } from "@/lib/signal";

type SignalColor = "green" | "yellow" | "red";

function buildPinSVG(color: SignalColor, isSelected: boolean, pedestrian: boolean): string {
  const fill = `var(--color-signal-${color})`;
  const opacity = isSelected ? "1" : "0.92";
  const glow = isSelected ? `box-shadow:var(--shadow-glow-${color});border-radius:50%;` : "";
  const inner = pedestrian
    ? `<text x="18" y="21" text-anchor="middle" font-size="10" font-weight="900" fill="${fill}">🚶</text>`
    : `<circle cx="18" cy="17" r="4" style="fill:${fill};"/>`;
  return `<span style="position:relative;display:flex;width:36px;height:44px;align-items:center;justify-content:center;${glow}">
    <svg viewBox="0 0 36 44" width="36" height="44" fill="none" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.25));display:block;">
      <path d="M18 1C8.6 1 1 8.6 1 18c0 10.5 17 25 17 25s17-14.5 17-25C35 8.6 27.4 1 18 1Z" style="fill:${fill};fill-opacity:${opacity};"/>
      <circle cx="18" cy="17" r="7.5" fill="white"/>
      ${inner}
    </svg>
  </span>`;
}

function buildFavoriteBadge(): string {
  return `<span style="position:absolute;top:-4px;right:-4px;z-index:10;width:16px;height:16px;background:var(--color-signal-yellow);border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;line-height:1;">★</span>`;
}

function buildLabel(name: string, visible: boolean, pedestrianCount: number): string {
  const pedestrianText = pedestrianCount > 0 ? ` · 🚶 보행 ${pedestrianCount}개` : " · 🚶 보행 신호";
  return `<span class="kakao-marker-label" style="position:absolute;top:calc(100% + 4px);left:50%;transform:translateX(-50%);white-space:nowrap;background:var(--card);padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;color:var(--foreground);box-shadow:var(--shadow-sm);pointer-events:none;transition:opacity 150ms ease;opacity:${visible ? "1" : "0"};">${name}${pedestrianText}</span>`;
}

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
    </div>
    ${buildLabel(intersection.crsrdNm, isSelected, pedestrianSignals.length)}`;
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
