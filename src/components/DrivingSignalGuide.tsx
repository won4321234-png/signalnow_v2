import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Search, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABELS_KO, PHASE_LABELS, phaseColor, type SignalColor } from "@/lib/signal";
import type { Intersection, MovementType, TrafficSignal } from "@/types/traffic";

const MOVEMENT_ORDER: MovementType[] = ["Straight", "Left Turn", "Right Turn", "U Turn", "Bus", "Bicycle"];
const MOVEMENT_ICON: Record<MovementType, typeof ArrowUp> = {
  Straight: ArrowUp,
  "Left Turn": ArrowLeft,
  "Right Turn": ArrowRight,
  "U Turn": ArrowDown,
  Pedestrian: ArrowUp,
  Bus: ArrowUp,
  Bicycle: ArrowUp,
};

export interface DriveHistoryItem {
  id: string;
  name: string;
}

interface DrivingSignalGuideProps {
  intersection: Intersection | null;
  signals: TrafficSignal[];
  loading?: boolean;
  distanceMeters?: number | null;
  speedMps?: number | null;
  accelerationMps2?: number | null;
  accuracyM?: number | null;
  history?: DriveHistoryItem[];
  onExit: () => void;
  onOpenDetails: () => void;
}

function allSignals(signals: TrafficSignal[]): TrafficSignal[] {
  return signals
    .slice()
    .sort((a, b) => {
      const direction = a.direction.localeCompare(b.direction);
      if (direction !== 0) return direction;
      const movementA = MOVEMENT_ORDER.indexOf(a.movement);
      const movementB = MOVEMENT_ORDER.indexOf(b.movement);
      return (movementA < 0 ? 99 : movementA) - (movementB < 0 ? 99 : movementB);
    });
}

function signalTone(signal: TrafficSignal): SignalColor {
  return phaseColor(signal.state);
}

function toneClass(color: SignalColor): string {
  if (color === "green") return "text-[#3fbe52]";
  if (color === "yellow") return "text-[#f5ad16]";
  return "text-[#ff3535]";
}

function SignalRail({ signal }: { signal: TrafficSignal }) {
  const color = signalTone(signal);
  const seconds = signal.remainingSeconds === undefined ? null : Math.max(0, Math.floor(signal.remainingSeconds));
  const Icon = MOVEMENT_ICON[signal.movement];

  return (
    <div className="relative flex min-w-[112px] flex-1 flex-col items-center">
      <div className="mb-2 flex flex-col items-center text-center">
        <span className="text-[9px] font-bold text-white/35">{signal.direction}</span>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-black text-white/75">
          <Icon className="size-4" strokeWidth={2.6} />
          <span>{MOVEMENT_LABELS_KO[signal.movement]}</span>
        </div>
      </div>
      <div className="relative h-[320px] w-[78px] overflow-hidden rounded-[8px] border border-white/15 bg-[#10191a] shadow-[0_0_0_1px_rgba(0,0,0,.45),0_18px_40px_rgba(0,0,0,.28)]">
        <div className="absolute inset-[7px] flex flex-col overflow-hidden rounded-[3px] bg-[#15221e]">
          <div className="flex-[0.22] border-b border-black/20 bg-[#ff3535]" />
          <div className="h-[15%] border-b border-black/20 bg-[#f5ad16]" />
          <div className={cn("flex-1", color === "green" ? "bg-[#3fbe52]" : "bg-[#245c31]")} />
          {color === "green" && <div className="absolute inset-x-[7px] bottom-[18%] h-[8px] rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.5)]" />}
          {color === "yellow" && <div className="absolute inset-x-[7px] top-[52%] h-[8px] rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.5)]" />}
          {color === "red" && <div className="absolute inset-x-[7px] top-[22%] h-[8px] rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.5)]" />}
        </div>
      </div>
      <div className={cn("mt-2 flex items-baseline gap-1", toneClass(color))}>
        <span className="text-2xl font-black tabular-nums">{seconds ?? "—"}</span>
        {seconds !== null && <span className="text-[10px] font-bold text-white/45">초</span>}
      </div>
      <p className="mt-0.5 max-w-[112px] truncate text-center text-[9px] font-bold text-white/35">
        {signal.direction} · {PHASE_LABELS[signal.state]}
      </p>
    </div>
  );
}

