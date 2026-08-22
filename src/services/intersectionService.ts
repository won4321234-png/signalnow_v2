import type {
  ApproachDirection,
  Intersection,
  IntersectionListResult,
  MovementType,
  SignalPhaseState,
  TrafficMarkerData,
  TrafficSignal,
} from "@/types/traffic";
import {
  fetchTrafficMapInfo,
  fetchTrafficSignalInfo,
  type KlidIntersectionRecord,
  type KlidSignalRecord,
} from "@/services/trafficApi";

const SEOUL_STDG_CD = "1100000000";
const INTERSECTION_PAGE_ROWS = 100;
const SIGNAL_PAGE_ROWS = 100;
const MAX_NEW_PAGES_PER_VIEWPORT = 3;
const DEV_LOG_PREFIX = "[SignalNow]";

export interface MapViewportBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface IntersectionSeed {
  stdgCd?: string;
  lclgvNm?: string;
  crsrdId: string;
  crsrdNm: string;
  crsrdEngNm?: string;
  mapCtptIntLat: number;
  mapCtptIntLot: number;
  laneWdth?: string;
  lmtSpdTypeNm?: string;
  lmtSpd?: string;
  regDt?: string;
  totDt?: string;
}

interface LoaderOptions {
  onBatch?: (intersections: Intersection[]) => void;
  signalEnabled?: boolean;
}

const intersectionPageCache = new Map<number, KlidIntersectionRecord[]>();
const intersectionCache = new Map<string, Intersection>();
const signalCache = new Map<string, TrafficSignal[]>();
const signalPromiseCache = new Map<string, Promise<TrafficSignal[]>>();
const signalNoDataCache = new Set<string>();
const viewportCache = new Set<string>();

let intersectionLoadPromise: Promise<Intersection[]> | null = null;
let nextIntersectionPage = 1;
let intersectionTotalPages = 1;

function getServiceKey(): string {
  const serviceKey =
    import.meta.env.VITE_TRAFFIC_API_KEY ??
    import.meta.env.VITE_DATA_API_SERVICE_KEY;
  if (!serviceKey) throw new Error("Traffic API service key is not set.");
  return serviceKey;
}

function logDev(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(`${DEV_LOG_PREFIX} ${message}`, ...args);
}

function toNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeState(value: unknown): SignalPhaseState {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("yellow") || text.includes("clearance") || text.includes("amber") || text.includes("황색")) return "protected-clearance";
  if (text.includes("green") || text.includes("allowed") || text.includes("go") || text.includes("녹색")) return "protected-Movement-Allowed";
  return "stop-And-Remain";
}

function normalizeIntersection(record: KlidIntersectionRecord): IntersectionSeed | null {
  if (!record.crsrdId || !record.crsrdNm) return null;
  const mapCtptIntLat = toNumber(record.mapCtptIntLat);
  const mapCtptIntLot = toNumber(record.mapCtptIntLot);
  if (!mapCtptIntLat || !mapCtptIntLot) return null;
  return {
    stdgCd: record.stdgCd,
    lclgvNm: record.lclgvNm,
    crsrdId: record.crsrdId,
    crsrdNm: record.crsrdNm,
    crsrdEngNm: record.crsrdEngNm,
    mapCtptIntLat,
    mapCtptIntLot,
    laneWdth: record.laneWdth,
    lmtSpdTypeNm: record.lmtSpdTypeNm,
    lmtSpd: record.lmtSpd,
    regDt: record.regDt,
    totDt: record.totDt,
  };
}

function extractDirectionalSignals(record: KlidSignalRecord): TrafficSignal[] {
  const directions: Array<[ApproachDirection, string]> = [
    ["North", "nt"], ["East", "et"], ["South", "st"], ["West", "wt"],
    ["NorthEast", "ne"], ["SouthEast", "se"], ["SouthWest", "sw"], ["NorthWest", "nw"],
  ];
  const movements: Array<[MovementType, string]> = [
    ["Bus", "Bssg"], ["Bicycle", "Bcsg"], ["Left Turn", "Ltsg"],
    ["Pedestrian", "Pdsg"], ["Straight", "Stsg"], ["U Turn", "Utsg"],
  ];
  const signals: TrafficSignal[] = [];
  for (const [direction, directionPrefix] of directions) {
    for (const [movement, movementSuffix] of movements) {
      const remainingKey = `${directionPrefix}${movementSuffix}RmndCs` as keyof KlidSignalRecord;
      const stateKey = `${directionPrefix}${movementSuffix}SttsNm` as keyof KlidSignalRecord;
      const remainingSeconds = toNumber(record[remainingKey] as string | number | undefined);
      const state = normalizeState(record[stateKey]);
      signals.push({ direction, movement, state, remainingSeconds, cycleSeconds: 60 });
    }
  }
  return signals;
}

