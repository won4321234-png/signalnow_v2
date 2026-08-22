import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, Clock, Share2, Star, X, Info, Activity, Bookmark, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AiRecommendationCard } from "@/components/AiRecommendationCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorView } from "@/components/ErrorView";
import { LoadingState } from "@/components/LoadingState";
import { RecentIntersections } from "@/components/RecentIntersections";
import { TrafficSignalCard } from "@/components/TrafficSignalCard";
import { snapHeightPx, useBottomSheet, type SheetSnap } from "@/hooks/use-bottom-sheet";
import type { ApproachDirection, DataStatus, Intersection, ViewMode } from "@/types/traffic";

interface BottomSheetProps {
  open: boolean;
  intersection: Intersection | null;
  status: DataStatus;
  signalLoading: boolean;
  signalError: boolean;
  viewMode: ViewMode;
  favorites: Set<string>;
  recent: Intersection[];
  onToggleFavorite: (intersectionId: string) => void;
  onSelectRecent: (intersectionId: string) => void;
  onClearRecent: () => void;
  onClose: () => void;
  onRetry?: () => void;
  onRetrySignal?: () => void;
}

const DIRECTION_ORDER: ApproachDirection[] = ["North", "East", "South", "West", "NorthEast", "SouthEast", "SouthWest", "NorthWest"];
type TabId = "info" | "flow" | "favorites" | "history";
const TABS: { id: TabId; label: string; icon: typeof Info }[] = [
  { id: "info", label: "정보", icon: Info }, { id: "flow", label: "교통흐름", icon: Activity },
  { id: "favorites", label: "즐겨찾기", icon: Bookmark }, { id: "history", label: "이력", icon: History },
];

export function BottomSheet({ open, intersection, status, signalLoading, signalError, viewMode, favorites, recent, onToggleFavorite, onSelectRecent, onClearRecent, onClose, onRetry, onRetrySignal }: BottomSheetProps) {
  const { snap, liveHeightPx, isDragging, setSnap, onDragStart, onDragMove, onDragEnd } = useBottomSheet({ open, initialSnap: "partial" });
  const [tab, setTab] = useState<TabId>("info");
  const sheetRef = useRef<HTMLDivElement>(null);
  const viewportHRef = useRef<number>(0);
  useEffect(() => { viewportHRef.current = window.innerHeight; }, []);
  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => onDragStart(e.clientY), [onDragStart]);
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: PointerEvent) => onDragMove(e.clientY);
    const handleUp = (e: PointerEvent) => onDragEnd(e.clientY);
    window.addEventListener("pointermove", handleMove); window.addEventListener("pointerup", handleUp); window.addEventListener("pointercancel", handleUp);
    return () => { window.removeEventListener("pointermove", handleMove); window.removeEventListener("pointerup", handleUp); window.removeEventListener("pointercancel", handleUp); };
  }, [isDragging, onDragMove, onDragEnd]);
  const currentHeightPx = liveHeightPx ?? snapHeightPx(snap, viewportHRef.current || window.innerHeight);

  const groupedSignals: Record<ApproachDirection, Intersection["signals"]> = intersection ? intersection.signals.reduce<Record<ApproachDirection, Intersection["signals"]>>((acc, sig) => { (acc[sig.direction] ??= []).push(sig); return acc; }, { North: [], East: [], South: [], West: [], NorthEast: [], SouthEast: [], SouthWest: [], NorthWest: [] }) : { North: [], East: [], South: [], West: [], NorthEast: [], SouthEast: [], SouthWest: [], NorthWest: [] };
  const isFav = intersection ? favorites.has(intersection.crsrdId) : false;

  const renderInfoContent = () => {
    if (status === "loading") return <LoadingState />;
    if (status === "error") return <ErrorView onRetry={onRetry} />;
    if (!intersection) return <div className="flex flex-col gap-6 px-5 py-6"><EmptyState /><RecentIntersections recent={recent} onSelect={onSelectRecent} onClear={onClearRecent} /></div>;
    return (
      <div className="flex flex-col gap-6 px-5 py-5">
        <AiRecommendationCard intersection={intersection} viewMode={viewMode} index={0} />
        <div className="flex flex-col gap-4">
          {signalLoading ? <LoadingState /> : signalError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-5 text-center">
              <p className="text-sm font-medium text-destructive">신호 데이터를 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetrySignal}>다시 시도</Button>
            </div>
          ) : intersection.signals.length === 0 ? (
            <div className="rounded-2xl border border-border/15 bg-muted/30 px-4 py-5 text-center text-sm font-medium text-muted-foreground">데이터 없음</div>
          ) : DIRECTION_ORDER.map((dir, idx) => {
            const signals = groupedSignals[dir];
            if (!signals || signals.length === 0) return null;
            return <div key={dir}>{idx > 0 && <Separator className="my-6 border-border/15" />}<TrafficSignalCard direction={dir} signals={signals} index={idx + 1} viewMode={viewMode} /></div>;
          })}
        </div>
      </div>
    );
  };
  const renderFlowContent = () => <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><Activity className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">교통흐름 분석 기능이 준비 중입니다</p></div>;
  const renderFavoritesContent = () => <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><Bookmark className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">즐겨찾기한 교차로가 없습니다</p></div>;
  const renderHistoryContent = () => recent.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><History className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">최근 본 교차로가 없습니다</p></div> : <div className="px-5 py-5"><RecentIntersections recent={recent} onSelect={onSelectRecent} onClear={onClearRecent} /></div>;
  const renderContent = () => { switch (tab) { case "info": return renderInfoContent(); case "flow": return renderFlowContent(); case "favorites": return renderFavoritesContent(); case "history": return renderHistoryContent(); } };

  if (!open) return null;
  return (
    <aside ref={sheetRef} className={cn("fixed z-30 flex flex-col overflow-hidden border-border/20 bg-background/95 shadow-2xl backdrop-blur-xl lg:right-0 lg:top-0 lg:h-full lg:w-[360px] lg:border-l", "bottom-0 left-0 w-full rounded-t-3xl border-t lg:rounded-none lg:border-t-0")} style={{ height: currentHeightPx }}>
      <div className="flex shrink-0 touch-none cursor-grab items-center justify-between px-4 py-3 lg:hidden" onPointerDown={handlePointerDown}>
        <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <button className="absolute right-3 rounded-full p-2 text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="닫기"><X className="size-4" /></button>
      </div>
      <div className="hidden shrink-0 items-center justify-between border-b px-4 py-3 lg:flex"><div><p className="text-sm font-semibold">{intersection?.crsrdNm ?? "교차로 정보"}</p><p className="text-xs text-muted-foreground">실시간 신호 정보</p></div><button className="rounded-full p-2 text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="닫기"><X className="size-4" /></button></div>
      <div className="flex shrink-0 border-b border-border/10 px-2">{TABS.map(({ id, label, icon: Icon }) => <button key={id} className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium", tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground")} onClick={() => setTab(id)}><Icon className="size-3.5" />{label}</button>)}</div>
      <ScrollArea className="min-h-0 flex-1">{renderContent()}</ScrollArea>
    </aside>
  );
}
