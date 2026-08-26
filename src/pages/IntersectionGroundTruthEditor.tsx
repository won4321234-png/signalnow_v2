import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Grip, MapPin, Redo2, RotateCcw, Save, Search, Undo2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKakaoLoader } from "@/hooks/useKakaoLoader";
import { configureTrafficRegion, fetchSelectedIntersectionSignals, loadIntersectionsForViewport } from "@/services/viewportTrafficService";
import { getRoadGeometry, type IntersectionRoadGeometry } from "@/services/roadGeometryService";
import { intersectionLayoutRepository } from "@/services/intersectionLayoutRepository";
import { TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import type { ApproachDirection, Intersection } from "@/types/traffic";
import { createInitialLayout, normalizeBearing, type ApproachGroundTruth, type CorrectionReason, type GroundTruthExport, type GroundTruthApproachState, type IntersectionType, type ManualIntersectionLayout } from "@/types/intersectionLayout";

const DIRECTIONS: Array<[ApproachDirection, string, number]> = [["North", "북", 0], ["NorthEast", "북동", 45], ["East", "동", 90], ["SouthEast", "남동", 135], ["South", "남", 180], ["SouthWest", "남서", 225], ["West", "서", 270], ["NorthWest", "북서", 315]];
const REGION_STORAGE = "signalnow-region";
type Filter = "ALL" | "UNREVIEWED" | "REVIEW_REQUIRED" | "VERIFIED" | "OSM" | "AUTO_ONLY" | "MANUAL";
type HistoryState = { layout: ManualIntersectionLayout; selectedDirection: ApproachDirection | null };
type KakaoPolyline = { setMap: (map: kakao.maps.Map | null) => void };
type KakaoPolylineConstructor = new (options: Record<string, unknown>) => KakaoPolyline;

const createKakaoPolyline = (options: Record<string, unknown>): KakaoPolyline => {
  const maps = kakao.maps as unknown as { Polyline: KakaoPolylineConstructor };
  return new maps.Polyline(options);
};

const directionLabel = (direction: ApproachDirection) => DIRECTIONS.find(([value]) => value === direction)?.[1] ?? direction;
const directionFallbackBearing = (direction: ApproachDirection) => DIRECTIONS.find(([value]) => value === direction)?.[2] ?? 0;
const approachState = (a: ApproachGroundTruth): GroundTruthApproachState => a.state ?? (a.final ? "FINAL" : a.manual ? "MANUAL" : "AUTO");
const reasonLabel: Record<CorrectionReason, string> = { ROAD_AXIS_WRONG: "도로 축 불일치", OSM_GEOMETRY_WRONG: "OSM geometry 불일치", LANE_OFFSET_WRONG: "차선 offset 보정", INTERSECTION_CENTER_WRONG: "교차로 중심 보정", DIRECTION_MAPPING_WRONG: "방향 매핑 보정", SIGNAL_POSITION_WRONG: "신호기 위치 보정", OTHER: "기타" };
const typeLabel: Record<IntersectionType, string> = { FOUR_WAY: "사거리", T_JUNCTION: "T자", Y_JUNCTION: "Y자", ROUNDABOUT: "로터리", OFFSET_INTERSECTION: "엇갈림", COMPLEX: "복잡 교차로", OTHER: "기타" };

function offsetCoordinate(lat: number, lng: number, bearing: number, distance: number) {
  const earth = 6371008.8, br = normalizeBearing(bearing) * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lng * Math.PI / 180, angular = Math.max(0, distance) / earth;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(angular) + Math.cos(p1) * Math.sin(angular) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(angular) * Math.cos(p1), Math.cos(angular) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * 180 / Math.PI, lng: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
}
function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earth = 6371008.8, p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180, dp = (b.lat - a.lat) * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
  return normalizeBearing(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI);
}
function makeLayout(intersection: Intersection, geometry: IntersectionRoadGeometry | null, existing?: ManualIntersectionLayout | null) {
  if (existing) return existing;
  const layout = createInitialLayout(intersection);
  layout.approaches = DIRECTIONS.map(([direction]) => {
    const auto = geometry?.directionMatches[direction];
    return { direction, state: "AUTO", auto: auto ? { roadBearing: auto.bearing, axisBearing: auto.axisBearing, distanceMeters: auto.distanceMeters, confidence: auto.confidence, wayId: auto.wayId, source: "OSM" } : undefined, source: "auto", confidence: auto?.confidence ?? 0, verified: false, updatedAt: new Date().toISOString() };
  });
  layout.status = geometry && Object.keys(geometry.directionMatches ?? {}).length ? "AUTO_READY" : "UNREVIEWED";
  return layout;
}
function markerPosition(layout: ManualIntersectionLayout, approach: ApproachGroundTruth) {
  if (approach.manual?.signalPosition) return approach.manual.signalPosition;
  if (approach.final?.signalPosition) return approach.final.signalPosition;
  const bearing = approach.auto?.roadBearing ?? directionFallbackBearing(approach.direction);
  const distance = approach.auto?.distanceMeters ?? 18;
  return offsetCoordinate(layout.coordinate.lat, layout.coordinate.lng, bearing, distance);
}
function stateBadge(state: GroundTruthApproachState) {
  return state === "FINAL" ? "bg-emerald-500/15 text-emerald-700" : state === "MANUAL" ? "bg-amber-500/15 text-amber-700" : "bg-slate-500/10 text-slate-600";
}

