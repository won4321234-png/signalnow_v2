export type RoadGeometryPoint = { lat: number; lng: number };
export type RoadSegment = { p1: RoadGeometryPoint; p2: RoadGeometryPoint; bearing: number; reverseBearing: number; distanceMeters: number; lengthMeters: number; outwardBearing: number };
export type RoadAxis = { bearing: number; reverseBearing: number; segmentCount: number; confidence: number };
export type RoadApproach = { bearing: number; axisBearing: number; distanceMeters: number; highway?: string; name?: string; wayId: string; confidence: number };
export type IntersectionRoadGeometry = { crsrdId: string; axes: RoadAxis[]; approaches: RoadApproach[]; directionMatches: Partial<Record<string, RoadApproach>>; confidence: number; provider: "osm-overpass" };

type OverpassWay = { id?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> };
type OverpassResponse = { elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> };
type Candidate = RoadSegment & { way: OverpassWay; weight: number };
type ApproachCluster = { candidates: Candidate[]; bearing: number };

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"] as const;
const ENDPOINT_TIMEOUT_MS = 3500;
const TOTAL_TIMEOUT_MS = 9000;
const RADIUS_METERS = 70;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const AXIS_CLUSTER_DEGREES = 12;
const APPROACH_CLUSTER_DEGREES = 18;
const MAX_MATCH_DISTANCE_DEGREES = 55;
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
function weightedCircularMean(values: Array<{ angle: number; weight: number }>): number { if (!values.length) return 0; const sin = values.reduce((sum, item) => sum + Math.sin(toRad(item.angle)) * item.weight, 0); const cos = values.reduce((sum, item) => sum + Math.cos(toRad(item.angle)) * item.weight, 0); return normalizeAngle(toDeg(Math.atan2(sin, cos))); }
function cacheKey(crsrdId: string, lat: number, lng: number): string { return `${crsrdId}:${lat.toFixed(5)}:${lng.toFixed(5)}:osm-v3`; }
function escapeOverpassNumber(value: number): string { if (!Number.isFinite(value)) throw new Error("Invalid coordinate."); return value.toFixed(6); }

async function fetchWithTimeout(url: string, query: string, deadlineAt: number): Promise<OverpassResponse> {
  const controller = new AbortController();
  const remainingMs = Math.max(1, deadlineAt - Date.now());
  const timeoutMs = Math.min(ENDPOINT_TIMEOUT_MS, remainingMs);
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" }, body: new URLSearchParams({ data: query }).toString(), signal: controller.signal });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) throw new Error("Invalid Overpass content type.");
    const payload = await response.json() as OverpassResponse;
    if (!payload || !Array.isArray(payload.elements)) throw new Error("Invalid Overpass response.");
    return payload;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function candidateWeight(tags: Record<string, string>): number {
  const highway = tags.highway ?? "";
  let weight = 1;
  if (["service", "track", "path", "footway", "cycleway", "steps", "pedestrian"].includes(highway)) weight *= 0.55;
  if (highway.endsWith("_link")) weight *= 0.72;
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
    const lengthMeters = haversine(p1, p2);
    if (lengthMeters < 1) continue;
    const distanceMeters = Math.min(d1, d2);
    if (distanceMeters > RADIUS_METERS) continue;
    const outwardPoint = d1 >= d2 ? p1 : p2;
    const segmentBearing = bearing(p1, p2);
    const candidate: RoadSegment = { p1, p2, bearing: segmentBearing, reverseBearing: normalizeAngle(segmentBearing + 180), distanceMeters, lengthMeters, outwardBearing: bearing(center, outwardPoint) };
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
  }
  return best;
}

function clusterAxes(segments: Candidate[]): RoadAxis[] {
  const clusters: Array<{ angles: number[]; weights: number[] }> = [];
  for (const segment of segments) {
    const angle = axisAngle(segment.bearing);
    let target = clusters.find((cluster) => angularDistance(angle, circularMean(cluster.angles)) <= AXIS_CLUSTER_DEGREES);
    if (!target) { target = { angles: [], weights: [] }; clusters.push(target); }
    target.angles.push(angle);
    target.weights.push(segment.weight);
  }
  return clusters.map((cluster) => {
    const representative = weightedCircularMean(cluster.angles.map((angle, index) => ({ angle, weight: cluster.weights[index] })));
    const confidence = Math.min(1, 0.45 + cluster.angles.length * 0.12);
    return { bearing: representative, reverseBearing: normalizeAngle(representative + 180), segmentCount: cluster.angles.length, confidence };
  }).sort((a, b) => b.segmentCount - a.segmentCount);
}

function clusterApproaches(candidates: Candidate[]): RoadApproach[] {
  const clusters: ApproachCluster[] = [];
  for (const candidate of candidates) {
    const existing = clusters.find((cluster) => angularDistance(candidate.outwardBearing, cluster.bearing) <= APPROACH_CLUSTER_DEGREES);
    if (existing) {
      existing.candidates.push(candidate);
      existing.bearing = weightedCircularMean(existing.candidates.map((item) => ({ angle: item.outwardBearing, weight: item.weight })));
    } else {
      clusters.push({ candidates: [candidate], bearing: candidate.outwardBearing });
    }
  }
  return clusters.map((cluster) => {
    const best = [...cluster.candidates].sort((a, b) => (b.weight - a.weight) || (a.distanceMeters - b.distanceMeters))[0];
    const distanceScore = Math.max(0, 1 - best.distanceMeters / RADIUS_METERS);
    const supportScore = Math.min(1, 0.55 + cluster.candidates.length * 0.15);
    const confidence = Math.min(1, distanceScore * 0.55 + supportScore * 0.45);
    return { bearing: cluster.bearing, axisBearing: axisAngle(best.bearing), distanceMeters: best.distanceMeters, highway: best.way.tags?.highway, name: best.way.tags?.name, wayId: String(best.way.id), confidence };
  }).sort((a, b) => b.confidence - a.confidence);
}

