export const TRAFFIC_API_BASE_PATH = "/api/traffic";
export const TRAFFIC_API_DIRECT_BASE_URL = "https://apis.data.go.kr/B551982/rti";

export interface KlidIntersectionRecord {
  stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string;
  mapCtptIntLat?: string | number; mapCtptIntLot?: string | number; crsrdEngNm?: string;
  laneWdth?: string; lmtSpdTypeNm?: string; lmtSpd?: string; regDt?: string; totDt?: string;
}

export interface KlidSignalRecord {
  stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string; crsrdEngNm?: string;
  ntBssgRmndCs?: string | number; ntBcsgRmndCs?: string | number; ntLtsgRmndCs?: string | number; ntPdsgRmndCs?: string | number; ntStsgRmndCs?: string | number; ntUtsgRmndCs?: string | number;
  ntBssgSttsNm?: string; ntBcsgSttsNm?: string; ntLtsgSttsNm?: string; ntPdsgSttsNm?: string; ntStsgSttsNm?: string; ntUtsgSttsNm?: string;
  etBssgRmndCs?: string | number; etBcsgRmndCs?: string | number; etLtsgRmndCs?: string | number; etPdsgRmndCs?: string | number; etStsgRmndCs?: string | number; etUtsgRmndCs?: string | number;
  etBssgSttsNm?: string; etBcsgSttsNm?: string; etLtsgSttsNm?: string; etPdsgSttsNm?: string; etStsgSttsNm?: string; etUtsgSttsNm?: string;
  stBssgRmndCs?: string | number; stBcsgRmndCs?: string | number; stLtsgRmndCs?: string | number; stPdsgRmndCs?: string | number; stStsgRmndCs?: string | number; stUtsgRmndCs?: string | number;
  stBssgSttsNm?: string; stBcsgSttsNm?: string; stLtsgSttsNm?: string; stPdsgSttsNm?: string; stStsgSttsNm?: string; stUtsgSttsNm?: string;
  wtBssgRmndCs?: string | number; wtBcsgRmndCs?: string | number; wtLtsgRmndCs?: string | number; wtPdsgRmndCs?: string | number; wtStsgRmndCs?: string | number; wtUtsgRmndCs?: string | number;
  wtBssgSttsNm?: string; wtBcsgSttsNm?: string; wtLtsgSttsNm?: string; wtPdsgSttsNm?: string; wtStsgSttsNm?: string; wtUtsgSttsNm?: string;
  neBssgRmndCs?: string | number; neBcsgRmndCs?: string | number; neLtsgRmndCs?: string | number; nePdsgRmndCs?: string | number; neStsgRmndCs?: string | number; neUtsgRmndCs?: string | number;
  neBssgSttsNm?: string; neBcsgSttsNm?: string; neLtsgSttsNm?: string; nePdsgSttsNm?: string; neStsgSttsNm?: string; neUtsgSttsNm?: string;
  seBssgRmndCs?: string | number; seBcsgRmndCs?: string | number; seLtsgRmndCs?: string | number; sePdsgRmndCs?: string | number; seStsgRmndCs?: string | number; seUtsgRmndCs?: string | number;
  seBssgSttsNm?: string; seBcsgSttsNm?: string; seLtsgSttsNm?: string; sePdsgSttsNm?: string; seStsgSttsNm?: string; seUtsgSttsNm?: string;
  swBssgRmndCs?: string | number; swBcsgRmndCs?: string | number; swLtsgRmndCs?: string | number; swPdsgRmndCs?: string | number; swStsgRmndCs?: string | number; swUtsgRmndCs?: string | number;
  swBssgSttsNm?: string; swBcsgSttsNm?: string; swLtsgSttsNm?: string; swPdsgSttsNm?: string; swStsgSttsNm?: string; swUtsgSttsNm?: string;
  nwBssgRmndCs?: string | number; nwBcsgRmndCs?: string | number; nwLtsgRmndCs?: string | number; nwPdsgRmndCs?: string | number; nwStsgRmndCs?: string | number; nwUtsgRmndCs?: string | number;
  nwBssgSttsNm?: string; nwBcsgSttsNm?: string; nwLtsgSttsNm?: string; nwPdsgSttsNm?: string; nwStsgSttsNm?: string; nwUtsgSttsNm?: string;
  crsrdDirNm?: string; crsrdDrctNm?: string; dirNm?: string; drctNm?: string; direction?: string; laneDirNm?: string; moveDirNm?: string; movementNm?: string; turnDirNm?: string; signalStateNm?: string; sigStatNm?: string; sigSttNm?: string; phaseNm?: string; tlSttNm?: string; remainSec?: string | number; remainTime?: string | number; redTime?: string | number; yellowTime?: string | number; greenTime?: string | number; cycleTime?: string | number; cycleSec?: string | number; totCyc?: string | number; regDt?: string; totDt?: string;
}

