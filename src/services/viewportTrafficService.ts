import type {
  ApproachDirection,
  Intersection,
  MovementType,
  SignalPhaseState,
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
const VIEWPORT_PADDING = 0.15;
const MAX_NEW_PAGES_PER_VIEWPORT = 2;

type Viewport = { south: number; west: number; north: number; east: number };
export type SignalLoadStatus = "loading" | "success" | "empty" | "error";
export interface SignalLoadResult {
  signals: TrafficSignal[];
  status: Exclude<SignalLoadStatus, "loading">;
}

const pageCache = new Map<number, KlidIntersectionRecord[]>();
const intersectionCache = new Map<string, Intersection>();
const viewportCache = new Set<string>();
const signalCache = new Map<string, TrafficSignal[]>();
const signalPromiseCache = new Map<string, Promise<SignalLoadResult>>();
let totalPages = 0;
let nextPage = 1;

function getServiceKey(): string {
  const key = import.meta.env.VITE_TRAFFIC_API_KEY ?? import.meta.env.VITE_DATA_API_SERVICE_KEY;
  if (!key?.trim()) throw new Error("Traffic API service key is not set.");
  return key;
}

function toNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeIntersection(record: KlidIntersectionRecord): Intersection | null {
  const crsrdId = normalizeId(record.crsrdId);
  if (!crsrdId || !record.crsrdNm) return null;
  const lat = toNumber(record.mapCtptIntLat);
  const lng = toNumber(record.mapCtptIntLot);
  if (!lat || !lng) return null;
  return {
    crsrdId,
    crsrdNm: record.crsrdNm,
    stdgCd: record.stdgCd,
    lclgvNm: record.lclgvNm,
    mapCtptIntLat: lat,
    mapCtptIntLot: lng,
    crsrdEngNm: record.crsrdEngNm,
    laneWdth: record.laneWdth,
    lmtSpdTypeNm: record.lmtSpdTypeNm,
    lmtSpd: record.lmtSpd,
    regDt: record.regDt,
    totDt: record.totDt,
    signals: [],
    updatedAt: record.regDt || record.totDt || new Date().toISOString(),
  };
}

function viewportKey(viewport: Viewport): string {
  return [viewport.south, viewport.west, viewport.north, viewport.east]
    .map((value) => value.toFixed(3))
    .join(":");
}

function contains(intersection: Intersection, viewport: Viewport): boolean {
  return (
    intersection.mapCtptIntLat >= viewport.south &&
    intersection.mapCtptIntLat <= viewport.north &&
    intersection.mapCtptIntLot >= viewport.west &&
    intersection.mapCtptIntLot <= viewport.east
  );
}

async function loadNextIntersectionPage(): Promise<Intersection[]> {
  if (totalPages > 0 && nextPage > totalPages) return [];
  const pageNo = nextPage;
  let raw = pageCache.get(pageNo);

  if (!raw) {
    const page = await fetchTrafficMapInfo({
      serviceKey: getServiceKey(),
      stdgCd: SEOUL_STDG_CD,
      pageNo,
      numOfRows: INTERSECTION_PAGE_ROWS,
    });
    totalPages = Math.max(
      totalPages,
      Math.ceil((toNumber(page.totalCount) || INTERSECTION_PAGE_ROWS) / INTERSECTION_PAGE_ROWS),
    );
    raw = page.items.filter((item): item is KlidIntersectionRecord => Boolean(item));
    pageCache.set(pageNo, raw);
  }

  nextPage = Math.max(nextPage, pageNo + 1);
  const normalized = raw
    .map(normalizeIntersection)
    .filter((item): item is Intersection => item !== null);

  for (const intersection of normalized) {
    if (!intersectionCache.has(intersection.crsrdId)) {
      intersectionCache.set(intersection.crsrdId, intersection);
    }
  }

  return normalized;
}

export async function loadIntersectionsForViewport(viewport: Viewport): Promise<Intersection[]> {
  const latSpan = Math.max(0.001, viewport.north - viewport.south);
  const lngSpan = Math.max(0.001, viewport.east - viewport.west);
  const paddedViewport: Viewport = {
    south: viewport.south - latSpan * VIEWPORT_PADDING,
    west: viewport.west - lngSpan * VIEWPORT_PADDING,
    north: viewport.north + latSpan * VIEWPORT_PADDING,
    east: viewport.east + lngSpan * VIEWPORT_PADDING,
  };
  const key = viewportKey(paddedViewport);

  if (!viewportCache.has(key)) {
    viewportCache.add(key);
    for (let page = 0; page < MAX_NEW_PAGES_PER_VIEWPORT; page += 1) {
      if (totalPages > 0 && nextPage > totalPages) break;
      await loadNextIntersectionPage();
      const visibleCount = [...intersectionCache.values()].filter((item) =>
        contains(item, paddedViewport),
      ).length;
      if (visibleCount >= 80) break;
    }
  }

  return [...intersectionCache.values()].filter((item) => contains(item, paddedViewport));
}

function normalizeState(value: unknown): SignalPhaseState {
  const text = String(value ?? "").toLowerCase();
  if (
    text.includes("yellow") ||
    text.includes("clearance") ||
    text.includes("amber") ||
    text.includes("황색")
  ) {
    return "protected-clearance";
  }
  if (
    text.includes("green") ||
    text.includes("allowed") ||
    text.includes("go") ||
    text.includes("녹색")
  ) {
    return "protected-Movement-Allowed";
  }
  return "stop-And-Remain";
}

const directions: Array<[ApproachDirection, string]> = [
  ["North", "nt"],
  ["East", "et"],
  ["South", "st"],
  ["West", "wt"],
  ["NorthEast", "ne"],
  ["SouthEast", "se"],
  ["SouthWest", "sw"],
  ["NorthWest", "nw"],
];

const movements: Array<[MovementType, string]> = [
  ["Bus", "Bssg"],
  ["Bicycle", "Bcsg"],
  ["Left Turn", "Ltsg"],
  ["Pedestrian", "Pdsg"],
  ["Straight", "Stsg"],
  ["U Turn", "Utsg"],
];

function extractSignals(record: KlidSignalRecord): TrafficSignal[] {
  const signals: TrafficSignal[] = [];

  for (const [direction, prefix] of directions) {
    for (const [movement, suffix] of movements) {
      const remainingKey = `${prefix}${suffix}RmndCs` as keyof KlidSignalRecord;
      const stateKey = `${prefix}${suffix}SttsNm` as keyof KlidSignalRecord;
      const remaining = record[remainingKey];
      const state = record[stateKey];

      // The API can legitimately omit either field. Never create a value from
      // undefined; only emit a signal when at least one real API field exists.
      if (remaining === undefined && state === undefined) continue;

      signals.push({
        direction,
        movement,
        state: normalizeState(state),
        remainingSeconds: remaining === undefined ? 0 : toNumber(remaining),
        cycleSeconds: 60,
      });
    }
  }

  const rawDirection =
    record.crsrdDirNm ?? record.crsrdDrctNm ?? record.dirNm ?? record.drctNm ?? record.direction;
  const rawMovement = record.movementNm ?? record.moveDirNm ?? record.turnDirNm;
  const rawRemaining = record.remainSec ?? record.remainTime;
  const rawState =
    record.signalStateNm ?? record.sigStatNm ?? record.sigSttNm ?? record.phaseNm ?? record.tlSttNm;

  const directionMap: Record<string, ApproachDirection> = {
    북: "North",
    북동: "NorthEast",
    동: "East",
    남동: "SouthEast",
    남: "South",
    남서: "SouthWest",
    서: "West",
    북서: "NorthWest",
    north: "North",
    northeast: "NorthEast",
    east: "East",
    southeast: "SouthEast",
    south: "South",
    southwest: "SouthWest",
    west: "West",
    northwest: "NorthWest",
  };
  const movementMap: Record<string, MovementType> = {
    직진: "Straight",
    straight: "Straight",
    좌회전: "Left Turn",
    "left turn": "Left Turn",
    우회전: "Right Turn",
    "right turn": "Right Turn",
    유턴: "U Turn",
    "u turn": "U Turn",
    보행자: "Pedestrian",
    pedestrian: "Pedestrian",
    버스: "Bus",
    bus: "Bus",
    자전거: "Bicycle",
    bicycle: "Bicycle",
  };

  if (rawDirection && rawMovement && (rawRemaining !== undefined || rawState !== undefined)) {
    const direction = directionMap[normalizeId(rawDirection).toLowerCase()];
    const movement = movementMap[normalizeId(rawMovement).toLowerCase()];
    if (direction && movement) {
      signals.push({
        direction,
        movement,
        state: normalizeState(rawState),
        remainingSeconds: rawRemaining === undefined ? 0 : toNumber(rawRemaining),
        cycleSeconds: toNumber(record.cycleSec ?? record.cycleTime ?? record.totCyc) || 60,
      });
    }
  }

  return signals;
}

async function loadSignalsForId(crsrdId: string): Promise<SignalLoadResult> {
  const normalizedTargetId = normalizeId(crsrdId);
  const cached = signalCache.get(normalizedTargetId);
  // Empty results are deliberately not treated as durable cache hits. A
  // temporary no-data response must not permanently mask a later valid API response.
  if (cached && cached.length > 0) return { signals: cached, status: "success" };

  const pending = signalPromiseCache.get(normalizedTargetId);
  if (pending) return pending;

  const promise = (async (): Promise<SignalLoadResult> => {
    try {
      const firstPage = await fetchTrafficSignalInfo({
        serviceKey: getServiceKey(),
        stdgCd: SEOUL_STDG_CD,
        pageNo: 1,
        numOfRows: SIGNAL_PAGE_ROWS,
      });
      const totalPages = Math.max(
        1,
        Math.ceil((toNumber(firstPage.totalCount) || SIGNAL_PAGE_ROWS) / SIGNAL_PAGE_ROWS),
      );

      for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
        const page =
          pageNo === 1
            ? firstPage
            : await fetchTrafficSignalInfo({
                serviceKey: getServiceKey(),
                stdgCd: SEOUL_STDG_CD,
                pageNo,
                numOfRows: SIGNAL_PAGE_ROWS,
              });

        // Normalize both sides because API gateways can deserialize numeric IDs
        // while the intersection endpoint returns the same ID as a string.
        const match = page.items.find((item) => normalizeId(item.crsrdId) === normalizedTargetId) as
          | KlidSignalRecord
          | undefined;
        if (!match) continue;

        const signals = extractSignals(match);
        if (signals.length > 0) {
          signalCache.set(normalizedTargetId, signals);
          return { signals, status: "success" };
        }

        // The intersection exists in the response, but this particular response
        // contains no usable signal fields. Do not poison the cache with [] and
        // do not confuse this with an API request failure.
        signalCache.delete(normalizedTargetId);
        return { signals: [], status: "empty" };
      }

      signalCache.delete(normalizedTargetId);
      return { signals: [], status: "empty" };
    } catch (error) {
      console.error("[SignalNow] 선택 교차로 신호 API 오류", { crsrdId: normalizedTargetId, error });
      signalCache.delete(normalizedTargetId);
      return { signals: [], status: "error" };
    }
  })();

  signalPromiseCache.set(normalizedTargetId, promise);
  try {
    return await promise;
  } finally {
    signalPromiseCache.delete(normalizedTargetId);
  }
}

export function fetchSelectedIntersectionSignals(crsrdId: string): Promise<SignalLoadResult> {
  return loadSignalsForId(crsrdId);
}