function matchDirections(approaches: RoadApproach[]): Partial<Record<string, RoadApproach>> {
  const pairs = approaches.flatMap((approach, approachIndex) => COMPASS.map(([direction, targetBearing]) => ({ direction, approach, approachIndex, score: angularDistance(approach.bearing, targetBearing) + (1 - approach.confidence) * 20 })));
  pairs.sort((a, b) => a.score - b.score);
  const usedDirections = new Set<string>();
  const usedApproaches = new Set<number>();
  const matches: Partial<Record<string, RoadApproach>> = {};
  for (const pair of pairs) {
    if (pair.score > MAX_MATCH_DISTANCE_DEGREES || usedDirections.has(pair.direction) || usedApproaches.has(pair.approachIndex)) continue;
    usedDirections.add(pair.direction);
    usedApproaches.add(pair.approachIndex);
    matches[pair.direction] = pair.approach;
  }
  return matches;
}

function buildAnalysis(crsrdId: string, center: RoadGeometryPoint, ways: OverpassWay[]): IntersectionRoadGeometry | null {
  const candidates: Candidate[] = [];
  for (const way of ways) {
    if (!way.id || !way.geometry || way.geometry.length < 2 || !way.tags?.highway) continue;
    const segment = nearestSegment(center, way);
    if (!segment) continue;
    candidates.push({ ...segment, way, weight: candidateWeight(way.tags) });
  }
  if (!candidates.length) return null;
  const axes = clusterAxes(candidates);
  const rawApproaches = clusterApproaches(candidates);
  const approaches = rawApproaches.map((approach) => {
    const axis = axes.reduce((best, item) => angularDistance(axisAngle(approach.bearing), axisAngle(item.bearing)) < angularDistance(axisAngle(approach.bearing), axisAngle(best.bearing)) ? item : best, axes[0]);
    return { ...approach, axisBearing: axis.bearing };
  });
  const directionMatches = matchDirections(approaches);
  const matched = Object.values(directionMatches).filter(Boolean) as RoadApproach[];
  const coverage = Math.min(1, matched.length / Math.max(2, Math.min(8, approaches.length)));
  const meanConfidence = matched.length ? matched.reduce((sum, item) => sum + item.confidence, 0) / matched.length : 0;
  const ambiguityPenalty = approaches.length > 1 ? Math.min(0.18, Math.max(0, approaches.length - matched.length) * 0.04) : 0.08;
  const confidence = Math.max(0, Math.min(1, meanConfidence * 0.58 + coverage * 0.32 + (approaches.length > 1 ? 0.1 : 0) - ambiguityPenalty));
  return { crsrdId, axes, approaches, directionMatches, confidence, provider: "osm-overpass" };
}

async function queryOverpass(lat: number, lng: number): Promise<OverpassWay[]> {
  const query = `[out:json][timeout:20];way(around:${RADIUS_METERS},${escapeOverpassNumber(lat)},${escapeOverpassNumber(lng)})[highway];out tags geom;`;
  const deadlineAt = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    if (Date.now() >= deadlineAt) break;
    try {
      const payload = await fetchWithTimeout(endpoint, query, deadlineAt);
      return (payload.elements ?? []).filter((item) => item.type === "way").map((item) => ({ id: item.id, tags: item.tags, geometry: item.geometry }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All Overpass endpoints failed.");
}

function createSharedRequest(crsrdId: string, latitude: number, longitude: number, key: string): Promise<IntersectionRoadGeometry | null> {
  const promise = (async () => {
    try {
      const ways = await queryOverpass(latitude, longitude);
      const result = buildAnalysis(crsrdId, { lat: latitude, lng: longitude }, ways);
      CACHE.set(key, { expiresAt: Date.now() + (result ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS), value: result });
      return result;
    } catch {
      CACHE.set(key, { expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null });
      return null;
    } finally {
      PENDING.delete(key);
    }
  })();
  PENDING.set(key, promise);
  return promise;
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(undefined as T);
  return new Promise<T>((resolve) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => { if (settled) return; settled = true; cleanup(); resolve(undefined as T); };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { if (settled) return; settled = true; cleanup(); resolve(value); }, () => { if (settled) return; settled = true; cleanup(); resolve(undefined as T); });
  });
}

export async function getRoadGeometry(crsrdId: string, latitude: number, longitude: number, options?: { signal?: AbortSignal }): Promise<IntersectionRoadGeometry | null> {
  if (!crsrdId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const key = cacheKey(crsrdId, latitude, longitude);
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = PENDING.get(key) ?? createSharedRequest(crsrdId, latitude, longitude, key);
  const result = await awaitWithAbort(pending, options?.signal);
  return result ?? null;
}

export function clearRoadGeometryCache(): void { CACHE.clear(); }
