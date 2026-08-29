import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Activity,
  Bookmark,
  ChevronDown,
  Clock,
  History,
  Info,
  Share2,
  Star,
  X,
} from "lucide-react";
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
import { estimatePedestrianSignal } from "@/services/pedestrianSignalEstimationService";
import { snapHeightPx, useBottomSheet, type SheetSnap } from "@/hooks/use-bottom-sheet";
import type { ApproachDirection, DataStatus, Intersection, ViewMode } from "@/types/traffic";

interface BottomSheetProps {
  open: boolean;
  intersection: Intersection | null;
  status: DataStatus;
  signalLoading: boolean;
  viewMode: ViewMode;
  favorites: Set<string>;
  recent: Intersection[];
  onToggleFavorite: (intersectionId: string) => void;
  onSelectRecent: (intersectionId: string) => void;
  onClearRecent: () => void;
  onClose: () => void;
  onRetry?: () => void;
}

const DIRECTION_ORDER: ApproachDirection[] = ["North", "East", "South", "West", "NorthEast", "SouthEast", "SouthWest", "NorthWest"];
type TabId = "info" | "flow" | "favorites" | "history";
const TABS: { id: TabId; label: string; icon: typeof Info }[] = [
  { id: "info", label: "정보", icon: Info },
  { id: "flow", label: "교통흐름", icon: Activity },
  { id: "favorites", label: "즐겨찾기", icon: Bookmark },
  { id: "history", label: "이력", icon: History },
];

function relativeAgo(updatedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000));
  if (seconds < 5) return "방금 전";
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

function PedestrianEstimateCard({ intersection }: { intersection: Intersection }) {
  const estimate = estimatePedestrianSignal(intersection.crsrdId, intersection.signals);
  const confidenceLabel = estimate.confidence === "medium" ? "보통" : "낮음";
  return (
    <div className="rounded-2xl border border-signal-yellow/20 bg-signal-yellow/5 p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal-yellow/10 text-lg">🚶</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">보행 안내 · 차량 신호 기반 추정</p>
          <p className="mt-1 text-base font-extrabold tracking-tight text-foreground">
            {estimate.available && estimate.estimatedChangeInSeconds !== undefined
              ? `약 ${estimate.estimatedChangeInSeconds}초 후 횡단 가능 시점 예상`
              : estimate.available && estimate.status === "wait"
                ? "현재는 횡단 가능 시점을 확정할 수 없습니다"
                : "횡단 가능 시점을 아직 추정할 수 없습니다"}
          </p>
          <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground">실제 보행신호 데이터가 없어 차량 신호의 반복 현시를 관찰해 보수적으로 추정합니다.</p>
          <p className="mt-2 text-[10px] font-bold text-muted-foreground/80">추정 신뢰도 · {confidenceLabel}</p>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-background/60 px-3 py-2 text-[10px] font-medium leading-4 text-muted-foreground">⚠ 차량 신호 데이터를 기반으로 한 추정입니다. 실제 횡단 전 현장 보행신호와 차량 흐름을 반드시 확인하세요.</p>
    </div>
  );
}