function RouteRail({ history, currentId }: { history: DriveHistoryItem[]; currentId?: string }) {
  const items = history.slice(-6);
  return (
    <div className="relative h-full min-h-[420px] w-[112px] shrink-0">
      <div className="absolute left-[47px] top-8 bottom-8 w-[2px] bg-white/15" />
      <div className="flex h-full flex-col justify-between py-8">
        {items.map((item, index) => {
          const active = item.id === currentId;
          return (
            <div key={item.id + "-" + index} className="relative flex min-h-[48px] items-center">
              <div className={cn(
                "absolute left-[37px] z-10 size-[20px] rounded-full border-[3px]",
                active ? "border-[#54d6df] bg-[#54d6df] shadow-[0_0_16px_rgba(84,214,223,.45)]" : "border-white/25 bg-[#081012]"
              )} />
              <div className="absolute left-[65px] min-w-[145px]">
                <p className={cn("truncate text-[13px] font-black", active ? "text-white" : "text-white/35")}>{item.name}</p>
                {active && <p className="mt-0.5 text-[9px] font-bold text-[#54d6df]">현재 위치</p>}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div className="absolute left-[24px] top-1/2 size-[46px] -translate-y-1/2 rounded-full border-[4px] border-[#54d6df]/70 bg-[#071012] shadow-[0_0_20px_rgba(84,214,223,.25)]" />}
      </div>
    </div>
  );
}

export function DrivingSignalGuide({
  intersection,
  signals,
  loading = false,
  distanceMeters,
  speedMps = null,
  accelerationMps2 = null,
  accuracyM = null,
  history = [],
  onExit,
  onOpenDetails,
}: DrivingSignalGuideProps) {
  const currentSignals = allSignals(signals);
  const distance = distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters)
    ? Math.round(distanceMeters)
    : null;
  const leadSignal = currentSignals.find((signal) => signal.movement === "Straight") ?? currentSignals[0];
  const leadSeconds = leadSignal?.remainingSeconds === undefined
    ? null
    : Math.max(0, Math.floor(leadSignal.remainingSeconds));
  const speedKmh = speedMps !== null && Number.isFinite(speedMps) ? Math.round(speedMps * 3.6) : null;
  const acceleration = accelerationMps2 !== null && Number.isFinite(accelerationMps2) ? accelerationMps2 : null;
  const accuracy = accuracyM !== null && Number.isFinite(accuracyM) ? Math.round(accuracyM) : null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[90] overflow-hidden bg-[#05090b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_48%,rgba(42,75,66,.16),transparent_38%)]" />
      <header className="relative z-10 flex h-[78px] items-center justify-between px-5 sm:px-8">
        <button type="button" aria-label="자동 안내 종료" onClick={onExit} className="flex size-12 items-center justify-center rounded-full text-white transition hover:bg-white/10">
          <span className="text-[42px] font-extralight leading-none">‹</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[11px] font-black text-white/55">화면</span>
          <span className="rounded-full border border-[#2f737a]/50 bg-[#0b2529] px-4 py-2 text-[11px] font-black text-[#65dce4]">● GPS {accuracy === null ? "확인 중" : "±" + accuracy + "m"} · 자동</span>
          <button type="button" aria-label="교차로 상세 검색" onClick={onOpenDetails} className="flex size-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10">
            <Search className="size-7" strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex h-[calc(100%-78px)] min-h-0 overflow-hidden px-3 pb-4 sm:px-6 lg:px-10">
        <RouteRail history={history} currentId={intersection?.crsrdId} />

        <section className="min-w-0 flex-1 overflow-y-auto pr-1">
          <div className="mx-auto max-w-[980px]">
            <div className="flex items-end justify-between gap-4 pt-6 sm:pt-8">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold text-white/35">현재 교차로</p>
                <h1 className="truncate text-[clamp(1.5rem,4vw,2.45rem)] font-black tracking-tight">{intersection?.crsrdNm ?? "교차로 찾는 중…"}</h1>
                <p className="mt-1 truncate text-xs font-semibold text-white/35">{distance === null ? "GPS로 다음 교차로를 찾는 중" : distance + " m"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold text-white/30">다음 신호까지</p>
                <p className="mt-1 text-[clamp(3rem,9vw,5.8rem)] font-light leading-none tabular-nums">{leadSeconds ?? "—"}<span className="ml-2 text-[clamp(1rem,2vw,1.5rem)] font-normal text-white/50">초</span></p>
              </div>
            </div>

            <div className="mt-7 border-t border-white/10 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-black tracking-[0.12em] text-white/45">전체 신호</p>
                <span className="text-[10px] font-bold text-white/25">{currentSignals.length}개 데이터 · 보행/차량/버스/자전거 포함</span>
              </div>

              {loading ? (
                <div className="flex min-h-[390px] items-center justify-center text-center">
                  <div>
                    <div className="mx-auto mb-3 size-7 animate-spin rounded-full border-2 border-white/10 border-t-[#54d6df]" />
                    <p className="text-sm font-black">신호 데이터 불러오는 중</p>
                    <p className="mt-1 text-[10px] font-semibold text-white/35">현재 위치의 교차로 신호를 확인하고 있습니다.</p>
                  </div>
                </div>
              ) : currentSignals.length === 0 ? (
                <div className="flex min-h-[390px] items-center justify-center text-center">
                  <div>
                    <p className="text-lg font-black">표시할 신호 데이터가 없습니다.</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">이 교차로에는 현재 제공되는 신호 데이터가 없습니다. 다음 교차로를 자동으로 탐색합니다.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="flex min-w-max gap-5 pr-8 sm:gap-8">
                    {currentSignals.map((signal) => <SignalRail key={signal.direction + "-" + signal.movement} signal={signal} />)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-1 flex items-end justify-between gap-6 border-t border-white/[0.06] py-5 text-white/30">
              <div className="flex items-center gap-2 text-xs font-bold"><Volume2 className="size-4" /> 신호 변경 알림 · 핀 선택 없이 자동 전환</div>
              <div className="flex items-end gap-5">
                <div className="text-right"><p className="text-[9px] font-bold text-white/25">현재 속도</p><p className="mt-0.5 text-[clamp(2.5rem,7vw,4.5rem)] font-light leading-none tabular-nums text-white">{speedKmh ?? "—"}<span className="ml-1 text-base font-normal text-white/40">km/h</span></p></div>
                <div className="pb-1 text-right"><p className="text-[9px] font-bold text-white/25">가속도</p><p className="mt-0.5 text-xl font-light leading-none tabular-nums text-[#65dce4]">{acceleration === null ? "—" : (acceleration >= 0 ? "+" : "") + acceleration.toFixed(1)}<span className="ml-1 text-[9px] text-white/35">m/s²</span></p></div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DrivingSignalGuide;
