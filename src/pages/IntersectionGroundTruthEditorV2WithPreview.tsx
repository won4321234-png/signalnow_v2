import { useEffect } from "react";
import { IntersectionGroundTruthEditorV2 } from "@/pages/IntersectionGroundTruthEditorV2";
import type { ApproachDirection, MovementType } from "@/types/traffic";

const DIRECTION_ANGLE: Record<ApproachDirection, number> = {
  North: 0, NorthEast: 45, East: 90, SouthEast: 135, South: 180, SouthWest: 225, West: 270, NorthWest: 315,
};
const MOVEMENT_OFFSET: Partial<Record<MovementType, number>> = {
  "Left Turn": -90, "Right Turn": 90, "U Turn": 180,
};
const DIRECTION_LABEL: Record<string, ApproachDirection> = {
  북: "North", 북동: "NorthEast", 동: "East", 남동: "SouthEast", 남: "South", 남서: "SouthWest", 서: "West", 북서: "NorthWest",
};
const MOVEMENTS = new Set<MovementType>(["Straight", "Left Turn", "Right Turn", "U Turn", "Pedestrian", "Bus", "Bicycle"]);

function normalizeAngle(value: number): number { return ((value % 360) + 360) % 360; }
function getPreviewAngle(direction: ApproachDirection, movement: MovementType, rotation: number): number {
  const travelBearing = normalizeAngle(DIRECTION_ANGLE[direction] + 180);
  return normalizeAngle(travelBearing + (MOVEMENT_OFFSET[movement] ?? 0) + rotation);
}
function getSelectedDirection(root: HTMLElement): ApproachDirection | null {
  for (const element of root.querySelectorAll<HTMLElement>("div")) {
    const text = element.textContent?.trim() ?? "";
    if (!text.endsWith(" 방향")) continue;
    const label = text.slice(0, -3);
    const direction = DIRECTION_LABEL[label];
    if (direction) return direction;
  }
  return null;
}

function createPreview(row: HTMLElement, movement: MovementType): HTMLElement {
  const preview = document.createElement("div");
  preview.dataset.signalRotationPreview = "true";
  preview.setAttribute("aria-label", `${movement} 화살표 실시간 Preview`);
  preview.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:58px;min-height:52px;border-radius:10px;border:1px solid rgb(191 219 254);background:rgb(239 246 255);overflow:hidden;";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", "30");
  svg.setAttribute("height", "30");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "display:block;transform-origin:50% 50%;transition:transform 140ms ease-out;overflow:visible;";
  const shaft = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shaft.setAttribute("d", "M16 27V7M16 7L8 15M16 7L24 15");
  shaft.setAttribute("fill", "none");
  shaft.setAttribute("stroke", "currentColor");
  shaft.setAttribute("stroke-width", "3.2");
  shaft.setAttribute("stroke-linecap", "round");
  shaft.setAttribute("stroke-linejoin", "round");
  svg.appendChild(shaft);

  const label = document.createElement("span");
  label.textContent = "Preview";
  label.style.cssText = "font-size:8px;font-weight:800;color:rgb(37 99 235);line-height:1;";
  preview.append(svg, label);
  row.appendChild(preview);
  return preview;
}

function updatePreviews(root: HTMLElement): void {
  const direction = getSelectedDirection(root);
  if (!direction) return;
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[aria-label$="신호 화살표 보정 각도"]')];
  const seen = new Set<string>();
  for (const input of inputs) {
    const movement = (input.getAttribute("aria-label") ?? "").replace(/ 신호 화살표 보정 각도$/, "") as MovementType;
    if (!MOVEMENTS.has(movement) || seen.has(movement)) continue;
    seen.add(movement);
    const row = input.closest(".rounded-xl.border.bg-white") as HTMLElement | null;
    if (!row) continue;
    const preview = row.querySelector<HTMLElement>("[data-signal-rotation-preview]") ?? createPreview(row, movement);
    const svg = preview.querySelector<SVGElement>("svg");
    const rotation = Number(input.value);
    const angle = getPreviewAngle(direction, movement, Number.isFinite(rotation) ? rotation : 0);
    if (svg) svg.style.transform = `rotate(${angle}deg)`;
  }
}

function LiveRotationPreviewLayer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".signalnow-editor");
    if (!root) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updatePreviews(root));
    };
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("input", refresh, true);
    root.addEventListener("change", refresh, true);
    root.addEventListener("click", refresh, true);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("input", refresh, true);
      root.removeEventListener("change", refresh, true);
      root.removeEventListener("click", refresh, true);
    };
  }, []);
  return null;
}

export function IntersectionGroundTruthEditorV2WithPreview() {
  return <><IntersectionGroundTruthEditorV2 /><LiveRotationPreviewLayer /></>;
}