export function BottomSheet({ open, intersection, status, signalLoading, viewMode, favorites, recent, onToggleFavorite, onSelectRecent, onClearRecent, onClose, onRetry }: BottomSheetProps) {
  const { snap, liveHeightPx, isDragging, setSnap, onDragStart, onDragMove, onDragEnd } = useBottomSheet({ open, initialSnap: "partial" });
  const [tab, setTab] = useState<TabId>("info");
  const currentHeightPx = liveHeightPx ?? snapHeightPx(snap, typeof window === "undefined" ? 0 : window.innerHeight);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => root.style.setProperty("--signal-sheet-height", media.matches && open ? `${Math.max(0, currentHeightPx)}px` : "0px");
    sync();
    media.addEventListener?.("change", sync);
    return () => { media.removeEventListener?.("change", sync); root.style.setProperty("--signal-sheet-height", "0px"); };
  }, [open, currentHeightPx]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => onDragStart(event.clientY), [onDragStart]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => onDragMove(event.clientY);
    const handleUp = (event: PointerEvent) => onDragEnd(event.clientY);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => { window.removeEventListener("pointermove", handleMove); window.removeEventListener("pointerup", handleUp); window.removeEventListener("pointercancel", handleUp); };
  }, [isDragging, onDragMove, onDragEnd]);

  const actualPedestrianSignals = intersection?.signals.filter((signal) => signal.movement === "Pedestrian") ?? [];
  const hasActualPedestrianSignals = actualPedestrianSignals.length > 0;
  const modeSignals = intersection ? intersection.signals.filter((signal) => viewMode === "pedestrian" ? signal.movement === "Pedestrian" : signal.movement !== "Pedestrian") : [];
  const groupedModeSignals: Record<ApproachDirection, Intersection["signals"]> = modeSignals.reduce<Record<ApproachDirection, Intersection["signals"]>>((acc, signal) => { (acc[signal.direction] ??= []).push(signal); return acc; }, { North: [], East: [], South: [], West: [], NorthEast: [], SouthEast: [], SouthWest: [], NorthWest: [] });
  const isFav = intersection ? favorites.has(intersection.crsrdId) : false;

  const renderInfoContent = () => {
    if (status === "loading") return <LoadingState />;
    if (status === "error") return <ErrorView onRetry={onRetry} />;
    if (!intersection) return <div className="flex flex-col gap-6 px-5 py-6"><EmptyState /><RecentIntersections recent={recent} onSelect={onSelectRecent} onClear={onClearRecent} /></div>;
    const pedestrianFallback = viewMode === "pedestrian" && !hasActualPedestrianSignals;
    return (
      <div className="flex flex-col gap-6 px-5 py-5">
        <AiRecommendationCard intersection={intersection} viewMode={viewMode} index={0} />
        <div className="flex flex-col gap-4">
          {signalLoading ? <LoadingState /> : pedestrianFallback ? <PedestrianEstimateCard intersection={intersection} /> : modeSignals.length === 0 ? (
            <div className="rounded-2xl border border-border/15 bg-muted/30 px-4 py-5 text-center text-sm font-medium text-muted-foreground" role="status" aria-live="polite">{viewMode === "pedestrian" ? "보행 신호 데이터 없음" : "데이터 없음"}</div>
          ) : DIRECTION_ORDER.map((direction, index) => {
            const signals = groupedModeSignals[direction];
            if (!signals || signals.length === 0) return null;
            return <div key={direction}>{index > 0 && <Separator className="my-6 border-border/15" />}<TrafficSignalCard direction={direction} signals={signals} index={index + 1} viewMode={viewMode} /></div>;
          })}
        </div>
      </div>
    );
  };

  const renderFlowContent = () => <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><Activity className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">교통흐름 분석 기능이 준비 중입니다</p></div>;
  const renderFavoritesContent = () => <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><Bookmark className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">즐겨찾기한 교차로가 없습니다</p></div>;
  const renderHistoryContent = () => recent.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><History className="size-10 text-muted-foreground/40" /><p className="text-sm font-medium text-muted-foreground">최근 본 교차로가 없습니다</p></div> : <div className="px-5 py-5"><RecentIntersections recent={recent} onSelect={onSelectRecent} onClear={onClearRecent} /></div>;
  const renderContent = () => { switch (tab) { case "info": return renderInfoContent(); case "flow": return renderFlowContent(); case "favorites": return renderFavoritesContent(); case "history": return renderHistoryContent(); } };

  const renderHeader = (compact = false) => <div className={cn("sticky top-0 z-10 glass-heavy", compact ? "px-5 pt-2 pb-2" : "px-5 pt-4 pb-3.5")}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 flex-col gap-1"><h2 className={cn("truncate font-bold tracking-tight text-foreground", compact ? "text-sm" : "text-xl")}>{intersection ? intersection.crsrdNm : "교통 신호"}</h2>{intersection && !compact && <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock className="size-3" /><span>마지막 업데이트 {relativeAgo(intersection.updatedAt)}</span></div>}</div><div className="flex shrink-0 items-center gap-0.5">{intersection && <><Button variant="ghost" size="icon-sm" aria-label={isFav ? "즐겨찾기 삭제" : "즐겨찾기 추가"} onClick={() => onToggleFavorite(intersection.crsrdId)} className={cn("transition-all duration-250 active:scale-90 hover:bg-accent", isFav ? "text-signal-yellow hover:text-signal-yellow" : "text-muted-foreground")}><Star className={cn("size-4 transition-all", isFav && "fill-current animate-star-pop")} /></Button><Button variant="ghost" size="icon-sm" aria-label="교차로 공유" onClick={() => {}} className="text-muted-foreground transition-all duration-250 active:scale-90 hover:bg-accent hover:text-foreground"><Share2 className="size-4" /></Button></>}<Button variant="ghost" size="icon-sm" aria-label="패널 닫기" onClick={onClose} className="shrink-0 -mr-1.5 text-muted-foreground transition-all duration-250 active:scale-90 hover:bg-accent hover:text-foreground"><X className="size-4" /></Button></div></div></div>;

  const renderTabBar = () => <div className="flex shrink-0 items-center border-t border-border/15 glass-heavy">{TABS.map((item) => { const active = tab === item.id; const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-all duration-200", active ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground")}><Icon className={cn("size-4 transition-transform duration-200", active && "scale-110")} />{item.label}</button>; })}</div>;
  const renderSnapDots = () => <div className="flex items-center justify-center gap-2 pb-2">{(["collapsed", "partial", "full"] as SheetSnap[]).map((sheetSnap) => <button key={sheetSnap} type="button" aria-label={`패널 높이 ${sheetSnap}`} onClick={() => setSnap(sheetSnap)} className={cn("h-1.5 rounded-full transition-all duration-250 ease-out", snap === sheetSnap ? "w-6 bg-foreground/40" : "w-1.5 bg-foreground/15 hover:bg-foreground/30")} />)}</div>;

  return <>
    <div className={cn("lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cn("fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden", snap === "full" && open ? "opacity-100" : "opacity-0")} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="false" aria-label="교통 신호 정보" style={{ height: open ? `${currentHeightPx}px` : undefined, transition: isDragging ? "none" : "height 380ms cubic-bezier(0.32, 0.72, 0, 1)" }} className={cn("fixed inset-x-0 bottom-0 z-40 flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-t-[2rem] border-t border-border/20 bg-card elevation-5 pb-[env(safe-area-inset-bottom)]", open ? "translate-y-0" : "translate-y-full")}>
        <div onPointerDown={handlePointerDown} className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 px-4 pt-3 pb-1.5 active:cursor-grabbing"><span className="h-1.5 w-10 rounded-full bg-foreground/15 transition-colors active:bg-foreground/30" />{snap !== "collapsed" && renderSnapDots()}</div>
        {snap === "collapsed" ? <button type="button" aria-label="패널 펼치기" onClick={() => setSnap("partial")} className="flex flex-1 flex-col justify-center px-5 pb-3 text-left">{renderHeader(true)}</button> : <>{renderHeader()}<ScrollArea className="min-h-0 flex-1 overflow-hidden">{renderContent()}</ScrollArea>{renderTabBar()}<button type="button" aria-label="패널 접기" onClick={() => setSnap("collapsed")} className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border/15 py-3 text-xs font-semibold text-muted-foreground transition-colors duration-200 hover:bg-accent"><ChevronDown className="size-4" />접기</button></>}
      </div>
    </div>
    <aside className={cn("hidden lg:flex fixed right-0 top-14 z-40 h-[calc(100dvh-3.5rem)] w-[var(--signal-desktop-sheet-width,min(360px,32vw))] min-w-[320px] max-w-[360px] flex-col border-l border-border/15 bg-card/95 elevation-4", "transition-transform duration-350 ease-out", open ? "translate-x-0 animate-panel-slide-in" : "translate-x-full")} aria-hidden={!open} aria-label="교통 신호 정보">
      {renderHeader()}<ScrollArea className="min-h-0 flex-1 overflow-hidden">{renderContent()}</ScrollArea>{renderTabBar()}
    </aside>
  </>;
}

export default BottomSheet;
