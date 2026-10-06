import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, LocateFixed, MapPin, Navigation, RefreshCw, Search, Signal, Smartphone, X } from "lucide-react";

import { configureTrafficRegion, fetchSelectedIntersectionSignals, loadIntersectionsForViewport } from "@/services/viewportTrafficService";
import { getRoadGeometry } from "@/services/roadGeometryService";
import { DEFAULT_TRAFFIC_REGION, TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import { DIRECTION_LABELS_KO, MOVEMENT_LABELS_KO, PHASE_LABELS, phaseColor, type SignalColor } from "@/lib/signal";
import type { ApproachDirection, Intersection, MovementType, TrafficSignal } from "@/types/traffic";
import "./signal-navigation.css";

type GeoState = { lat: number; lng: number; accuracy: number; speed: number; heading: number | null };
type SignalSnapshot = { signals: TrafficSignal[]; receivedAt: number };
type DirectionKey = "North" | "East" | "South" | "West";
type HudSignal = { movement: MovementType; signal?: TrafficSignal };

const directionAngles: Record<DirectionKey, number> = { North: 0, East: 90, South: 180, West: 270 };
const directionOrder: DirectionKey[] = ["North", "East", "South", "West"];
const movementOrder: MovementType[] = ["Left Turn", "Straight", "Right Turn"];

function getRegionFromStorage(): TrafficRegionId {
  const stored = window.localStorage.getItem("signalnow-region");
  return stored === "ulsan" || stored === "seoul" ? stored : DEFAULT_TRAFFIC_REGION;
}

function normalizeAngle(value: number): number { return ((value % 360) + 360) % 360; }
function angularDistance(a: number, b: number): number { const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)); return Math.min(d, 360 - d); }

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371008.8;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI);
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatSpeed(speedMps: number): string {
  if (!Number.isFinite(speedMps) || speedMps < 0.5) return "0";
  return String(Math.round(speedMps * 3.6));
}

function signalColor(signal?: TrafficSignal): SignalColor {
  return signal ? phaseColor(signal.state) : "red";
}

function countdown(signal?: TrafficSignal, snapshotAt?: number, now = Date.now()): number | undefined {
  if (!signal?.remainingSeconds || snapshotAt === undefined) return signal?.remainingSeconds;
  return Math.max(0, Math.floor(signal.remainingSeconds - Math.max(0, now - snapshotAt) / 1000));
}

function findBestDirection(heading: number | null, geometry: Awaited<ReturnType<typeof getRoadGeometry>>): ApproachDirection | null {
  if (heading === null) return null;
  const approaches = geometry ? Object.entries(geometry.directionMatches) : [];
  if (!approaches.length) return null;
  const reverseHeading = normalizeAngle(heading + 180);
  return approaches
    .map(([direction, approach]) => ({ direction: direction as ApproachDirection, score: approach ? angularDistance(approach.bearing, reverseHeading) : 999 }))
    .sort((a, b) => a.score - b.score)[0]?.direction ?? null;
}

function nearestIntersection(position: GeoState, intersections: Intersection[], heading: number | null): Intersection | null {
  const ranked = intersections
    .map((intersection) => {
      const d = distanceMeters(position, { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot });
      const approachBearing = bearing(position, { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot });
      const headingPenalty = heading === null ? 0 : Math.max(0, angularDistance(heading, approachBearing) - 45) * 3;
      return { intersection, score: d + headingPenalty, distance: d };
    })
    .filter((item) => item.distance <= 3000)
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.intersection ?? null;
}

function SignalPill({ color, active }: { color: SignalColor; active: boolean }) {
  return <span className={`sn-signal-pill sn-signal-${color} ${active ? "is-active" : ""}`} aria-hidden />;
}

