import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState() {
  return (
    <div className="animate-fade-in flex flex-col gap-6 px-5 py-5">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48 rounded-lg" />
        <Skeleton className="h-3.5 w-32 rounded-md" />
      </div>

      {/* AI card skeleton */}
      <div className="flex items-start gap-3 rounded-2xl bg-muted/30 px-4 py-3.5">
        <Skeleton className="size-8 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      </div>

      {/* Signal section skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-7 rounded-lg" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between pl-9">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-8" />
            </div>
          </div>
          <Skeleton className="ml-9 h-1 w-[calc(100%-2.25rem)] rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default LoadingState;
