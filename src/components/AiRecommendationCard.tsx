import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";
import { phaseColor, type SignalColor } from "@/lib/signal";
import type { Intersection, ViewMode } from "@/types/traffic";

interface AiRecommendationCardProps {
  intersection: Intersection | null;
  viewMode: ViewMode;
  index?: number;
}

export function AiRecommendationCard({
  intersection,
  viewMode,
  index = 0,
}: AiRecommendationCardProps) {
  const dominant: SignalColor = intersection
    ? (() => {
        const colors = intersection.signals.map((s) => phaseColor(s.state));
        const counts: Record<SignalColor, number> = { green: 0, yellow: 0, red: 0 };
        for (const c of colors) counts[c] += 1;
        if (counts.green >= counts.red && counts.green >= counts.yellow) return "green";
        if (counts.yellow >= counts.red) return "yellow";
        return "red";
      })()
    : "red";

  const message = (() => {
    if (!intersection) return "교차로를 선택하면 실시간 주행 추천을 받을 수 있습니다.";
    if (viewMode === "pedestrian") {
      if (dominant === "green") return "지금 횡단이 가능합니다. 횡단보도 내에서 안전하게 건너세요.";
      if (dominant === "yellow") return "보행 신호가 곧 변경됩니다. 다음 신호 주기까지 대기하세요.";
      return "약 8초 후 횡단이 가능합니다. 안전선에서 대기하세요.";
    }
    if (dominant === "green") return "현재 속도를 유지하세요. 다음 녹색 신호에 통과할 수 있습니다.";
    if (dominant === "yellow") return "신호가 변경 중입니다. 교차로 전에서 안전하게 정지하세요.";
    return "속도를 줄이고 정지 준비하세요. 다음 녹색 신호가 곧 시작됩니다.";
  })();

  return (
    <div
      className={cn(
        "animate-card-enter relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border/15 px-4 py-3.5",
        "bg-gradient-to-br from-primary/8 via-primary/4 to-transparent"
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Icon */}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground">
        <Bot className="size-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight text-foreground">SignalNow AI</span>
          <span className="rounded-full bg-foreground/8 px-1.5 py-px text-[9px] font-bold tracking-tight text-muted-foreground">
            BETA
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}

export default AiRecommendationCard;
