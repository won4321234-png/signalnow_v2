import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Grip, MapPin, RotateCcw, Save, Search, Undo2, Redo2, Upload } from "lucide-react";
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
