import type { GroundTruthExport, ManualIntersectionLayout, SignalRotationMap } from "@/types/intersectionLayout";
import type { MovementType } from "@/types/traffic";

const STORAGE_KEY = "signalnow-intersection-ground-truth-v1";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validBearing = (value: unknown): boolean => finite(value) && value >= 0 && value < 360;
const validDirection = new Set(["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"]);
const validMovement = new Set<MovementType>(["Straight", "Left Turn", "Right Turn", "U Turn", "Pedestrian", "Bus", "Bicycle"]);
const validState = new Set(["AUTO", "MANUAL", "FINAL"]);
const validSource = new Set(["auto", "manual", "hybrid"]);
const validStatus = new Set(["UNREVIEWED", "AUTO_READY", "REVIEW_REQUIRED", "MANUAL_ONLY", "VERIFIED"]);

function isLayout(value: unknown): value is ManualIntersectionLayout {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const coordinate = item.coordinate as Record<string, unknown> | undefined;
  return item.schemaVersion === 1 && typeof item.intersectionId === "string" && typeof item.intersectionName === "string" && Boolean(coordinate) && finite(coordinate?.lat) && finite(coordinate?.lng) && Array.isArray(item.approaches) && typeof item.status === "string" && validStatus.has(item.status);
}

function validateSignalRotation(value: unknown, prefix: string, errors: string[]): void {
  if (value === undefined) return;
  if (finite(value)) {
    if (value < -180 || value > 180) errors.push(`${prefix}: signalRotation must be in [-180, 180].`);
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${prefix}: signalRotation must be a number or movement map.`);
    return;
  }
  for (const [movement, rotation] of Object.entries(value as Record<string, unknown>)) {
    if (!validMovement.has(movement as MovementType)) errors.push(`${prefix}: invalid movement key ${movement}.`);
    if (!finite(rotation) || rotation < -180 || rotation > 180) errors.push(`${prefix}.${movement}: signalRotation must be in [-180, 180].`);
  }
}

export function validateLayout(value: unknown, label: string): string[] {
  if (!isLayout(value)) return [`${label} is not a valid Ground Truth layout.`];
  const item = value as ManualIntersectionLayout;
  const errors: string[] = [];
  if (item.coordinate.lat < -90 || item.coordinate.lat > 90) errors.push(`${label}: invalid latitude.`);
  if (item.coordinate.lng < -180 || item.coordinate.lng > 180) errors.push(`${label}: invalid longitude.`);
  const directions = new Set<string>();
  item.approaches.forEach((approach, index) => {
    const prefix = `${label}.approaches[${index}]`;
    const direction = approach.direction;
    if (!direction || !validDirection.has(direction)) errors.push(`${prefix}: invalid direction.`);
    else { if (directions.has(direction)) errors.push(`${prefix}: duplicate direction.`); directions.add(direction); }
    if (approach.state === undefined || !validState.has(approach.state)) errors.push(`${prefix}: invalid state.`);
    if (!validSource.has(approach.source)) errors.push(`${prefix}: invalid source.`);
    if (!finite(approach.confidence) || approach.confidence < 0 || approach.confidence > 1) errors.push(`${prefix}: invalid confidence.`);
    for (const position of [approach.manual?.signalPosition, approach.final?.signalPosition]) {
      if (position && (!finite(position.lat) || !finite(position.lng) || position.lat < -90 || position.lat > 90 || position.lng < -180 || position.lng > 180)) errors.push(`${prefix}: invalid signal coordinates.`);
    }
    validateSignalRotation(approach.manual?.signalRotation, `${prefix}.manual`, errors);
    validateSignalRotation(approach.final?.signalRotation, `${prefix}.final`, errors);
    for (const bearing of [approach.auto?.roadBearing, approach.auto?.axisBearing, approach.manual?.roadBearing, approach.manual?.axisBearing, approach.final?.roadBearing, approach.final?.axisBearing]) {
      if (bearing !== undefined && !validBearing(bearing)) errors.push(`${prefix}: bearing must be in [0, 360).`);
    }
    for (const distance of [approach.auto?.distanceMeters, approach.manual?.distanceMeters, approach.final?.distanceMeters]) {
      if (distance !== undefined && (!finite(distance) || distance < 0)) errors.push(`${prefix}: distance must be non-negative.`);
    }
    if (approach.manual?.laneCount !== undefined && (!Number.isInteger(approach.manual.laneCount) || approach.manual.laneCount < 0 || approach.manual.laneCount > 20)) errors.push(`${prefix}: invalid laneCount.`);
  });
  return errors;
}

export interface IntersectionLayoutRepository {
  list(): ManualIntersectionLayout[];
  get(intersectionId: string): ManualIntersectionLayout | null;
  save(layout: ManualIntersectionLayout): Promise<void>;
  remove(intersectionId: string): void;
  replaceAll(layouts: ManualIntersectionLayout[]): void;
  exportAll(): GroundTruthExport;
  importAll(payload: unknown): { imported: number; skipped: number; errors: string[] };
}

function read(): ManualIntersectionLayout[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => validateLayout(item, "stored layout").length === 0);
  } catch { return []; }
}
function write(layouts: ManualIntersectionLayout[]): void { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); }
async function persistShared(layout: ManualIntersectionLayout): Promise<void> {
  const response = await fetch(`/api/ground-truth/${encodeURIComponent(layout.intersectionId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    const detail = text.slice(0, 500);
    const message = `Ground Truth API save failed: ${response.status}${detail ? ` ${detail}` : ""}`;
    console.error("[SignalNow] shared Ground Truth save failed", { intersectionId: layout.intersectionId, status: response.status, response: detail });
    throw new Error(message);
  }
}
function removeShared(intersectionId: string): void {
  void fetch(`/api/ground-truth/${encodeURIComponent(intersectionId)}`, { method: "DELETE", cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      console.error("[SignalNow] shared Ground Truth delete failed", { intersectionId, status: response.status, response: text });
    }
  }).catch((error) => console.error("[SignalNow] shared Ground Truth delete failed", { intersectionId, error }));
}

export const intersectionLayoutRepository: IntersectionLayoutRepository = {
  list: () => read(),
  get: (intersectionId) => read().find((item) => item.intersectionId === intersectionId) ?? null,
  save: async (layout) => {
    const errors = validateLayout(layout, layout.intersectionId);
    if (errors.length) throw new Error(errors[0]);
    write([...read().filter((item) => item.intersectionId !== layout.intersectionId), layout]);
    await persistShared(layout);
  },
  remove: (intersectionId) => { write(read().filter((item) => item.intersectionId !== intersectionId)); removeShared(intersectionId); },
  replaceAll: (layouts) => {
    const errors = layouts.flatMap((item) => validateLayout(item, item.intersectionId));
    if (errors.length) throw new Error(errors[0]);
    const ids = new Set<string>(); for (const item of layouts) { if (ids.has(item.intersectionId)) throw new Error(`Duplicate intersection ID: ${item.intersectionId}`); ids.add(item.intersectionId); }
    write(layouts); layouts.forEach((item) => { void persistShared(item).catch((error) => console.error("[SignalNow] shared Ground Truth save failed", { intersectionId: item.intersectionId, error })); });
  },
  exportAll: () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), exportedAt: new Date().toISOString(), source: "SignalNow Ground Truth Editor", intersections: read() }),
  importAll: (payload) => {
    if (!payload || typeof payload !== "object") return { imported: 0, skipped: 0, errors: ["JSON root must be an object."] };
    const root = payload as Record<string, unknown>;
    if (root.schemaVersion !== 1) return { imported: 0, skipped: 0, errors: ["Unsupported schemaVersion. Expected 1."] };
    if (!Array.isArray(root.intersections)) return { imported: 0, skipped: 0, errors: ["intersections must be an array."] };
    const ids = new Set<string>(); const valid: ManualIntersectionLayout[] = []; const errors: string[] = [];
    root.intersections.forEach((item, index) => {
      const itemErrors = validateLayout(item, `intersections[${index}]`);
      const id = isLayout(item) ? item.intersectionId : "";
      if (id && ids.has(id)) itemErrors.push(`intersections[${index}]: duplicate intersection ID ${id}.`);
      if (!itemErrors.length && id) { ids.add(id); valid.push(item as ManualIntersectionLayout); } else errors.push(...itemErrors);
    });
    if (errors.length) return { imported: 0, skipped: root.intersections.length - valid.length, errors };
    const byId = new Map(read().map((item) => [item.intersectionId, item])); valid.forEach((item) => byId.set(item.intersectionId, item)); write([...byId.values()]); valid.forEach((item) => { void persistShared(item).catch((error) => console.error("[SignalNow] shared Ground Truth save failed", { intersectionId: item.intersectionId, error })); });
    return { imported: valid.length, skipped: 0, errors: [] };
  },
};
