type Request = { method?: string; query: Record<string, unknown>; body?: unknown };
type Response = { status: (code: number) => Response; setHeader: (name: string, value: string) => Response; json: (body: unknown) => void };

type IntersectionRecord = { crsrdId?: string; crsrdNm?: string; mapCtptIntLat?: string | number; mapCtptIntLot?: string | number };

const API_BASE_URL = "https://apis.data.go.kr/B551982/rti/crsrd_map_info";
const MAX_SEARCH_DISTANCE_METERS = 3000;
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const DATA_CACHE_TTL_MS = 5 * 60 * 1000;
const intersectionCache = new Map<string, { expiresAt: number; items: IntersectionRecord[] }>();
const inFlightCache = new Map<string, Promise<IntersectionRecord[]>>();

function jsonResponse(res: Response, status: number, body: unknown): void { res.status(status).setHeader("Cache-Control", "no-store, max-age=0").json(body); }
function numberParam(value: unknown): number | null { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function normalizeServiceKey(value: string): string { try { return decodeURIComponent(value.trim()); } catch { return value.trim(); } }
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number { const earthRadius = 6371000; const toRad = (value: number) => (value * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2; return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }

async function fetchPage(serviceKey: string, stdgCd: string, pageNo: number): Promise<{ totalCount: number; items: IntersectionRecord[] }> {
  const params = new URLSearchParams({ pageNo: String(pageNo), numOfRows: String(PAGE_SIZE), type: "JSON", stdgCd, serviceKey: normalizeServiceKey(serviceKey) });
  const response = await fetch(`${API_BASE_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Traffic API ${response.status}`);
  const payload = await response.json() as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { totalCount?: number | string; items?: { item?: IntersectionRecord | IntersectionRecord[] } } } };
  const envelope = payload.response ?? {}; const header = envelope.header; const body = envelope.body;
  if (header?.resultCode && header.resultCode !== "K0" && header.resultCode !== "00") { if (header.resultCode === "K3" || header.resultMsg === "NODATA_ERROR") return { totalCount: 0, items: [] }; throw new Error(header.resultMsg ?? `Traffic API error ${header.resultCode}`); }
  const rawItems = body?.items?.item; const items = rawItems ? (Array.isArray(rawItems) ? rawItems : [rawItems]) : [];
  return { totalCount: Number(body?.totalCount ?? 0), items };
}

async function getIntersections(serviceKey: string, stdgCd: string): Promise<IntersectionRecord[]> {
  const cached = intersectionCache.get(stdgCd);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const existing = inFlightCache.get(stdgCd);
  if (existing) return existing;
  const request = (async () => {
    const all: IntersectionRecord[] = [];
    let totalPages = 1;
    for (let pageNo = 1; pageNo <= Math.min(totalPages, MAX_PAGES); pageNo += 1) {
      const page = await fetchPage(serviceKey, stdgCd, pageNo);
      if (page.totalCount > 0) totalPages = Math.ceil(page.totalCount / PAGE_SIZE);
      all.push(...page.items);
      if (page.items.length < PAGE_SIZE && totalPages <= pageNo) break;
    }
    intersectionCache.set(stdgCd, { expiresAt: Date.now() + DATA_CACHE_TTL_MS, items: all });
    return all;
  })();
  inFlightCache.set(stdgCd, request);
  try { return await request; } finally { inFlightCache.delete(stdgCd); }
}

export default async function handler(req: Request, res: Response) {
  if (req.method && req.method !== "GET") { res.setHeader("Allow", "GET"); return jsonResponse(res, 405, { error: "Method not allowed" }); }
  const lat = numberParam(req.query.lat); const lng = numberParam(req.query.lng); const stdgCd = typeof req.query.stdgCd === "string" ? req.query.stdgCd.trim() : "";
  const serviceKey = process.env.TRAFFIC_API_SERVICE_KEY || process.env.TRAFFIC_API_KEY || process.env.VITE_TRAFFIC_API_KEY || process.env.VITE_DATA_API_SERVICE_KEY || "";
  if (lat === null || lat < -90 || lat > 90 || lng === null || lng < -180 || lng > 180) return jsonResponse(res, 400, { error: "Valid lat and lng are required" });
  if (!stdgCd) return jsonResponse(res, 400, { error: "stdgCd is required" });
  if (!serviceKey.trim()) return jsonResponse(res, 500, { error: "Traffic API service key is not configured" });
  try {
    const items = await getIntersections(serviceKey, stdgCd);
    let best: { intersection: IntersectionRecord; distanceMeters: number } | null = null;
    for (const item of items) {
      const itemLat = numberParam(item.mapCtptIntLat); const itemLng = numberParam(item.mapCtptIntLot); const id = String(item.crsrdId ?? "").trim();
      if (!id || itemLat === null || itemLng === null) continue;
      const distance = distanceMeters(lat, lng, itemLat, itemLng);
      if (!best || distance < best.distanceMeters) best = { intersection: item, distanceMeters: distance };
    }
    if (!best || best.distanceMeters > MAX_SEARCH_DISTANCE_METERS) return jsonResponse(res, 200, { found: false, maxDistanceMeters: MAX_SEARCH_DISTANCE_METERS });
    return jsonResponse(res, 200, { found: true, distanceMeters: Math.round(best.distanceMeters), intersection: { crsrdId: String(best.intersection.crsrdId).trim(), crsrdNm: String(best.intersection.crsrdNm ?? "").trim(), lat: numberParam(best.intersection.mapCtptIntLat), lng: numberParam(best.intersection.mapCtptIntLot) } });
  } catch (error) { console.error("[location/nearest] failed", error instanceof Error ? error.message : String(error)); return jsonResponse(res, 502, { error: "Unable to find nearest intersection" }); }
}
