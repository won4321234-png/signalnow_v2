import { User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useAuth } from "@/auth/hooks/useAuth";
import type { User } from "@/auth/types/auth";

interface ProfileButtonProps {
  /** Opens the login modal when the user is unauthenticated. */
  onLoginClick: () => void;
  /** Navigates to the My Page when an authenticated menu item is clicked. */
  onProfileClick: () => void;
}

/**
 * Header account button.
 *
 * Shows "로그인" with a user icon when unauthenticated.
 * Shows a circular avatar with a dropdown profile menu when authenticated.
 *
 * Only the logged-out state is rendered until Google OAuth is connected.
 * The authenticated UI is fully built and ready — just hidden.
 */
export function ProfileButton({ onLoginClick, onProfileClick }: ProfileButtonProps) {
  const { status, user } = useAuth();

  // Unauthenticated: show login button.
  if (status === "unauthenticated" || status === "expired") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onLoginClick}
        className={cn(
          "gap-2 rounded-full transition-all duration-200 ease-out",
          "hover:shadow-sm active:scale-95",
          "px-3 sm:px-4"
        )}
      >
        <UserIcon className="size-4" />
        <span className="text-sm font-medium">로그인</span>
      </Button>
    );
  }

  // Loading: show a subtle disabled avatar.
  if (status === "loading") {
    return (
      <Button variant="outline" size="icon" disabled className="rounded-full">
        <UserIcon className="size-4 animate-pulse" />
      </Button>
    );
  }

  // Authenticated: show avatar + dropdown profile menu.
  // TODO: This branch activates once Google OAuth is connected and
  //       AuthService.getCurrentUser() returns a valid User.
  return (
    <ProfileDropdown user={user} onProfileClick={onProfileClick} />
  );
}

/**
 * Authenticated dropdown profile menu.
 * Hidden until authentication is implemented.
 */
function ProfileDropdown({
  user,
  onProfileClick,
}: {
  user: User | null;
  onProfileClick: () => void;
}) {
  // TODO: Connect logout from useAuth() once OAuth is implemented.
  // const { logout } = useAuth();
  const handleLogout = () => {
    // TODO: Handle logout via AuthService.logout().
  };

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded-full transition-all duration-200 ease-out",
            "ring-2 ring-transparent hover:ring-primary/20",
            "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label="프로필 메뉴"
        >
          <Avatar size="default" className="size-8 sm:size-9">
            {/* TODO: Use <AvatarImage src={user.profileImage} /> once OAuth is connected. */}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 p-1.5 [animation-duration:200ms]"
      >
        {/* User info header */}
        <div className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2">
          <span className="text-sm font-semibold text-foreground">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onProfileClick} className="gap-2.5 rounded-md py-2">
          프로필
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onProfileClick} className="gap-2.5 rounded-md py-2">
          즐겨찾기
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onProfileClick} className="gap-2.5 rounded-md py-2">
          최근 조회
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onProfileClick} className="gap-2.5 rounded-md py-2">
          설정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="gap-2.5 rounded-md py-2 text-destructive focus:text-destructive"
        >
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
