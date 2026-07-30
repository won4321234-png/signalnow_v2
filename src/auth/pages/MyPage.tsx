import {
  ChevronRight,
  Clock,
  Heart,
  Settings as SettingsIcon,
  TrendingUp,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useAuth } from "@/auth/hooks/useAuth";

interface MyPageProps {
  /** Navigate to the settings sub-page. */
  onSettingsClick: () => void;
  /** Navigate back to the main map view. */
  onBack: () => void;
}

/**
 * My Page — complete profile dashboard with placeholder data.
 *
 * Sections:
 *   • Profile (avatar, name, email)
 *   • Statistics (favorites, recent searches, total views)
 *   • Favorites (saved intersections)
 *   • Recent Searches (recently looked-up intersections)
 *   • Settings entry point
 *
 * All data shown is placeholder. Once Google OAuth is connected,
 * these will be populated from the authenticated user's profile.
 */
export function MyPage({ onSettingsClick, onBack }: MyPageProps) {
  const { user, status } = useAuth();

  // TODO: Replace placeholder data with real user data once OAuth is connected.
  // For now, use placeholder values so the UI is fully designed.
  const displayName = user?.name ?? "게스트 사용자";
  const displayEmail = user?.email ?? "guest@signalnow.kr";
  const initials = "게";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 sm:px-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-4 rotate-180" />
        지도
      </button>

      {/* Profile Header */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="flex items-center gap-4 p-5">
          <Avatar size="lg" className="size-16">
            {/* TODO: Use <AvatarImage src={user?.profileImage} /> once OAuth is connected. */}
            <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight">{displayName}</h1>
            <p className="truncate text-sm text-muted-foreground">{displayEmail}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {status === "authenticated" ? "Google 계정 연결됨" : "로그인 필요"}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={onSettingsClick}
            aria-label="설정"
          >
            <SettingsIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard icon={Heart} label="즐겨찾기" value={user?.favoriteCount ?? 0} />
        <StatCard icon={Clock} label="최근 조회" value={user?.recentSearchCount ?? 0} />
        <StatCard icon={TrendingUp} label="총 조회" value={128} />
      </div>

      {/* Favorites */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <SectionHeader icon={Heart} title="즐겨찾기" count={0} />
          <EmptySection
            icon={Heart}
            title="즐겨찾기가 없습니다"
            description="지도에서 교차로를 선택하고 즐겨찾기에 추가하세요."
          />
        </CardContent>
      </Card>

      {/* Recent Searches */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <SectionHeader icon={Clock} title="최근 조회" count={0} />
          <EmptySection
            icon={Clock}
            title="최근 조회 내역이 없습니다"
            description="검색한 교차로가 여기에 표시됩니다."
          />
        </CardContent>
      </Card>

      {/* Quick Settings Entry */}
      <button
        type="button"
        onClick={onSettingsClick}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border bg-card p-4",
          "transition-all duration-200 hover:shadow-sm hover:bg-accent/50"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted">
            <SettingsIcon className="size-4 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium">설정</span>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </button>
    </div>
  );
}

/** A single statistic card. */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: number;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center gap-1 p-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xl font-extrabold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

/** Section header with icon, title, and item count. */
function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Heart;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {count > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

/** Empty state for a section. */
function EmptySection({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground/50">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground/70">
        {description}
      </p>
    </div>
  );
}


