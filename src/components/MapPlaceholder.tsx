import { forwardRef, type RefObject } from "react";

import { TrafficMarker } from "@/components/TrafficMarker";
import { cn } from "@/lib/utils";
import type {
  Intersection,
  TrafficMarkerData,
} from "@/types/traffic";

interface MapPlaceholderProps {
  markers: TrafficMarkerData[];
  intersections: Intersection[];
  selectedIntersectionId: string | null;
  favoriteIds: Set<string>;
  onSelectIntersection: (intersectionId: string) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
}

export const MapPlaceholder = forwardRef<HTMLDivElement, MapPlaceholderProps>(
  function MapPlaceholder(
    { markers, intersections, selectedIntersectionId, favoriteIds, onSelectIntersection, containerRef, children },
    _ref
  ) {
    const intersectionMap = new Map(intersections.map((i) => [i.crsrdId, i]));

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-map-surface"
        role="application"
        aria-label="교차로 지도"
      >
        <div className="map-canvas absolute inset-0" aria-hidden>
          {/* Subtle terrain gradient for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-map-surface via-map-surface to-map-water/8" />

          {/* River — softer, more natural */}
          <div className="absolute -left-16 top-[20%] h-56 w-[140%] -rotate-[5deg] rounded-[60%] bg-map-water/35 blur-[8px]" />
          <div className="absolute -left-12 top-[24%] h-36 w-[135%] -rotate-[5deg] rounded-[60%] bg-map-water/25 blur-[5px]" />

          {/* Parks — softer organic shapes */}
          <div className="absolute right-[10%] top-[12%] size-40 rounded-[3rem] bg-map-park/30 blur-[4px]" />
          <div className="absolute left-[62%] bottom-[8%] size-36 rounded-[3rem] bg-map-park/25 blur-[4px]" />
          <div className="absolute left-[4%] top-[52%] size-28 rounded-[2.5rem] bg-map-park/20 blur-[3px]" />

          {/* City blocks — subtle building footprint hints */}
          <div className="absolute left-[40%] top-[8%] size-16 rounded-xl bg-foreground/[0.025]" />
          <div className="absolute left-[52%] top-[10%] size-12 rounded-xl bg-foreground/[0.025]" />
          <div className="absolute left-[44%] top-[50%] size-20 rounded-xl bg-foreground/[0.02]" />
          <div className="absolute left-[8%] top-[78%] size-14 rounded-xl bg-foreground/[0.025]" />
          <div className="absolute right-[20%] top-[62%] size-16 rounded-xl bg-foreground/[0.02]" />

          {/* Grid — very subtle */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--color-map-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--color-map-grid) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
            }}
          />

          {/* Major roads — wider, softer, road hierarchy */}
          <div className="absolute left-1/2 top-0 h-full w-9 -translate-x-1/2 rounded-full bg-map-road shadow-[0_0_12px_rgba(0,0,0,0.03)] dark:shadow-[0_0_8px_rgba(0,0,0,0.2)]" />
          <div className="absolute left-0 top-[42%] h-8 w-full rounded-full bg-map-road shadow-[0_0_12px_rgba(0,0,0,0.03)] dark:shadow-[0_0_8px_rgba(0,0,0,0.2)]" />
          {/* Minor roads */}
          <div className="absolute left-[24%] top-0 h-full w-5 rounded-full bg-map-road-minor/70" />
          <div className="absolute left-0 top-[70%] h-4 w-full rounded-full bg-map-road-minor/70" />
          <div className="absolute left-[78%] top-0 h-full w-5 rounded-full bg-map-road-minor/70" />

          {/* Road labels — tiny, subtle */}
          <span className="absolute left-1/2 top-[16%] -translate-x-1/2 -rotate-90 text-[9px] font-semibold tracking-tight text-muted-foreground/25">
            세종대로
          </span>
          <span className="absolute left-[34%] top-[42%] -translate-y-1/2 text-[9px] font-semibold tracking-tight text-muted-foreground/25">
            테헤란로
          </span>
        </div>

        {/* Watermark */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[5] rounded-lg bg-card/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/50 backdrop-blur-sm">
          지도 미리보기 · 카카오맵 연동 준비
        </div>

        {/* Markers */}
        <div className="absolute inset-0">
          {markers.map((marker) => {
            const intersection = intersectionMap.get(marker.intersectionId);
            if (!intersection) return null;
            return (
              <TrafficMarker
                key={marker.intersectionId}
                position={marker.position}
                intersection={intersection}
                isSelected={selectedIntersectionId === marker.intersectionId}
                isFavorite={favoriteIds.has(marker.intersectionId)}
                onSelect={onSelectIntersection}
              />
            );
          })}
        </div>

        {children && <div className={cn("pointer-events-none absolute inset-0")}>{children}</div>}
      </div>
    );
  }
);

export default MapPlaceholder;
