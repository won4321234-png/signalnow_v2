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
const DEV_LOG_PREFIX = "[SignalNow]";

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

interface SignalSeed {
  crsrdId: string;
  direction: ApproachDirection;
  movement: MovementType;
  state: SignalPhaseState;
  remainingSeconds: number;
  cycleSeconds: number;
}

interface LoaderOptions {
  onBatch?: (intersections: Intersection[]) => void;
  signalEnabled?: boolean;
}

const intersectionPageCache = new Map<number, KlidIntersectionRecord[]>();
const intersectionCache = new Map<string, Intersection>();
const signalCache = new Map<string, SignalSeed[]>();
const signalPromiseCache = new Map<string, Promise<TrafficSignal[]>>();

let intersectionLoadPromise: Promise<Intersection[]> | null = null;
let intersectionBackgroundPromise: Promise<void> | null = null;

function getServiceKey(): string {
  const serviceKey =
    import.meta.env.VITE_TRAFFIC_API_KEY ??
    import.meta.env.VITE_DATA_API_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("Traffic API service key is not set.");
  }
  return serviceKey;
}

function logDev(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(`${DEV_LOG_PREFIX} ${message}`, ...args);
  }
}

function toNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeState(value: unknown): SignalPhaseState {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("yellow") || text.includes("clearance") || text.includes("amber") || text.includes("황색")) {
    return "protected-clearance";
  }
  if (text.includes("green") || text.includes("allowed") || text.includes("go") || text.includes("녹색")) {
    return "protected-Movement-Allowed";
  }
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
  const entries: Array<
    [ApproachDirection, Partial<Record<MovementType, { remainingSeconds: number; state: SignalPhaseState }>>]
  > = [
    ["North", {
      Bus: { remainingSeconds: toNumber(record.ntBssgRmndCs), state: normalizeState(record.ntBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.ntBcsgRmndCs), state: normalizeState(record.ntBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.ntLtsgRmndCs), state: normalizeState(record.ntLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.ntPdsgRmndCs), state: normalizeState(record.ntPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.ntStsgRmndCs), state: normalizeState(record.ntStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.ntUtsgRmndCs), state: normalizeState(record.ntUtsgSttsNm) },
    }],
    ["East", {
      Bus: { remainingSeconds: toNumber(record.etBssgRmndCs), state: normalizeState(record.etBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.etBcsgRmndCs), state: normalizeState(record.etBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.etLtsgRmndCs), state: normalizeState(record.etLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.etPdsgRmndCs), state: normalizeState(record.etPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.etStsgRmndCs), state: normalizeState(record.etStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.etUtsgRmndCs), state: normalizeState(record.etUtsgSttsNm) },
    }],
    ["South", {
      Bus: { remainingSeconds: toNumber(record.stBssgRmndCs), state: normalizeState(record.stBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.stBcsgRmndCs), state: normalizeState(record.stBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.stLtsgRmndCs), state: normalizeState(record.stLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.stPdsgRmndCs), state: normalizeState(record.stPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.stStsgRmndCs), state: normalizeState(record.stStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.stUtsgRmndCs), state: normalizeState(record.stUtsgSttsNm) },
    }],
    ["West", {
      Bus: { remainingSeconds: toNumber(record.wtBssgRmndCs), state: normalizeState(record.wtBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.wtBcsgRmndCs), state: normalizeState(record.wtBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.wtLtsgRmndCs), state: normalizeState(record.wtLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.wtPdsgRmndCs), state: normalizeState(record.wtPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.wtStsgRmndCs), state: normalizeState(record.wtStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.wtUtsgRmndCs), state: normalizeState(record.wtUtsgSttsNm) },
    }],
    ["NorthEast", {
      Bus: { remainingSeconds: toNumber(record.neBssgRmndCs), state: normalizeState(record.neBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.neBcsgRmndCs), state: normalizeState(record.neBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.neLtsgRmndCs), state: normalizeState(record.neLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.nePdsgRmndCs), state: normalizeState(record.nePdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.neStsgRmndCs), state: normalizeState(record.neStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.neUtsgRmndCs), state: normalizeState(record.neUtsgSttsNm) },
    }],
    ["SouthEast", {
      Bus: { remainingSeconds: toNumber(record.seBssgRmndCs), state: normalizeState(record.seBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.seBcsgRmndCs), state: normalizeState(record.seBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.seLtsgRmndCs), state: normalizeState(record.seLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.sePdsgRmndCs), state: normalizeState(record.sePdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.seStsgRmndCs), state: normalizeState(record.seStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.seUtsgRmndCs), state: normalizeState(record.seUtsgSttsNm) },
    }],
    ["SouthWest", {
      Bus: { remainingSeconds: toNumber(record.swBssgRmndCs), state: normalizeState(record.swBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.swBcsgRmndCs), state: normalizeState(record.swBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.swLtsgRmndCs), state: normalizeState(record.swLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.swPdsgRmndCs), state: normalizeState(record.swPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.swStsgRmndCs), state: normalizeState(record.swStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.swUtsgRmndCs), state: normalizeState(record.swUtsgSttsNm) },
    }],
    ["NorthWest", {
      Bus: { remainingSeconds: toNumber(record.nwBssgRmndCs), state: normalizeState(record.nwBssgSttsNm) },
      Bicycle: { remainingSeconds: toNumber(record.nwBcsgRmndCs), state: normalizeState(record.nwBcsgSttsNm) },
      "Left Turn": { remainingSeconds: toNumber(record.nwLtsgRmndCs), state: normalizeState(record.nwLtsgSttsNm) },
      Pedestrian: { remainingSeconds: toNumber(record.nwPdsgRmndCs), state: normalizeState(record.nwPdsgSttsNm) },
      Straight: { remainingSeconds: toNumber(record.nwStsgRmndCs), state: normalizeState(record.nwStsgSttsNm) },
      "U Turn": { remainingSeconds: toNumber(record.nwUtsgRmndCs), state: normalizeState(record.nwUtsgSttsNm) },
    }],
  ];

  const signals: TrafficSignal[] = [];
  for (const [direction, movements] of entries) {
    for (const [movement, data] of Object.entries(movements) as Array<
      [MovementType, { remainingSeconds: number; state: SignalPhaseState } | undefined]
    >) {
      if (!data) continue;
      signals.push({
        direction,
        movement,
        state: data.state,
        remainingSeconds: data.remainingSeconds,
        cycleSeconds: 60,
      });
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

async function fetchIntersectionPage(pageNo: number): Promise<IntersectionSeed[]> {
  const cached = intersectionPageCache.get(pageNo);
  if (cached) {
    const normalized = cached.map(normalizeIntersection).filter((item): item is IntersectionSeed => item !== null);
    if (import.meta.env.DEV) {
      console.log(`${DEV_LOG_PREFIX} 교차로 페이지 캐시`, { pageNo, rawCount: cached.length, normalizedCount: normalized.length });
    }
    return normalized;
  }

  const page = await fetchTrafficMapInfo({
    serviceKey: getServiceKey(),
    stdgCd: SEOUL_STDG_CD,
    pageNo,
    numOfRows: INTERSECTION_PAGE_ROWS,
  });
  intersectionPageCache.set(pageNo, page.items.filter((item): item is KlidIntersectionRecord => Boolean(item)));
  const normalized = page.items.map(normalizeIntersection).filter((item): item is IntersectionSeed => item !== null);
  if (import.meta.env.DEV) {
    console.log(`${DEV_LOG_PREFIX} 교차로 페이지 수신`, {
      pageNo,
      rawCount: page.items.length,
      normalizedCount: normalized.length,
    });
  }
  return normalized;
}

async function loadIntersectionSignals(crsrdId: string): Promise<TrafficSignal[]> {
  const cached = signalCache.get(crsrdId);
  if (cached) return cached;

  const pending = signalPromiseCache.get(crsrdId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const firstPage = await fetchTrafficSignalInfo({
        serviceKey: getServiceKey(),
        stdgCd: SEOUL_STDG_CD,
        pageNo: 1,
        numOfRows: SIGNAL_PAGE_ROWS,
      });

      const firstMatch = firstPage.items.find((record) => record.crsrdId === crsrdId);
      if (firstMatch) {
        const signals = extractDirectionalSignals(firstMatch);
        if (import.meta.env.DEV) {
          console.log(`${DEV_LOG_PREFIX} 신호 파싱 완료`, { crsrdId, totalSignals: signals.length });
        }
        return signals;
      }

      const totalPages = Math.ceil(firstPage.totalCount / SIGNAL_PAGE_ROWS);
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const page = await fetchTrafficSignalInfo({
          serviceKey: getServiceKey(),
          stdgCd: SEOUL_STDG_CD,
          pageNo,
          numOfRows: SIGNAL_PAGE_ROWS,
        });
        const matchingRecord = page.items.find((record) => record.crsrdId === crsrdId);
        if (matchingRecord) {
          const signals = extractDirectionalSignals(matchingRecord);
          if (import.meta.env.DEV) {
            console.log(`${DEV_LOG_PREFIX} 신호 파싱 완료`, { crsrdId, totalSignals: signals.length });
          }
          return signals;
        }
      }
      if (import.meta.env.DEV) {
        console.log(`${DEV_LOG_PREFIX} 신호 데이터 없음`, { crsrdId });
      }
      return [];
    } catch (error) {
      console.error(`${DEV_LOG_PREFIX} API 오류`, error);
      return [];
    }
  })();

  signalPromiseCache.set(crsrdId, promise);
  const signals = await promise;
  signalPromiseCache.delete(crsrdId);
  signalCache.set(crsrdId, signals);
  return signals;
}

