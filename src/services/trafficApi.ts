export const TRAFFIC_API_BASE_PATH = "/api/traffic";
export const TRAFFIC_API_DIRECT_BASE_URL = "https://apis.data.go.kr/B551982/rti";

export interface KlidIntersectionRecord { stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string; mapCtptIntLat?: string | number; mapCtptIntLot?: string | number; crsrdEngNm?: string; laneWdth?: string; lmtSpdTypeNm?: string; lmtSpd?: string; regDt?: string; totDt?: string; }
export interface KlidSignalRecord {
  stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string; crsrdEngNm?: string;
  [key: string]: string | number | undefined;
}
interface KlidResponseEnvelope { response?: { header?: ApiHeader; body?: ApiBody }; header?: ApiHeader; body?: ApiBody; }
interface ApiHeader { resultCode?: string; resultMsg?: string; }
interface ApiBody { totalCount?: number | string; pageNo?: number | string; numOfRows?: number | string; items?: { item?: (KlidIntersectionRecord | KlidSignalRecord) | (KlidIntersectionRecord | KlidSignalRecord)[] }; }
export interface TrafficApiPageResult { totalCount: number; items: Array<KlidIntersectionRecord | KlidSignalRecord>; }
export interface TrafficApiClientOptions { serviceKey: string; stdgCd: string; pageNo?: number; numOfRows?: number; basePath?: string; }

function debugEnabled() { return new URLSearchParams(window.location.search).get("debug") === "1"; }
function debugLog(message: string, data: Record<string, unknown>) { if (debugEnabled()) console.log(`[SignalNow debug] ${message}`, data); }
function logDev(message: string, ...args: unknown[]): void { if (import.meta.env.DEV) console.log(`[SignalNow] ${message}`, ...args); }
function toArray<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
async function parseJsonResponse(response: Response): Promise<KlidResponseEnvelope> { const text = await response.text(); if (!text.trim()) throw new Error("Empty response from traffic API."); return JSON.parse(text) as KlidResponseEnvelope; }
function normalizeServiceKey(serviceKey: string): string { const trimmed = serviceKey.trim(); try { return decodeURIComponent(trimmed); } catch { return trimmed; } }

async function fetchTrafficApiPage({ path, serviceKey, stdgCd, pageNo = 1, numOfRows = 100, basePath = TRAFFIC_API_BASE_PATH }: TrafficApiClientOptions & { path: string }): Promise<TrafficApiPageResult> {
  const normalizedServiceKey = normalizeServiceKey(serviceKey);
  const directParams = new URLSearchParams(); directParams.set("pageNo", String(pageNo)); directParams.set("numOfRows", String(numOfRows)); directParams.set("type", "JSON"); directParams.set("stdgCd", stdgCd); directParams.set("serviceKey", normalizedServiceKey);
  const proxyParams = new URLSearchParams(directParams);
  const directUrl = `${TRAFFIC_API_DIRECT_BASE_URL}${path}?${directParams.toString()}`;
  const proxyUrl = new URL(`${basePath}${path}`, window.location.origin); proxyUrl.search = proxyParams.toString();
  logDev("서울 교차로 API 요청", path, { pageNo, numOfRows, stdgCd });
  debugLog("tl_drct_info request started", { endpoint: path, pageNo, numOfRows, stdgCd: path === "/tl_drct_info" ? undefined : stdgCd });

  const tryFetch = async (url: string) => fetch(url, { headers: { Accept: "application/json" } });
  let response: Response;
  let via: "direct" | "proxy" = "direct";
  try { response = await tryFetch(directUrl); } catch { via = "proxy"; response = await tryFetch(proxyUrl.toString()); }
  if (!response.ok) { debugLog("FAILURE: API request", { endpoint: path, status: response.status, ok: response.ok, via }); throw new Error(`Traffic API request failed with status ${response.status}.`); }

  let payload: KlidResponseEnvelope;
  try { payload = await parseJsonResponse(response); } catch (error) { debugLog("FAILURE: response parsing", { endpoint: path, status: response.status, ok: response.ok, via, error: error instanceof Error ? error.message : "unknown" }); throw error; }
  const envelope = payload.response ?? payload; const header = envelope.header; const body = envelope.body; const itemCount = toArray(body?.items?.item).length;
  debugLog("tl_drct_info response", { endpoint: path, status: response.status, ok: response.ok, via, hasResponse: Boolean(payload.response), envelopeKeys: Object.keys(envelope).slice(0, 8), hasBody: Boolean(body), hasItems: Boolean(body?.items), itemType: Array.isArray(body?.items?.item) ? "array" : body?.items?.item ? "object" : "missing", itemCount });
  logDev("서울 교차로 API 응답", path, { resultCode: header?.resultCode ?? null, resultMsg: header?.resultMsg ?? null, totalCount: body?.totalCount ?? 0, itemCount });
  if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") { const message = header.resultMsg ?? "Traffic API returned an error."; if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") return { totalCount: 0, items: [] }; throw new Error(message); }
  return { totalCount: Number(body?.totalCount ?? 0), items: toArray(body?.items?.item) };
}

export async function fetchTrafficMapInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult> { return fetchTrafficApiPage({ ...options, path: "/crsrd_map_info" }); }
export async function fetchTrafficSignalInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult> { return fetchTrafficApiPage({ ...options, path: "/tl_drct_info" }); }
