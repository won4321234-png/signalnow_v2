import type { GroundTruthExport, ManualIntersectionLayout } from "@/types/intersectionLayout";

const STORAGE_KEY = "signalnow-intersection-ground-truth-v1";

function isLayout(value: unknown): value is ManualIntersectionLayout {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 && typeof item.intersectionId === "string" && typeof item.intersectionName === "string" && typeof item.coordinate === "object" && Array.isArray(item.approaches);
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
    return parsed.filter(isLayout);
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
    const layouts = read().filter((item) => item.intersectionId !== layout.intersectionId);
    write([...layouts, layout]);
  },
  remove: (intersectionId) => write(read().filter((item) => item.intersectionId !== intersectionId)),
  replaceAll: (layouts) => write(layouts.filter(isLayout)),
  exportAll: () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), intersections: read() }),
  importAll: (payload) => {
    const errors: string[] = [];
    if (!payload || typeof payload !== "object") return { imported: 0, skipped: 0, errors: ["JSON root must be an object."] };
    const root = payload as Record<string, unknown>;
    if (root.schemaVersion !== 1) return { imported: 0, skipped: 0, errors: ["Unsupported schemaVersion. Expected 1."] };
    if (!Array.isArray(root.intersections)) return { imported: 0, skipped: 0, errors: ["intersections must be an array."] };
    const valid = root.intersections.filter((item, index) => {
      if (!isLayout(item)) { errors.push(`intersections[${index}] is invalid.`); return false; }
      const coordinate = item.coordinate;
      if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) { errors.push(`intersections[${index}] has invalid coordinates.`); return false; }
      return true;
    });
    const current = read();
    const byId = new Map(current.map((item) => [item.intersectionId, item]));
    for (const item of valid) byId.set(item.intersectionId, item);
    write([...byId.values()]);
    return { imported: valid.length, skipped: root.intersections.length - valid.length, errors };
  },
};
