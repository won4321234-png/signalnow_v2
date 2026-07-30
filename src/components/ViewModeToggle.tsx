import { Car, Footprints } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types/traffic";

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  const options: { value: ViewMode; label: string; icon: typeof Car }[] = [
    { value: "driver", label: "운전자", icon: Car },
    { value: "pedestrian", label: "보행자", icon: Footprints },
  ];

  return (
    <div
      className="inline-flex items-center rounded-full border border-border/50 bg-card/80 p-1 glass elevation-2"
      role="radiogroup"
      aria-label="보기 모드"
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ease-out sm:text-sm",
              active
                ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground elevation-2"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            <Icon className={cn("size-4 transition-transform duration-300", active && "scale-110")} />
            <span className="animate-fade-in">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ViewModeToggle;
