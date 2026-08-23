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

const MOVEMENT_ICON_MAP: Record<
  (typeof MOVEMENT_ICONS)[MovementType],
  LucideIcon
> = {
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

export function TrafficSignalCard({ direction, signals, index = 0, viewMode = "driver" }: TrafficSignalCardProps) {
  if (signals.length === 0) return null;

  const orderedSignals =
    viewMode === "pedestrian"
      ? [...signals].sort((a, b) => {
          const aPed = a.movement === "Pedestrian" ? 0 : 1;
          const bPed = b.movement === "Pedestrian" ? 0 : 1;
          return aPed - bPed;
        })
      : signals;

  return (
    <section className="animate-card-enter" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center justify-between px-1 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted/60 text-[11px] font-bold text-muted-foreground">
            {DIRECTION_SHORT[direction]}
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            {DIRECTION_LABELS_KO[direction]}
          </h3>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{signals.length}개 차선</span>
      </div>

      <div className="flex flex-col">
        {orderedSignals.map((sig, idx) => {
          const color: SignalColor = phaseColor(sig.state);
          const progress = phaseProgress(sig.remainingSeconds, sig.cycleSeconds);
          const Icon = MOVEMENT_ICON_MAP[MOVEMENT_ICONS[sig.movement]];
          const displayRemaining = sig.remainingSeconds === undefined
            ? undefined
            : Math.floor(Math.max(0, sig.remainingSeconds));

          return (
            <div key={`${sig.direction}-${sig.movement}-${idx}`}>
              {idx > 0 && <Separator className="my-3 border-border/15" />}

              <div className="flex items-center gap-3 px-1">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", SIGNAL_SOFT_BG_CLASS[color])}>
                  <Icon className={cn("size-4.5", SIGNAL_TEXT_CLASS[color])} />
                </span>

                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {MOVEMENT_LABELS_KO[sig.movement]}
                </span>

                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white", SIGNAL_BG_CLASS[color])}>
                  {PHASE_LABELS[sig.state]}
                </span>

                <div className="flex shrink-0 items-baseline gap-0.5">
                  <span className={cn("text-xl font-extrabold tabular-nums leading-none", SIGNAL_TEXT_CLASS[color])}>
                    {displayRemaining ?? "—"}
                  </span>
                  {displayRemaining !== undefined && (
                    <span className="text-[10px] font-semibold text-muted-foreground">s</span>
                  )}
                </div>
              </div>

              {progress !== undefined && (
                <div className="mt-2.5 flex items-center gap-1.5 pl-10">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500 ease-linear", SIGNAL_BG_CLASS[color])}
                      style={{ width: `${progress * 100}%` }}
                    />
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
