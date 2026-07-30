import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorViewProps {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorView({
  title = "교통 데이터를 불러올 수 없습니다",
  description = "교통 신호 서비스에 연결할 수 없습니다. 네트워크 연결을 확인 후 다시 시도해 주세요.",
  retryLabel = "다시 시도",
  onRetry,
}: ErrorViewProps) {
  return (
    <div className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-3xl bg-destructive/8" />
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5 text-destructive">
          <TriangleAlert className="size-7" />
        </span>
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-bold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 rounded-full px-5 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export default ErrorView;