async function fetchRemainingIntersectionPages(
  totalPages: number,
  onBatch?: (intersections: Intersection[]) => void
): Promise<void> {
  if (intersectionBackgroundPromise) return intersectionBackgroundPromise;

  intersectionBackgroundPromise = (async () => {
    try {
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const batch = await fetchIntersectionPage(pageNo);
        const intersections = upsertIntersections(batch);
        if (intersections.length > 0) {
          onBatch?.(intersections);
        }
      }
    } finally {
      intersectionBackgroundPromise = null;
    }
  })();

  return intersectionBackgroundPromise;
}

function upsertIntersections(seeds: IntersectionSeed[]): Intersection[] {
  const next: Intersection[] = [];
  for (const seed of seeds) {
    if (intersectionCache.has(seed.crsrdId)) {
      const prev = intersectionCache.get(seed.crsrdId)!;
      next.push(prev);
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

export async function loadSeoulIntersections(options: LoaderOptions = {}): Promise<Intersection[]> {
  if (intersectionLoadPromise) return intersectionLoadPromise;
  const { onBatch, signalEnabled = false } = options;

  intersectionLoadPromise = (async () => {
    const firstPage = await fetchTrafficMapInfo({
      serviceKey: getServiceKey(),
      stdgCd: SEOUL_STDG_CD,
      pageNo: 1,
      numOfRows: INTERSECTION_PAGE_ROWS,
    });
    const totalPages = Math.max(1, Math.ceil((toNumber(firstPage.totalCount) || INTERSECTION_PAGE_ROWS) / INTERSECTION_PAGE_ROWS));
    if (import.meta.env.DEV) {
      console.log(`${DEV_LOG_PREFIX} 서울 교차로 API 첫 응답`, {
        totalCount: toNumber(firstPage.totalCount),
        firstPageRawCount: firstPage.items.length,
        totalPages,
      });
    }
    const firstBatch = firstPage.items
      .map(normalizeIntersection)
      .filter((item): item is IntersectionSeed => item !== null);
    intersectionPageCache.set(1, firstPage.items.filter((item): item is KlidIntersectionRecord => Boolean(item)));
    const intersections = upsertIntersections(firstBatch);
    if (import.meta.env.DEV) {
      console.log(`${DEV_LOG_PREFIX} Intersection 변환`, { pageNo: 1, count: intersections.length });
    }
    onBatch?.(intersections);

    await fetchRemainingIntersectionPages(totalPages, onBatch);

    if (signalEnabled) {
      logDev("signal loading deferred until selection");
    }
    if (import.meta.env.DEV) {
      console.log(`${DEV_LOG_PREFIX} Intersection 전체 적재 완료`, { totalCount: intersectionCache.size });
    }
    return intersections;
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

export async function fetchIntersectionById(crsrdId: string): Promise<Intersection | null> {
  if (intersectionCache.has(crsrdId)) return intersectionCache.get(crsrdId)!;
  await loadSeoulIntersections();
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
