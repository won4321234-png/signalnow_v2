import type { GroundTruthExport, ManualIntersectionLayout } from "@/types/intersectionLayout";

const STORAGE_KEY = "signalnow-intersection-ground-truth-v1";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function validBearing(value: unknown): boolean {
  return finite(value) && value >= 0 && value < 360;
}

function isLayout(value: unknown): value is ManualIntersectionLayout {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const coordinate = item.coordinate as Record<string, unknown> | undefined;
  return item.schemaVersion === 1 && typeof item.intersectionId === "string" && typeof item.intersectionName === "string" && Boolean(coordinate) && finite(coordinate?.lat) && finite(coordinate?.lng) && Array.isArray(item.approaches);
}

function validateLayout(value: unknown, label: string): string[] {
  if (!isLayout(value)) return [`${label} is not a valid Ground Truth layout.`];
  const item = value as ManualIntersectionLayout;
  const errors: string[] = [];
  if (item.coordinate.lat < -90 || item.coordinate.lat > 90) errors.push(`${label}: invalid latitude.`);
  if (item.coordinate.lng < -180 || item.coordinate.lng > 180) errors.push(`${label}: invalid longitude.`);
  if (item.approaches.length === 0) errors.push(`${label}: at least one direction is required.`);
  const directions = new Set<string>();
  item.approaches.forEach((approach, index) => {
    if (directions.has(approach.direction)) errors.push(`${label}.approaches[${index}]: duplicate direction.`);
    directions.add(approach.direction);
    if (!finite(approach.confidence) || approach.confidence < 0 || approach.confidence > 1) errors.push(`${label}.approaches[${index}]: invalid confidence.`);
    for (const position of [approach.manual?.signalPosition, approach.final?.signalPosition]) {
      if (position && (!finite(position.lat) || !finite(position.lng) || position.lat < -90 || position.lat > 90 || position.lng < -180 || position.lng > 180)) errors.push(`${label}.approaches[${index}]: invalid signal coordinates.`);
    }
    for (const bearing of [approach.auto?.roadBearing, approach.auto?.axisBearing, approach.manual?.roadBearing, approach.manual?.axisBearing, approach.final?.roadBearing, approach.final?.axisBearing]) {
      if (bearing !== undefined && !validBearing(bearing)) errors.push(`${label}.approaches[${index}].bearing: ${String(bearing)} must be in [0, 360).`);
    }
    for (const distance of [approach.auto?.distanceMeters, approach.manual?.distanceMeters, approach.final?.distanceMeters]) {
      if (distance !== undefined && (!finite(distance) || distance < 0)) errors.push(`${label}.approaches[${index}]: invalid distance.`);
    }
    if (approach.manual?.laneCount !== undefined && (!Number.isInteger(approach.manual.laneCount) || approach.manual.laneCount < 0 || approach.manual.laneCount > 20)) errors.push(`${label}.approaches[${index}]: invalid laneCount.`);
  });
  return errors;
}

export interface IntersectionLayoutRepository {
  list(): ManualIntersectionLayout[];
  get(intersectionId: string): ManualIntersectionLayout | null;
  save(layout: ManualIntersectionLayout): void;
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
  } catch {
    return [];
  }
}

function write(layouts: ManualIntersectionLayout[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export const intersectionLayoutRepository: IntersectionLayoutRepository = {
  list: () => read(),
  get: (intersectionId) => read().find((item) => item.intersectionId === intersectionId) ?? null,
  save: (layout) => {
    const errors = validateLayout(layout, layout.intersectionId);
    if (errors.length) throw new Error(errors[0]);
    const layouts = read().filter((item) => item.intersectionId !== layout.intersectionId);
    write([...layouts, layout]);
  },
  remove: (intersectionId) => write(read().filter((item) => item.intersectionId !== intersectionId)),
  replaceAll: (layouts) => {
    const errors = layouts.flatMap((item) => validateLayout(item, item.intersectionId));
    if (errors.length) throw new Error(errors[0]);
    write(layouts);
  },
  exportAll: () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), source: "SignalNow Ground Truth Editor", intersections: read() }),
  importAll: (payload) => {
    const errors: string[] = [];
    if (!payload || typeof payload !== "object") return { imported: 0, skipped: 0, errors: ["JSON root must be an object."] };
    const root = payload as Record<string, unknown>;
    if (root.schemaVersion !== 1) return { imported: 0, skipped: 0, errors: ["Unsupported schemaVersion. Expected 1."] };
    if (!Array.isArray(root.intersections)) return { imported: 0, skipped: 0, errors: ["intersections must be an array."] };
    const valid: ManualIntersectionLayout[] = [];
    root.intersections.forEach((item, index) => {
      const itemErrors = validateLayout(item, `intersections[${index}]`);
      if (itemErrors.length) errors.push(...itemErrors); else valid.push(item as ManualIntersectionLayout);
    });
    if (errors.length) return { imported: 0, skipped: root.intersections.length - valid.length, errors };
    const current = read();
    const byId = new Map(current.map((item) => [item.intersectionId, item]));
    valid.forEach((item) => byId.set(item.intersectionId, item));
    write([...byId.values()]);
    return { imported: valid.length, skipped: 0, errors: [] };
  },
};
