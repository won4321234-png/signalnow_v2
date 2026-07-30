import { Loader2, LogIn, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Reusable authentication state view components.
 *
 * These are UI-only. No authentication logic is implemented.
 * They are designed to be rendered by ProtectedRoute or any
 * component that needs to display an auth state.
 */

/** Unauthenticated state — prompts the user to sign in. */
export function AuthUnauthenticated({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <LogIn className="size-7" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight">로그인이 필요합니다</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          이 페이지를 이용하려면 SignalNow 계정으로 로그인하세요.
        </p>
      </div>
      <Button onClick={onLogin} className="mt-2 rounded-full px-6">
        로그인
      </Button>
    </div>
  );
}

/** Loading state — shown while checking for an existing session. */
export function AuthLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">로그인 상태를 확인하는 중…</p>
    </div>
  );
}

/** Authenticated state — shows a confirmation with the user's name. */
export function AuthAuthenticated({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck className="size-7" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight">로그인되었습니다</h2>
        <p className="text-sm text-muted-foreground">
          {name}님, 환영합니다.
        </p>
      </div>
    </div>
  );
}

/** Expired session state — the session token is no longer valid. */
export function AuthExpiredSession({ onReLogin }: { onReLogin: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <ShieldAlert className="size-7" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight">세션이 만료되었습니다</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          보안을 위해 다시 로그인해 주세요.
        </p>
      </div>
      <Button onClick={onReLogin} variant="outline" className="mt-2 rounded-full px-6">
        다시 로그인
      </Button>
    </div>
  );
}
