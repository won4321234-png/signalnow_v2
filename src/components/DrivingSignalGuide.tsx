import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Gauge, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIRECTION_LABELS_KO, MOVEMENT_LABELS_KO, PHASE_LABELS, SIGNAL_TEXT_CLASS, phaseColor, type SignalColor } from "@/lib/signal";
import type { Intersection, MovementType, TrafficSignal } from "@/types/traffic";

const MOVEMENT_ORDER: MovementType[] = ["Straight", "Left Turn", "Right Turn", "U Turn", "Bus", "Bicycle"];
function movementIcon(movement: MovementType) {
  if (movement === "Straight") return ArrowUp;
  if (movement === "Left Turn") return ArrowLeft;
  if (movement === "Right Turn") return ArrowRight;
  if (movement === "U Turn") return ArrowDown;
  return Gauge;
}
function uniqueVehicleSignals(signals: TrafficSignal[]): TrafficSignal[] {
  return signals.filter((item) => item.movement !== "Pedestrian").slice().sort((a, b) => MOVEMENT_ORDER.indexOf(a.movement) - MOVEMENT_ORDER.indexOf(b.movement));
}

interface DrivingSignalGuideProps {
  intersection: Intersection | null;
  signals: TrafficSignal[];
  loading?: boolean;
  distanceMeters?: number | null;
  onExit: () => void;
  onOpenDetails: () => void;
}

function SignalRow({ signal }: { signal: TrafficSignal }) {
  const color: SignalColor = phaseColor(signal.state);
  const Icon = movementIcon(signal.movement);
  const seconds = signal.remainingSeconds === undefined ? null : Math.max(0, Math.floor(signal.remainingSeconds));
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/15 bg-background/65 px-3.5 py-3">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/50", SIGNAL_TEXT_CLASS[color])}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-foreground">{MOVEMENT_LABELS_KO[signal.movement]}</p>
        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{DIRECTION_LABELS_KO[signal.direction]} · {PHASE_LABELS[signal.state]}</p>
      </div>
      <div className="flex shrink-0 items-end gap-0.5"><span className={cn("text-2xl font-black tabular-nums leading-none", SIGNAL_TEXT_CLASS[color])}>{seconds ?? "—"}</span>{seconds !== null && <span className="pb-0.5 text-[10px] font-bold text-muted-foreground">초</span>}</div>
    </div>
  );
}

export function DrivingSignalGuide({ intersection, signals, loading = false, distanceMeters, onExit, onOpenDetails }: DrivingSignalGuideProps) {
  const vehicleSignals = uniqueVehicleSignals(signals);
  const distance = distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null;
  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[55] mx-auto w-[min(430px,calc(100vw-1.5rem))] lg:inset-y-0 lg:bottom-auto lg:left-auto lg:right-4 lg:top-20 lg:mx-0 lg:w-[min(390px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-[1.75rem] border border-border/20 bg-card/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/15 px-4 py-3.5">
          <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gauge className="size-4.5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">SignalNow Drive</p><p className="text-sm font-black text-foreground">자동 운행 안내</p></div></div>
          <button type="button" aria-label="자동 운행 안내 종료" onClick={onExit} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="max-h-[min(62vh,620px)] overflow-y-auto p-3.5">
          <div className="mb-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
            <p className="text-[11px] font-bold opacity-75">현재 안내 교차로</p>
            <div className="mt-1 flex items-start justify-between gap-3"><h2 className="min-w-0 truncate text-xl font-black tracking-tight">{intersection?.crsrdNm ?? "교차로 찾는 중…"}</h2>{intersection && <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold">자동 전환</span>}</div>
            <p className="mt-1 text-xs font-medium opacity-80">{distance === null ? "현재 위치를 확인하고 있습니다" : distance <= 35 ? "교차로 통과를 감지하는 중" : `교차로까지 약 ${distance}m`}</p>
          </div>
          {loading ? (
            <div className="rounded-2xl border border-border/15 bg-muted/30 px-4 py-8 text-center"><p className="text-sm font-bold text-foreground">신호 데이터를 불러오는 중…</p><p className="mt-1 text-xs text-muted-foreground">교차로를 통과하면 다음 신호로 자동 전환됩니다.</p></div>
          ) : !intersection ? (
            <div className="rounded-2xl border border-border/15 bg-muted/30 px-4 py-8 text-center"><p className="text-sm font-bold text-foreground">현재 위치를 확인하고 있습니다</p><p className="mt-1 text-xs text-muted-foreground">위치 권한을 허용하면 가까운 교차로의 신호가 자동으로 표시됩니다.</p></div>
          ) : vehicleSignals.length === 0 ? (
            <div className="rounded-2xl border border-border/15 bg-muted/30 px-4 py-8 text-center"><p className="text-sm font-bold text-foreground">차량 신호 데이터가 없습니다</p><p className="mt-1 text-xs text-muted-foreground">데이터가 다시 들어오면 자동으로 갱신됩니다.</p></div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between px-1"><p className="text-xs font-extrabold text-foreground">현재 신호</p><p className="text-[10px] font-semibold text-muted-foreground">{vehicleSignals.length}개 신호 데이터</p></div>
              <div className="flex flex-col gap-2">{vehicleSignals.map((signal) => <SignalRow key={`${signal.direction}-${signal.movement}`} signal={signal} />)}</div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/15 bg-muted/25 px-3.5 py-3"><div><p className="text-[10px] font-bold text-muted-foreground">대표 진행 방향</p><p className="mt-0.5 text-xs font-extrabold text-foreground">전체 차량 신호 데이터를 자동 표시</p></div><ChevronRight className="size-4 text-muted-foreground/60" /></div>
            </>
          )}
          <button type="button" onClick={onOpenDetails} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/15 bg-muted/20 py-2.5 text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground">기존 교차로 상세 화면 열기 <ChevronRight className="size-3.5" /></button>
          <p className="mt-3 px-1 text-[10px] font-medium leading-4 text-muted-foreground/70">자동 운행 안내는 현재 위치에 가장 가까운 신호 교차로를 기준으로 다음 교차로로 자동 전환됩니다. 실제 운전 중에는 현장 교통신호와 도로 상황을 우선하세요.</p>
        </div>
      </div>
    </div>
  );
}
export default DrivingSignalGuide;
