/**
 * Factory utilities for creating and updating Kakao Maps CustomOverlay
 * content elements that display a traffic-signal pin.
 *
 * These are plain DOM operations (not React) because Kakao Maps CustomOverlay
 * accepts an HTMLElement, not a React node. The visual design mirrors the
 * existing TrafficMarker component so the UI is consistent.
 *
 * CSS custom properties (e.g. `var(--color-signal-green)`) are used for all
 * colours so the markers automatically respect the light / dark theme.
 */

import type { Intersection } from "@/types/traffic";
import { dominantColor, phaseColor } from "@/lib/signal";

type SignalColor = "green" | "yellow" | "red";

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildPinSVG(color: SignalColor, isSelected: boolean): string {
  const fill = `var(--color-signal-${color})`;
  const opacity = isSelected ? "1" : "0.92";
  const glow = isSelected
    ? `box-shadow:var(--shadow-glow-${color});border-radius:50%;`
    : "";
  return `
    <span style="position:relative;display:flex;width:36px;height:44px;
                 align-items:center;justify-content:center;${glow}">
      <svg viewBox="0 0 36 44" width="36" height="44" fill="none"
           style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.25));display:block;">
        <path d="M18 1C8.6 1 1 8.6 1 18c0 10.5 17 25 17 25s17-14.5 17-25C35 8.6 27.4 1 18 1Z"
              style="fill:${fill};fill-opacity:${opacity};"/>
        <circle cx="18" cy="17" r="7.5" fill="white"/>
        <circle cx="18" cy="17" r="4" style="fill:${fill};"/>
      </svg>
    </span>`;
}

function buildFavoriteBadge(): string {
  return `<span style="position:absolute;top:-4px;right:-4px;z-index:10;
                       width:16px;height:16px;
                       background:var(--color-signal-yellow);border-radius:9999px;
                       display:flex;align-items:center;justify-content:center;
                       font-size:8px;color:white;line-height:1;">★</span>`;
}

function buildLabel(name: string, visible: boolean): string {
  return `
    <span class="kakao-marker-label"
          style="position:absolute;top:calc(100% + 4px);left:50%;
                 transform:translateX(-50%);white-space:nowrap;
                 background:var(--card);padding:3px 10px;border-radius:9999px;
                 font-size:11px;font-weight:600;color:var(--foreground);
                 box-shadow:var(--shadow-sm);pointer-events:none;
                 transition:opacity 150ms ease;
                 opacity:${visible ? "1" : "0"};">
      ${name}
    </span>`;
}

function buildInnerHTML(
  intersection: Intersection,
  isSelected: boolean,
  isFavorite: boolean,
): string {
  const color = dominantColor(
    intersection.signals.map((s) => phaseColor(s.state)),
  );
  const scale = isSelected ? "scale(1.25)" : "scale(1)";
  return `
    <div style="position:relative;display:flex;flex-direction:column;
                align-items:center;transform:${scale};transform-origin:bottom center;
                transition:transform 0.2s ease;">
      ${buildPinSVG(color, isSelected)}
      ${isFavorite ? buildFavoriteBadge() : ""}
    </div>
    ${buildLabel(intersection.crsrdNm, isSelected)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a DOM element to use as the `content` of a Kakao CustomOverlay.
 *
 * Position anchors: xAnchor=0.5, yAnchor=1.0 — the bottom-centre of this
 * element (= the teardrop tip) is placed at the intersection coordinate.
 *
 * Click handlers should be attached by the caller so they are never lost
 * when `updateMarkerState` rebuilds the innerHTML.
 */
export function createMarkerElement(
  intersection: Intersection,
  isSelected: boolean,
  isFavorite: boolean,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:relative;display:flex;flex-direction:column;" +
    "align-items:center;cursor:pointer;outline:none;";
  el.innerHTML = buildInnerHTML(intersection, isSelected, isFavorite);
  return el;
}

/**
 * Rebuilds the innerHTML of an existing marker element to reflect new state.
 * Does NOT touch event listeners — they stay bound to the outer element.
 */
export function updateMarkerState(
  element: HTMLElement,
  isSelected: boolean,
  isFavorite: boolean,
  intersection: Intersection,
): void {
  element.innerHTML = buildInnerHTML(intersection, isSelected, isFavorite);
}