function SignalColumn({ label, signal, seconds }: { label: string; signal?: TrafficSignal; seconds?: number }) {
  const color = signalColor(signal);
  const isActive = Boolean(signal);
  return (
    <div className={`sn-column sn-column-${color}`}>
      <div className="sn-column-label">{label}</div>
      <div className="sn-lamp-stack">
        <SignalPill color="red" active={color === "red"} />
        <SignalPill color="yellow" active={color === "yellow"} />
        <SignalPill color="green" active={color === "green"} />
      </div>
      <div className={`sn-column-seconds ${isActive ? "is-live" : ""}`}>{seconds ?? "—"}</div>
    </div>
  );
}

export function SignalNavigationPage() {
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => getRegionFromStorage());
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [position, setPosition] = useState<GeoState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signalSnapshot, setSignalSnapshot] = useState<SignalSnapshot | null>(null);
  const [roadGeometry, setRoadGeometry] = useState<Awaited<ReturnType<typeof getRoadGeometry>>>(null);
  const [loading, setLoading] = useState(true);
  const [signalLoading, setSignalLoading] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);

  const region = TRAFFIC_REGIONS[regionId];

  const loadAll = useCallback(async (nextRegion: TrafficRegionId) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    configureTrafficRegion(nextRegion);
    try {
      const all = await loadIntersectionsForViewport({ south: 0, west: 0, north: 0, east: 0 }, { loadAll: true });
      if (requestId !== requestRef.current) return;
      setIntersections(all);
      setSelectedId((current) => current && all.some((item) => item.crsrdId === current) ? current : null);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(regionId); }, [loadAll, regionId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPosition((previous) => {
          const speed = p.coords.speed ?? previous?.speed ?? 0;
          const heading = Number.isFinite(p.coords.heading ?? NaN) ? p.coords.heading : previous?.heading ?? null;
          return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed, heading };
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const nearest = useMemo(() => position ? nearestIntersection(position, intersections, position.heading) : null, [position, intersections]);

  useEffect(() => {
    if (!nearest) return;
    setSelectedId(nearest.crsrdId);
  }, [nearest?.crsrdId]);

  useEffect(() => {
    if (!selectedId) return;
    const intersection = intersections.find((item) => item.crsrdId === selectedId);
    if (!intersection) return;
    const controller = new AbortController();
    setSignalLoading(true);
    Promise.all([
      fetchSelectedIntersectionSignals(selectedId, { forceRefresh: false }),
      getRoadGeometry(selectedId, intersection.mapCtptIntLat, intersection.mapCtptIntLot, { signal: controller.signal }),
    ]).then(([signalResult, geometry]) => {
      if (controller.signal.aborted) return;
      setSignalSnapshot({ signals: signalResult.signals, receivedAt: Date.now() });
      setRoadGeometry(geometry);
    }).finally(() => { if (!controller.signal.aborted) setSignalLoading(false); });
    return () => controller.abort();
  }, [selectedId, intersections]);

  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(async () => {
      const result = await fetchSelectedIntersectionSignals(selectedId, { forceRefresh: true });
      if (result.status === "success" && result.signals.length) setSignalSnapshot({ signals: result.signals, receivedAt: Date.now() });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [selectedId]);

  const activeDirection = useMemo(() => findBestDirection(position?.heading ?? null, roadGeometry), [position?.heading, roadGeometry]);
  const fallbackDirection = useMemo(() => {
    if (!position || !selectedId) return null;
    const intersection = intersections.find((item) => item.crsrdId === selectedId);
    if (!intersection) return null;
    const toIntersection = bearing(position, { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot });
    const reverse = normalizeAngle(toIntersection + 180);
    return directionOrder.reduce((best, direction) => angularDistance(reverse, directionAngles[direction]) < angularDistance(reverse, directionAngles[best]) ? direction : best, "North" as DirectionKey);
  }, [position, selectedId, intersections]);

  const signalDirection = activeDirection ?? fallbackDirection;
  const visibleSignals = useMemo(() => {
    const all = signalSnapshot?.signals ?? [];
    if (!signalDirection) return all;
    return all.filter((signal) => signal.direction === signalDirection);
  }, [signalSnapshot, signalDirection]);

  const hudSignals: HudSignal[] = useMemo(() => movementOrder.map((movement) => ({
    movement,
    signal: visibleSignals.find((item) => item.movement === movement),
  })), [visibleSignals]);

  const preferredSignal = hudSignals.find((item) => item.movement === "Straight")?.signal ?? visibleSignals.find((item) => item.movement === "Bus") ?? visibleSignals[0];
  const distance = position && nearest ? distanceMeters(position, { lat: nearest.mapCtptIntLat, lng: nearest.mapCtptIntLot }) : null;
  const filteredIntersections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return intersections.slice(0, 80);
    return intersections.filter((item) => `${item.crsrdNm} ${item.crsrdEngNm ?? ""} ${item.crsrdId}`.toLowerCase().includes(normalized)).slice(0, 80);
  }, [intersections, query]);

  const toggleCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraEnabled(false);
      return;
    }
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraEnabled(true);
    } catch {
      setCameraError("카메라 권한을 허용하면 영상 위에 실시간 신호 HUD를 표시할 수 있습니다.");
    }
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const chooseIntersection = useCallback((id: string) => {
    setSelectedId(id);
    setSearchOpen(false);
  }, []);

  const switchRegion = useCallback((next: TrafficRegionId) => {
    window.localStorage.setItem("signalnow-region", next);
    setRegionId(next);
    setSelectedId(null);
    setSignalSnapshot(null);
    setRoadGeometry(null);
  }, []);

  const secondsFor = (signal?: TrafficSignal) => countdown(signal, signalSnapshot?.receivedAt, now);

  return (
    <main className="sn-page">
      <video ref={videoRef} className={`sn-camera ${cameraEnabled ? "is-visible" : ""}`} muted playsInline aria-hidden />
      <div className={`sn-camera-placeholder ${cameraEnabled ? "is-hidden" : ""}`}>
        <div className="sn-placeholder-grid" />
        <div className="sn-placeholder-copy">
          <Navigation size={34} />
          <strong>SignalNow 내비게이션</strong>
          <span>실제 교차로·실시간 신호 데이터를 기준으로 표시합니다.</span>
        </div>
      </div>
      <div className="sn-vignette" />

      <header className="sn-topbar">
        <a href="/" className="sn-back" aria-label="SignalNow로 돌아가기"><ArrowLeft size={19} /></a>
        <div className="sn-brand"><span>Signal</span><b>Now</b><small>NAV</small></div>
        <div className="sn-region">
          {(Object.keys(TRAFFIC_REGIONS) as TrafficRegionId[]).map((id) => (
            <button key={id} className={id === regionId ? "is-active" : ""} onClick={() => switchRegion(id)}>{TRAFFIC_REGIONS[id].name.replace("특별시", "").replace("광역시", "")}</button>
          ))}
        </div>
        <button className="sn-top-action" onClick={() => setSearchOpen(true)} aria-label="교차로 검색"><Search size={18} /></button>
      </header>

      <section className="sn-hud">
        <div className="sn-route-card">
          <div className="sn-route-row">
            <div className="sn-turn-icon"><Navigation size={24} /></div>
            <div className="sn-route-copy">
              <span>{nearest ? "다음 신호 교차로" : "교차로 데이터 탐색 중"}</span>
              <strong>{nearest?.crsrdNm ?? region.name}</strong>
              <small>{distance !== null ? `${formatDistance(distance)} 앞 · ${signalDirection ? DIRECTION_LABELS_KO[signalDirection] : "방향 확인 중"}` : "현재 위치를 허용하면 가장 가까운 실제 교차로를 자동 선택합니다."}</small>
            </div>
            <div className="sn-route-distance">{distance !== null ? formatDistance(distance) : "—"}</div>
          </div>
        </div>

        <div className="sn-signal-card">
          <div className="sn-signal-card-head">
            <div><span>실시간 교통신호</span><strong>{preferredSignal ? PHASE_LABELS[preferredSignal.state] : signalLoading ? "불러오는 중" : "데이터 선택 대기"}</strong></div>
            <div className="sn-live"><i /> LIVE</div>
          </div>
          <div className="sn-columns">
            {hudSignals.map(({ movement, signal }) => <SignalColumn key={movement} label={MOVEMENT_LABELS_KO[movement]} signal={signal} seconds={secondsFor(signal)} />)}
          </div>
          <div className="sn-signal-meta">
            <span>{signalDirection ? DIRECTION_LABELS_KO[signalDirection] : "전체 방향"}</span>
            <span>{preferredSignal ? `${MOVEMENT_LABELS_KO[preferredSignal.movement]} 기준` : "실제 API 신호 데이터"}</span>
          </div>
        </div>

        <div className="sn-speed-card">
          <span>현재 속도</span>
          <strong>{position ? formatSpeed(position.speed) : "—"}</strong>
          <small>km/h</small>
        </div>

        <div className="sn-actions">
          <button onClick={() => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(() => undefined); }}><LocateFixed size={17} />내 위치</button>
          <button onClick={() => void loadAll(regionId)}><RefreshCw size={17} />데이터 새로고침</button>
          <button className={cameraEnabled ? "is-active" : ""} onClick={() => void toggleCamera}><Camera size={17} />{cameraEnabled ? "카메라 끄기" : "카메라 켜기"}</button>
        </div>
        {cameraError && <div className="sn-camera-error">{cameraError}</div>}
      </section>

      <section className="sn-all-signals">
        <div className="sn-all-signals-head"><strong>전체 실제 신호 데이터</strong><span>{signalSnapshot?.signals.length ?? 0}개</span></div>
        <div className="sn-all-signals-grid">
          {(signalSnapshot?.signals ?? []).map((signal, index) => {
            const seconds = secondsFor(signal);
            const color = signalColor(signal);
            return <div key={`${signal.direction}-${signal.movement}-${index}`} className="sn-all-signal-row">
              <span className="sn-all-dir">{DIRECTION_LABELS_KO[signal.direction]}</span>
              <span className="sn-all-movement">{MOVEMENT_LABELS_KO[signal.movement]}</span>
              <SignalPill color={color} active />
              <b>{PHASE_LABELS[signal.state]}</b>
              <strong>{seconds ?? "—"}{seconds !== undefined ? "초" : ""}</strong>
            </div>;
          })}
          {!signalSnapshot?.signals.length && <div className="sn-all-empty">선택된 실제 교차로의 신호 데이터가 로딩되면 모든 방향·이동 유형이 여기에 표시됩니다.</div>}
        </div>
      </section>

      <footer className="sn-footer">
        <div><Signal size={15} /><span>{loading ? "전체 교차로 데이터 로딩 중" : `${intersections.length.toLocaleString()}개 실제 교차로 데이터`}</span></div>
        <div><Smartphone size={15} /><span>실시간 위치 · 신호 연동</span></div>
      </footer>

      {searchOpen && (
        <div className="sn-search-backdrop" role="dialog" aria-modal="true">
          <div className="sn-search-panel">
            <div className="sn-search-head">
              <div><MapPin size={19} /><strong>전체 교차로</strong><span>{intersections.length.toLocaleString()}개</span></div>
              <button onClick={() => setSearchOpen(false)} aria-label="닫기"><X size={20} /></button>
            </div>
            <label className="sn-search-input"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="교차로명 또는 ID 검색" /></label>
            <div className="sn-search-list">
              {filteredIntersections.map((item) => (
                <button key={item.crsrdId} className={item.crsrdId === selectedId ? "is-selected" : ""} onClick={() => chooseIntersection(item.crsrdId)}>
                  <span>{item.crsrdNm}</span><small>{item.crsrdId} · {item.lclgvNm ?? ""}</small>
                </button>
              ))}
              {!filteredIntersections.length && <div className="sn-empty">검색 결과가 없습니다.</div>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default SignalNavigationPage;
