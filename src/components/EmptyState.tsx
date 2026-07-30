import { MapPinned } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "교차로를 선택하세요",
  description = "지도의 마커를 탭하면 실시간 신호 상태와 남은 시간을 확인할 수 있습니다.",
}: EmptyStateProps) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-4 py-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
        <MapPinned className="size-7" />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-bold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export default EmptyState;
