import { ArrowLeft, ArrowRight, ArrowUp, Bike, Bus, CornerDownLeft, Footprints } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  DIRECTION_LABELS_KO,
  MOVEMENT_ICONS,
  MOVEMENT_LABELS_KO,
  PHASE_LABELS,
  SIGNAL_BG_CLASS,
  SIGNAL_SOFT_BG_CLASS,
  SIGNAL_TEXT_CLASS,
  phaseColor,
  phaseProgress,
  type SignalColor,
} from "@/lib/signal";
import type { ApproachDirection, MovementType, TrafficSignal, ViewMode } from "@/types/traffic";

const MOVEMENT_ICON_MAP: Record<(typeof MOVEMENT_ICONS)[MovementType], LucideIcon> = {
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Footprints,
  Bus,
  Bike,
  CornerDownLeft,
};

const DIRECTION_SHORT: Record<ApproachDirection, string> = {
  North: "북",
  East: "동",
  South: "남",
  West: "서",
  NorthEast: "북동",
  SouthEast: "남동",
  SouthWest: "남서",
  NorthWest: "북서",
};

interface TrafficSignalCardProps {
  direction: ApproachDirection;
  signals: TrafficSignal[];
  index?: number;
  viewMode?: ViewMode;
}

function interpretationFor(signal: TrafficSignal, viewMode: ViewMode): { title: string; detail: string } {
  const seconds = signal.remainingSeconds === undefined ? null : Math.max(0, Math.floor(signal.remainingSeconds));

  if (viewMode === "pedestrian" || signal.movement === "Pedestrian") {
    if (signal.state === "protected-Movement-Allowed") {
      return {
        title: "지금 건널 수 있어요",
        detail: seconds === null ? "보행 신호가 진행 중입니다." : `보행 가능 신호가 약 ${seconds}초 남았습니다.`,
      };
    }
    if (signal.state === "protected-clearance") {
      return {
        title: "건너는 중이라면 서두르세요",
        detail: seconds === null ? "보행 신호가 곧 종료됩니다." : `보행 신호 종료까지 약 ${seconds}초 남았습니다.`,
      };
    }
    return {
      title: "잠시 기다리세요",
      detail: seconds === null ? "다음 보행 신호를 기다려 주세요." : `다음 보행 신호를 기다려 주세요. 현재 단계 약 ${seconds}초.`,
    };
  }

  if (signal.state === "protected-Movement-Allowed") {
    return {
      title: `${MOVEMENT_LABELS_KO[signal.movement]} 진행 가능`,
      detail: seconds === null ? "현재 진행 신호가 켜져 있습니다." : `현재 신호가 약 ${seconds}초 남았습니다.`,
    };
  }
  if (signal.state === "protected-clearance") {
    return {
      title: "신호 전환 중",
      detail: seconds === null ? "진행 신호가 종료되는 단계입니다." : `현재 전환 단계가 약 ${seconds}초 남았습니다.`,
    };
  }
  return {
    title: "정지",
    detail: seconds === null ? "현재 정지 신호입니다." : `정지 신호가 약 ${seconds}초 남았습니다.`,
  };
}