interface KlidResponseEnvelope { response?: { header?: ApiHeader; body?: ApiBody }; header?: ApiHeader; body?: ApiBody; }
interface ApiHeader { resultCode?: string; resultMsg?: string; }
interface ApiBody { totalCount?: number | string; pageNo?: number | string; numOfRows?: number | string; items?: { item?: (KlidIntersectionRecord | KlidSignalRecord) | (KlidIntersectionRecord | KlidSignalRecord)[] }; }
export interface TrafficApiPageResult { totalCount: number; items: Array<KlidIntersectionRecord | KlidSignalRecord>; }
export interface TrafficApiClientOptions { serviceKey: string; stdgCd: string; pageNo?: number; numOfRows?: number; basePath?: string; }

function logDev(message: string, ...args: unknown[]): void { if (import.meta.env.DEV) console.log(`[SignalNow] ${message}`, ...args); }
function toArray<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
async function parseJsonResponse(response: Response): Promise<KlidResponseEnvelope> { const text = await response.text(); if (!text.trim()) throw new Error("Empty response from traffic API."); return JSON.parse(text) as KlidResponseEnvelope; }
function normalizeServiceKey(serviceKey: string): string { const trimmed = serviceKey.trim(); try { return decodeURIComponent(trimmed); } catch { return trimmed; } }

async function fetchTrafficApiPage({ path, serviceKey, stdgCd, pageNo = 1, numOfRows = 100, basePath = TRAFFIC_API_BASE_PATH }: TrafficApiClientOptions & { path: string }): Promise<TrafficApiPageResult> {
  const normalizedServiceKey = normalizeServiceKey(serviceKey);
  const params = new URLSearchParams({ pageNo: String(pageNo), numOfRows: String(numOfRows), type: "JSON", stdgCd, serviceKey: normalizedServiceKey });
  const directUrl = `${TRAFFIC_API_DIRECT_BASE_URL}${path}?${params.toString()}`;
  const proxyUrl = new URL(`${basePath}${path}`, window.location.origin);
  proxyUrl.search = params.toString();
  logDev("서울 교차로 API 요청", path, { pageNo, numOfRows, stdgCd });

  let response: Response | null = null;
  let directError: unknown = null;
  try {
    response = await fetch(directUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Direct traffic API request failed with status ${response.status}.`);
  } catch (error) {
    directError = error;
    response = null;
  }
  if (!response) {
    try {
      response = await fetch(proxyUrl.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Proxy traffic API request failed with status ${response.status}.`);
    } catch (proxyError) {
      throw new Error(`Traffic API request failed. Direct: ${String(directError)}; Proxy: ${String(proxyError)}`);
    }
  }

  const payload = await parseJsonResponse(response);
  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;
  const itemCount = toArray(body?.items?.item).length;
  logDev("서울 교차로 API 응답", path, { resultCode: header?.resultCode ?? null, resultMsg: header?.resultMsg ?? null, totalCount: body?.totalCount ?? 0, itemCount });
  if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") {
    if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") return { totalCount: 0, items: [] };
    throw new Error(header.resultMsg ?? "Traffic API returned an error.");
  }
  return { totalCount: Number(body?.totalCount ?? 0), items: toArray(body?.items?.item) };
}

export async function fetchTrafficMapInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult> { return fetchTrafficApiPage({ ...options, path: "/crsrd_map_info" }); }
export async function fetchTrafficSignalInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult> { return fetchTrafficApiPage({ ...options, path: "/tl_drct_info" }); }