function toMarker(intersection: Intersection): TrafficMarkerData {
  return {
    intersectionId: intersection.crsrdId,
    position: { x: intersection.mapCtptIntLot, y: intersection.mapCtptIntLat },
  };
}

function upsertIntersections(seeds: IntersectionSeed[]): Intersection[] {
  const next: Intersection[] = [];
  for (const seed of seeds) {
    const existing = intersectionCache.get(seed.crsrdId);
    if (existing) {
      next.push(existing);
      continue;
    }
    const intersection: Intersection = {
      crsrdId: seed.crsrdId,
      crsrdNm: seed.crsrdNm,
      stdgCd: seed.stdgCd,
      lclgvNm: seed.lclgvNm,
      mapCtptIntLat: seed.mapCtptIntLat,
      mapCtptIntLot: seed.mapCtptIntLot,
      crsrdEngNm: seed.crsrdEngNm,
      laneWdth: seed.laneWdth,
      lmtSpdTypeNm: seed.lmtSpdTypeNm,
      lmtSpd: seed.lmtSpd,
      regDt: seed.regDt,
      totDt: seed.totDt,
      signals: [],
      updatedAt: seed.regDt || seed.totDt || new Date().toISOString(),
    };
    intersectionCache.set(seed.crsrdId, intersection);
    next.push(intersection);
  }
  return next;
}

async function fetchIntersectionPage(pageNo: number): Promise<Intersection[]> {
  const cached = intersectionPageCache.get(pageNo);
  if (cached) return cached.map(normalizeIntersection).filter((item): item is IntersectionSeed => item !== null).map((seed) => upsertIntersections([seed])[0]);

  const page = await fetchTrafficMapInfo({
    serviceKey: getServiceKey(),
    stdgCd: SEOUL_STDG_CD,
    pageNo,
    numOfRows: INTERSECTION_PAGE_ROWS,
  });
  intersectionPageCache.set(pageNo, page.items.filter((item): item is KlidIntersectionRecord => Boolean(item)));
  const normalized = page.items.map(normalizeIntersection).filter((item): item is IntersectionSeed => item !== null);
  logDev("교차로 페이지 수신", { pageNo, rawCount: page.items.length, normalizedCount: normalized.length });
  return upsertIntersections(normalized);
}

function isInsideViewport(intersection: Intersection, bounds: MapViewportBounds): boolean {
  return intersection.mapCtptIntLat >= bounds.south &&
    intersection.mapCtptIntLat <= bounds.north &&
    intersection.mapCtptIntLot >= bounds.west &&
    intersection.mapCtptIntLot <= bounds.east;
}

function viewportKey(bounds: MapViewportBounds): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return [round(bounds.south), round(bounds.west), round(bounds.north), round(bounds.east)].join(":");
}

async function ensureInitialIntersectionPage(): Promise<Intersection[]> {
  if (intersectionPageCache.has(1)) return fetchIntersectionPage(1);
  const page = await fetchTrafficMapInfo({
    serviceKey: getServiceKey(), stdgCd: SEOUL_STDG_CD, pageNo: 1, numOfRows: INTERSECTION_PAGE_ROWS,
  });
  intersectionPageCache.set(1, page.items.filter((item): item is KlidIntersectionRecord => Boolean(item)));
  intersectionTotalPages = Math.max(1, Math.ceil((toNumber(page.totalCount) || INTERSECTION_PAGE_ROWS) / INTERSECTION_PAGE_ROWS));
  nextIntersectionPage = 2;
  const firstBatch = page.items.map(normalizeIntersection).filter((item): item is IntersectionSeed => item !== null);
  logDev("서울 교차로 첫 페이지", { totalCount: page.totalCount, totalPages: intersectionTotalPages, count: firstBatch.length });
  return upsertIntersections(firstBatch);
}

