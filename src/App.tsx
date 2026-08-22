import { useCallback, useEffect, useMemo, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
import { FloatingButton } from "@/components/FloatingButton";
import { Header } from "@/components/Header";
import { KakaoMap } from "@/components/map/KakaoMap";
import { SearchPanel } from "@/components/SearchPanel";
import {
  fetchIntersectionSignals,
  fetchIntersections,
  fetchIntersectionsForViewport,
  findIntersection,
  type MapViewportBounds,
} from "@/services/intersectionService";
import type { DataStatus, Intersection, ViewMode } from "@/types/traffic";
import { AuthProvider } from "@/auth/context/AuthContext";
import { LoginModal } from "@/auth/components/LoginModal";
import { MyPage } from "@/auth/pages/MyPage";
import { ProtectedRoute } from "@/auth/components/ProtectedRoute";
import { SettingsPage } from "@/auth/pages/SettingsPage";

const MAX_RECENT = 5;
type Page = "map" | "mypage" | "settings";
type SignalStatus = "idle" | "loading" | "success" | "empty" | "error";

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
  const [signalStatuses, setSignalStatuses] = useState<Map<string, SignalStatus>>(new Map());

  const loadInitial = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await fetchIntersections();
      setIntersections(result.intersections);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  const handleViewportChange = useCallback(async (bounds: MapViewportBounds) => {
    try {
      const visible = await fetchIntersectionsForViewport(bounds);
      if (visible.length === 0) return;
      setIntersections((prev) => {
        const byId = new Map(prev.map((intersection) => [intersection.crsrdId, intersection]));
        for (const intersection of visible) {
          const existing = byId.get(intersection.crsrdId);
          byId.set(intersection.crsrdId, existing?.signals.length ? { ...intersection, signals: existing.signals } : intersection);
        }
        return Array.from(byId.values());
      });
      setStatus("success");
    } catch (error) {
      if (import.meta.env.DEV) console.error("[SignalNow] viewport 교차로 로딩 오류", error);
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  useEffect(() => {
    if (!selectedId || !sheetOpen) {
      setSignalLoadingId(null);
      return;
    }

    const selected = findIntersection(selectedId, intersections);
    if (!selected) return;

    const knownStatus = signalStatuses.get(selectedId);
    if (knownStatus === "success" || knownStatus === "empty" || knownStatus === "error") return;
    if (signalLoadingId === selectedId) return;

    let active = true;
    setSignalLoadingId(selectedId);
    setSignalStatuses((prev) => new Map(prev).set(selectedId, "loading"));

    fetchIntersectionSignals(selectedId)
      .then((signals) => {
        if (!active) return;
        setIntersections((prev) => prev.map((intersection) =>
          intersection.crsrdId === selectedId ? { ...intersection, signals } : intersection,
        ));
        setSignalStatuses((prev) => new Map(prev).set(selectedId, signals.length > 0 ? "success" : "empty"));
      })
      .catch((error) => {
        if (!active) return;
        if (import.meta.env.DEV) console.error("[SignalNow] 신호 API 오류", { crsrdId: selectedId, error });
        setSignalStatuses((prev) => new Map(prev).set(selectedId, "error"));
      })
      .finally(() => {
        if (active) setSignalLoadingId((current) => current === selectedId ? null : current);
      });

    return () => { active = false; };
  }, [selectedId, sheetOpen, intersections, signalStatuses, signalLoadingId]);

  const selectedIntersection = useMemo(
    () => (selectedId ? findIntersection(selectedId, intersections) : null),
    [selectedId, intersections],
  );

  const recentIntersections = useMemo(
    () => recentIds.map((id) => findIntersection(id, intersections)).filter((i): i is Intersection => i !== null),
    [recentIds, intersections],
  );

  const recordRecent = useCallback((id: string) => {
    setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, MAX_RECENT));
  }, []);

  const handleSelectIntersection = useCallback((intersectionId: string) => {
    setSelectedId(intersectionId);
    setSheetOpen(true);
    recordRecent(intersectionId);
  }, [recordRecent]);

  const handleCloseSheet = useCallback(() => { setSheetOpen(false); setSelectedId(null); }, []);
  const handleToggleFavorite = useCallback((intersectionId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(intersectionId)) next.delete(intersectionId); else next.add(intersectionId);
      return next;
    });
  }, []);
  const handleClearRecent = useCallback(() => setRecentIds([]), []);
  const handleLoginClick = useCallback(() => setLoginOpen(true), []);
  const handleProfileClick = useCallback(() => setPage("mypage"), []);
  const handleBackToMap = useCallback(() => setPage("map"), []);
  const handleSettingsClick = useCallback(() => setPage("settings"), []);

  const panelStatus: DataStatus = status === "loading" ? "loading" : status === "error" ? "error" : "success";
  const selectedSignalStatus = selectedId ? signalStatuses.get(selectedId) ?? "idle" : "idle";

  return (
    <div className="h-svh overflow-hidden bg-background">
      {page === "map" && (
        <div className="relative h-full w-full">
          <div className={`absolute inset-0 transition-[padding] duration-300 ease-out ${sheetOpen ? "lg:pr-[360px]" : "lg:pr-0"}`}>
            <KakaoMap
              intersections={intersections}
              selectedIntersectionId={selectedId}
              favoriteIds={favorites}
              onSelectIntersection={handleSelectIntersection}
              onViewportChange={handleViewportChange}
            />
          </div>
          <Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} floating intersections={intersections} onSelectIntersection={handleSelectIntersection} />
          <div className="pointer-events-none absolute left-3 top-16 z-20 lg:hidden">
            <div className="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-[340px]">
              <SearchPanel mode={viewMode} onModeChange={setViewMode} intersections={intersections} onSelect={handleSelectIntersection} />
            </div>
          </div>
          <div className="pointer-events-none absolute left-4 top-16 z-20 hidden lg:block">
            <div className="pointer-events-auto"><SearchPanel modeOnly mode={viewMode} onModeChange={setViewMode} /></div>
          </div>
          <FloatingButton className={`fixed right-4 z-20 transition-[bottom] duration-300 ease-out ${sheetOpen ? "bottom-[104px] lg:bottom-8" : "bottom-6 lg:bottom-8"}`} onClick={() => {}} />
          <div className="pointer-events-none absolute bottom-0 left-0 z-10 hidden lg:flex">
            <div className="pointer-events-auto m-4 flex items-center gap-3 rounded-xl border border-border/20 bg-card/80 glass px-4 py-2 text-[11px] font-medium text-muted-foreground elevation-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-green" /> 원활</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-yellow" /> 보통</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal-red" /> 혼잡</span>
              <span className="text-muted-foreground/50">정보없음</span>
              <span className="ml-1 flex items-center gap-1 text-muted-foreground/50"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/40" /><span className="relative inline-flex size-1.5 rounded-full bg-signal-green" /></span> API 연동됨</span>
            </div>
          </div>
          <BottomSheet
            open={sheetOpen}
            intersection={selectedIntersection}
            status={panelStatus}
            signalLoading={signalLoadingId === selectedId}
            signalError={selectedSignalStatus === "error"}
            viewMode={viewMode}
            favorites={favorites}
            recent={recentIntersections}
            onToggleFavorite={handleToggleFavorite}
            onSelectRecent={handleSelectIntersection}
            onClearRecent={handleClearRecent}
            onClose={handleCloseSheet}
            onRetry={loadInitial}
            onRetrySignal={() => {
              if (selectedId) setSignalStatuses((prev) => { const next = new Map(prev); next.delete(selectedId); return next; });
            }}
          />
        </div>
      )}
      {(page === "mypage" || page === "settings") && (
        <div className="flex h-full flex-col">
          <Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} />
          <main className="flex-1 overflow-y-auto">
            {page === "mypage" && <ProtectedRoute><MyPage onSettingsClick={handleSettingsClick} onBack={handleBackToMap} /></ProtectedRoute>}
            {page === "settings" && <ProtectedRoute><SettingsPage onBack={() => setPage("mypage")} /></ProtectedRoute>}
          </main>
        </div>
      )}
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

export function App() { return <AuthProvider><AppInner /></AuthProvider>; }
export default App;