function SignalInterpretation({ signals, viewMode }: { signals: TrafficSignal[]; viewMode: ViewMode }) {
  if (signals.length === 0) return null;

  const preferred = viewMode === "pedestrian"
    ? signals.find((signal) => signal.movement === "Pedestrian") ?? signals[0]
    : signals.find((signal) => signal.movement === "Straight")
      ?? signals.find((signal) => signal.movement === "Left Turn")
      ?? signals[0];
  const interpretation = interpretationFor(preferred, viewMode);
  const seconds = preferred.remainingSeconds === undefined ? null : Math.max(0, Math.floor(preferred.remainingSeconds));
  const active = preferred.state === "protected-Movement-Allowed";
  const color = phaseColor(preferred.state);

  return (
    <div className="rounded-2xl border border-border/20 bg-muted/30 p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full", SIGNAL_SOFT_BG_CLASS[color])}>
          <span className={cn("size-4 rounded-full", SIGNAL_BG_CLASS[color])} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {viewMode === "pedestrian" ? "보행자 안내" : "운전자 안내"}
            </p>
            {seconds !== null && (
              <span className={cn("text-2xl font-black tabular-nums leading-none", SIGNAL_TEXT_CLASS[color])}>
                {seconds}<span className="ml-0.5 text-xs font-bold">초</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-base font-extrabold tracking-tight text-foreground">{interpretation.title}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground">{interpretation.detail}</p>
          {viewMode === "driver" && (
            <p className="mt-2 text-[11px] font-medium text-muted-foreground/80">
              {MOVEMENT_LABELS_KO[preferred.movement]} · {DIRECTION_LABELS_KO[preferred.direction]}
            </p>
          )}
        </div>
      </div>
      {seconds !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/60">
          <div
            className={cn("h-full rounded-full transition-all duration-500 ease-linear", SIGNAL_BG_CLASS[color])}
            style={{ width: `${Math.min(100, Math.max(0, (seconds / Math.max(1, preferred.cycleSeconds)) * 100))}%` }}
          />
        </div>
      )}
      {!active && viewMode === "pedestrian" && (
        <p className="mt-2 text-[10px] font-medium text-muted-foreground">
          신호 데이터 기준 안내이며 실제 현장 신호와 차이가 있을 수 있습니다.
        </p>
      )}
    </div>
  );
}

export function TrafficSignalCard({ direction, signals, index = 0, viewMode = "driver" }: TrafficSignalCardProps) {
  if (signals.length === 0) return null;

  const orderedSignals = viewMode === "pedestrian"
    ? [...signals].sort((a, b) => {
        const aPed = a.movement === "Pedestrian" ? 0 : 1;
        const bPed = b.movement === "Pedestrian" ? 0 : 1;
        return aPed - bPed;
      })
    : signals;

  return (
    <section className="animate-card-enter" style={{ animationDelay: `${index * 60}ms` }}>
      <SignalInterpretation signals={orderedSignals} viewMode={viewMode} />

      <div className="mt-5 flex items-center justify-between px-1 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted/60 text-[11px] font-bold text-muted-foreground">
            {DIRECTION_SHORT[direction]}
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">{DIRECTION_LABELS_KO[direction]}</h3>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{signals.length}개 차선</span>
      </div>

      <div className="flex flex-col">
        {orderedSignals.map((sig, idx) => {
          const color: SignalColor = phaseColor(sig.state);
          const progress = phaseProgress(sig.remainingSeconds, sig.cycleSeconds);
          const Icon = MOVEMENT_ICON_MAP[MOVEMENT_ICONS[sig.movement]];
          const displayRemaining = sig.remainingSeconds === undefined ? undefined : Math.floor(Math.max(0, sig.remainingSeconds));

          return (
            <div key={`${sig.direction}-${sig.movement}-${idx}`}>
              {idx > 0 && <Separator className="my-3 border-border/15" />}
              <div className="flex items-center gap-3 px-1">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", SIGNAL_SOFT_BG_CLASS[color])}>
                  <Icon className={cn("size-4.5", SIGNAL_TEXT_CLASS[color])} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{MOVEMENT_LABELS_KO[sig.movement]}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white", SIGNAL_BG_CLASS[color])}>
                  {PHASE_LABELS[sig.state]}
                </span>
                <div className="flex shrink-0 items-baseline gap-0.5">
                  <span className={cn("text-xl font-extrabold tabular-nums leading-none", SIGNAL_TEXT_CLASS[color])}>{displayRemaining ?? "—"}</span>
                  {displayRemaining !== undefined && <span className="text-[10px] font-semibold text-muted-foreground">s</span>}
                </div>
              </div>
              {progress !== undefined && (
                <div className="mt-2.5 flex items-center gap-1.5 pl-10">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <div className={cn("h-full rounded-full transition-all duration-500 ease-linear", SIGNAL_BG_CLASS[color])} style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className={cn("size-2 shrink-0 rounded-full", SIGNAL_BG_CLASS[color])} aria-hidden />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TrafficSignalCard;
