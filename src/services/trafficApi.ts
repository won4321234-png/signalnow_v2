export const TRAFFIC_API_BASE_PATH = "/api/traffic";
export const TRAFFIC_API_DIRECT_BASE_URL = "https://apis.data.go.kr/B551982/rti";

export interface KlidIntersectionRecord { stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string; mapCtptIntLat?: string | number; mapCtptIntLot?: string | number; crsrdEngNm?: string; laneWdth?: string; lmtSpdTypeNm?: string; lmtSpd?: string; regDt?: string; totDt?: string; }
export interface KlidSignalRecord {
  stdgCd?: string; lclgvNm?: string; crsrdId?: string; crsrdNm?: string; crsrdEngNm?: string;
  [key: string]: string | number | undefined;
}
interface KlidResponseEnvelope { response?: { header?: ApiHeader; body?: ApiBody }; header?: ApiHeader; body?: ApiBody; }
interface ApiHeader { resultCode?: string; resultMsg?: string; }
interface ApiBody { totalCount?: number | string; pageNo?: number | string; numOfRows?: number | string; items?: { item?: Record<string, unknown> | Record<string, unknown>[] }; }
export interface TrafficApiDebugMeta { apiStatus: string; via: "direct" | "proxy"; responseReceived: boolean; itemCount: number; sampleIds: string[]; }
export interface TrafficApiPageResult<T> { totalCount: number; items: T[]; debug: TrafficApiDebugMeta; }
export interface TrafficApiClientOptions { serviceKey: string; stdgCd: string; pageNo?: number; numOfRows?: number; crsrdId?: string; basePath?: string; }

const TRAFFIC_API_TIMEOUT_MS = 8000;
function debugEnabled() { return new URLSearchParams(window.location.search).get("debug") === "1"; }
function debugLog(message: string, data: Record<string, unknown>) { if (debugEnabled()) console.log(`[SignalNow debug] ${message}`, data); }
function logDev(message: string, ...args: unknown[]): void { if (import.meta.env.DEV) console.log(`[SignalNow] ${message}`, ...args); }
function toArray<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
async function parseJsonResponse(response: Response): Promise<KlidResponseEnvelope> { const text = await response.text(); if (!text.trim()) throw new Error("Empty response from traffic API."); return JSON.parse(text) as KlidResponseEnvelope; }
function normalizeServiceKey(serviceKey: string): string { const trimmed = serviceKey.trim(); try { return decodeURIComponent(trimmed); } catch { return trimmed; } }

export class TrafficApiRequestError extends Error {
  public readonly debug: TrafficApiDebugMeta;

  constructor(message: string, debug: TrafficApiDebugMeta) {
    super(message);
    this.name = "TrafficApiRequestError";
    this.debug = debug;
  }
}

