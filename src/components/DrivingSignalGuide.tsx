import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Gauge, LocateFixed, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABELS_KO, PHASE_LABELS, SIGNAL_TEXT_CLASS, phaseColor, type SignalColor } from "@/lib/signal";
import type { Intersection, MovementType, TrafficSignal } from "@/types/traffic";

const MOVEMENT_ORDER: MovementType[] = ["Straight", "Left Turn", "Right Turn", "U Turn", "Bus", "Bicycle"];
const MOVEMENT_ICON: Record<MovementType, typeof ArrowUp> = {
  Straight: ArrowUp, "Left Turn": ArrowLeft, "Right Turn": ArrowRight, "U Turn": ArrowDown,
  Pedestrian: Gauge, Bus: Gauge, Bicycle: Gauge,
};

export interface DriveHistoryItem { id: string; name: string; }

interface DrivingSignalGuideProps {
  intersection: Intersection | null;
  signals: TrafficSignal[];
  loading?: boolean;
  distanceMeters?: number | null;
  history?: DriveHistoryItem[];
  onExit: () => void;
  onOpenDetails: () => void;
}

function vehicleSignals(signals: TrafficSignal[]): TrafficSignal[] {
  return signals.filter((signal) => signal.movement !== "Pedestrian").slice().sort((a, b) => {
    const direction = a.direction.localeCompare(b.direction);
    return direction !== 0 ? direction : MOVEMENT_ORDER.indexOf(a.movement) - MOVEMENT_ORDER.indexOf(b.movement);
  });
}

function SignalBlock({ signal }: { signal: TrafficSignal }) {
  const color: SignalColor = phaseColor(signal.state);
  const Icon = MOVEMENT_ICON[signal.movement];
  const seconds = signal.remainingSeconds === undefined ? null : Math.max(0, Math.floor(signal.remainingSeconds));
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]", SIGNAL_TEXT_CLASS[color])}><Icon className="size-4.5" strokeWidth={2.5} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{MOVEMENT_LABELS_KO[signal.movement]}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-white/45">{signal.direction} · {PHASE_LABELS[signal.state]}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-1"><span className={cn("text-2xl font-black tabular-nums leading-none", SIGNAL_TEXT_CLASS[color])}>{seconds ?? "—"}</span>{seconds !== null && <span className="text-[10px] font-bold text-white/40">초</span>}</div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={cn("h-full rounded-full transition-all duration-700 ease-linear", color === "green" && "bg-signal-green", color === "yellow" && "bg-signal-yellow", color === "red" && "bg-signal-red")} style={{ width: seconds === null ? "0%" : `${Math.min(100, Math.max(3, (seconds / Math.max(1, signal.cycleSeconds)) * 100))}%` }} />
      </div>
    </div>
  );
}

function Timeline({ history, currentId }: { history: DriveHistoryItem[]; currentId?: string }) {
  const visible = history.slice(-5);
  return <div className="relative pl-7">
    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
    <div className="flex flex-col gap-4">
      {visible.map((item, index) => {
        const current = item.id === currentId;
        return <div key={`${item.id}-${index}`} className="relative">
          <span className={cn("absolute -left-7 top-1.5 size-[15px] rounded-full border-2", current ? "border-cyan-300 bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.55)]" : "border-white/25 bg-[#071016]")} />
          <p className={cn("truncate text-xs font-bold", current ? "text-white" : "text-white/35")}>{item.name}</p>
          {current && <p className="mt-0.5 text-[9px] font-semibold text-cyan-300/80">현재 안내 중</p>}
        </div>;
      })}
    </div>
  </div>;
}

export function DrivingSignalGuide({ intersection, signals, loading = false, distanceMeters, history = [], onExit, onOpenDetails }: DrivingSignalGuideProps) {
  const currentSignals = vehicleSignals(signals);
  const distance = distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-[55] flex items-end justify-center bg-[#02070a]/55 backdrop-blur-[2px] lg:items-start lg:justify-end lg:bg-transparent lg:backdrop-blur-0">
      <section className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#071016]/[0.97] text-white shadow-2xl lg:m-4 lg:mt-20 lg:max-h-[calc(100svh-6rem)] lg:w-[min(470px,calc(100vw-2rem))] lg:rounded-[2rem]">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300"><LocateFixed className="size-4.5" /></div>
            <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">SIGNALNOW DRIVE</p><p className="truncate text-sm font-black text-white">주행 신호 안내</p></div>
          </div>
          <button type="button" aria-label="자동 운행 안내 종료" onClick={onExit} className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><X className="size-4.5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pt-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0"><p className="text-[10px] font-bold text-cyan-300/80">현재 교차로</p><h2 className="mt-1 truncate text-[clamp(1.35rem,5vw,2rem)] font-black tracking-tight text-white">{intersection?.crsrdNm ?? "교차로 찾는 중…"}</h2></div>
              <div className="shrink-0 text-right"><p className="text-[9px] font-bold text-white/35">거리</p><p className="mt-0.5 text-lg font-black tabular-nums text-white">{distance === null ? "—" : `${distance}m`}</p></div>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-white/40">교차로를 통과하면 GPS 기준으로 다음 교차로 신호로 자동 전환됩니다.</p>
          </div>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 px-5">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2"><span className="size-1.5 rounded-full bg-cyan-300" /><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">이동 순서</p></div>
              {history.length > 0 ? <Timeline history={history} currentId={intersection?.crsrdId} /> : <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-[10px] font-semibold leading-5 text-white/35">현재 위치를 기준으로 교차로를 자동 탐색하고 있습니다.</div>}
            </div>
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">실시간 신호</p><span className="text-[9px] font-bold text-white/30">{currentSignals.length}개</span></div>
              {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center"><p className="text-sm font-black text-white">신호 데이터 불러오는 중</p><p className="mt-1 text-[10px] font-semibold leading-4 text-white/35">데이터가 들어오면 직진·좌회전 등 이용 가능한 모든 차량 신호를 표시합니다.</p></div> : currentSignals.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center"><p className="text-sm font-black text-white">현재 교차로의 차량 신호 데이터가 없습니다.</p><p className="mt-1 text-[10px] font-semibold leading-4 text-white/35">다음 교차로로 이동하면 자동으로 갱신됩니다.</p></div> : <div className="grid gap-2">{currentSignals.map((signal) => <SignalBlock key={`${signal.direction}-${signal.movement}`} signal={signal} />)}</div>}
            </div>
          </div>
          <div className="px-5 pb-5 pt-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black text-white/35">자동 전환</p><p className="mt-0.5 text-xs font-extrabold text-white">핀을 누르지 않아도 다음 교차로가 표시됩니다.</p></div><span className="shrink-0 rounded-full bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black text-cyan-300">GPS ON</span></div></div>
            <button type="button" onClick={onOpenDetails} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-[11px] font-bold text-white/45 hover:bg-white/[0.07] hover:text-white">기존 교차로 상세 화면 열기 <ChevronRight className="size-3.5" /></button>
            <p className="mt-3 text-[9px] font-medium leading-4 text-white/25">자동 안내는 위치 정확도와 신호 데이터 상태에 따라 달라질 수 있습니다. 실제 운전 중에는 현장 교통신호를 우선하세요.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
export default DrivingSignalGuide;
