import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
import { FloatingButton } from "@/components/FloatingButton";
import { Header } from "@/components/Header";
import { KakaoMap } from "@/components/map/KakaoMap";
import { SearchPanel } from "@/components/SearchPanel";
import { fetchSelectedIntersectionSignals, type SignalLoadStatus, loadIntersectionsForViewport } from "@/services/viewportTrafficService";
import type { DataStatus, Intersection, TrafficSignal, ViewMode } from "@/types/traffic";

import { AuthProvider } from "@/auth/context/AuthContext";
import { LoginModal } from "@/auth/components/LoginModal";
import { MyPage } from "@/auth/pages/MyPage";
import { ProtectedRoute } from "@/auth/components/ProtectedRoute";
import { SettingsPage } from "@/auth/pages/SettingsPage";

const MAX_RECENT = 5;
type Page = "map" | "mypage" | "settings";
type Viewport = { south: number; west: number; north: number; east: number };

type DebugInfo = { apiStatus: string; itemCount: number; targetId: string; matched: boolean; extractedCount: number; finalCount: number; state: string; reason: string };
const debugEnabled = () => new URLSearchParams(window.location.search).get("debug") === "1";
const debugLog = (message: string, data: Record<string, unknown>) => { if (debugEnabled()) console.log(`[SignalNow debug] ${message}`, data); };

