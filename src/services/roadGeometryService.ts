export type RoadGeometryPoint = { lat: number; lng: number };
export type RoadSegment = {
  p1: RoadGeometryPoint;
  p2: RoadGeometryPoint;
  bearing: number;
  reverseBearing: number;
  distanceMeters: number;
  lengthMeters: number;
  outwardBearing: number;
};
export type RoadAxis = { bearing: number; reverseBearing: number; segmentCount: number; confidence: number };
export type RoadApproach = { bearing: number; axisBearing: number; distanceMeters: number; highway?: string; name?: string; wayId: string; confidence: number };
export type IntersectionRoadGeometry = {
  crsrdId: string;
  axes: RoadAxis[];
  approaches: RoadApproach[];
  directionMatches: Partial<Record<string, RoadApproach>>;
  confidence: number;
  provider: "osm-overpass";
};

type OverpassWay = { id?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> };
type OverpassResponse = { elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> };

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;
const ENDPOINT_TIMEOUT_MS = 3500;
const TOTAL_TIMEOUT_MS = 9000;
const RADIUS_METERS = 70;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE = new Map<string, { expiresAt: number; value: IntersectionRoadGeometry | null }>();
const PENDING = new Map<string, Promise<IntersectionRoadGeometry | null>>();
const COMPASS: Array<[string, number]> = [["North", 0], ["NorthEast", 45], ["East", 90], ["SouthEast", 135], ["South", 180], ["SouthWest", 225], ["West", 270], ["NorthWest", 315]];

function normalizeAngle(value: number): number { return ((value % 360) + 360) % 360; }
function angularDistance(a: number, b: number): number { const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)); return Math.min(d, 360 - d); }
function toRad(value: number): number { return value * Math.PI / 180; }
function toDeg(value: number): number { return value * 180 / Math.PI; }
function haversine(a: RoadGeometryPoint, b: RoadGeometryPoint): number { const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng); const lat1 = toRad(a.lat); const lat2 = toRad(b.lat); const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2; return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))); }
function bearing(a: RoadGeometryPoint, b: RoadGeometryPoint): number { const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat)); const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng)); return normalizeAngle(toDeg(Math.atan2(y, x))); }
function axisAngle(angle: number): number { return normalizeAngle(angle >= 180 ? angle - 180 : angle); }
function circularMean(angles: number[]): number { if (!angles.length) return 0; const sin = angles.reduce((sum, a) => sum + Math.sin(toRad(a)), 0); const cos = angles.reduce((sum, a) => sum + Math.cos(toRad(a)), 0); return normalizeAngle(toDeg(Math.atan2(sin, cos))); }
function cacheKey(crsrdId: string, lat: number, lng: number): string { return `${crsrdId}:${lat.toFixed(5)}:${lng.toFixed(5)}:osm-v2`; }
function escapeOverpassNumber(value: number): string { if (!Number.isFinite(value)) throw new Error("Invalid coordinate."); return value.toFixed(6); }

async function fetchWithTimeout(url: string, query: string, deadlineAt: number, externalSignal?: AbortSignal): Promise<OverpassResponse> {
  const controller = new AbortController();
  const remainingMs = Math.max(1, deadlineAt - Date.now());
  const timeoutMs = Math.min(ENDPOINT_TIMEOUT_MS, remainingMs);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" }, body: new URLSearchParams({ data: query }).toString(), signal: controller.signal });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) throw new Error("Invalid Overpass content type.");
    const payload = await response.json() as OverpassResponse;
    if (!payload || !Array.isArray(payload.elements)) throw new Error("Invalid Overpass response.");
    return payload;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function candidateWeight(tags: Record<string, string>): number {
  const highway = tags.highway ?? "";
  let weight = 1;
  if (["service", "track", "path", "footway", "cycleway", "steps", "pedestrian"].includes(highway)) weight *= 0.55;
  if (highway.endsWith("_link") || highway === "motorway_link" || highway === "trunk_link") weight *= 0.72;
  if (tags.bridge === "yes" || tags.tunnel === "yes") weight *= 0.65;
  if (tags.layer && tags.layer !== "0") weight *= 0.7;
  if (tags.junction === "roundabout") weight *= 0.9;
  return weight;
}

function nearestSegment(center: RoadGeometryPoint, way: OverpassWay): RoadSegment | null {
  const geometry = way.geometry ?? [];
  let best: RoadSegment | null = null;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const p1 = { lat: geometry[i].lat, lng: geometry[i].lon };
    const p2 = { lat: geometry[i + 1].lat, lng: geometry[i + 1].lon };
    const d1 = haversine(center, p1);
    const d2 = haversine(center, p2);
    const distanceMeters = Math.min(d1, d2);
    const lengthMeters = haversine(p1, p2);
    if (lengthMeters < 1 || distanceMeters > RADIUS_METERS) continue;
    const outwardPoint = d1 >= d2 ? p1 : p2;
    const outwardBearing = bearing(center, outwardPoint);
    const segmentBearing = bearing(p1, p2);
    const candidate: RoadSegment = { p1, p2, bearing: segmentBearing, reverseBearing: normalizeAngle(segmentBearing + 180), distanceMeters, lengthMeters, outwardBearing };
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
  }
  return best;
}

