import { forwardRef } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SIGNAL_BORDER_CLASS,
  dominantColor,
  phaseColor,
  type SignalColor,
} from "@/lib/signal";
import type { Intersection, MarkerPosition } from "@/types/traffic";

interface TrafficMarkerProps {
  position: MarkerPosition;
  intersection: Intersection;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (intersectionId: string) => void;
}

const PIN_COLOR_HEX: Record<SignalColor, string> = {
  green: "var(--color-signal-green)",
  yellow: "var(--color-signal-yellow)",
  red: "var(--color-signal-red)",
};

const GLOW_SHADOW: Record<SignalColor, string> = {
  green: "shadow-glow-green",
  yellow: "shadow-glow-yellow",
  red: "shadow-glow-red",
};

export const TrafficMarker = forwardRef<
  HTMLButtonElement,
  TrafficMarkerProps
>(function TrafficMarker(
  { position, intersection, isSelected, isFavorite, onSelect },
  ref
) {
  const color = dominantColor(intersection.signals.map((s) => phaseColor(s.state)));
  const fillColor = PIN_COLOR_HEX[color];

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${intersection.crsrdNm} — 신호 상태 보기`}
      aria-pressed={isSelected}
      onClick={() => onSelect(intersection.crsrdId)}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      className={cn(
        "group absolute z-10 -translate-x-1/2 -translate-y-full touch-manipulation outline-none",
        "animate-pin-enter",
        "transition-transform duration-250 ease-out active:scale-90"
      )}
    >
      {/* Pulse rings on selection */}
      {isSelected && (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute bottom-0 left-1/2 size-10 -translate-x-1/2 translate-y-1/2 animate-marker-pulse rounded-full",
              SIGNAL_BORDER_CLASS[color], "opacity-20 border-2"
            )}
          />
          <span
            aria-hidden
            className={cn(
              "absolute bottom-0 left-1/2 size-10 -translate-x-1/2 translate-y-1/2 animate-marker-pulse-delayed rounded-full",
              SIGNAL_BORDER_CLASS[color], "opacity-10 border-2"
            )}
          />
        </>
      )}

      {/* Teardrop pin — SVG */}
      <div
        className={cn(
          "relative flex flex-col items-center transition-all duration-300 ease-out",
          isSelected ? "scale-125" : "group-hover:scale-110"
        )}
      >
        <span
          className={cn(
            "relative flex size-9 items-center justify-center transition-all duration-300",
            isSelected && GLOW_SHADOW[color]
          )}
        >
          <svg
            viewBox="0 0 36 44"
            className="size-9 drop-shadow-[0_3px_5px_rgba(0,0,0,0.25)]"
            fill="none"
          >
            {/* Pin body */}
            <path
              d="M18 1C8.6 1 1 8.6 1 18c0 10.5 17 25 17 25s17-14.5 17-25C35 8.6 27.4 1 18 1Z"
              fill={fillColor}
              fillOpacity={isSelected ? 1 : 0.92}
            />
            {/* White inner circle */}
            <circle cx="18" cy="17" r="7.5" fill="white" />
            {/* Colored center dot */}
            <circle cx="18" cy="17" r="4" fill={fillColor} />
          </svg>
        </span>

        {/* Favorite badge */}
        {isFavorite && (
          <span className="absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full bg-signal-yellow ring-2 ring-card transition-transform duration-200 group-hover:scale-110">
            <Star className="size-2.5 fill-current text-white" />
          </span>
        )}
      </div>

      {/* Apple Maps style callout */}
      <span
        className={cn(
          "absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground elevation-2 transition-all duration-200",
          "hidden lg:block",
          isSelected && "lg:block lg:elevation-3"
        )}
      >
        {intersection.crsrdNm}
      </span>
    </button>
  );
});

export default TrafficMarker;
