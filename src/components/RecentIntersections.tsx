import { CornerDownRight, Clock3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Intersection } from "@/types/traffic";

interface RecentIntersectionsProps {
  recent: Intersection[];
  onSelect: (intersectionId: string) => void;
  onClear?: () => void;
}

export function RecentIntersections({
  recent,
  onSelect,
  onClear,
}: RecentIntersectionsProps) {
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            최근 본 교차로
          </h3>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
            삭제
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {recent.map((intersection, idx) => (
          <button
            key={intersection.crsrdId}
            type="button"
            onClick={() => onSelect(intersection.crsrdId)}
            className={cn(
              "animate-list-item-in group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:bg-accent/50",
              "active:scale-[0.98]"
            )}
            style={{ animationDelay: `${idx * 70}ms` }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition-all duration-200 group-hover:bg-muted group-hover:text-foreground">
              <CornerDownRight className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {intersection.crsrdNm}
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {intersection.crsrdId}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default RecentIntersections;