export function IntersectionGroundTruthEditor() {
  const { loaded, error: kakaoError } = useKakaoLoader();
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => window.localStorage.getItem(REGION_STORAGE) === "seoul" ? "seoul" : "ulsan");
  const region = TRAFFIC_REGIONS[regionId];
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<ManualIntersectionLayout | null>(null);
  const [geometry, setGeometry] = useState<IntersectionRoadGeometry | null>(null);
  const [signals, setSignals] = useState<Intersection["signals"]>([]);
  const [selectedDirection, setSelectedDirection] = useState<ApproachDirection | null>(null);
  const [saved, setSaved] = useState(true);
  const [verified, setVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState("준비됨");
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [savedLayouts, setSavedLayouts] = useState<ManualIntersectionLayout[]>(() => intersectionLayoutRepository.list());
  const [autoNext, setAutoNext] = useState(true);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Map<ApproachDirection, kakao.maps.Marker>>(new Map());
  const labelRefs = useRef<Map<ApproachDirection, kakao.maps.CustomOverlay>>(new Map());
  const lineRefs = useRef<Map<ApproachDirection, KakaoPolyline>>(new Map());
  const bearingRefs = useRef<Map<ApproachDirection, KakaoPolyline>>(new Map());
  const centerRef = useRef<kakao.maps.CustomOverlay | null>(null);

  const selectedIntersection = useMemo(() => intersections.find((item) => item.crsrdId === selectedId) ?? null, [intersections, selectedId]);
  const filtered = useMemo(() => intersections.filter((item) => {
    const q = query.trim().toLowerCase();
    if (q && !item.crsrdNm.toLowerCase().includes(q) && !item.crsrdId.toLowerCase().includes(q)) return false;
    const savedLayout = savedLayouts.find((value) => value.intersectionId === item.crsrdId);
    if (filter === "ALL") return true;
    if (filter === "UNREVIEWED") return !savedLayout || savedLayout.status === "UNREVIEWED" || savedLayout.status === "AUTO_READY";
    if (filter === "REVIEW_REQUIRED") return savedLayout?.status === "REVIEW_REQUIRED" || savedLayout?.status === "MANUAL_ONLY";
    if (filter === "VERIFIED") return savedLayout?.status === "VERIFIED";
    if (filter === "OSM") return Boolean(savedLayout?.approaches.some((a) => a.auto));
    if (filter === "AUTO_ONLY") return Boolean(savedLayout && savedLayout.approaches.every((a) => approachState(a) === "AUTO"));
    return Boolean(savedLayout?.approaches.some((a) => a.manual));
  }).sort((a, b) => a.crsrdNm.localeCompare(b.crsrdNm, "ko")), [filter, intersections, query, savedLayouts]);
  const current = useMemo(() => layout?.approaches.find((item) => item.direction === selectedDirection) ?? null, [layout, selectedDirection]);
  const stats = useMemo(() => ({ total: intersections.length, final: savedLayouts.filter((x) => x.status === "VERIFIED").length, manual: savedLayouts.filter((x) => x.approaches.some((a) => a.manual)).length, auto: savedLayouts.filter((x) => x.approaches.some((a) => a.auto)).length, osm: savedLayouts.filter((x) => x.approaches.some((a) => a.auto)).length }), [intersections.length, savedLayouts]);
  const refresh = useCallback(() => setSavedLayouts(intersectionLayoutRepository.list()), []);

  const pushHistory = useCallback((next: ManualIntersectionLayout, direction = selectedDirection) => {
    if (!layout) return;
    setHistory((prev) => [...prev.slice(-39), { layout: structuredClone(layout), selectedDirection }]);
    setFuture([]); setLayout(next); setSaved(false); setVerified(false); setSelectedDirection(direction); setStatusMessage("수정됨 · 저장 필요");
  }, [layout, selectedDirection]);

  const loadRegion = useCallback(async (nextRegion: TrafficRegionId) => {
    const request = ++requestIdRef.current;
    const next = TRAFFIC_REGIONS[nextRegion];
    configureTrafficRegion(nextRegion); window.localStorage.setItem(REGION_STORAGE, nextRegion); setRegionId(nextRegion);
    setSelectedId(null); setLayout(null); setGeometry(null); setSignals([]); setSelectedDirection(null); setStatusMessage(`${next.name} 교차로 불러오는 중…`);
    try {
      const span = nextRegion === "ulsan" ? 0.22 : 0.18;
      const items = await loadIntersectionsForViewport({ south: next.center.lat - span, west: next.center.lng - span, north: next.center.lat + span, east: next.center.lng + span });
      if (request !== requestIdRef.current) return;
      setIntersections(items); setStatusMessage(`${items.length}개 교차로 로드됨`);
    } catch (e) {
      if (request !== requestIdRef.current) return;
      setStatusMessage(e instanceof Error ? e.message : "교차로 로드 실패");
    }
  }, []);
  useEffect(() => { void loadRegion(regionId); }, [loadRegion, regionId]);

  const selectIntersection = useCallback(async (intersection: Intersection) => {
    const request = ++requestIdRef.current;
    setSelectedId(intersection.crsrdId); setSelectedDirection(null); setSignals([]); setGeometry(null); setStatusMessage("KLID 신호 + OSM geometry 분석 중…");
    const existing = intersectionLayoutRepository.get(intersection.crsrdId);
    try {
      const [nextGeometry, signalResult] = await Promise.all([getRoadGeometry(intersection.crsrdId, intersection.mapCtptIntLat, intersection.mapCtptIntLot), fetchSelectedIntersectionSignals(intersection.crsrdId)]);
      if (request !== requestIdRef.current) return;
      const nextLayout = makeLayout(intersection, nextGeometry, existing);
      setGeometry(nextGeometry); setSignals(signalResult.signals); setLayout(nextLayout); setHistory([]); setFuture([]); setSaved(Boolean(existing)); setVerified(nextLayout.status === "VERIFIED");
      setStatusMessage(existing ? "저장된 Ground Truth 불러옴" : `AUTO ${Object.keys(nextGeometry?.directionMatches ?? {}).length}/8 방향 분석 완료`);
    } catch (e) {
      if (request !== requestIdRef.current) return;
      const nextLayout = makeLayout(intersection, null, existing);
      setGeometry(null); setSignals([]); setLayout(nextLayout); setHistory([]); setFuture([]); setSaved(Boolean(existing)); setVerified(nextLayout.status === "VERIFIED"); setStatusMessage(e instanceof Error ? "OSM 실패 · 수동 편집 가능" : "OSM 실패 · 수동 편집 가능");
    }
  }, []);

  useEffect(() => {
    if (!loaded || !mapContainerRef.current || mapRef.current) return;
    const map = new kakao.maps.Map(mapContainerRef.current, { center: new kakao.maps.LatLng(region.center.lat, region.center.lng), level: 5 });
    mapRef.current = map;
    return () => { markerRefs.current.forEach((marker) => marker.setMap(null)); labelRefs.current.forEach((overlay) => overlay.setMap(null)); lineRefs.current.forEach((line) => line.setMap(null)); bearingRefs.current.forEach((line) => line.setMap(null)); centerRef.current?.setMap(null); mapRef.current = null; };
  }, [loaded, region.center.lat, region.center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layout || !selectedIntersection) return;
    map.setCenter(new kakao.maps.LatLng(layout.coordinate.lat, layout.coordinate.lng));
    markerRefs.current.forEach((marker) => marker.setMap(null)); labelRefs.current.forEach((overlay) => overlay.setMap(null)); lineRefs.current.forEach((line) => line.setMap(null)); bearingRefs.current.forEach((line) => line.setMap(null));
    markerRefs.current.clear(); labelRefs.current.clear(); lineRefs.current.clear(); bearingRefs.current.clear();
    for (const [direction, label] of DIRECTIONS) {
      const approach = layout.approaches.find((item) => item.direction === direction);
      if (!approach) continue;
      const position = markerPosition(layout, approach);
      const latLng = new kakao.maps.LatLng(position.lat, position.lng);
      const marker = new kakao.maps.Marker({ position: latLng, map, draggable: true, zIndex: direction === selectedDirection ? 100 : 60 });
      kakao.maps.event.addListener(marker, "click", () => setSelectedDirection(direction));
      kakao.maps.event.addListener(marker, "dragstart", () => setSelectedDirection(direction));
      kakao.maps.event.addListener(marker, "dragend", () => {
        const pos = marker.getPosition();
        const signalPosition = { lat: pos.getLat(), lng: pos.getLng() };
        const next = structuredClone(layout);
        const target = next.approaches.find((item) => item.direction === direction);
        if (!target) return;
        const distance = distanceBetween(next.coordinate, signalPosition);
        const bearing = bearingBetween(next.coordinate, signalPosition);
        target.manual = { ...(target.manual ?? { lanes: [] }), lanes: target.manual?.lanes ?? [], signalPosition, distanceMeters: distance, roadBearing: bearing, axisBearing: target.manual?.axisBearing ?? target.auto?.axisBearing ?? bearing, correctedAt: new Date().toISOString(), correctedBy: "local-admin", correctionReason: target.manual?.correctionReason ?? "SIGNAL_POSITION_WRONG" };
        target.final = undefined; target.state = "MANUAL"; target.source = target.auto ? "hybrid" : "manual"; target.confidence = 1; target.verified = false; target.updatedAt = new Date().toISOString(); next.status = "REVIEW_REQUIRED"; next.metadata.updatedAt = new Date().toISOString(); next.metadata.correctionCount = (next.metadata.correctionCount ?? 0) + 1; next.metadata.lastCorrectionReason = target.manual.correctionReason;
        setHistory((prev) => [...prev.slice(-39), { layout: structuredClone(layout), selectedDirection: direction }]); setFuture([]); setLayout(next); setSaved(false); setVerified(false); setSelectedDirection(direction); setStatusMessage(`${label} 위치 수정 · ${distance.toFixed(1)}m / ${bearing.toFixed(1)}°`);
      });
      markerRefs.current.set(direction, marker);
      const line = createKakaoPolyline({ map, path: [new kakao.maps.LatLng(layout.coordinate.lat, layout.coordinate.lng), latLng], strokeWeight: direction === selectedDirection ? 4 : 2, strokeColor: approachState(approach) === "MANUAL" ? "#d97706" : "#2563eb", strokeOpacity: 0.72, strokeStyle: "solid" });
      lineRefs.current.set(direction, line);
      const bearing = approach.manual?.roadBearing ?? approach.auto?.roadBearing ?? directionFallbackBearing(direction);
      const tip = offsetCoordinate(position.lat, position.lng, bearing, 14);
      const bearingLine = createKakaoPolyline({ map, path: [latLng, new kakao.maps.LatLng(tip.lat, tip.lng)], strokeWeight: 3, strokeColor: "#111827", strokeOpacity: 0.7, strokeStyle: "solid" });
      bearingRefs.current.set(direction, bearingLine);
      const content = document.createElement("div");
      content.className = cn("rounded-xl border bg-white/95 px-2.5 py-1.5 text-[11px] font-bold shadow-xl backdrop-blur", direction === selectedDirection ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200");
      const displayDistance = approach.manual?.distanceMeters ?? approach.auto?.distanceMeters ?? 0;
      content.textContent = `${label} · ${approachState(approach)} · ${displayDistance.toFixed(1)}m`;
      const overlay = new kakao.maps.CustomOverlay({ position: latLng, content, xAnchor: 0.5, yAnchor: 1.35, zIndex: 120 }); overlay.setMap(map); labelRefs.current.set(direction, overlay);
    }
    centerRef.current?.setMap(null);
    const center = document.createElement("div"); center.className = "rounded-full border-2 border-blue-600 bg-white p-2 shadow-lg";
    const dot = document.createElement("span"); dot.className = "block h-2.5 w-2.5 rounded-full bg-blue-600"; center.appendChild(dot);
    centerRef.current = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(layout.coordinate.lat, layout.coordinate.lng), content: center, xAnchor: 0.5, yAnchor: 0.5, zIndex: 150 }); centerRef.current.setMap(map);
  }, [layout, selectedDirection, selectedIntersection]);

  const updateSelected = useCallback((patch: Partial<NonNullable<ApproachGroundTruth["manual"]>>) => {
    if (!layout || !selectedDirection) return;
    const next = structuredClone(layout);
    const target = next.approaches.find((item) => item.direction === selectedDirection);
    if (!target) return;
    target.manual = { ...(target.manual ?? { lanes: [] }), ...patch, lanes: target.manual?.lanes ?? [], correctedAt: new Date().toISOString(), correctedBy: "local-admin" };
    if (patch.roadBearing !== undefined) target.manual.roadBearing = normalizeBearing(patch.roadBearing);
    if (patch.axisBearing !== undefined) target.manual.axisBearing = normalizeBearing(patch.axisBearing);
    if (patch.signalPosition) {
      target.manual.distanceMeters = distanceBetween(next.coordinate, patch.signalPosition);
      target.manual.roadBearing = bearingBetween(next.coordinate, patch.signalPosition);
    }
    target.final = undefined; target.state = "MANUAL"; target.source = target.auto ? "hybrid" : "manual"; target.confidence = 1; target.verified = false; target.updatedAt = new Date().toISOString(); next.status = "REVIEW_REQUIRED"; next.metadata.updatedAt = new Date().toISOString(); next.metadata.correctionCount = (next.metadata.correctionCount ?? 0) + 1;
    if (target.manual.correctionReason) next.metadata.lastCorrectionReason = target.manual.correctionReason;
    pushHistory(next, selectedDirection);
  }, [layout, selectedDirection, pushHistory]);

  const updateCoordinateField = useCallback((key: "lat" | "lng", raw: string) => {
    if (!current || !current.manual?.signalPosition) return;
    const value = Number(raw); if (!Number.isFinite(value)) return;
    const position = { ...current.manual.signalPosition, [key]: value };
    if (position.lat < -90 || position.lat > 90 || position.lng < -180 || position.lng > 180) return;
    updateSelected({ signalPosition: position });
  }, [current, updateSelected]);

  const undo = useCallback(() => {
    if (!history.length || !layout) return;
    const item = history[history.length - 1];
    setFuture((prev) => [{ layout: structuredClone(layout), selectedDirection }, ...prev]); setHistory((prev) => prev.slice(0, -1)); setLayout(item.layout); setSelectedDirection(item.selectedDirection); setSaved(false); setVerified(false); setStatusMessage("Undo 적용");
  }, [history, layout, selectedDirection]);
  const redo = useCallback(() => {
    if (!future.length || !layout) return;
    const item = future[0];
    setHistory((prev) => [...prev, { layout: structuredClone(layout), selectedDirection }]); setFuture((prev) => prev.slice(1)); setLayout(item.layout); setSelectedDirection(item.selectedDirection); setSaved(false); setVerified(false); setStatusMessage("Redo 적용");
  }, [future, layout, selectedDirection]);
  const resetSelected = useCallback(() => {
    if (!layout || !selectedDirection) return;
    const target = layout.approaches.find((item) => item.direction === selectedDirection);
    if (!target) return;
    const next = structuredClone(layout); const item = next.approaches.find((value) => value.direction === selectedDirection);
    if (!item) return;
    item.manual = undefined; item.final = undefined; item.state = "AUTO"; item.source = "auto"; item.confidence = item.auto?.confidence ?? 0; item.verified = false; item.updatedAt = new Date().toISOString(); next.status = next.approaches.some((value) => value.manual) ? "REVIEW_REQUIRED" : (geometry ? "AUTO_READY" : "UNREVIEWED");
    pushHistory(next, selectedDirection); setStatusMessage(`${directionLabel(selectedDirection)} AUTO 값으로 되돌림`);
  }, [geometry, layout, selectedDirection, pushHistory]);

  const validateBeforeVerify = useCallback((value: ManualIntersectionLayout) => {
    if (!value.intersectionId) return "교차로 ID가 없습니다.";
    if (!Number.isFinite(value.coordinate.lat) || value.coordinate.lat < -90 || value.coordinate.lat > 90) return "교차로 latitude가 유효하지 않습니다.";
    if (!Number.isFinite(value.coordinate.lng) || value.coordinate.lng < -180 || value.coordinate.lng > 180) return "교차로 longitude가 유효하지 않습니다.";
    if (!value.approaches.length) return "사용 가능한 signal direction이 없습니다.";
    for (const approach of value.approaches) {
      const position = approach.manual?.signalPosition ?? approach.final?.signalPosition;
      if (position && (position.lat < -90 || position.lat > 90 || position.lng < -180 || position.lng > 180 || !Number.isFinite(position.lat) || !Number.isFinite(position.lng))) return `${directionLabel(approach.direction)} 방향 좌표가 유효하지 않습니다.`;
      for (const bearing of [approach.auto?.roadBearing, approach.auto?.axisBearing, approach.manual?.roadBearing, approach.manual?.axisBearing]) if (bearing !== undefined && (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360)) return `${directionLabel(approach.direction)} bearing이 유효하지 않습니다.`;
      if (!Number.isFinite(approach.confidence) || approach.confidence < 0 || approach.confidence > 1) return `${directionLabel(approach.direction)} confidence가 유효하지 않습니다.`;
    }
    return null;
  }, []);

  const save = useCallback(() => {
    if (!layout) return;
    try {
      const next = { ...layout, metadata: { ...layout.metadata, updatedAt: new Date().toISOString() } };
      intersectionLayoutRepository.save(next); setLayout(next); setSaved(true); refresh(); setStatusMessage("Ground Truth 저장 완료");
    } catch (e) { setStatusMessage(e instanceof Error ? `저장 실패 · ${e.message}` : "저장 실패"); }
  }, [layout, refresh]);

  const verify = useCallback(() => {
    if (!layout) return;
    const error = validateBeforeVerify(layout);
    if (error) { setStatusMessage(`검수 완료 불가 · ${error}`); return; }
    const now = new Date().toISOString();
    const next = structuredClone(layout);
    next.status = "VERIFIED"; next.metadata = { ...next.metadata, updatedAt: now, verifiedAt: now, verifiedBy: "local-admin" };
    next.approaches = next.approaches.map((approach) => {
      const source = approach.manual ?? approach.auto;
      if (!source) return { ...approach, state: "FINAL", verified: true, updatedAt: now };
      return { ...approach, state: "FINAL", final: { roadBearing: source.roadBearing, axisBearing: source.axisBearing, distanceMeters: source.distanceMeters, offsetMeters: approach.manual?.offsetMeters, labelRotation: approach.manual?.labelRotation, signalPosition: approach.manual?.signalPosition, source: approach.manual ? (approach.auto ? "hybrid" : "manual") : "auto" }, verified: true, updatedAt: now };
    });
    try { intersectionLayoutRepository.save(next); setLayout(next); setSaved(true); setVerified(true); refresh(); setStatusMessage("검수 완료 · FINAL Ground Truth 저장됨"); } catch (e) { setStatusMessage(e instanceof Error ? `검수 저장 실패 · ${e.message}` : "검수 저장 실패"); }
  }, [layout, refresh, validateBeforeVerify]);

  const selectRelative = useCallback((delta: number) => {
    if (!selectedId || !filtered.length) return;
    const index = filtered.findIndex((item) => item.crsrdId === selectedId);
    const nextIndex = index < 0 ? 0 : (index + delta + filtered.length) % filtered.length;
    const next = filtered[nextIndex]; if (next) void selectIntersection(next);
  }, [filtered, selectedId, selectIntersection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); redo(); return; }
      if (typing) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); selectRelative(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); selectRelative(1); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, save, selectRelative, undo]);

  useEffect(() => {
    if (!layout || saved || !selectedId) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload); return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [layout, saved, selectedId]);

  const exportJson = useCallback(() => {
    const payload = intersectionLayoutRepository.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `signalnow-ground-truth-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setStatusMessage("Ground Truth JSON export 완료");
  }, []);
  const importJson = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = intersectionLayoutRepository.importAll(JSON.parse(String(reader.result)) as GroundTruthExport);
        if (result.errors.length) { setImportMessage(result.errors.slice(0, 4).join(" ")); setStatusMessage(`Import 실패 · ${result.errors.length}개 오류`); return; }
        setImportMessage(`${result.imported}개 layout을 가져왔습니다.`); refresh(); if (selectedId) setLayout(intersectionLayoutRepository.get(selectedId)); setStatusMessage(`Import 완료 · ${result.imported}개`);
      } catch { setImportMessage("JSON 파싱 실패"); setStatusMessage("Import 실패 · JSON 파싱 오류"); }
    };
    reader.readAsText(file); event.target.value = "";
  }, [refresh, selectedId]);

  const progress = stats.total ? Math.round((stats.final / stats.total) * 100) : 0;
  const autoCount = geometry ? Object.keys(geometry.directionMatches ?? {}).length : 0;

  return <div className="signalnow-editor min-h-screen bg-slate-50 text-slate-950">
    <header className="sticky top-0 z-50 border-b bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:px-5">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3">
        <div className="mr-auto min-w-[220px]"><div className="text-lg font-black tracking-tight">SignalNow Ground Truth Editor</div><div className="text-xs text-slate-500">{region.name} · {stats.final}/{stats.total} 검수 완료 · {statusMessage}</div></div>
        <div className="flex items-center gap-1 rounded-xl border bg-slate-50 p-1"><button onClick={() => void loadRegion("ulsan")} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", regionId === "ulsan" ? "bg-white shadow" : "text-slate-500")}>울산</button><button onClick={() => void loadRegion("seoul")} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", regionId === "seoul" ? "bg-white shadow" : "text-slate-500")}>서울</button></div>
        <div className="flex gap-2"><button title="JSON Export" aria-label="Ground Truth JSON Export" onClick={exportJson} className="rounded-xl border bg-white p-2"><Download size={17}/></button><label title="JSON Import" aria-label="Ground Truth JSON Import" className="cursor-pointer rounded-xl border bg-white p-2"><Upload size={17}/><input className="hidden" type="file" accept="application/json,.json" onChange={importJson}/></label><button title="Undo" aria-label="Undo" disabled={!history.length} onClick={undo} className="rounded-xl border bg-white p-2 disabled:opacity-30"><Undo2 size={17}/></button><button title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo} className="rounded-xl border bg-white p-2 disabled:opacity-30"><Redo2 size={17}/></button></div>
      </div>
      <div className="mx-auto mt-3 max-w-[1800px]"><div className="flex items-center justify-between text-[11px] font-semibold text-slate-500"><span>검수 진행률</span><span>{progress}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }}/></div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-slate-100 px-2 py-1">AUTO {stats.auto}</span><span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">MANUAL {stats.manual}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">FINAL {stats.final}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">OSM {stats.osm}</span></div></div>
    </header>

    <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 p-3 md:p-4 lg:grid-cols-[300px_minmax(420px,1fr)_380px]">
      <aside className="flex max-h-[calc(100vh-180px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="교차로명 / ID 검색" className="w-full rounded-xl border bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div><div className="mt-2 flex gap-1 overflow-x-auto pb-1">{(["ALL","UNREVIEWED","REVIEW_REQUIRED","VERIFIED","OSM","AUTO_ONLY","MANUAL"] as Filter[]).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn("whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold", filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>{({ALL:"전체",UNREVIEWED:"미검수",REVIEW_REQUIRED:"수정중",VERIFIED:"완료",OSM:"OSM",AUTO_ONLY:"AUTO",MANUAL:"MANUAL"})[value]}</button>)}</div></div>
        <div className="flex-1 overflow-y-auto p-2">{filtered.map((item) => { const savedLayout = savedLayouts.find((value) => value.intersectionId === item.crsrdId); const state = savedLayout?.status ?? "UNREVIEWED"; const lowConfidence = savedLayout ? savedLayout.approaches.some((a) => a.auto && a.auto.confidence < 0.58) : false; return <button key={item.crsrdId} onClick={() => void selectIntersection(item)} className={cn("mb-1 w-full rounded-xl border p-3 text-left transition", selectedId === item.crsrdId ? "border-blue-500 bg-blue-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50")}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.crsrdNm}</div><div className="mt-0.5 text-[10px] text-slate-400">ID {item.crsrdId}</div></div>{lowConfidence && <span title="AUTO confidence 낮음" className="text-amber-500">⚠</span>}</div><div className="mt-2 flex gap-1"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">{state === "VERIFIED" ? "검수완료" : state === "REVIEW_REQUIRED" ? "수정중" : "미검수"}</span>{savedLayout?.approaches.some((a) => a.auto) && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">OSM</span>}{savedLayout?.approaches.some((a) => a.manual) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">MANUAL</span>}</div></button> })}</div>
      </aside>

      <section className="relative min-h-[520px] overflow-hidden rounded-2xl border bg-slate-200 shadow-sm lg:min-h-[calc(100vh-180px)]">
        {!loaded && <div className="absolute inset-0 z-20 grid place-items-center bg-white/80 text-sm font-semibold">Kakao Map 로딩 중…</div>}
        {kakaoError && <div className="absolute left-3 top-3 z-30 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Kakao Map 로드 실패 · 지도 없이도 Ground Truth 편집은 가능합니다.</div>}
        <div ref={mapContainerRef} className="absolute inset-0" />
        {!selectedIntersection && <div className="absolute inset-0 grid place-items-center"><div className="rounded-2xl bg-white/90 px-6 py-5 text-center shadow-xl"><MapPin className="mx-auto mb-2 text-blue-600"/><div className="font-bold">교차로를 선택하세요</div><div className="mt-1 text-xs text-slate-500">왼쪽 목록에서 KLID 교차로를 선택하면 OSM AUTO 결과와 편집 marker가 표시됩니다.</div></div></div>}
        {layout && <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-24px)] rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur"><div className="flex items-center gap-2"><span className="font-black">{layout.intersectionName}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", verified ? "bg-emerald-100 text-emerald-700" : saved ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700")}>{verified ? "✓ Verified" : saved ? "✓ Saved" : "● Unsaved"}</span></div><div className="mt-1 text-[10px] text-slate-500">{layout.coordinate.lat.toFixed(6)}, {layout.coordinate.lng.toFixed(6)} · OSM {autoCount}/8</div></div>}
        {layout && <div className="absolute bottom-3 left-3 right-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border bg-white/95 p-2 shadow-lg backdrop-blur"><button title="이전 교차로" aria-label="이전 교차로" onClick={() => selectRelative(-1)} className="rounded-xl border p-2"><ChevronLeft size={18}/></button><button title="다음 교차로" aria-label="다음 교차로" onClick={() => selectRelative(1)} className="rounded-xl border p-2"><ChevronRight size={18}/></button><button title="선택 방향 Undo" aria-label="Undo" onClick={undo} disabled={!history.length} className="rounded-xl border p-2 disabled:opacity-30"><Undo2 size={18}/></button><button title="Redo" aria-label="Redo" onClick={redo} disabled={!future.length} className="rounded-xl border p-2 disabled:opacity-30"><Redo2 size={18}/></button><button title="저장" aria-label="Ground Truth 저장" onClick={save} disabled={saved} className="ml-auto rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Save size={15} className="mr-1 inline"/>저장</button><button title="검수 완료" aria-label="검수 완료" onClick={verify} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check size={15} className="mr-1 inline"/>검수 완료</button><label className="flex items-center gap-1 text-[10px] font-semibold"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)}/> 완료 후 다음</label></div>}
      </section>

      <aside className="min-h-[520px] rounded-2xl border bg-white shadow-sm">
        {layout && selectedIntersection ? <div className="flex h-full flex-col">
          <div className="border-b p-4"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-lg font-black">{layout.intersectionName}</div><div className="mt-1 text-[10px] text-slate-500">{layout.intersectionId} · {layout.coordinate.lat.toFixed(6)}, {layout.coordinate.lng.toFixed(6)}</div></div><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", layout.status === "VERIFIED" ? "bg-emerald-100 text-emerald-700" : layout.status === "REVIEW_REQUIRED" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{layout.status === "VERIFIED" ? "FINAL" : layout.status === "REVIEW_REQUIRED" ? "MANUAL" : "AUTO"}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><select value={layout.manualIntersectionType ?? layout.autoIntersectionType ?? "FOUR_WAY"} onChange={(e) => { const next = structuredClone(layout); next.manualIntersectionType = e.target.value as IntersectionType; next.status = "REVIEW_REQUIRED"; pushHistory(next, selectedDirection); }} className="rounded-xl border bg-white px-2 py-2 text-xs"><option value="FOUR_WAY">사거리</option><option value="T_JUNCTION">T자</option><option value="Y_JUNCTION">Y자</option><option value="ROUNDABOUT">로터리</option><option value="OFFSET_INTERSECTION">엇갈림</option><option value="COMPLEX">복잡</option><option value="OTHER">기타</option></select><div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold">OSM {autoCount}/8 방향</div></div>
          </div>
          <div className="border-b p-3"><div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">방향 선택</div><div className="grid grid-cols-4 gap-1.5">{DIRECTIONS.map(([direction, label]) => { const a = layout.approaches.find((item) => item.direction === direction); return <button key={direction} onClick={() => setSelectedDirection(direction)} className={cn("rounded-xl border p-2 text-center", selectedDirection === direction ? "border-blue-600 bg-blue-50" : "bg-white")}><div className="text-xs font-black">{label}</div><div className={cn("mt-1 rounded-full px-1 py-0.5 text-[9px] font-bold", stateBadge(approachState(a ?? { direction, source: "auto", confidence: 0, verified: false, updatedAt: "" })))}>{approachState(a ?? { direction, source: "auto", confidence: 0, verified: false, updatedAt: "" })}</div></button> })}</div></div>
          <div className="flex-1 overflow-y-auto p-4">
            {!current && <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">방향 marker를 클릭하거나 위에서 방향을 선택하세요.</div>}
            {current && <div className="space-y-4">
              <div className="flex items-center gap-2"><Grip size={18} className="text-blue-600"/><div><div className="font-black">{directionLabel(current.direction)} 방향</div><div className="text-[10px] text-slate-500">지도 marker를 드래그하면 lat/lng, distance, bearing이 즉시 계산됩니다.</div></div></div>
              <div className="rounded-2xl border bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-black">AUTO · OSM</span><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">confidence {(current.auto?.confidence ?? 0).toFixed(2)}</span></div><div className="grid grid-cols-3 gap-2 text-xs"><div><div className="text-[10px] text-slate-400">bearing</div><b>{current.auto?.roadBearing?.toFixed(1) ?? "—"}°</b></div><div><div className="text-[10px] text-slate-400">axis</div><b>{current.auto?.axisBearing?.toFixed(1) ?? "—"}°</b></div><div><div className="text-[10px] text-slate-400">distance</div><b>{current.auto?.distanceMeters?.toFixed(1) ?? "—"}m</b></div></div><div className="mt-2 text-[10px] text-slate-400">wayId {current.auto?.wayId ?? "—"} · source {current.auto?.source ?? "—"}</div></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-black">MANUAL · Ground Truth</span><button onClick={resetSelected} title="AUTO 값으로 되돌리기" aria-label="AUTO 값으로 되돌리기" className="text-[10px] font-bold text-amber-700"><RotateCcw size={13} className="mr-1 inline"/>AUTO 복원</button></div><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Latitude<input value={current.manual?.signalPosition?.lat ?? ""} onChange={(e) => updateCoordinateField("lat", e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Longitude<input value={current.manual?.signalPosition?.lng ?? ""} onChange={(e) => updateCoordinateField("lng", e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Bearing<input type="number" min="0" max="359.999" step="0.1" value={current.manual?.roadBearing ?? ""} onChange={(e) => updateSelected({ roadBearing: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Axis bearing<input type="number" min="0" max="359.999" step="0.1" value={current.manual?.axisBearing ?? ""} onChange={(e) => updateSelected({ axisBearing: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Distance<input readOnly value={current.manual?.distanceMeters?.toFixed(2) ?? "—"} className="mt-1 w-full rounded-lg border bg-slate-100 px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Lateral offset<input type="number" step="0.1" value={current.manual?.offsetMeters?.lateral ?? 0} onChange={(e) => updateSelected({ offsetMeters: { longitudinal: current.manual?.offsetMeters?.longitudinal ?? 0, lateral: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Longitudinal offset<input type="number" step="0.1" value={current.manual?.offsetMeters?.longitudinal ?? 0} onChange={(e) => updateSelected({ offsetMeters: { longitudinal: Number(e.target.value), lateral: current.manual?.offsetMeters?.lateral ?? 0 } })} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-500">Lane count<input type="number" min="0" max="20" step="1" value={current.manual?.laneCount ?? ""} onChange={(e) => updateSelected({ laneCount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-xs"/></label></div><div className="mt-3 grid grid-cols-2 gap-2"><select value={current.manual?.correctionReason ?? "SIGNAL_POSITION_WRONG"} onChange={(e) => updateSelected({ correctionReason: e.target.value as CorrectionReason })} className="rounded-lg border bg-white px-2 py-2 text-xs">{Object.entries(reasonLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={current.manual?.notes ?? ""} onChange={(e) => updateSelected({ notes: e.target.value })} placeholder="보정 메모" className="rounded-lg border bg-white px-2 py-2 text-xs"/></div></div>
              <div className="rounded-2xl border p-3"><div className="text-[11px] font-black">AUTO → MANUAL diff</div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2">Δ bearing <b>{current.manual?.roadBearing !== undefined && current.auto?.roadBearing !== undefined ? `${(current.manual.roadBearing - current.auto.roadBearing).toFixed(1)}°` : "—"}</b></div><div className="rounded-lg bg-slate-50 p-2">Δ distance <b>{current.manual?.distanceMeters !== undefined && current.auto?.distanceMeters !== undefined ? `${(current.manual.distanceMeters - current.auto.distanceMeters).toFixed(1)}m` : "—"}</b></div></div></div>
              <div className="rounded-2xl border p-3"><div className="mb-2 text-[11px] font-black">KLID Signal 연결</div>{signals.filter((signal) => signal.direction === current.direction).length ? signals.filter((signal) => signal.direction === current.direction).map((signal, index) => <div key={`${current.direction}-${index}`} className="flex items-center justify-between border-b py-2 last:border-0"><span className="text-xs">{signal.direction} · {signal.movement ?? "signal"}</span><b className="text-xs">{signal.remainingSeconds ?? "—"}초</b></div>) : <div className="text-[10px] text-slate-400">선택 방향에 연결된 KLID signal 없음</div>}</div>
            </div>}
          </div>
        </div> : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-500">교차로를 선택하면 편집 패널이 활성화됩니다.</div>}
      </aside>
    </main>
    {importMessage && <div className="fixed bottom-5 left-1/2 z-[100] max-w-[calc(100%-24px)] -translate-x-1/2 rounded-xl border bg-white px-4 py-3 text-xs font-semibold shadow-xl">{importMessage}<button onClick={() => setImportMessage(null)} className="ml-3 text-blue-600">닫기</button></div>}
    <div className="mx-auto max-w-[1800px] px-4 pb-5 text-[10px] text-slate-400">{layout?.manualIntersectionType ? `${typeLabel[layout.manualIntersectionType]} · ` : ""}단축키: ←/→ 이전·다음 · Ctrl/Cmd+S 저장 · Ctrl/Cmd+Z Undo · Ctrl/Cmd+Shift+Z Redo · {autoNext ? "검수 완료 후 다음 옵션 활성화" : "수동 이동"}</div>
  </div>;
}
