import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
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
const SIGNAL_REFRESH_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
type Page = "map" | "mypage" | "settings";
type Viewport = { south: number; west: number; north: number; east: number };
type DebugInfo = { apiStatus: string; itemCount: number; targetId: string; matched: boolean; extractedCount: number; finalCount: number; state: string; reason: string; signalDiagnostics: SignalDiagnostic[]; receivedAt: number | null };
type SignalRefreshRetry = { attempt: number; nextRetryAt: number };
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
  const signalRefreshRetryRef = useRef<Map<string, SignalRefreshRetry>>(new Map());

  const handleRegionChange = useCallback((nextRegionId: TrafficRegionId) => {
    if (nextRegionId === regionId) return;
    window.localStorage.setItem("signalnow-region", nextRegionId);
    configureTrafficRegion(nextRegionId);
    viewportRequestRef.current += 1;
    signalRequestRef.current += 1;
    signalDataRef.current.clear();
    signalReceivedAtRef.current.clear();
    signalRefreshInFlightRef.current = false;
    signalRefreshRetryRef.current.clear();
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

  useEffect(() => { configureTrafficRegion(regionId); }, []);

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
      const retry = signalRefreshRetryRef.current.get(refreshTargetId);
      if (retry && now < retry.nextRetryAt) return;
      signalRefreshInFlightRef.current = true;
      debugLog("signal phase refresh start", { region: regionId, crsrdId: refreshTargetId, reason: "remaining-reached-zero", retryAttempt: retry?.attempt ?? 0 });
      fetchSelectedIntersectionSignals(refreshTargetId, { forceRefresh: true })
        .then((result) => {
          const refreshSucceeded = result.status === "success" && result.signals.length > 0;
          const previousSignals = signalDataRef.current.get(refreshTargetId);
          const previousReceivedAt = signalReceivedAtRef.current.get(refreshTargetId);
          if (refreshSucceeded) {
            const refreshedAt = Date.now();
            signalDataRef.current.set(refreshTargetId, result.signals);
            signalReceivedAtRef.current.set(refreshTargetId, refreshedAt);
            signalRefreshRetryRef.current.delete(refreshTargetId);
            setCountdownNow(refreshedAt);
            setIntersections((prev) => prev.map((intersection) => intersection.crsrdId === refreshTargetId ? { ...intersection, signals: result.signals } : intersection));
          } else {
            if (previousSignals && !signalDataRef.current.has(refreshTargetId)) signalDataRef.current.set(refreshTargetId, previousSignals);
            if (previousReceivedAt && !signalReceivedAtRef.current.has(refreshTargetId)) signalReceivedAtRef.current.set(refreshTargetId, previousReceivedAt);
            const previousAttempt = retry?.attempt ?? 0;
            const delay = SIGNAL_REFRESH_BACKOFF_MS[Math.min(previousAttempt, SIGNAL_REFRESH_BACKOFF_MS.length - 1)];
            signalRefreshRetryRef.current.set(refreshTargetId, { attempt: previousAttempt + 1, nextRetryAt: Date.now() + delay });
          }
          setSignalStatus((prev) => ({ ...prev, [refreshTargetId]: result.status }));
          setDebugInfo((info) => ({ ...info, apiStatus: result.debug.apiStatus, itemCount: result.debug.itemCount, targetId: refreshTargetId, matched: result.debug.matched, extractedCount: result.signals.length, finalCount: refreshSucceeded ? result.signals.length : previousSignals?.length ?? 0, state: result.status, reason: refreshSucceeded ? "" : result.debug.failureReason, signalDiagnostics: result.debug.signalDiagnostics, receivedAt: refreshSucceeded ? Date.now() : previousReceivedAt ?? info.receivedAt }));
        })
        .catch((error) => {
          const retry = signalRefreshRetryRef.current.get(refreshTargetId);
          const previousAttempt = retry?.attempt ?? 0;
          const delay = SIGNAL_REFRESH_BACKOFF_MS[Math.min(previousAttempt, SIGNAL_REFRESH_BACKOFF_MS.length - 1)];
          signalRefreshRetryRef.current.set(refreshTargetId, { attempt: previousAttempt + 1, nextRetryAt: Date.now() + delay });
          debugLog("signal phase refresh exception; preserving last known data", { region: regionId, crsrdId: refreshTargetId, retryInMs: delay, error: error instanceof Error ? error.message : String(error) });
        })
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
    if (currentSignalStatus === "loading" || currentSignalStatus === "success" || currentSignalStatus === "empty") return;
    const requestId = ++signalRequestRef.current;
    const safetyTimeoutId = window.setTimeout(() => {
      if (requestId !== signalRequestRef.current) return;
      setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
      setSignalLoadingId((current) => (current === selectedId ? null : current));
    }, 15000);
    setSignalLoadingId(selectedId);
    setSignalStatus((prev) => ({ ...prev, [selectedId]: "loading" }));
    fetchSelectedIntersectionSignals(selectedId)
      .then((result) => {
        if (requestId !== signalRequestRef.current) return;
        const receivedAt = Date.now();
        signalDataRef.current.set(selectedId, result.signals);
        signalReceivedAtRef.current.set(selectedId, receivedAt);
        setCountdownNow(receivedAt);
        if (result.status === "success" && result.signals.length > 0) signalRefreshRetryRef.current.delete(selectedId);
        setSignalStatus((prev) => ({ ...prev, [selectedId]: result.status }));
        setIntersections((prev) => prev.map((intersection) => intersection.crsrdId === selectedId ? { ...intersection, signals: result.signals } : intersection));
      })
      .catch(() => {
        if (requestId !== signalRequestRef.current) return;
        setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
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
  const handleSelectIntersection = useCallback((intersectionId: string) => { setSelectedId(intersectionId); setSheetOpen(true); recordRecent(intersectionId); }, [recordRecent]);
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

  return (
    <div className="h-svh overflow-hidden bg-background">
      {page === "map" && <div className="relative h-full w-full [--signal-header-height:3.5rem] [--signal-desktop-sheet-width:min(360px,32vw)]">
        <div className={cn("absolute inset-0 transition-[padding] duration-300 ease-out", sheetOpen ? "lg:pr-[var(--signal-desktop-sheet-width)]" : "lg:pr-0")}><KakaoMap intersections={intersections} selectedIntersection={selectedIntersection} selectedIntersectionId={selectedId} favoriteIds={favorites} viewMode={viewMode} region={region} onSelectIntersection={handleSelectIntersection} onViewportChange={handleViewportChange} /></div>
        <Header sidePanelOpen={sheetOpen} onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} floating intersections={intersections} onSelectIntersection={handleSelectIntersection} />
        <div className="pointer-events-none absolute inset-x-3 top-[4rem] z-40 lg:hidden"><div className="pointer-events-auto w-full max-w-[340px]"><SearchPanel mode={viewMode} onModeChange={setViewMode} intersections={intersections} onSelect={handleSelectIntersection} region={region} regions={Object.values(TRAFFIC_REGIONS)} onRegionChange={handleRegionChange} /></div></div>
        <div className="pointer-events-none absolute left-4 top-[4.5rem] z-40 hidden lg:block"><div className="pointer-events-auto"><SearchPanel modeOnly mode={viewMode} onModeChange={setViewMode} region={region} regions={Object.values(TRAFFIC_REGIONS)} onRegionChange={handleRegionChange} /></div></div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden lg:flex"><div className="pointer-events-auto m-4 flex items-center gap-3 rounded-xl border border-border/20 bg-card/80 glass px-4 py-2 text-[11px] font-medium text-muted-foreground elevation-2"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-green" /> 원활</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-yellow" /> 보통</span><span className="size-2 rounded-full bg-signal-red" /> 혼잡</span><span className="text-muted-foreground/50">정보없음</span><span className="ml-1 flex items-center gap-1 text-muted-foreground/50"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/40" /><span className="relative inline-flex size-1.5 rounded-full bg-signal-green" /></span> API 연동됨</span></div></div>
        {selectedSignalStatus === "error" && <div className="pointer-events-none absolute inset-x-4 bottom-[calc(var(--signal-sheet-height,0px)+1rem)] z-[60] flex justify-center lg:left-4 lg:right-[var(--signal-desktop-sheet-width)]"><div className="pointer-events-auto max-w-[min(520px,calc(100vw-2rem))] rounded-xl border border-destructive/20 bg-background/95 px-4 py-2 text-xs font-medium text-destructive shadow-lg">선택한 교차로의 최신 신호 데이터를 불러오지 못했습니다. 마지막 정상 데이터를 유지하고 다시 시도합니다.</div></div>}
        {debug && <div className="pointer-events-none absolute bottom-4 right-4 z-[70] max-h-[70vh] max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-border bg-background/95 px-3 py-2 text-[11px] leading-5 text-foreground shadow-lg">SignalNow Debug</div>}
        <BottomSheet open={sheetOpen} intersection={selectedIntersection} status={panelStatus} signalLoading={signalLoadingId === selectedId} viewMode={viewMode} favorites={favorites} recent={recentIntersections} onToggleFavorite={handleToggleFavorite} onSelectRecent={handleSelectIntersection} onClearRecent={handleClearRecent} onClose={handleCloseSheet} />
      </div>}
      {page === "mypage" && <MyPage onBack={handleBackToMap} onSettingsClick={handleSettingsClick} />}
      {page === "settings" && <SettingsPage onBack={handleBackToMap} />}
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

function App() {
  return <AuthProvider><ProtectedRoute><AppInner /></ProtectedRoute></AuthProvider>;
}

export default App;
