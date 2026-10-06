import type { Intersection, TrafficSignal } from "@/types/traffic";
import { TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import { fetchTrafficMapInfo, fetchTrafficSignalInfo, type KlidIntersectionRecord, type KlidSignalRecord } from "@/services/trafficApi";

const ROWS = 100;
const intersectionCache = new Map<TrafficRegionId, Intersection[]>();
const signalCache = new Map<string, TrafficSignal[]>();
const signalPending = new Map<string, Promise<TrafficSignal[]>>();

const directions = ["North","East","South","West","NorthEast","SouthEast","SouthWest","NorthWest"] as const;
const movements = ["Bus","Bicycle","Left Turn","Right Turn","Pedestrian","Straight","U Turn"] as const;
const directionPrefix: Record<(typeof directions)[number], string> = { North:"nt", East:"et", South:"st", West:"wt", NorthEast:"ne", SouthEast:"se", SouthWest:"sw", NorthWest:"nw" };
const movementSuffix: Record<(typeof movements)[number], string> = { Bus:"Bssg", Bicycle:"Bcsg", "Left Turn":"Ltsg", "Right Turn":"Rtsg", Pedestrian:"Pdsg", Straight:"Stsg", "U Turn":"Utsg" };

function serviceKey() {
  const key = import.meta.env.VITE_TRAFFIC_API_KEY ?? import.meta.env.VITE_DATA_API_SERVICE_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : "server-proxy";
}
function numberValue(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function normalizeState(value: unknown): TrafficSignal["state"] | undefined {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("yellow") || text.includes("clearance") || text.includes("amber") || text.includes("황색")) return "protected-clearance";
  if (text.includes("green") || text.includes("allowed") || text.includes("go") || text.includes("녹색")) return "protected-Movement-Allowed";
  if (text.includes("red") || text.includes("stop") || text.includes("remain") || text.includes("적색")) return "stop-And-Remain";
  return undefined;
}
function normalizeIntersection(record: KlidIntersectionRecord): Intersection | null {
  const id = String(record.crsrdId ?? "").trim();
  const lat = numberValue(record.mapCtptIntLat);
  const lng = numberValue(record.mapCtptIntLot);
  if (!id || lat === undefined || lng === undefined || lat === 0 || lng === 0) return null;
  return { crsrdId:id, crsrdNm:String(record.crsrdNm ?? "교차로"), stdgCd:record.stdgCd, lclgvNm:record.lclgvNm, mapCtptIntLat:lat, mapCtptIntLot:lng, crsrdEngNm:record.crsrdEngNm, laneWdth:record.laneWdth, lmtSpdTypeNm:record.lmtSpdTypeNm, lmtSpd:record.lmtSpd, regDt:record.regDt, totDt:record.totDt, signals:[], updatedAt:record.regDt || record.totDt || new Date().toISOString() };
}
export async function loadNavigationIntersections(regionId: TrafficRegionId): Promise<Intersection[]> {
  const cached = intersectionCache.get(regionId);
  if (cached) return cached;
  const region = TRAFFIC_REGIONS[regionId];
  const all = new Map<string, Intersection>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const response = await fetchTrafficMapInfo({ serviceKey:serviceKey(), stdgCd:region.stdgCd, pageNo:page, numOfRows:ROWS });
    if (response.totalCount > 0) totalPages = Math.max(1, Math.ceil(response.totalCount / ROWS));
    for (const raw of response.items) {
      const intersection = normalizeIntersection(raw);
      if (intersection) all.set(intersection.crsrdId, intersection);
    }
    if (response.items.length === 0 || (response.totalCount === 0 && response.items.length < ROWS)) break;
    page += 1;
  }
  const result = [...all.values()];
  intersectionCache.set(regionId, result);
  return result;
}
function extractSignals(record: KlidSignalRecord): TrafficSignal[] {
  const signals: TrafficSignal[] = [];
  for (const direction of directions) for (const movement of movements) {
    const prefix = directionPrefix[direction];
    const suffix = movementSuffix[movement];
    const state = normalizeState(record[`${prefix}${suffix}SttsNm`]);
    const rawRemaining = numberValue(record[`${prefix}${suffix}RmndCs`]);
    if (!state) continue;
    signals.push({ direction, movement, state, remainingSeconds: rawRemaining === undefined ? undefined : Math.max(0, rawRemaining / 1000), cycleSeconds:60 });
  }
  return signals;
}
export async function loadNavigationSignals(crsrdId: string, regionId: TrafficRegionId): Promise<TrafficSignal[]> {
  const cacheKey = `${regionId}:${crsrdId}`;
  const cached = signalCache.get(cacheKey);
  if (cached) return cached;
  const pending = signalPending.get(cacheKey);
  if (pending) return pending;
  const promise = (async () => {
    const region = TRAFFIC_REGIONS[regionId];
    const first = await fetchTrafficSignalInfo({ serviceKey:serviceKey(), stdgCd:region.stdgCd, pageNo:1, numOfRows:ROWS, crsrdId });
    let record = first.items.find(item => String(item.crsrdId ?? "").trim() === crsrdId);
    if (!record && first.totalCount > ROWS) {
      const totalPages = Math.ceil(first.totalCount / ROWS);
      for (let page=2; page<=totalPages && !record; page+=1) {
        const response = await fetchTrafficSignalInfo({ serviceKey:serviceKey(), stdgCd:region.stdgCd, pageNo:page, numOfRows:ROWS });
        record = response.items.find(item => String(item.crsrdId ?? "").trim() === crsrdId);
      }
    }
    const signals = record ? extractSignals(record) : [];
    signalCache.set(cacheKey, signals);
    return signals;
  })();
  signalPending.set(cacheKey, promise);
  try { return await promise; } finally { signalPending.delete(cacheKey); }
}
