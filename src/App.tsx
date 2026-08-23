import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
import { FloatingButton } from "@/components/FloatingButton";
import { Header } from "@/components/Header";
import { KakaoMap } from "@/components/map/KakaoMap";
import { SearchPanel } from "@/components/SearchPanel";
import { configureTrafficRegion, fetchSelectedIntersectionSignals, type SignalLoadStatus, type SignalDiagnostic, loadIntersectionsForViewport } from "@/services/viewportTrafficService";
import { DEFAULT_TRAFFIC_REGION, TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import type { DataStatus, Intersection, TrafficSignal, ViewMode } from "@/types/traffic";

import { AuthProvider } from "@/auth/context/AuthContext";
import { LoginModal } from "@/auth/components/LoginModal";
import { MyPage } from "@/auth/pages/MyPage";
import { ProtectedRoute } from "@/auth/components/ProtectedRoute";
import { SettingsPage } from "@/auth/pages/SettingsPage";

const MAX_RECENT = 5;
type Page = "map" | "mypage" | "settings";
type Viewport = { south: number; west: number; north: number; east: number };
type DebugInfo = { apiStatus: string; itemCount: number; targetId: string; matched: boolean; extractedCount: number; finalCount: number; state: string; reason: string; signalDiagnostics: SignalDiagnostic[]; receivedAt: number | null };
const debugEnabled = () => new URLSearchParams(window.location.search).get("debug") === "1";
const debugLog = (message: string, data: Record<string, unknown>) => { if (debugEnabled()) console.log(`[SignalNow debug] ${message}`, data); };

function getCountdownSignals(signals: TrafficSignal[], receivedAt: number, now: number): TrafficSignal[] {
  const elapsedSeconds = Math.max(0, Math.floor((now - receivedAt) / 1000));
  return signals.map((signal) => signal.remainingSeconds === undefined ? signal : { ...signal, remainingSeconds: Math.max(0, signal.remainingSeconds - elapsedSeconds) });
}

function getStoredRegion(): TrafficRegionId {
  const stored = window.localStorage.getItem("signalnow-region");
  return stored === "ulsan" || stored === "seoul" ? stored : DEFAULT_TRAFFIC_REGION;
}

function AppInner() {
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => getStoredRegion());
  const region = TRAFFIC_REGIONS[regionId];
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("driver");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [page, setPage] = useState<Page>("map");
  const [signalLoadingId, setSignalLoadingId] = useState<string | null>(null);
  const [signalStatus, setSignalStatus] = useState<Record<string, SignalLoadStatus>>({});
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ apiStatus: "-", itemCount: 0, targetId: "-", matched: false, extractedCount: 0, finalCount: 0, state: "idle", reason: "", signalDiagnostics: [], receivedAt: null });
  const viewportRequestRef = useRef(0);
  const signalRequestRef = useRef(0);
  const signalDataRef = useRef<Map<string, TrafficSignal[]>>(new Map());
  const signalReceivedAtRef = useRef<Map<string, number>>(new Map());
  const signalRefreshInFlightRef = useRef(false);

  const handleRegionChange = useCallback((nextRegionId: TrafficRegionId) => {
    if (nextRegionId === regionId) return;
    window.localStorage.setItem("signalnow-region", nextRegionId);
    configureTrafficRegion(nextRegionId);
    viewportRequestRef.current += 1;
    signalRequestRef.current += 1;
    signalDataRef.current.clear();
    signalReceivedAtRef.current.clear();
    signalRefreshInFlightRef.current = false;
    setRegionId(nextRegionId);
    setIntersections([]);
    setStatus("idle");
    setSelectedId(null);
    setSheetOpen(false);
    setSignalLoadingId(null);
    setSignalStatus({});
    setRecentIds([]);
    setCountdownNow(Date.now());
    setDebugInfo({ apiStatus: "-", itemCount: 0, targetId: "-", matched: false, extractedCount: 0, finalCount: 0, state: "idle", reason: "region-changed", signalDiagnostics: [], receivedAt: null });
  }, [regionId]);

  const handleViewportChange = useCallback(async (viewport: Viewport) => {
    const requestId = ++viewportRequestRef.current;
    setStatus("loading");
    try {
      const visibleIntersections = await loadIntersectionsForViewport(viewport);
      if (requestId !== viewportRequestRef.current) return;
      const hydrated = visibleIntersections.map((intersection) => {
        const cachedSignals = signalDataRef.current.get(intersection.crsrdId);
        return cachedSignals ? { ...intersection, signals: cachedSignals } : intersection;
      });
      setIntersections(hydrated);
      setStatus("success");
    } catch (error) {
      if (requestId !== viewportRequestRef.current) return;
      console.error("[SignalNow] viewport 교차로 로딩 실패", error);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    configureTrafficRegion(regionId);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setCountdownNow(Date.now());
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);
      const refreshTargetId = selectedId;
      const receivedAt = signalReceivedAtRef.current.get(refreshTargetId);
      const sourceSignals = signalDataRef.current.get(refreshTargetId);
      if (!receivedAt || !sourceSignals || signalRefreshInFlightRef.current) return;
      const elapsedSeconds = Math.max(0, Math.floor((now - receivedAt) / 1000));
      const hasExpiredSignal = sourceSignals.some((signal) => signal.remainingSeconds !== undefined && Math.max(0, signal.remainingSeconds - elapsedSeconds) <= 0);
      if (!hasExpiredSignal) return;
      signalRefreshInFlightRef.current = true;
      debugLog("signal phase refresh start", { region: regionId, crsrdId: refreshTargetId, reason: "remaining-reached-zero" });
      fetchSelectedIntersectionSignals(refreshTargetId, { forceRefresh: true })
        .then((result) => {
          const refreshedAt = Date.now();
          signalDataRef.current.set(refreshTargetId, result.signals);
          signalReceivedAtRef.current.set(refreshTargetId, refreshedAt);
          setCountdownNow(refreshedAt);
          setSignalStatus((prev) => ({ ...prev, [refreshTargetId]: result.status }));
          setDebugInfo((info) => ({ ...info, apiStatus: result.debug.apiStatus, itemCount: result.debug.itemCount, targetId: refreshTargetId, matched: result.debug.matched, extractedCount: result.signals.length, finalCount: result.signals.length, state: result.status, reason: result.status === "empty" || result.status === "error" ? result.debug.failureReason : "", signalDiagnostics: result.debug.signalDiagnostics, receivedAt: refreshedAt }));
          setIntersections((prev) => prev.map((intersection) => intersection.crsrdId === refreshTargetId ? { ...intersection, signals: result.signals } : intersection));
          debugLog("signal phase refresh complete", { region: regionId, crsrdId: refreshTargetId, signalCount: result.signals.length, status: result.status });
        })
        .catch(() => debugLog("signal phase refresh failed", { region: regionId, crsrdId: refreshTargetId }))
        .finally(() => { signalRefreshInFlightRef.current = false; });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [selectedId, regionId]);

  useEffect(() => {
    if (!selectedId || !sheetOpen) {
      if (debugEnabled() && !selectedId) setDebugInfo((info) => ({ ...info, state: "idle", reason: "no-selected-id" }));
      return;
    }
    const currentSignalStatus = signalStatus[selectedId];
    setDebugInfo((info) => ({ ...info, targetId: selectedId, state: currentSignalStatus ?? "loading", reason: "" }));
    debugLog("signal fetch start", { region: regionId, crsrdId: selectedId });
    if (currentSignalStatus === "loading" || currentSignalStatus === "success" || currentSignalStatus === "empty" || currentSignalStatus === "error") return;
    const requestId = ++signalRequestRef.current;
    const safetyTimeoutId = window.setTimeout(() => {
      if (requestId !== signalRequestRef.current) return;
      setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
      setSignalLoadingId((current) => (current === selectedId ? null : current));
      setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "error", reason: "signal-load-timeout" }));
    }, 15000);
    setSignalLoadingId(selectedId);
    setSignalStatus((prev) => ({ ...prev, [selectedId]: "loading" }));
    setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "loading", reason: "" }));
    fetchSelectedIntersectionSignals(selectedId)
      .then((result) => {
        if (requestId !== signalRequestRef.current) return;
        const receivedAt = Date.now();
        signalDataRef.current.set(selectedId, result.signals);
        signalReceivedAtRef.current.set(selectedId, receivedAt);
        setCountdownNow(receivedAt);
        setSignalStatus((prev) => ({ ...prev, [selectedId]: result.status }));
        setDebugInfo((info) => ({ ...info, apiStatus: result.debug.apiStatus, itemCount: result.debug.itemCount, targetId: selectedId, matched: result.debug.matched, extractedCount: result.signals.length, state: result.status, reason: result.status === "empty" || result.status === "error" ? result.debug.failureReason : "", signalDiagnostics: result.debug.signalDiagnostics, receivedAt }));
        setIntersections((prev) => {
          const next = prev.map((intersection) => intersection.crsrdId === selectedId ? { ...intersection, signals: result.signals } : intersection);
          const finalCount = next.find((intersection) => intersection.crsrdId === selectedId)?.signals.length ?? 0;
          setDebugInfo((info) => ({ ...info, finalCount }));
          return next;
        });
      })
      .catch(() => {
        if (requestId !== signalRequestRef.current) return;
        setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
        setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "error", reason: "signal-fetch-error" }));
      })
      .finally(() => {
        window.clearTimeout(safetyTimeoutId);
        if (requestId !== signalRequestRef.current) return;
        setSignalLoadingId((current) => (current === selectedId ? null : current));
      });
    return () => {};
  }, [selectedId, sheetOpen, regionId]);

  const selectedIntersection = useMemo(() => {
    if (!selectedId) return null;
    const intersection = intersections.find((item) => item.crsrdId === selectedId) ?? null;
    if (!intersection) return null;
    const receivedAt = signalReceivedAtRef.current.get(selectedId);
    const sourceSignals = signalDataRef.current.get(selectedId) ?? intersection.signals;
    if (!receivedAt) return { ...intersection, signals: sourceSignals };
    return { ...intersection, signals: getCountdownSignals(sourceSignals, receivedAt, countdownNow) };
  }, [selectedId, intersections, countdownNow]);

  const recentIntersections = useMemo(() => recentIds.map((id) => intersections.find((intersection) => intersection.crsrdId === id)).filter((i): i is Intersection => i !== undefined), [recentIds, intersections]);
  const recordRecent = useCallback((id: string) => setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, MAX_RECENT)), []);
  const handleSelectIntersection = useCallback((intersectionId: string) => { setDebugInfo((info) => ({ ...info, targetId: intersectionId || "-", state: intersectionId ? "loading" : "blocked", reason: intersectionId ? "" : "missing-crsrdId", signalDiagnostics: [], receivedAt: null })); setSelectedId(intersectionId); setSheetOpen(true); recordRecent(intersectionId); }, [recordRecent]);
  const handleCloseSheet = useCallback(() => { setSheetOpen(false); setSelectedId(null); }, []);
  const handleToggleFavorite = useCallback((intersectionId: string) => setFavorites((prev) => { const next = new Set(prev); if (next.has(intersectionId)) next.delete(intersectionId); else next.add(intersectionId); return next; }), []);
  const handleClearRecent = useCallback(() => setRecentIds([]), []);
  const handleLoginClick = useCallback(() => setLoginOpen(true), []);
  const handleProfileClick = useCallback(() => setPage("mypage"), []);
  const handleBackToMap = useCallback(() => setPage("map"), []);
  const handleSettingsClick = useCallback(() => setPage("settings"), []);
  const panelStatus: DataStatus = status === "loading" ? "loading" : status === "error" ? "error" : "success";
  const selectedSignalStatus = selectedId ? signalStatus[selectedId] : undefined;
  const debug = debugEnabled();
  const debugReceivedAt = debugInfo.receivedAt;
  const debugElapsed = debugReceivedAt ? Math.max(0, Math.floor((countdownNow - debugReceivedAt) / 1000)) : 0;
  const abnormalDiagnostics = debugInfo.signalDiagnostics.filter((item) => typeof item.parsedRemaining === "number" && item.parsedRemaining > 300).slice(0, 5);
  const firstDiagnostic = debugInfo.signalDiagnostics[0];
  const firstSignal = firstDiagnostic ? selectedIntersection?.signals.find((signal) => signal.direction === firstDiagnostic.direction && signal.movement === firstDiagnostic.movement) : undefined;
  const firstBase = firstDiagnostic?.parsedRemaining;
  const firstDisplay = firstSignal?.remainingSeconds;

  return (
    <div className="h-svh overflow-hidden bg-background">
      {page === "map" && <div className="relative h-full w-full">
        <div className={`absolute inset-0 transition-[padding] duration-300 ease-out ${sheetOpen ? "lg:pr-[360px]" : "lg:pr-0"}`}><KakaoMap intersections={intersections} selectedIntersection={selectedIntersection} selectedIntersectionId={selectedId} favoriteIds={favorites} viewMode={viewMode} region={region} onSelectIntersection={handleSelectIntersection} onViewportChange={handleViewportChange} /></div>
        <Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} floating intersections={intersections} onSelectIntersection={handleSelectIntersection} />
        <div className="pointer-events-none absolute left-3 top-16 z-20 lg:hidden"><div className="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-[340px]"><SearchPanel mode={viewMode} onModeChange={setViewMode} intersections={intersections} onSelect={handleSelectIntersection} region={region} regions={Object.values(TRAFFIC_REGIONS)} onRegionChange={handleRegionChange} /></div></div>
        <div className="pointer-events-none absolute left-4 top-16 z-20 hidden lg:block"><div className="pointer-events-auto"><SearchPanel modeOnly mode={viewMode} onModeChange={setViewMode} region={region} regions={Object.values(TRAFFIC_REGIONS)} onRegionChange={handleRegionChange} /></div></div>
        <FloatingButton className={`fixed right-4 z-20 transition-[bottom] duration-300 ease-out ${sheetOpen ? "bottom-[104px] lg:bottom-8" : "bottom-6 lg:bottom-8"}`} onClick={() => {}} />
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 hidden lg:flex"><div className="pointer-events-auto m-4 flex items-center gap-3 rounded-xl border border-border/20 bg-card/80 glass px-4 py-2 text-[11px] font-medium text-muted-foreground elevation-2"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-green" /> 원활</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-yellow" /> 보통</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-red" /> 혼잡</span><span className="text-muted-foreground/50">정보없음</span><span className="ml-1 flex items-center gap-1 text-muted-foreground/50"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/40" /><span className="relative inline-flex size-1.5 rounded-full bg-signal-green" /></span> API 연동됨</span></div></div>
        {selectedSignalStatus === "error" && <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-destructive/20 bg-background/95 px-4 py-2 text-xs font-medium text-destructive shadow-lg">선택한 교차로의 신호 데이터를 불러오지 못했습니다. 다시 선택해 주세요.</div>}
        {debug && <div className="pointer-events-none absolute bottom-4 right-4 z-50 max-h-[70vh] max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-border bg-background/95 px-3 py-2 text-[11px] leading-5 text-foreground shadow-lg"><div className="font-semibold">SignalNow Debug</div><div>Region: {region.name}</div><div>API: {debugInfo.apiStatus}</div><div>Items: {debugInfo.itemCount}</div><div>Target: {debugInfo.targetId}</div><div>Match: {debugInfo.matched ? "YES" : "NO"}</div><div>Signals: {debugInfo.extractedCount}</div><div>Final: {debugInfo.finalCount}</div><div>Status: {debugInfo.state}</div>{debugInfo.reason && <div>Reason: {debugInfo.reason}</div>}<div className="mt-1 border-t border-border pt-1 font-semibold">Signal Debug</div>{firstDiagnostic ? <><div>Direction: {firstDiagnostic.direction}</div><div>Movement: {firstDiagnostic.movement}</div><div>Field: {firstDiagnostic.field}</div><div>Raw Remaining: {String(firstDiagnostic.rawRemaining ?? "undefined")}</div><div>Parsed Remaining: {String(firstDiagnostic.parsedRemaining ?? "undefined")}</div><div>Signal Remaining: {String(firstSignal?.remainingSeconds ?? "undefined")}</div><div>Received At: {debugReceivedAt ? new Date(debugReceivedAt).toISOString() : "-"}</div><div>Elapsed: {debugElapsed}</div><div>Base Remaining: {String(firstBase ?? "undefined")}</div><div>Final Display: {String(firstDisplay ?? "undefined")}</div>{typeof firstDiagnostic.parsedRemaining === "number" && firstDiagnostic.parsedRemaining > 300 && <div className="font-semibold text-destructive">⚠ Abnormal Remaining: {firstDiagnostic.parsedRemaining}</div>}</> : <div>No signal diagnostic</div>}{abnormalDiagnostics.length > 0 && <div className="mt-1 border-t border-border pt-1"><div className="font-semibold">Abnormal Signals</div>{abnormalDiagnostics.map((item, index) => <div key={`${item.direction}-${item.movement}-${index}`}>{index + 1}. {item.direction} / {item.movement} / {item.field} / {String(item.rawRemaining ?? "undefined")} / {String(item.parsedRemaining ?? "undefined")}</div>)}</div>}</div>}
        <BottomSheet open={sheetOpen} intersection={selectedIntersection} status={panelStatus} signalLoading={signalLoadingId === selectedId} viewMode={viewMode} favorites={favorites} recent={recentIntersections} onToggleFavorite={handleToggleFavorite} onSelectRecent={handleSelectIntersection} onClearRecent={handleClearRecent} onClose={handleCloseSheet} />
      </div>}
      {page === "mypage" && <MyPage onBack={handleBackToMap} onSettingsClick={handleSettingsClick} />}
      {page === "settings" && <SettingsPage onBack={handleBackToMap} />}
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

export default function App() {
  return <AuthProvider><ProtectedRoute><AppInner /></ProtectedRoute></AuthProvider>;
}
