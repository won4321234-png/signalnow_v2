import { TRAFFIC_API_BASE_PATH, TRAFFIC_API_DIRECT_BASE_URL, type KlidIntersectionRecord, type KlidSignalRecord } from "@/services/trafficApi";

interface ApiBody { totalCount?: number | string; items?: { item?: (KlidIntersectionRecord | KlidSignalRecord) | (KlidIntersectionRecord | KlidSignalRecord)[] } }
interface ApiEnvelope { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: ApiBody }; header?: { resultCode?: string; resultMsg?: string }; body?: ApiBody }
export interface SafeTrafficPage { totalCount: number; items: Array<KlidIntersectionRecord | KlidSignalRecord> }

function asArray<T>(value: T | T[] | undefined): T[] { return !value ? [] : Array.isArray(value) ? value : [value]; }
function normalizeKey(key: string): string { const trimmed = key.trim(); try { return decodeURIComponent(trimmed); } catch { return trimmed; } }

export async function fetchTrafficPageSafe(options: { path: "/crsrd_map_info" | "/tl_drct_info"; serviceKey: string; stdgCd: string; pageNo: number; numOfRows: number }): Promise<SafeTrafficPage> {
  const params = new URLSearchParams();
  params.set("pageNo", String(options.pageNo));
  params.set("numOfRows", String(options.numOfRows));
  params.set("type", "JSON");
  params.set("stdgCd", options.stdgCd);
  params.set("serviceKey", normalizeKey(options.serviceKey));

  const directUrl = `${TRAFFIC_API_DIRECT_BASE_URL}${options.path}?${params.toString()}`;
  const proxyUrl = new URL(`${TRAFFIC_API_BASE_PATH}${options.path}`, window.location.origin);
  proxyUrl.search = params.toString();

  const request = async (url: string) => {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Traffic API request failed with status ${response.status}.`);
    return response;
  };

  let response: Response;
  try {
    response = await request(directUrl);
  } catch (directError) {
    console.warn("[SignalNow] direct traffic API failed; trying Vite proxy", directError);
    response = await request(proxyUrl.toString());
  }

  const text = await response.text();
  if (!text.trim()) throw new Error("Empty response from traffic API.");
  const payload = JSON.parse(text) as ApiEnvelope;
  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;
  if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") {
    const message = header.resultMsg ?? "Traffic API returned an error.";
    if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") return { totalCount: 0, items: [] };
    throw new Error(message);
  }

  return {
    totalCount: Number(body?.totalCount ?? 0),
    items: asArray(body?.items?.item),
  };
}
