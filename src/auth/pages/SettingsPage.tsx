import {
  Bell,
  ChevronRight,
  Globe,
  Info,
  LogOut,
  MapPin,
  Moon,
  Palette,
  Shield,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import { useAuth } from "@/auth/hooks/useAuth";

interface SettingsPageProps {
  /** Navigate back to My Page. */
  onBack: () => void;
}

/**
 * Settings page — full UI with no backend.
 *
 * Sections:
 *   • 알림 (Notifications)
 *   • 언어 (Language)
 *   • 기본 모드 (Default Mode)
 *   • 테마 (Theme)
 *   • 개인정보 (Privacy)
 *   • 정보 (About)
 */
export function SettingsPage({ onBack }: SettingsPageProps) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 sm:px-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-4 rotate-180" />
        마이페이지
      </button>

      <h1 className="mb-6 text-xl font-bold tracking-tight">설정</h1>

      {/* Notifications */}
      <SettingsSection title="알림" icon={Bell}>
        <SettingsRow
          label="신호 변경 알림"
          description="즐겨찾기 교차로의 신호가 변경되면 알림을 받습니다."
        >
          <Switch defaultChecked />
        </SettingsRow>
        <Separator />
        <SettingsRow
          label="출발 알림"
          description="예약된 출발 시간 10분 전에 알림을 받습니다."
        >
          <Switch />
        </SettingsRow>
      </SettingsSection>

      {/* Language */}
      <SettingsSection title="언어" icon={Globe}>
        <SettingsRow label="표시 언어" description="한국어">
          <ChevronRight className="size-5 text-muted-foreground" />
        </SettingsRow>
        <Separator />
        <SettingsRow label="음성 안내 언어" description="한국어 (여성)">
          <ChevronRight className="size-5 text-muted-foreground" />
        </SettingsRow>
      </SettingsSection>

      {/* Default Mode */}
      <SettingsSection title="기본 모드" icon={MapPin}>
        <SettingsRow
          label="기본 보기 모드"
          description="앱 시작 시 기본으로 표시되는 모드입니다."
        >
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full">
              운전자
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full">
              보행자
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Theme */}
      <SettingsSection title="테마" icon={Palette}>
        <SettingsRow label="다크 모드" description="어두운 배경으로 눈의 피로를 줄입니다.">
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "outline" : "ghost"}
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setTheme("light")}
            >
              라이트
            </Button>
            <Button
              variant={theme === "dark" ? "outline" : "ghost"}
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setTheme("dark")}
            >
              <Moon className="size-3.5" />
              다크
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection title="개인정보" icon={Shield}>
        <SettingsRow label="위치 정보" description="현재 위치 사용을 관리합니다.">
          <Switch defaultChecked />
        </SettingsRow>
        <Separator />
        <SettingsRow label="검색 기록 저장" description="최근 검색 기록을 저장합니다.">
          <Switch defaultChecked />
        </SettingsRow>
        <Separator />
        <SettingsRow
          label="데이터 삭제"
          description="저장된 검색 기록과 캐시를 삭제합니다."
          destructive
        >
          <ChevronRight className="size-5 text-muted-foreground" />
        </SettingsRow>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="정보" icon={Info}>
        <SettingsRow label="버전" description="SignalNow v1.0.0">
          <span className="text-xs text-muted-foreground">최신</span>
        </SettingsRow>
        <Separator />
        <SettingsRow label="이용약관" description="서비스 이용약관 보기">
          <ChevronRight className="size-5 text-muted-foreground" />
        </SettingsRow>
        <Separator />
        <SettingsRow label="개인정보처리방침" description="개인정보처리방침 보기">
          <ChevronRight className="size-5 text-muted-foreground" />
        </SettingsRow>
      </SettingsSection>

      {/* Logout */}
      <div className="mt-6">
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl text-destructive hover:text-destructive"
          onClick={() => {
            // TODO: Handle logout via AuthService.logout().
            void logout;
            onBack();
          }}
        >
          <LogOut className="size-4" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}

/** A settings section card with an icon header. */
function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bell;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2.5 pb-3">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}

/** A single settings row with a label, description, and trailing control. */
function SettingsRow({
  label,
  description,
  children,
  destructive,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            destructive ? "text-destructive" : "text-foreground"
          )}
        >
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}


