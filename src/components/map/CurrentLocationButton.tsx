/**
 * Floating button that triggers a browser Geolocation request and pans the
 * map to the user's current position. Reflects loading and error states.
 */

import { LocateFixed, LoaderCircle, LocateOff } from "lucide-react";

import type { LocationError } from "@/hooks/useCurrentLocation";
import { cn } from "@/lib/utils";

interface CurrentLocationButtonProps {
  onLocate: () => void;
  loading: boolean;
  error: LocationError | null;
  className?: string;
}

const ERROR_TITLES: Record<LocationError, string> = {
  permission_denied: "위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.",
  position_unavailable: "현재 위치를 가져올 수 없습니다. GPS 또는 네트워크 상태를 확인해 주세요.",
  timeout: "위치 요청이 시간 초과되었습니다. 다시 눌러 주세요.",
  unsupported: "이 브라우저는 위치 기능을 지원하지 않습니다.",
  nearest_lookup_failed: "주변 교차로를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.",
  location_accuracy_low: "위치 정확도가 낮습니다. GPS가 잘 잡히는 야외에서 다시 시도해 주세요.",
};

export function CurrentLocationButton({ onLocate, loading, error, className }: CurrentLocationButtonProps) {
  const isError = error !== null;
  const title = isError
    ? ERROR_TITLES[error]
    : loading
      ? "현재 위치와 주변 교차로를 찾는 중…"
      : "내 위치와 가까운 교차로 찾기";

  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={loading}
      title={title}
      aria-label={title}
      className={cn(
        "flex size-10 items-center justify-center rounded-xl",
        "bg-card/90 text-foreground backdrop-blur-sm elevation-2",
        "transition-all duration-200 hover:elevation-3 active:scale-95 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        isError && "text-destructive",
        className,
      )}
    >
      {loading ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : isError ? (
        <LocateOff className="size-5" />
      ) : (
        <LocateFixed className="size-5" />
      )}
    </button>
  );
}
