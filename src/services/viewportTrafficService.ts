import type { ApproachDirection, Intersection, MovementType, SignalPhaseState, TrafficSignal } from "@/types/traffic";
import { fetchTrafficMapInfo, fetchTrafficSignalInfo, type KlidIntersectionRecord, type KlidSignalRecord, type TrafficApiDebugMeta, type TrafficApiRequestError, type TrafficApiPageResult } from "@/services/trafficApi";
import { DEFAULT_TRAFFIC_REGION, TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";

const INTERSECTION_PAGE_ROWS = 100;
const SIGNAL_PAGE_ROWS = 100;
const VIEWPORT_PADDING = 0.15;
type Viewport = { south: number; west: number; north: number; east: number };
type IntersectionLoadOptions = { loadAll?: boolean };
export type SignalLoadStatus = "loading" | "success" | "empty" | "error";
export interface SignalDiagnostic { direction: ApproachDirection; movement: MovementType; field: string; rawRemaining: unknown; parsedRemaining: number | undefined; rawState: unknown; apiPageNo: number; apiItemIndex: number; crsrdId: string; crsrdNm: string; }
export interface SignalLoadResult { signals: TrafficSignal[]; status: Exclude<SignalLoadStatus, "loading">; debug: { apiStatus: string; itemCount: number; matched: boolean; matchedId: string; matchedName: string; apiPageNo: number; apiItemIndex: number; via: "direct" | "proxy" | "-"; responseReceived: boolean; sampleIds: string[]; matchedKeys: string[]; signalDiagnostics: SignalDiagnostic[]; failureReason: string }; }

let activeRegionId: TrafficRegionId = DEFAULT_TRAFFIC_REGION;
let regionGeneration = 0;
const pageCache = new Map<string, KlidIntersectionRecord[]>();
const pageTotalCache = new Map<string, number>();
const intersectionCache = new Map<string, Intersection>();
const viewportCache = new Set<string>();
const viewportPromiseCache = new Map<string, Promise<Intersection[]>>();
const signalCache = new Map<string, TrafficSignal[]>();
const signalPromiseCache = new Map<string, Promise<SignalLoadResult>>();
const signalPageCache = new Map<number, KlidSignalRecord[]>();
const signalPagePromiseCache = new Map<number, Promise<TrafficApiPageResult<KlidSignalRecord>>>();
const signalMatchPageCache = new Map<string, number>();
let signalTotalPages = 0;

const debugEnabled = () => new URLSearchParams(window.location.search).get("debug") === "1";
const debugLog = (message: string, data: Record<string, unknown>) => { if (debugEnabled()) console.log(`[SignalNow debug] ${message}`, data); };
function getActiveRegion() { return TRAFFIC_REGIONS[activeRegionId]; }
function getServiceKey(): string { return "server-proxy"; }
function toNumber(value: string | number | undefined): number { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function toOptionalNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed / 1000 : undefined; }
function normalizeId(value: unknown): string { return String(value ?? "").trim(); }
function normalizeIntersection(record: KlidIntersectionRecord): Intersection | null {
  const crsrdId = normalizeId(record.crsrdId);
  const crsrdNm = normalizeId(record.crsrdNm) || "교차로";
  if (!crsrdId) return null;
  const lat = toNumber(record.mapCtptIntLat);
  const lng = toNumber(record.mapCtptIntLot);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  return {
    crsrdId,
    crsrdNm,
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
function viewportKey(viewport: Viewport): string { return [activeRegionId, viewport.south, viewport.west, viewport.north, viewport.east].map((value) => typeof value === "string" ? value : value.toFixed(3)).join(":"); }
function contains(intersection: Intersection, viewport: Viewport): boolean { return intersection.mapCtptIntLat >= viewport.south && intersection.mapCtptIntLat <= viewport.north && intersection.mapCtptIntLot >= viewport.west && intersection.mapCtptIntLot <= viewport.east; }
async function loadIntersectionPage(pageNo: number): Promise<Intersection[]> {
  const regionId = activeRegionId;
  const cacheKey = `${regionId}:${pageNo}`;
  const cached = pageCache.get(cacheKey);
  if (cached) {
    return cached.map(normalizeIntersection).filter((item): item is Intersection => item !== null);
  }

  const requestGeneration = regionGeneration;
  const region = getActiveRegion();
  const page = await fetchTrafficMapInfo({
    serviceKey: getServiceKey(),
    stdgCd: region.stdgCd,
    pageNo,
    numOfRows: INTERSECTION_PAGE_ROWS,
  });

  if (requestGeneration !== regionGeneration || regionId !== activeRegionId) {
    throw new Error("Traffic region changed while loading intersections.");
  }

  const raw = page.items.filter((item): item is KlidIntersectionRecord => Boolean(item));
  pageCache.set(cacheKey, raw);
  const reportedTotalCount = toNumber(page.totalCount);
  if (reportedTotalCount > 0) {
    pageTotalCache.set(regionId, Math.ceil(reportedTotalCount / INTERSECTION_PAGE_ROWS));
  } else if (raw.length < INTERSECTION_PAGE_ROWS) {
    pageTotalCache.set(regionId, pageNo);
  }

  const normalized = raw.map(normalizeIntersection).filter((item): item is Intersection => item !== null);
  for (const intersection of normalized) intersectionCache.set(intersection.crsrdId, intersection);

  debugLog("intersection API page", {
    region: regionId,
    stdgCd: region.stdgCd,
    pageNo,
    totalCount: page.totalCount,
    totalPages: pageTotalCache.get(regionId) ?? 0,
    itemCount: raw.length,
    parsedCount: normalized.length,
    firstId: raw[0]?.crsrdId ?? "",
    lastId: raw[raw.length - 1]?.crsrdId ?? "",
  });

  return normalized;
}

export function configureTrafficRegion(regionId: TrafficRegionId): void {
export function getTrafficRegion(): TrafficRegionId { return activeRegionId; }
export async function loadIntersectionsForViewport(viewport: Viewport, options: IntersectionLoadOptions = {}): Promise<Intersection[]> {
  const isGroundTruthAdmin = window.location.pathname === "/admin/intersections" || window.location.pathname === "/intersection-editor";
  const { loadAll = isGroundTruthAdmin } = options;
  const latSpan = Math.max(0.001, viewport.north - viewport.south);
  const lngSpan = Math.max(0.001, viewport.east - viewport.west);
  const paddedViewport: Viewport = {
    south: viewport.south - latSpan * VIEWPORT_PADDING,
    west: viewport.west - lngSpan * VIEWPORT_PADDING,
    north: viewport.north + latSpan * VIEWPORT_PADDING,
    east: viewport.east + lngSpan * VIEWPORT_PADDING,
  };
  const key = viewportKey(paddedViewport);

  if (loadAll) {
    const full = new Map<string, Intersection>();
    const regionId = activeRegionId;
    const knownTotalPages = () => pageTotalCache.get(regionId) ?? 0;

    for (let pageNo = 1; ; pageNo += 1) {
      const before = intersectionCache.size;
      await loadIntersectionPage(pageNo);
      for (const item of intersectionCache.values()) full.set(item.crsrdId, item);
      const raw = pageCache.get(`${regionId}:${pageNo}`) ?? [];
      const reachedEnd = knownTotalPages() > 0 && pageNo >= knownTotalPages();
      const emptyPage = raw.length === 0;
      if (emptyPage || reachedEnd) break;
      if (pageNo > 1000 || (intersectionCache.size === before && raw.length < INTERSECTION_PAGE_ROWS)) break;
    }

    return [...full.values()];
  }

  const existing = viewportPromiseCache.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const regionId = activeRegionId;
      for (let pageNo = 1; ; pageNo += 1) {
        await loadIntersectionPage(pageNo);
        const visible = [...intersectionCache.values()].filter((item) => contains(item, paddedViewport));
        const raw = pageCache.get(`${regionId}:${pageNo}`) ?? [];
        const totalPages = pageTotalCache.get(regionId) ?? 0;
        debugLog("viewport intersection loading", {
          region: regionId,
          stdgCd: getActiveRegion().stdgCd,
          pageNo,
          totalPages,
          parsedItems: intersectionCache.size,
          pageItems: raw.length,
          visibleCount: visible.length,
        });
        if (visible.length >= 80 || raw.length === 0 || (totalPages > 0 && pageNo >= totalPages)) {
          viewportCache.add(key);
          return visible;
        }
        if (pageNo >= 1000) {
          viewportCache.add(key);
          return visible;
        }
      }
    } catch (error) {
      viewportCache.delete(key);
      throw error;
    }
    return [];
  })();

  viewportPromiseCache.set(key, request);
  try {
    return await request;
  } finally {
    viewportPromiseCache.delete(key);
  }
}

function normalizeState(value: unknown): SignalPhaseState | undefined { if (value === undefined || value === null || value === "") return undefined; const text = String(value).trim().toLowerCase(); if (text.includes("yellow") || text.includes("clearance") || text.includes("amber") || text.includes("황색")) return "protected-clearance"; if (text.includes("green") || text.includes("allowed") || text.includes("go") || text.includes("녹색")) return "protected-Movement-Allowed"; if (text.includes("red") || text.includes("stop") || text.includes("remain") || text.includes("적색")) return "stop-And-Remain"; return undefined; }
const directions: Array<[ApproachDirection, string]> = [["North","nt"],["East","et"],["South","st"],["West","wt"],["NorthEast","ne"],["SouthEast","se"],["SouthWest","sw"],["NorthWest","nw"]];
const movements: Array<[MovementType, string]> = [["Bus","Bssg"],["Bicycle","Bcsg"],["Left Turn","Ltsg"],["Right Turn","Rtsg"],["Pedestrian","Pdsg"],["Straight","Stsg"],["U Turn","Utsg"]];
function extractSignals(record: KlidSignalRecord, apiPageNo: number, apiItemIndex: number): { signals: TrafficSignal[]; diagnostics: SignalDiagnostic[] } { const signals: TrafficSignal[] = []; const diagnostics: SignalDiagnostic[] = []; const crsrdId = normalizeId(record.crsrdId); const crsrdNm = String(record.crsrdNm ?? ""); for (const [direction,prefix] of directions) for (const [movement,suffix] of movements) { const remainingKey = `${prefix}${suffix}RmndCs` as keyof KlidSignalRecord; const stateKey = `${prefix}${suffix}SttsNm` as keyof KlidSignalRecord; const remaining = record[remainingKey]; const rawState = record[stateKey]; const state = normalizeState(rawState); const parsedRemaining = toOptionalNumber(remaining); if (remaining === undefined && state === undefined) continue; diagnostics.push({ direction, movement, field: String(remainingKey), rawRemaining: remaining, parsedRemaining, rawState, apiPageNo, apiItemIndex, crsrdId, crsrdNm }); if (state === undefined) continue; signals.push({ direction, movement, state, remainingSeconds: parsedRemaining, cycleSeconds: 60 }); } return { signals, diagnostics }; }
function diagnosticReason(base: string, sampleIds: string[], matchedKeys: string[]): string { const samples = sampleIds.length > 0 ? ` samples=${sampleIds.slice(0, 5).join(",")}` : " samples=-"; const keys = matchedKeys.length > 0 ? ` keys=${matchedKeys.slice(0, 40).join(",")}` : ""; return `${base}${samples}${keys}`; }
async function fetchSignalPage(pageNo: number, forceRefresh = false): Promise<TrafficApiPageResult<KlidSignalRecord>> {
  if (!forceRefresh) {
    const cached = signalPageCache.get(pageNo);
    if (cached) {
      return {
        totalCount: signalTotalPages * SIGNAL_PAGE_ROWS,
        items: cached,
        debug: {
          apiStatus: "cached",
          via: "proxy",
          responseReceived: true,
          itemCount: cached.length,
          sampleIds: cached.slice(0, 5).map((item) => normalizeId(item.crsrdId)).filter(Boolean),
        },
      };
    }
    const pending = signalPagePromiseCache.get(pageNo);
    if (pending) return pending;
  }

  const promise = fetchTrafficSignalInfo({
    serviceKey: getServiceKey(),
    stdgCd: getActiveRegion().stdgCd,
    pageNo,
    numOfRows: SIGNAL_PAGE_ROWS,
  }).then((page) => {
    signalPageCache.set(pageNo, page.items);
    if (page.totalCount > 0) {
      signalTotalPages = Math.max(signalTotalPages, Math.ceil(page.totalCount / SIGNAL_PAGE_ROWS));
    } else if (page.items.length < SIGNAL_PAGE_ROWS) {
      signalTotalPages = Math.max(signalTotalPages, pageNo);
    }
    return page;
  });

  signalPagePromiseCache.set(pageNo, promise);
  try {
    return await promise;
  } finally {
    signalPagePromiseCache.delete(pageNo);
  }
}

async function findSignalRecord(
  crsrdId: string,
  forceRefresh: boolean,
): Promise<{ record: KlidSignalRecord; pageNo: number; page: TrafficApiPageResult<KlidSignalRecord> } | null> {
  const targetId = normalizeId(crsrdId);
  const cachedPageNo = signalMatchPageCache.get(targetId);

  if (!forceRefresh || !cachedPageNo) {
    try {
      const targetedPage = await fetchTrafficSignalInfo({
        serviceKey: getServiceKey(),
        stdgCd: getActiveRegion().stdgCd,
        pageNo: 1,
        numOfRows: SIGNAL_PAGE_ROWS,
        crsrdId: targetId,
      });
      const targetedIndex = targetedPage.items.findIndex((item) => normalizeId(item.crsrdId) === targetId);
      if (targetedIndex >= 0) {
        signalMatchPageCache.set(targetId, 1);
        return { record: targetedPage.items[targetedIndex], pageNo: 1, page: targetedPage };
      }
    } catch {
      // Fall back to the paginated search below when the provider does not support filtering.
    }
  }

  if (forceRefresh && cachedPageNo) {
    const page = await fetchSignalPage(cachedPageNo, true);
    const index = page.items.findIndex((item) => normalizeId(item.crsrdId) === targetId);
    if (index >= 0) return { record: page.items[index], pageNo: cachedPageNo, page };
    signalMatchPageCache.delete(targetId);
  }

  const firstPage = await fetchSignalPage(1, forceRefresh);
  const firstIndex = firstPage.items.findIndex((item) => normalizeId(item.crsrdId) === targetId);
  if (firstIndex >= 0) {
    signalMatchPageCache.set(targetId, 1);
    return { record: firstPage.items[firstIndex], pageNo: 1, page: firstPage };
  }

  const totalPagesForSearch = Math.max(
    signalTotalPages,
    firstPage.totalCount > 0 ? Math.ceil(firstPage.totalCount / SIGNAL_PAGE_ROWS) : 1,
  );
  if (totalPagesForSearch <= 1) return null;

  for (let pageNo = 2; pageNo <= totalPagesForSearch; pageNo += 1) {
    const cached = signalPageCache.get(pageNo);
    if (!cached) continue;
    const index = cached.findIndex((item) => normalizeId(item.crsrdId) === targetId);
    if (index >= 0) {
      const page: TrafficApiPageResult<KlidSignalRecord> = {
        totalCount: signalTotalPages * SIGNAL_PAGE_ROWS,
        items: cached,
        debug: {
          apiStatus: "cached",
          via: "proxy",
          responseReceived: true,
          itemCount: cached.length,
          sampleIds: cached.slice(0, 5).map((item) => normalizeId(item.crsrdId)).filter(Boolean),
        },
      };
      signalMatchPageCache.set(targetId, pageNo);
      return { record: cached[index], pageNo, page };
    }
  }

  const concurrency = 6;
  for (let batchStart = 2; batchStart <= totalPagesForSearch; batchStart += concurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(concurrency, totalPagesForSearch - batchStart + 1) },
      (_, index) => batchStart + index,
    ).filter((pageNo) => !signalPageCache.has(pageNo));

    const pages = await Promise.all(pageNumbers.map((pageNo) => fetchSignalPage(pageNo)));
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const pageNo = pageNumbers[index];
      const matchIndex = page.items.findIndex((item) => normalizeId(item.crsrdId) === targetId);
      if (matchIndex >= 0) {
        signalMatchPageCache.set(targetId, pageNo);
        return { record: page.items[matchIndex], pageNo, page };
      }
    }
  }

  return null;
}