async function fetchTrafficApiPage<T extends KlidIntersectionRecord | KlidSignalRecord>(options: TrafficApiClientOptions & { path: string }): Promise<TrafficApiPageResult<T>> {
  const { path, serviceKey, stdgCd, pageNo = 1, numOfRows = 100, basePath = TRAFFIC_API_BASE_PATH } = options;
  const normalizedServiceKey = normalizeServiceKey(serviceKey);
  const directParams = new URLSearchParams(); directParams.set("pageNo", String(pageNo)); directParams.set("numOfRows", String(numOfRows)); directParams.set("type", "JSON"); directParams.set("stdgCd", stdgCd); if (options.crsrdId) directParams.set("crsrdId", options.crsrdId); directParams.set("serviceKey", normalizedServiceKey);
  const proxyParams = new URLSearchParams(directParams);
  const directUrl = `${TRAFFIC_API_DIRECT_BASE_URL}${path}?${directParams.toString()}`;
  const proxyUrl = new URL(`${basePath}${path}`, window.location.origin); proxyUrl.search = proxyParams.toString();
  logDev("서울 교차로 API 요청", path, { pageNo, numOfRows, stdgCd });
  debugLog("tl_drct_info request started", { endpoint: path, pageNo, numOfRows, stdgCd: path === "/tl_drct_info" ? undefined : stdgCd });

  const tryFetchAndParse = async (url: string, via: "direct" | "proxy") => {
    const controller = new AbortController();
    let timeoutId: number | undefined;
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new DOMException("Traffic API request timed out.", "TimeoutError"));
      }, TRAFFIC_API_TIMEOUT_MS);
    });
    const requestPromise = (async () => {
      debugLog("request pending", { endpoint: path, via, timeoutMs: TRAFFIC_API_TIMEOUT_MS });
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      debugLog("response received", { endpoint: path, via, status: response.status, ok: response.ok });
      if (!response.ok) return { response, payload: null as KlidResponseEnvelope | null };
      debugLog("parse-start", { endpoint: path, status: response.status, via });
      const payload = await parseJsonResponse(response);
      debugLog("parse-complete", { endpoint: path, status: response.status, via });
      return { response, payload };
    })();
    try {
      return await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      debugLog(timedOut || (error instanceof DOMException && error.name === "AbortError") ? "FAILURE: request timeout" : "FAILURE: network/parse request", { endpoint: path, via, timeout: timedOut });
      throw error;
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  };

  let result: { response: Response; payload: KlidResponseEnvelope | null };
  let via: "direct" | "proxy" = "direct";
  // When the browser has no public key, use the server proxy first. The
  // "server-proxy" sentinel is not a real API credential and must never be
  // sent to the upstream provider as though it were one.
  const proxyFirst = !normalizedServiceKey || normalizedServiceKey === "server-proxy";
  let directFailure: unknown;
  if (!proxyFirst) {
    try {
      result = await tryFetchAndParse(directUrl, "direct");
      // CORS-free HTTP errors (401/403/5xx) must also trigger the proxy.
      // Previously only network exceptions did, causing valid server-side
      // credentials to be bypassed whenever the direct endpoint returned HTTP.
      if (result.response.ok) {
        via = "direct";
      } else {
        directFailure = new Error(`Direct traffic API returned HTTP ${result.response.status}`);
        via = "proxy";
        result = await tryFetchAndParse(proxyUrl.toString(), "proxy");
      }
    } catch (error) {
      directFailure = error;
      via = "proxy";
      debugLog("proxy fallback start", { endpoint: path, reason: error instanceof Error ? error.message : String(error) });
      try {
        result = await tryFetchAndParse(proxyUrl.toString(), "proxy");
      } catch {
        throw new TrafficApiRequestError("Traffic API direct and proxy requests failed.", { apiStatus: "network-error", via: "proxy", responseReceived: false, itemCount: 0, sampleIds: [] });
      }
    }
  } else {
    via = "proxy";
    debugLog("proxy-first request", { endpoint: path, reason: "server-side credential required" });
    try {
      result = await tryFetchAndParse(proxyUrl.toString(), "proxy");
    } catch {
      throw new TrafficApiRequestError("Traffic API proxy request failed.", { apiStatus: "network-error", via: "proxy", responseReceived: false, itemCount: 0, sampleIds: [] });
    }
  }

  const { response, payload } = result;
  if (!response.ok) {
    const debug: TrafficApiDebugMeta = { apiStatus: String(response.status), via, responseReceived: true, itemCount: 0, sampleIds: [] };
    debugLog("FAILURE: API request", { endpoint: path, status: response.status, ok: response.ok, via });
    throw new TrafficApiRequestError(`Traffic API request failed with status ${response.status}.`, debug);
  }
  if (!payload) {
    throw new TrafficApiRequestError("Traffic API response payload is missing.", { apiStatus: "parse-error", via, responseReceived: true, itemCount: 0, sampleIds: [] });
  }

  const envelope = payload.response ?? payload; const header = envelope.header; const body = envelope.body; const items = toArray(body?.items?.item); const itemCount = items.length;
  const sampleIds = items.slice(0, 5).map((item) => String((item as Record<string, unknown>).crsrdId ?? "").trim()).filter(Boolean);
  const debug: TrafficApiDebugMeta = { apiStatus: String(response.status), via, responseReceived: true, itemCount, sampleIds };
  debugLog("tl_drct_info response", { endpoint: path, status: response.status, ok: response.ok, via, hasResponse: Boolean(payload.response), envelopeKeys: Object.keys(envelope).slice(0, 8), hasBody: Boolean(body), hasItems: Boolean(body?.items), itemType: Array.isArray(body?.items?.item) ? "array" : body?.items?.item ? "object" : "missing", itemCount, sampleIds });
  logDev("서울 교차로 API 응답", path, { resultCode: header?.resultCode ?? null, resultMsg: header?.resultMsg ?? null, totalCount: body?.totalCount ?? 0, itemCount });
  if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") { const message = header.resultMsg ?? "Traffic API returned an error."; if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") return { totalCount: 0, items: [], debug }; throw new TrafficApiRequestError(message, { ...debug, apiStatus: `api-error:${header.resultCode}` }); }
  return { totalCount: Number(body?.totalCount ?? 0), items: items as T[], debug };
}

export async function fetchTrafficMapInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult<KlidIntersectionRecord>> { return fetchTrafficApiPage<KlidIntersectionRecord>({ ...options, path: "/crsrd_map_info" }); }
export async function fetchTrafficSignalInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult<KlidSignalRecord>> { return fetchTrafficApiPage<KlidSignalRecord>({ ...options, path: "/tl_drct_info" }); }