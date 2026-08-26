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
      const items = await loadIntersectionsForViewport({ south: region.center.lat - span, west: region.center.lng - span, north: region.center.lat + span, east: region.center.lng + span });
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

  useEffect(() => { const onKey = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (target?.matches("input, textarea, select")) return; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if (event.key === "r") reset(); else if (event.key === "ArrowLeft") { const index = filtered.findIndex((item) => item.crsrdId === selectedId); if (index > 0) void selectIntersection(filtered[index - 1]); } else if (event.key === "ArrowRight") { const index = filtered.findIndex((item) => item.crsrdId === selectedId); if (index >= 0 && index < filtered.length - 1) void selectIntersection(filtered[index + 1]); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [save, redo, undo, reset, filtered, selectedId, selectIntersection]);

  if (error) return <div className="flex h-svh items-center justify-center p-6">카카오맵을 불러오지 못했습니다.</div>;

  return <div className="h-svh overflow-hidden bg-background text-foreground">
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 shadow-sm">
      <div className="flex items-center gap-3"><button onClick={() => { window.location.href = "/"; }} className="rounded-lg p-2 hover:bg-muted" aria-label="메인으로"><ArrowLeft className="size-4" /></button><div><h1 className="text-sm font-black">SignalNow Intersection Layout Editor</h1><p className="text-[10px] text-muted-foreground">수동 보정 → Ground Truth → 향후 자동화</p></div></div>
      <div className="flex items-center gap-2"><select value={regionId} onChange={(e) => void loadRegion(e.target.value as TrafficRegionId)} className="rounded-lg border bg-background px-2 py-1.5 text-xs"><option value="ulsan">울산</option><option value="seoul">서울</option></select><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", saved ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700")}>{saved ? "● Saved" : "● Unsaved"}</span></div>
    </header>
    <div className="grid h-[calc(100svh-3.5rem)] min-h-0 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside className="min-h-0 overflow-hidden border-r bg-card"><div className="border-b p-3"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="교차로명 / crsrdId" className="w-full rounded-lg border bg-background py-2 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" /></div><div className="mt-2 text-[10px] text-muted-foreground">{filtered.length}개 · 울산/서울 실제 KLID 데이터</div></div><div className="h-[calc(100%-76px)] overflow-auto p-2">{filtered.map((item) => { const savedLayout = intersectionLayoutRepository.get(item.crsrdId); const active = selectedId === item.crsrdId; return <button key={item.crsrdId} onClick={() => void selectIntersection(item)} className={cn("mb-1 w-full rounded-xl border p-2.5 text-left transition", active ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/60")}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold">{item.crsrdNm}</span><span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold", statusClass(savedLayout?.status ?? "UNREVIEWED"))}>{statusLabel(savedLayout?.status ?? "UNREVIEWED")}</span></div><div className="mt-1 text-[9px] text-muted-foreground">ID {item.crsrdId}</div></button>})}</div></aside>
      <main className="relative min-h-0 bg-muted/30"><div ref={mapContainerRef} className="absolute inset-0" />{!loaded && <div className="absolute inset-0 grid place-items-center bg-background/70">지도 불러오는 중…</div>}{selectedIntersection && layout && <div className="absolute left-3 top-3 z-20 rounded-xl border bg-card/90 px-3 py-2 shadow-lg backdrop-blur"><div className="text-xs font-black">{selectedIntersection.crsrdNm}</div><div className="text-[10px] text-muted-foreground">{selectedIntersection.mapCtptIntLat.toFixed(6)}, {selectedIntersection.mapCtptIntLot.toFixed(6)}</div><div className="mt-1 flex gap-1"><span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", statusClass(layout.status))}>{statusLabel(layout.status)}</span><span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">OSM {geometry?.confidence.toFixed(2) ?? "-"}</span></div></div>}{selectedIntersection && <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-2 rounded-xl border bg-card/90 p-2 shadow-lg backdrop-blur"><div className="flex items-center gap-1"><button onClick={undo} disabled={!history.length} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><Undo2 className="size-4" /></button><button onClick={redo} disabled={!future.length} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><Redo2 className="size-4" /></button><button onClick={reset} className="rounded-lg p-2 hover:bg-muted" title="자동 계산값으로 초기화"><RotateCcw className="size-4" /></button></div><div className="text-[10px] text-muted-foreground">{statusMessage}</div><div className="flex items-center gap-1"><button onClick={() => { const index = filtered.findIndex((item) => item.crsrdId === selectedId); if (index > 0) void selectIntersection(filtered[index - 1]); }} className="rounded-lg border p-2 hover:bg-muted"><ChevronLeft className="size-4" /></button><button onClick={save} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Save className="size-3.5" />저장</button><button onClick={verify} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><Check className="size-3.5" />검수 완료</button><button onClick={() => { const index = filtered.findIndex((item) => item.crsrdId === selectedId); if (index >= 0 && index < filtered.length - 1) void selectIntersection(filtered[index + 1]); }} className="rounded-lg border p-2 hover:bg-muted"><ChevronRight className="size-4" /></button></div></div>}</main>
      <aside className="min-h-0 overflow-auto border-l bg-card"><div className="border-b p-4"><div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Ground Truth</div><div className="mt-1 text-sm font-black">{selectedIntersection?.crsrdNm ?? "교차로를 선택하세요"}</div><div className="mt-1 text-[10px] text-muted-foreground">{statusMessage}</div></div>{selectedIntersection && layout && <div className="space-y-4 p-4">
        <section><div className="mb-2 text-[10px] font-black text-muted-foreground">APPROACHES</div><div className="grid grid-cols-2 gap-1.5">{DIRECTIONS.map(([direction, label, angle]) => { const item = layout.approaches.find((a) => a.direction === direction); const auto = item?.auto; const manual = item?.manual; return <button key={direction} onClick={() => setSelectedDirection(direction)} className={cn("rounded-xl border p-2 text-left", selectedDirection === direction ? "border-primary bg-primary/5" : "hover:bg-muted")}><div className="flex items-center justify-between"><span className="text-[11px] font-black">{label}</span><span className="text-[9px] text-muted-foreground">{manual ? "MANUAL" : "AUTO"}</span></div><div className="mt-1 text-[9px] text-muted-foreground">{(manual?.roadBearing ?? auto?.roadBearing ?? angle).toFixed(1)}° · {(manual?.distanceMeters ?? auto?.distanceMeters ?? 0).toFixed(1)}m</div></button>; })}</div></section>
        {selectedDirection && <section className="rounded-xl border bg-muted/30 p-3"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-black">{DIRECTIONS.find(([d]) => d === selectedDirection)?.[1]} 방향 편집</div><Grip className="size-4 text-muted-foreground" /></div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] font-bold text-muted-foreground">BEARING<input type="number" min="0" max="360" step="0.1" value={currentApproach?.manual?.roadBearing ?? currentApproach?.auto?.roadBearing ?? 0} onChange={(e) => updateSelected({ roadBearing: normalizeBearing(Number(e.target.value)) })} className="mt-1 w-full rounded-lg border bg-background p-2 text-xs" /></label><label className="text-[9px] font-bold text-muted-foreground">DISTANCE m<input type="number" min="0" step="0.1" value={currentApproach?.manual?.distanceMeters ?? currentApproach?.auto?.distanceMeters ?? 0} onChange={(e) => updateSelected({ distanceMeters: Math.max(0, Number(e.target.value)) })} className="mt-1 w-full rounded-lg border bg-background p-2 text-xs" /></label><label className="text-[9px] font-bold text-muted-foreground">LATERAL m<input type="number" step="0.1" value={currentApproach?.manual?.offsetMeters?.lateral ?? 0} onChange={(e) => updateSelected({ offsetMeters: { ...(currentApproach?.manual?.offsetMeters ?? { longitudinal: 0, lateral: 0 }), lateral: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border bg-background p-2 text-xs" /></label><label className="text-[9px] font-bold text-muted-foreground">LONGITUDINAL m<input type="number" step="0.1" value={currentApproach?.manual?.offsetMeters?.longitudinal ?? 0} onChange={(e) => updateSelected({ offsetMeters: { ...(currentApproach?.manual?.offsetMeters ?? { longitudinal: 0, lateral: 0 }), longitudinal: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border bg-background p-2 text-xs" /></label><label className="col-span-2 text-[9px] font-bold text-muted-foreground">LABEL ROTATION<input type="number" min="0" max="360" step="0.1" value={currentApproach?.manual?.labelRotation ?? currentApproach?.auto?.roadBearing ?? 0} onChange={(e) => updateSelected({ labelRotation: normalizeBearing(Number(e.target.value)) })} className="mt-1 w-full rounded-lg border bg-background p-2 text-xs" /></label></div><div className="mt-2 rounded-lg bg-background p-2 text-[9px] text-muted-foreground">지도에서 <b>핀을 직접 드래그</b>하면 실제 lat/lng로 저장됩니다. 픽셀 x/y는 저장하지 않습니다.</div></section>}
        <section className="rounded-xl border p-3"><div className="text-[10px] font-black">KLID SIGNALS</div><div className="mt-2 space-y-1">{signals.length ? signals.map((signal, index) => <div key={`${signal.direction}-${signal.movement}-${index}`} className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-[9px]"><span>{DIRECTIONS.find(([d]) => d === signal.direction)?.[1]} · {signal.movement}</span><span>{signal.remainingSeconds ?? "—"}초</span></div>) : <div className="text-[9px] text-muted-foreground">선택 교차로의 KLID 신호가 없습니다.</div>}</div></section>
        <section className="rounded-xl border p-3"><div className="text-[10px] font-black">GROUND TRUTH TOOLS</div><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={exportJson} className="inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-muted"><Download className="size-3" />Export</button><label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-muted"><Upload className="size-3" />Import<input type="file" accept="application/json" className="hidden" onChange={importJson} /></label></div></section>
      </div>}</aside>
    </div>
  </div>;
}

export default IntersectionEditorPage;