function AppInner() {
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
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ apiStatus: "-", itemCount: 0, targetId: "-", matched: false, extractedCount: 0, finalCount: 0, state: "idle", reason: "" });
  const viewportRequestRef = useRef(0);
  const signalRequestRef = useRef(0);
  const signalDataRef = useRef<Map<string, TrafficSignal[]>>(new Map());

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
    if (!selectedId || !sheetOpen) {
      if (debugEnabled() && !selectedId) setDebugInfo((info) => ({ ...info, state: "idle", reason: "no-selected-id" }));
      return;
    }

    const currentSignalStatus = signalStatus[selectedId];
    setDebugInfo((info) => ({ ...info, targetId: selectedId, state: currentSignalStatus ?? "loading", reason: "" }));
    debugLog("signal fetch start", { crsrdId: selectedId });

    if (currentSignalStatus === "loading" || currentSignalStatus === "success" || currentSignalStatus === "empty" || currentSignalStatus === "error") return;

    const requestId = ++signalRequestRef.current;
    let active = true;
    const safetyTimeoutId = window.setTimeout(() => {
      if (!active || requestId !== signalRequestRef.current) return;
      setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
      setSignalLoadingId((current) => (current === selectedId ? null : current));
      setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "error", reason: "signal-load-timeout" }));
      debugLog("FAILURE: signal loading safety timeout", { crsrdId: selectedId, timeoutMs: 15000 });
    }, 15000);

    setSignalLoadingId(selectedId);
    setSignalStatus((prev) => ({ ...prev, [selectedId]: "loading" }));
    setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "loading", reason: "" }));

    fetchSelectedIntersectionSignals(selectedId)
      .then((result) => {
        if (!active || requestId !== signalRequestRef.current) return;
        signalDataRef.current.set(selectedId, result.signals);
        setSignalStatus((prev) => ({ ...prev, [selectedId]: result.status }));
        setDebugInfo((info) => ({ ...info, apiStatus: result.debug.apiStatus, itemCount: result.debug.itemCount, targetId: selectedId, matched: result.debug.matched, extractedCount: result.signals.length, state: result.status, reason: result.status === "empty" ? result.debug.failureReason : result.status === "error" ? result.debug.failureReason : "" }));
        setIntersections((prev) => {
          const next = prev.map((intersection) => intersection.crsrdId === selectedId ? { ...intersection, signals: result.signals } : intersection);
          const finalCount = next.find((intersection) => intersection.crsrdId === selectedId)?.signals.length ?? 0;
          setDebugInfo((info) => ({ ...info, targetId: selectedId, apiStatus: result.debug.apiStatus, itemCount: result.debug.itemCount, matched: result.debug.matched, extractedCount: result.signals.length, finalCount, state: result.status, reason: result.status === "empty" || result.status === "error" ? result.debug.failureReason : "" }));
          debugLog("signal state", { selectedId, fetchedCount: result.signals.length, status: result.status, finalCount });
          return next;
        });
      })
      .catch(() => {
        if (!active || requestId !== signalRequestRef.current) return;
        setSignalStatus((prev) => ({ ...prev, [selectedId]: "error" }));
        setDebugInfo((info) => ({ ...info, targetId: selectedId, state: "error", reason: "signal-fetch-error" }));
      })
      .finally(() => {
        window.clearTimeout(safetyTimeoutId);
        if (!active || requestId !== signalRequestRef.current) return;
        setSignalLoadingId((current) => (current === selectedId ? null : current));
      });

    return () => {
      active = false;
      window.clearTimeout(safetyTimeoutId);
      setSignalStatus((prev) => {
        if (prev[selectedId] !== "loading") return prev;
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      setSignalLoadingId((current) => (current === selectedId ? null : current));
    };
  }, [selectedId, sheetOpen]);

  const selectedIntersection = useMemo(() => (selectedId ? intersections.find((intersection) => intersection.crsrdId === selectedId) ?? null : null), [selectedId, intersections]);
  const recentIntersections = useMemo(() => recentIds.map((id) => intersections.find((intersection) => intersection.crsrdId === id)).filter((i): i is Intersection => i !== undefined), [recentIds, intersections]);
  const recordRecent = useCallback((id: string) => setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, MAX_RECENT)), []);
  const handleSelectIntersection = useCallback((intersectionId: string) => {
    debugLog("intersection selected", { crsrdId: intersectionId, hasCrsrdId: Boolean(intersectionId) });
    setDebugInfo((info) => ({ ...info, targetId: intersectionId || "-", state: intersectionId ? "loading" : "blocked", reason: intersectionId ? "" : "missing-crsrdId" }));
    setSelectedId(intersectionId);
    setSheetOpen(true);
    recordRecent(intersectionId);
  }, [recordRecent]);
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

  return (
    <div className="h-svh overflow-hidden bg-background">
      {page === "map" && (
        <div className="relative h-full w-full">
          <div className={`absolute inset-0 transition-[padding] duration-300 ease-out ${sheetOpen ? "lg:pr-[360px]" : "lg:pr-0"}`}>
            <KakaoMap intersections={intersections} selectedIntersectionId={selectedId} favoriteIds={favorites} onSelectIntersection={handleSelectIntersection} onViewportChange={handleViewportChange} />
          </div>
          <Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} floating intersections={intersections} onSelectIntersection={handleSelectIntersection} />
          <div className="pointer-events-none absolute left-3 top-16 z-20 lg:hidden"><div className="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-[340px]"><SearchPanel mode={viewMode} onModeChange={setViewMode} intersections={intersections} onSelect={handleSelectIntersection} /></div></div>
          <div className="pointer-events-none absolute left-4 top-16 z-20 hidden lg:block"><div className="pointer-events-auto"><SearchPanel modeOnly mode={viewMode} onModeChange={setViewMode} /></div></div>
          <FloatingButton className={`fixed right-4 z-20 transition-[bottom] duration-300 ease-out ${sheetOpen ? "bottom-[104px] lg:bottom-8" : "bottom-6 lg:bottom-8"}`} onClick={() => {}} />
          <div className="pointer-events-none absolute bottom-0 left-0 z-10 hidden lg:flex"><div className="pointer-events-auto m-4 flex items-center gap-3 rounded-xl border border-border/20 bg-card/80 glass px-4 py-2 text-[11px] font-medium text-muted-foreground elevation-2"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-green" /> 원활</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-yellow" /> 보통</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-red" /> 혼잡</span><span className="text-muted-foreground/50">정보없음</span><span className="ml-1 flex items-center gap-1 text-muted-foreground/50"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/40" /><span className="relative inline-flex size-1.5 rounded-full bg-signal-green" /></span> API 연동됨</span></div></div>
          {selectedSignalStatus === "error" && <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-destructive/20 bg-background/95 px-4 py-2 text-xs font-medium text-destructive shadow-lg">선택한 교차로의 신호 데이터를 불러오지 못했습니다. 다시 선택해 주세요.</div>}
          {debug && <div className="absolute bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background/95 px-3 py-2 text-[11px] leading-5 text-foreground shadow-lg"><div className="font-semibold">SignalNow Debug</div><div>API: {debugInfo.apiStatus}</div><div>Items: {debugInfo.itemCount}</div><div>Target: {debugInfo.targetId}</div><div>Match: {debugInfo.matched ? "YES" : "NO"}</div><div>Signals: {debugInfo.extractedCount}</div><div>Final: {debugInfo.finalCount}</div><div>Status: {debugInfo.state}</div>{debugInfo.reason && <div>Reason: {debugInfo.reason}</div>}</div>}
          <BottomSheet open={sheetOpen} intersection={selectedIntersection} status={panelStatus} signalLoading={signalLoadingId === selectedId} viewMode={viewMode} favorites={favorites} recent={recentIntersections} onToggleFavorite={handleToggleFavorite} onSelectRecent={handleSelectIntersection} onClearRecent={handleClearRecent} onClose={handleCloseSheet} onRetry={() => { if (!selectedId) return; setSignalStatus((prev) => { const next = { ...prev }; delete next[selectedId]; return next; }); }} />
        </div>
      )}
      {(page === "mypage" || page === "settings") && (<div className="flex h-full flex-col"><Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} /><main className="flex-1 overflow-y-auto">{page === "mypage" && <ProtectedRoute><MyPage onSettingsClick={handleSettingsClick} onBack={handleBackToMap} /></ProtectedRoute>}{page === "settings" && <ProtectedRoute><SettingsPage onBack={() => setPage("mypage")} /></ProtectedRoute>}</main></div>)}
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

export function App() { return <AuthProvider><AppInner /></AuthProvider>; }
export default App;
