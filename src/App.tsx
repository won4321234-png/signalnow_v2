import { useCallback, useEffect, useMemo, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
import { FloatingButton } from "@/components/FloatingButton";
import { Header } from "@/components/Header";
import { KakaoMap } from "@/components/map/KakaoMap";
import { SearchPanel } from "@/components/SearchPanel";
import { fetchIntersections, findIntersection } from "@/services/intersectionService";
import type {
  DataStatus,
  Intersection,
  ViewMode,
} from "@/types/traffic";

import { AuthProvider } from "@/auth/context/AuthContext";
import { LoginModal } from "@/auth/components/LoginModal";
import { MyPage } from "@/auth/pages/MyPage";
import { ProtectedRoute } from "@/auth/components/ProtectedRoute";
import { SettingsPage } from "@/auth/pages/SettingsPage";

const MAX_RECENT = 5;
type Page = "map" | "mypage" | "settings";

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

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await fetchIntersections();
      setIntersections(result.intersections);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedIntersection = useMemo(
    () => (selectedId ? findIntersection(selectedId, intersections) : null),
    [selectedId, intersections]
  );

  const recentIntersections = useMemo(
    () => recentIds.map((id) => findIntersection(id, intersections)).filter((i): i is Intersection => i !== null),
    [recentIds, intersections]
  );

  const recordRecent = useCallback((id: string) => {
    setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, MAX_RECENT));
  }, []);

  const handleSelectIntersection = useCallback(
    (intersectionId: string) => { setSelectedId(intersectionId); setSheetOpen(true); recordRecent(intersectionId); },
    [recordRecent]
  );

  const handleCloseSheet = useCallback(() => { setSheetOpen(false); setSelectedId(null); }, []);
  const handleToggleFavorite = useCallback((intersectionId: string) => {
    setFavorites((prev) => { const next = new Set(prev); if (next.has(intersectionId)) next.delete(intersectionId); else next.add(intersectionId); return next; });
  }, []);
  const handleClearRecent = useCallback(() => setRecentIds([]), []);
  const handleLoginClick = useCallback(() => setLoginOpen(true), []);
  const handleProfileClick = useCallback(() => setPage("mypage"), []);
  const handleBackToMap = useCallback(() => setPage("map"), []);
  const handleSettingsClick = useCallback(() => setPage("settings"), []);

  const panelStatus: DataStatus =
    status === "loading" ? "loading" : status === "error" ? "error" : "success";

  return (
    <div className="h-svh overflow-hidden bg-background">
      {page === "map" && (
        <div className="relative h-full w-full">
          {/* Map fills viewport, with right padding when panel open on desktop */}
          <div className={`absolute inset-0 transition-[padding] duration-300 ease-out ${sheetOpen ? "lg:pr-[360px]" : "lg:pr-0"}`}>
            <KakaoMap
              intersections={intersections}
              selectedIntersectionId={selectedId}
              favoriteIds={favorites}
              onSelectIntersection={handleSelectIntersection}
            />
          </div>

          {/* Floating header with center search on desktop */}
          <Header
            onLoginClick={handleLoginClick}
            onProfileClick={handleProfileClick}
            floating
            intersections={intersections}
            onSelectIntersection={handleSelectIntersection}
          />

          {/* Mobile search panel (mode toggle + search) — top-left below header */}
          <div className="pointer-events-none absolute left-3 top-16 z-20 lg:hidden">
            <div className="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-[340px]">
              <SearchPanel
                mode={viewMode}
                onModeChange={setViewMode}
                intersections={intersections}
                onSelect={handleSelectIntersection}
              />
            </div>
          </div>

          {/* Desktop mode toggle — floating top-left below header */}
          <div className="pointer-events-none absolute left-4 top-16 z-20 hidden lg:block">
            <div className="pointer-events-auto">
              <SearchPanel modeOnly mode={viewMode} onModeChange={setViewMode} />
            </div>
          </div>

          {/* FAB */}
          <FloatingButton
            className={`fixed right-4 z-20 transition-[bottom] duration-300 ease-out ${
              sheetOpen ? "bottom-[104px] lg:bottom-8" : "bottom-6 lg:bottom-8"
            }`}
            onClick={() => {}}
          />

          {/* Bottom legend bar — desktop only */}
          <div className="pointer-events-none absolute bottom-0 left-0 z-10 hidden lg:flex">
            <div className="pointer-events-auto m-4 flex items-center gap-3 rounded-xl border border-border/20 bg-card/80 glass px-4 py-2 text-[11px] font-medium text-muted-foreground elevation-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-signal-green" /> 원활
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-signal-yellow" /> 보통
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-signal-red" /> 혼잡
              </span>
              <span className="text-muted-foreground/50">정보없음</span>
              <span className="ml-1 flex items-center gap-1 text-muted-foreground/50">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/40" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-signal-green" />
                </span>
                API 연동됨
              </span>
            </div>
          </div>

          <BottomSheet
            open={sheetOpen}
            intersection={selectedIntersection}
            status={panelStatus}
            viewMode={viewMode}
            favorites={favorites}
            recent={recentIntersections}
            onToggleFavorite={handleToggleFavorite}
            onSelectRecent={handleSelectIntersection}
            onClearRecent={handleClearRecent}
            onClose={handleCloseSheet}
            onRetry={load}
          />
        </div>
      )}

      {(page === "mypage" || page === "settings") && (
        <div className="flex h-full flex-col">
          <Header onLoginClick={handleLoginClick} onProfileClick={handleProfileClick} />
          <main className="flex-1 overflow-y-auto">
            {page === "mypage" && (
              <ProtectedRoute>
                <MyPage onSettingsClick={handleSettingsClick} onBack={handleBackToMap} />
              </ProtectedRoute>
            )}
            {page === "settings" && (
              <ProtectedRoute>
                <SettingsPage onBack={() => setPage("mypage")} />
              </ProtectedRoute>
            )}
          </main>
        </div>
      )}

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

export function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}

export default App;