function buildSignalDebug(
  base: SignalLoadResult["debug"],
  patch: Partial<SignalLoadResult["debug"]>,
): SignalLoadResult["debug"] {
  return { ...base, ...patch };
}

async function loadSignalsForId(crsrdId: string, forceRefresh = false): Promise<SignalLoadResult> {
  const targetId = normalizeId(crsrdId);
  if (!targetId) {
    return {
      signals: [],
      status: "error",
      debug: {
        apiStatus: "invalid-request",
        itemCount: 0,
        matched: false,
        matchedId: "",
        matchedName: "",
        apiPageNo: 0,
        apiItemIndex: -1,
        via: "-",
        responseReceived: false,
        sampleIds: [],
        matchedKeys: [],
        signalDiagnostics: [],
        failureReason: "invalid-crsrdId",
      },
    };
  }

  const cachedSignals = signalCache.get(targetId);
  if (!forceRefresh && cachedSignals && cachedSignals.length > 0) {
    return {
      signals: cachedSignals,
      status: "success",
      debug: {
        apiStatus: "cached",
        itemCount: cachedSignals.length,
        matched: true,
        matchedId: targetId,
        matchedName: "",
        apiPageNo: signalMatchPageCache.get(targetId) ?? 0,
        apiItemIndex: -1,
        via: "proxy",
        responseReceived: true,
        sampleIds: [targetId],
        matchedKeys: [],
        signalDiagnostics: [],
        failureReason: "",
      },
    };
  }

  const pending = signalPromiseCache.get(targetId);
  if (pending) return pending;

  const promise = (async (): Promise<SignalLoadResult> => {
    const baseDebug: SignalLoadResult["debug"] = {
      apiStatus: "-",
      itemCount: 0,
      matched: false,
      matchedId: "",
      matchedName: "",
      apiPageNo: 0,
      apiItemIndex: -1,
      via: "proxy",
      responseReceived: false,
      sampleIds: [],
      matchedKeys: [],
      signalDiagnostics: [],
      failureReason: "request-not-started",
    };

    try {
      const match = await findSignalRecord(targetId, forceRefresh);
      if (!match) {
        const firstPage = signalPageCache.get(1) ?? [];
        return {
          signals: [],
          status: "empty",
          debug: buildSignalDebug(baseDebug, {
            apiStatus: "200",
            itemCount: firstPage.length,
            responseReceived: true,
            sampleIds: firstPage.slice(0, 5).map((item) => normalizeId(item.crsrdId)).filter(Boolean),
            failureReason: diagnosticReason(
              firstPage.length === 0 ? "no-items" : "no-matching-crsrdId",
              firstPage.slice(0, 5).map((item) => normalizeId(item.crsrdId)).filter(Boolean),
              [],
            ),
          }),
        };
      }

      const matchIndex = match.page.items.findIndex((item) => normalizeId(item.crsrdId) === targetId);
      const matchedKeys = Object.keys(match.record).slice(0, 80);
      const extraction = extractSignals(match.record, match.pageNo, matchIndex);
      const signals = extraction.signals;

      if (signals.length > 0) {
        signalCache.set(targetId, signals);
      } else {
        signalCache.delete(targetId);
      }

      return {
        signals,
        status: signals.length > 0 ? "success" : "empty",
        debug: buildSignalDebug(baseDebug, {
          apiStatus: match.page.debug.apiStatus,
          itemCount: match.page.debug.itemCount,
          matched: true,
          matchedId: targetId,
          matchedName: String(match.record.crsrdNm ?? ""),
          apiPageNo: match.pageNo,
          apiItemIndex: matchIndex,
          via: match.page.debug.via,
          responseReceived: match.page.debug.responseReceived,
          sampleIds: match.page.debug.sampleIds,
          matchedKeys,
          signalDiagnostics: extraction.diagnostics,
          failureReason: signals.length > 0 ? "" : diagnosticReason("no-signal-fields", match.page.debug.sampleIds, matchedKeys),
        }),
      };
    } catch (error) {
      signalCache.delete(targetId);
      const apiError = error as TrafficApiRequestError;
      const errorDebug = apiError?.debug;
      return {
        signals: [],
        status: "error",
        debug: buildSignalDebug(baseDebug, {
          apiStatus: errorDebug?.apiStatus ?? "error",
          itemCount: errorDebug?.itemCount ?? 0,
          via: errorDebug?.via ?? "proxy",
          responseReceived: errorDebug?.responseReceived ?? false,
          sampleIds: errorDebug?.sampleIds ?? [],
          failureReason:
            errorDebug?.apiStatus === "parse-error"
              ? "parse-error"
              : errorDebug?.apiStatus === "network-error" || errorDebug?.apiStatus === "timeout"
                ? "network-error-or-timeout"
                : errorDebug?.apiStatus?.startsWith("api-error:")
                  ? "api-error"
                  : "request-failed",
        }),
      };
    }
  })();

  signalPromiseCache.set(targetId, promise);
  try {
    return await promise;
  } finally {
    signalPromiseCache.delete(targetId);
  }
}

export function fetchSelectedIntersectionSignals(crsrdId: string, options?: { forceRefresh?: boolean }): Promise<SignalLoadResult> { return loadSignalsForId(crsrdId, options?.forceRefresh === true); }
