import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, Grip, MapPin, RotateCcw, Save, Search, Upload, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKakaoLoader } from "@/hooks/useKakaoLoader";
import { configureTrafficRegion, fetchSelectedIntersectionSignals, loadIntersectionsForViewport } from "@/services/viewportTrafficService";
import { getRoadGeometry, type IntersectionRoadGeometry } from "@/services/roadGeometryService";
import { intersectionLayoutRepository } from "@/services/intersectionLayoutRepository";
import { TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import type { ApproachDirection, Intersection } from "@/types/traffic";
import { createInitialLayout, normalizeBearing, type ApproachGroundTruth, type GroundTruthExport, type IntersectionVerificationStatus, type ManualIntersectionLayout } from "@/types/intersectionLayout";

const DIRECTIONS: Array<[ApproachDirection, string, number]> = [["North", "북", 0], ["NorthEast", "북동", 45], ["East", "동", 90], ["SouthEast", "남동", 135], ["South", "남", 180], ["SouthWest", "남서", 225], ["West", "서", 270], ["NorthWest", "북서", 315]];
const REGION_STORAGE = "signalnow-region";

type HistoryState = { layout: ManualIntersectionLayout; selectedDirection: ApproachDirection | null };

function offsetCoordinate(lat: number, lng: number, bearing: number, distanceMeters: number): { lat: number; lng: number } {
  const earth = 6371008.8;
  const br = bearing * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;
  const angular = distanceMeters / earth;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lng: ((lon2 * 180 / Math.PI + 540) % 360) - 180 };
}

function approachFromAuto(direction: ApproachDirection, geometry: IntersectionRoadGeometry | null): ApproachGroundTruth {
  const auto = geometry?.directionMatches[direction];
  return {
    direction,
    auto: auto ? { roadBearing: auto.bearing, axisBearing: auto.axisBearing, distanceMeters: auto.distanceMeters, confidence: auto.confidence } : undefined,
    source: "auto",
    confidence: auto?.confidence ?? 0,
    verified: false,
    updatedAt: new Date().toISOString(),
  };
}

function statusLabel(status: IntersectionVerificationStatus): string {
  return { UNREVIEWED: "미검수", AUTO_READY: "자동 배치", REVIEW_REQUIRED: "검수 필요", MANUAL_ONLY: "수동", VERIFIED: "검수 완료" }[status];
}

function statusClass(status: IntersectionVerificationStatus): string {
  return status === "VERIFIED" ? "bg-emerald-500/15 text-emerald-700" : status === "REVIEW_REQUIRED" || status === "MANUAL_ONLY" ? "bg-amber-500/15 text-amber-700" : "bg-muted text-muted-foreground";
}

function makeLayout(intersection: Intersection, geometry: IntersectionRoadGeometry | null, existing?: ManualIntersectionLayout | null): ManualIntersectionLayout {
  if (existing) return existing;
  const layout = createInitialLayout(intersection);
  layout.approaches = DIRECTIONS.map(([direction]) => approachFromAuto(direction, geometry));
  return layout;
}