function clusterAxes(segments: Array<RoadSegment & { weight: number }>): RoadAxis[] {
  const clusters: Array<{ angles: number[]; weights: number[] }> = [];
  for (const segment of segments) {
    const angle = axisAngle(segment.bearing);
    let target = clusters.find((cluster) => angularDistance(angle, circularMean(cluster.angles)) <= 12);
    if (!target) { target = { angles: [], weights: [] }; clusters.push(target); }
    target.angles.push(angle);
    target.weights.push(segment.weight);
  }
  return clusters.map((cluster) => {
    const representative = circularMean(cluster.angles);
    const confidence = Math.min(1, 0.45 + cluster.angles.length * 0.12);
    return { bearing: representative, reverseBearing: normalizeAngle(representative + 180), segmentCount: cluster.angles.length, confidence };
  }).sort((a, b) => b.segmentCount - a.segmentCount);
}

function buildAnalysis(crsrdId: string, center: RoadGeometryPoint, ways: OverpassWay[]): IntersectionRoadGeometry | null {
  const candidates: Array<RoadSegment & { way: OverpassWay; weight: number }> = [];
  for (const way of ways) {
    if (!way.id || !way.geometry || way.geometry.length < 2) continue;
    const segment = nearestSegment(center, way);
    if (!segment) continue;
    candidates.push({ ...segment, way, weight: candidateWeight(way.tags ?? {}) });
  }
  if (!candidates.length) return null;
  const axes = clusterAxes(candidates);
  const approaches: RoadApproach[] = candidates.map((candidate) => {
    const axis = axes.reduce((best, item) => angularDistance(axisAngle(candidate.bearing), axisAngle(item.bearing)) < angularDistance(axisAngle(candidate.bearing), axisAngle(best.bearing)) ? item : best, axes[0]);
    const distanceScore = Math.max(0, 1 - candidate.distanceMeters / RADIUS_METERS);
    const confidence = Math.min(1, distanceScore * 0.65 + candidate.weight * 0.35);
    return { bearing: candidate.outwardBearing, axisBearing: axis.bearing, distanceMeters: candidate.distanceMeters, highway: candidate.way.tags?.highway, name: candidate.way.tags?.name, wayId: String(candidate.way.id), confidence };
  }).sort((a, b) => b.confidence - a.confidence);
  const directionMatches: Partial<Record<string, RoadApproach>> = {};
  for (const [direction, targetBearing] of COMPASS) {
    const matching = approaches.filter((approach) => angularDistance(approach.bearing, targetBearing) <= 55).sort((a, b) => {
      const aScore = angularDistance(a.bearing, targetBearing) + (1 - a.confidence) * 20;
      const bScore = angularDistance(b.bearing, targetBearing) + (1 - b.confidence) * 20;
      return aScore - bScore;
    })[0];
    if (matching) directionMatches[direction] = matching;
  }
  const matched = Object.values(directionMatches).filter(Boolean) as RoadApproach[];
  const uniqueWayCount = new Set(matched.map((item) => item.wayId)).size;
  const directionCoverage = Math.min(1, matched.length / Math.max(2, Math.min(8, axes.length * 2)));
  const confidence = Math.min(1, matched.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, matched.length) * 0.7 + directionCoverage * 0.3 + (uniqueWayCount > 1 ? 0.05 : 0));
  return { crsrdId, axes, approaches, directionMatches, confidence, provider: "osm-overpass" };
}

async function queryOverpass(lat: number, lng: number, externalSignal?: AbortSignal): Promise<OverpassWay[]> {
  const query = `[out:json][timeout:20];way(around:${RADIUS_METERS},${escapeOverpassNumber(lat)},${escapeOverpassNumber(lng)})[highway];out tags geom;`;
  const deadlineAt = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    if (externalSignal?.aborted || Date.now() >= deadlineAt) break;
    try {
      const payload = await fetchWithTimeout(endpoint, query, deadlineAt, externalSignal);
      return (payload.elements ?? []).filter((item) => item.type === "way").map((item) => ({ id: item.id, tags: item.tags, geometry: item.geometry }));
    } catch (error) {
      lastError = error;
      if (externalSignal?.aborted) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All Overpass endpoints failed.");
}

export async function getRoadGeometry(crsrdId: string, latitude: number, longitude: number, options?: { signal?: AbortSignal }): Promise<IntersectionRoadGeometry | null> {
  if (!crsrdId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const key = cacheKey(crsrdId, latitude, longitude);
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = PENDING.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const ways = await queryOverpass(latitude, longitude, options?.signal);
      const result = buildAnalysis(crsrdId, { lat: latitude, lng: longitude }, ways);
      CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
      return result;
    } catch {
      if (options?.signal?.aborted) return null;
      CACHE.set(key, { expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null });
      return null;
    }
  })();
  PENDING.set(key, promise);
  try { return await promise; } finally { PENDING.delete(key); }
}

export function clearRoadGeometryCache(): void { CACHE.clear(); PENDING.clear(); }