export async function fetchIntersectionsForViewport(bounds: MapViewportBounds): Promise<Intersection[]> {
  const key = viewportKey(bounds);
  if (viewportCache.has(key)) {
    return Array.from(intersectionCache.values()).filter((intersection) => isInsideViewport(intersection, bounds));
  }

  const newlyLoaded: Intersection[] = [];
  if (intersectionPageCache.size === 0) newlyLoaded.push(...await ensureInitialIntersectionPage());

  let pagesFetched = 0;
  while (pagesFetched < MAX_NEW_PAGES_PER_VIEWPORT && nextIntersectionPage <= intersectionTotalPages) {
    const batch = await fetchIntersectionPage(nextIntersectionPage);
    newlyLoaded.push(...batch);
    nextIntersectionPage += 1;
    pagesFetched += 1;
    const visibleCount = batch.filter((intersection) => isInsideViewport(intersection, bounds)).length;
    if (visibleCount > 0) break;
  }

  viewportCache.add(key);
  const visible = Array.from(intersectionCache.values()).filter((intersection) => isInsideViewport(intersection, bounds));
  logDev("viewport 교차로 로딩 완료", { key, pagesFetched, visibleCount: visible.length, cachedIntersections: intersectionCache.size });
  return visible.length > 0 ? visible : newlyLoaded.filter((intersection) => isInsideViewport(intersection, bounds));
}

export async function loadSeoulIntersections(options: LoaderOptions = {}): Promise<Intersection[]> {
  if (intersectionLoadPromise) return intersectionLoadPromise;
  intersectionLoadPromise = (async () => {
    const firstBatch = await ensureInitialIntersectionPage();
    options.onBatch?.(firstBatch);
    return firstBatch;
  })();
  try {
    return await intersectionLoadPromise;
  } finally {
    intersectionLoadPromise = null;
  }
}

export async function fetchIntersections(): Promise<IntersectionListResult> {
  const intersections = await loadSeoulIntersections();
  return { intersections, markers: intersections.map(toMarker) };
}

async function loadIntersectionSignals(crsrdId: string): Promise<TrafficSignal[]> {
  const cached = signalCache.get(crsrdId);
  if (cached) return cached;
  if (signalNoDataCache.has(crsrdId)) return [];

  const pending = signalPromiseCache.get(crsrdId);
  if (pending) return pending;

  const promise = (async () => {
    const firstPage = await fetchTrafficSignalInfo({
      serviceKey: getServiceKey(), stdgCd: SEOUL_STDG_CD, pageNo: 1, numOfRows: SIGNAL_PAGE_ROWS,
    });
    const findMatch = (items: Array<KlidIntersectionRecord | KlidSignalRecord>) => items.find((record) => record.crsrdId === crsrdId) as KlidSignalRecord | undefined;
    let matchingRecord = findMatch(firstPage.items);

    if (!matchingRecord) {
      const totalPages = Math.ceil(firstPage.totalCount / SIGNAL_PAGE_ROWS);
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const page = await fetchTrafficSignalInfo({
          serviceKey: getServiceKey(), stdgCd: SEOUL_STDG_CD, pageNo, numOfRows: SIGNAL_PAGE_ROWS,
        });
        matchingRecord = findMatch(page.items);
        if (matchingRecord) break;
      }
    }

    if (!matchingRecord) {
      signalNoDataCache.add(crsrdId);
      logDev("신호 데이터 없음", { crsrdId });
      return [];
    }

    const signals = extractDirectionalSignals(matchingRecord);
    signalCache.set(crsrdId, signals);
    logDev("신호 파싱 완료", { crsrdId, totalSignals: signals.length });
    return signals;
  })();

  signalPromiseCache.set(crsrdId, promise);
  try {
    return await promise;
  } finally {
    signalPromiseCache.delete(crsrdId);
  }
}

export async function fetchIntersectionById(crsrdId: string): Promise<Intersection | null> {
  return intersectionCache.get(crsrdId) ?? null;
}

export async function fetchIntersectionSignalsById(crsrdId: string): Promise<TrafficSignal[]> {
  return loadIntersectionSignals(crsrdId);
}

export async function fetchIntersectionSignals(crsrdId: string): Promise<TrafficSignal[]> {
  return loadIntersectionSignals(crsrdId);
}

export function findIntersection(crsrdId: string, intersections: Intersection[]): Intersection | null {
  return intersections.find((intersection) => intersection.crsrdId === crsrdId) ?? null;
}