export function IntersectionEditorPage() {
  const { loaded, error } = useKakaoLoader();
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => { const value = window.localStorage.getItem(REGION_STORAGE); return value === "ulsan" || value === "seoul" ? value : "ulsan"; });
  const region = TRAFFIC_REGIONS[regionId];
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<ManualIntersectionLayout | null>(null);
  const [geometry, setGeometry] = useState<IntersectionRoadGeometry | null>(null);
  const [signals, setSignals] = useState<Intersection["signals"]>([]);
  const [selectedDirection, setSelectedDirection] = useState<ApproachDirection | null>(null);
  const [saved, setSaved] = useState(true);
  const [statusMessage, setStatusMessage] = useState("준비됨");
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const previewOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const handleMarkersRef = useRef<Map<ApproachDirection, kakao.maps.Marker>>(new Map());
  const signalLabelsRef = useRef<Map<ApproachDirection, kakao.maps.CustomOverlay>>(new Map());

  const selectedIntersection = useMemo(() => intersections.find((item) => item.crsrdId === selectedId) ?? null, [intersections, selectedId]);
  const filtered = useMemo(() => { const text = query.trim().toLowerCase(); return intersections.filter((item) => !text || item.crsrdNm.toLowerCase().includes(text) || item.crsrdId.toLowerCase().includes(text)).sort((a, b) => a.crsrdNm.localeCompare(b.crsrdNm, "ko")); }, [intersections, query]);
  const currentApproach = useMemo(() => layout?.approaches.find((item) => item.direction === selectedDirection) ?? null, [layout, selectedDirection]);

  const pushHistory = useCallback((next: ManualIntersectionLayout, nextDirection: ApproachDirection | null) => {
    if (!layout) return;
    setHistory((prev) => [...prev.slice(-39), { layout: structuredClone(layout), selectedDirection }]);
    setFuture([]);
    setLayout(next);
    setSaved(false);
    setStatusMessage("수정됨 — 저장 필요");
    setSelectedDirection(nextDirection);
  }, [layout, selectedDirection]);

  const loadRegion = useCallback(async (nextRegion: TrafficRegionId) => {
    configureTrafficRegion(nextRegion);
    window.localStorage.setItem(REGION_STORAGE, nextRegion);
    setRegionId(nextRegion);
    setSelectedId(null); setLayout(null); setSignals([]); setGeometry(null); setSelectedDirection(null);
    setStatusMessage("교차로 불러오는 중…");
    try {
      const span = nextRegion === "ulsan" ? 0.22 : 0.18;
      const items = await loadIntersectionsForViewport({ south: region.center.lat - span, west: region.center.lng - span, north: region.center.lat + span, east: region.center.lng + span }, { loadAll: true });
      setIntersections(items);
      setStatusMessage(`${items.length}개 교차로 로드됨`);
    } catch (e) { setStatusMessage(e instanceof Error ? e.message : "교차로 로드 실패"); }
  }, [region.center.lat, region.center.lng]);

  useEffect(() => { void loadRegion(regionId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectIntersection = useCallback(async (intersection: Intersection) => {
    setSelectedId(intersection.crsrdId); setSelectedDirection(null); setSignals([]); setStatusMessage("자동 geometry 분석 중…");
    const existing = intersectionLayoutRepository.get(intersection.crsrdId);
    const [nextGeometry, signalResult] = await Promise.all([
      getRoadGeometry(intersection.crsrdId, intersection.mapCtptIntLat, intersection.mapCtptIntLot),
      fetchSelectedIntersectionSignals(intersection.crsrdId),
    ]);
    setGeometry(nextGeometry);
    setSignals(signalResult.signals);
    setLayout(makeLayout(intersection, nextGeometry, existing));
    setHistory([]); setFuture([]); setSaved(Boolean(existing));
    setStatusMessage(existing ? "저장된 Ground Truth 불러옴" : "자동 배치 결과 로드됨");
  }, []);

  useEffect(() => {
    if (!loaded || !mapContainerRef.current || mapRef.current) return;
    const map = new kakao.maps.Map(mapContainerRef.current, { center: new kakao.maps.LatLng(region.center.lat, region.center.lng), level: 5 });
    mapRef.current = map;
    return () => { for (const marker of handleMarkersRef.current.values()) marker.setMap(null); for (const overlay of signalLabelsRef.current.values()) overlay.setMap(null); previewOverlayRef.current?.setMap(null); mapRef.current = null; };
  }, [loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedIntersection || !layout) return;
    map.setCenter(new kakao.maps.LatLng(layout.coordinate.lat, layout.coordinate.lng));
    map.setLevel(5);
    for (const marker of handleMarkersRef.current.values()) marker.setMap(null);
    for (const overlay of signalLabelsRef.current.values()) overlay.setMap(null);
    handleMarkersRef.current.clear(); signalLabelsRef.current.clear();
    for (const [direction, label, angle] of DIRECTIONS) {
      const approach = layout.approaches.find((item) => item.direction === direction);
      const auto = approach?.auto;
      const manual = approach?.manual;
      const finalPosition = manual?.signalPosition ?? (auto?.distanceMeters !== undefined ? offsetCoordinate(layout.coordinate.lat, layout.coordinate.lng, manual?.roadBearing ?? auto.roadBearing ?? angle, auto.distanceMeters) : offsetCoordinate(layout.coordinate.lat, layout.coordinate.lng, angle, 10));
      const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(finalPosition.lat, finalPosition.lng), map, draggable: true, zIndex: direction === selectedDirection ? 20 : 10 });
      kakao.maps.event.addListener(marker, "click", () => setSelectedDirection(direction));
      kakao.maps.event.addListener(marker, "dragstart", () => setSelectedDirection(direction));
      kakao.maps.event.addListener(marker, "dragend", () => {
        const pos = marker.getPosition();
        const next = structuredClone(layout);
        const target = next.approaches.find((item) => item.direction === direction);
        if (!target) return;
        target.manual = { ...(target.manual ?? { lanes: [] }), signalPosition: { lat: pos.getLat(), lng: pos.getLng() }, lanes: target.manual?.lanes ?? [], distanceMeters: auto?.distanceMeters, roadBearing: auto?.roadBearing, axisBearing: auto?.axisBearing };
        target.source = "manual"; target.verified = false; target.updatedAt = new Date().toISOString(); target.confidence = 1;
        next.status = "REVIEW_REQUIRED";
        setHistory((prev) => [...prev.slice(-39), { layout: structuredClone(layout), selectedDirection: direction }]); setFuture([]); setLayout(next); setSaved(false); setStatusMessage(`${label} 신호 위치 수정됨`);
      });
      handleMarkersRef.current.set(direction, marker);
      const content = document.createElement("div"); content.className = cn("rounded-xl border bg-card/95 px-2.5 py-1.5 text-[11px] font-bold shadow-lg backdrop-blur", direction === selectedDirection ? "border-primary ring-2 ring-primary/20" : "border-border"); content.textContent = `${label} ${signals.filter((signal) => signal.direction === direction).length}개`;
      const overlay = new kakao.maps.CustomOverlay({ position: marker.getPosition(), content, xAnchor: 0.5, yAnchor: 1.4, zIndex: 30 }); overlay.setMap(map); signalLabelsRef.current.set(direction, overlay);
      kakao.maps.event.addListener(map, "idle", () => overlay.setPosition(marker.getPosition()));
    }
    previewOverlayRef.current?.setMap(null);
  }, [selectedIntersection, layout, selectedDirection, signals]);

  useEffect(() => { if (!mapRef.current || !layout) return; const center = new kakao.maps.LatLng(layout.coordinate.lat, layout.coordinate.lng); const element = document.createElement("div"); element.className = "rounded-full border-2 border-primary bg-background/95 p-2 text-primary shadow-lg"; element.innerHTML = '<span style="display:block;width:8px;height:8px;border-radius:999px;background:currentColor"></span>'; previewOverlayRef.current = new kakao.maps.CustomOverlay({ position: center, content: element, xAnchor: 0.5, yAnchor: 0.5, zIndex: 40 }); previewOverlayRef.current.setMap(mapRef.current); return () => previewOverlayRef.current?.setMap(null); }, [layout]);

  const updateSelected = useCallback((patch: Partial<NonNullable<ApproachGroundTruth>["manual"]>) => {
    if (!layout || !selectedDirection) return;
    const next = structuredClone(layout); const target = next.approaches.find((item) => item.direction === selectedDirection); if (!target) return;
    target.manual = { ...(target.manual ?? { lanes: [] }), ...patch, lanes: target.manual?.lanes ?? [] }; target.source = "manual"; target.verified = false; target.updatedAt = new Date().toISOString(); target.confidence = 1; next.status = "REVIEW_REQUIRED";
    pushHistory(next, selectedDirection);
  }, [layout, selectedDirection, pushHistory]);

  const undo = useCallback(() => { if (!history.length || !layout) return; const item = history[history.length - 1]; setFuture((prev) => [{ layout: structuredClone(layout), selectedDirection }, ...prev]); setHistory((prev) => prev.slice(0, -1)); setLayout(item.layout); setSelectedDirection(item.selectedDirection); setSaved(false); setStatusMessage("Undo"); }, [history, layout, selectedDirection]);
  const redo = useCallback(() => { if (!future.length || !layout) return; const item = future[0]; setHistory((prev) => [...prev, { layout: structuredClone(layout), selectedDirection }]); setFuture((prev) => prev.slice(1)); setLayout(item.layout); setSelectedDirection(item.selectedDirection); setSaved(false); setStatusMessage("Redo"); }, [future, layout, selectedDirection]);
  const reset = useCallback(() => { if (!selectedIntersection) return; const next = makeLayout(selectedIntersection, geometry); pushHistory(next, null); setStatusMessage("자동 계산값으로 초기화됨"); }, [selectedIntersection, geometry, pushHistory]);
  const save = useCallback(() => { if (!layout) return; const next = { ...layout, metadata: { ...layout.metadata, updatedAt: new Date().toISOString() } }; intersectionLayoutRepository.save(next); setLayout(next); setSaved(true); setStatusMessage("Ground Truth 저장 완료"); }, [layout]);
  const verify = useCallback(() => { if (!layout) return; const now = new Date().toISOString(); const next = { ...layout, status: "VERIFIED" as const, metadata: { ...layout.metadata, updatedAt: now, verifiedAt: now, verifiedBy: "manual-editor" }, approaches: layout.approaches.map((item) => ({ ...item, verified: true })) }; intersectionLayoutRepository.save(next); setLayout(next); setSaved(true); setStatusMessage("검수 완료"); }, [layout]);

  const exportJson = useCallback(() => { const payload = intersectionLayoutRepository.exportAll(); const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `signalnow-ground-truth-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); }, []);
  const importJson = useCallback((event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const result = intersectionLayoutRepository.importAll(JSON.parse(String(reader.result)) as GroundTruthExport); setStatusMessage(result.errors.length ? `가져옴 ${result.imported}개 / 오류 ${result.errors.length}개` : `${result.imported}개 Ground Truth 가져옴`); if (selectedId) setLayout(intersectionLayoutRepository.get(selectedId)); } catch { setStatusMessage("JSON 파싱 실패"); } }; reader.readAsText(file); event.target.value = ""; }, [selectedId]);

  return null;
}
