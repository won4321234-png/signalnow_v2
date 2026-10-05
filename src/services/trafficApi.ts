export const TRAFFIC_API_BASE_PATH = "/api/traffic";

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
export interface TrafficApiClientOptions { serviceKey: string; stdgCd: string; pageNo?: number; numOfRows?: number; basePath?: string; }

const TRAFFIC_API_TIMEOUT_MS = 9000;
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

async function fetchTrafficApiPage<T extends KlidIntersectionRecord | KlidSignalRecord>({ path, stdgCd, pageNo = 1, numOfRows = 100, basePath = TRAFFIC_API_BASE_PATH }: TrafficApiClientOptions & { path: string }): Promise<TrafficApiPageResult<T>> {
  const proxyParams = new URLSearchParams();
  proxyParams.set("pageNo", String(pageNo));
  proxyParams.set("numOfRows", String(numOfRows));
  proxyParams.set("type", "JSON");
  proxyParams.set("stdgCd", stdgCd);
  if (crsrdId?.trim()) proxyParams.set("crsrdId", crsrdId.trim());

  const proxyUrl = new URL(`${basePath}${path}`, window.location.origin);
  proxyUrl.search = proxyParams.toString();

  logDev("Traffic API request", path, { pageNo, numOfRows, stdgCd });

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TRAFFIC_API_TIMEOUT_MS);
  try {
    const response = await fetch(proxyUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const bodyText = await response.text();

    if (!response.ok) {
      let upstreamMessage = "";
      try {
        const errorPayload = JSON.parse(bodyText) as Record<string, unknown>;
        upstreamMessage = typeof errorPayload.error === "string" ? errorPayload.error : "";
      } catch {
        // Ignore non-JSON error bodies.
      }
      throw new TrafficApiRequestError(
        upstreamMessage || `Traffic API request failed with status ${response.status}.`,
        {
          apiStatus: String(response.status),
          via: "proxy",
          responseReceived: true,
          itemCount: 0,
          sampleIds: [],
        },
      );
    }

    let payload: KlidResponseEnvelope;
    try {
      payload = JSON.parse(bodyText) as KlidResponseEnvelope;
    } catch {
      throw new TrafficApiRequestError("Traffic API returned invalid JSON.", {
        apiStatus: "parse-error",
        via: "proxy",
        responseReceived: true,
        itemCount: 0,
        sampleIds: [],
      });
    }

    const envelope = payload.response ?? payload;
    const header = envelope.header;
    const body = envelope.body;
    const items = toArray(body?.items?.item);
    const itemCount = items.length;
    const sampleIds = items
      .slice(0, 5)
      .map((item) => String((item as Record<string, unknown>).crsrdId ?? "").trim())
      .filter(Boolean);
    const debug: TrafficApiDebugMeta = {
      apiStatus: String(response.status),
      via: "proxy",
      responseReceived: true,
      itemCount,
      sampleIds,
    };

    logDev("Traffic API response", path, {
      resultCode: header?.resultCode ?? null,
      resultMsg: header?.resultMsg ?? null,
      totalCount: body?.totalCount ?? 0,
      itemCount,
    });

    if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") {
      if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") {
        return { totalCount: 0, items: [], debug };
      }
      throw new TrafficApiRequestError(header.resultMsg ?? "Traffic API returned an error.", {
        ...debug,
        apiStatus: `api-error:${header.resultCode}`,
      });
    }

    return {
      totalCount: Number(body?.totalCount ?? 0),
      items: items as T[],
      debug,
    };
  } catch (error) {
    if (error instanceof TrafficApiRequestError) throw error;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new TrafficApiRequestError(
      timedOut ? "Traffic API request timed out." : "Traffic API request failed.",
      {
        apiStatus: timedOut ? "timeout" : "network-error",
        via: "proxy",
        responseReceived: false,
        itemCount: 0,
        sampleIds: [],
      },
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchTrafficMapInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult<KlidIntersectionRecord>> { return fetchTrafficApiPage<KlidIntersectionRecord>({ ...options, path: "/crsrd_map_info" }); }
export async function fetchTrafficSignalInfo(options: TrafficApiClientOptions): Promise<TrafficApiPageResult<KlidSignalRecord>> { return fetchTrafficApiPage<KlidSignalRecord>({ ...options, path: "/tl_drct_info" }); }