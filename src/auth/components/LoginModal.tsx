import { ShieldCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

import { GoogleSignInButton } from "./GoogleSignInButton";
import { useAuth } from "@/auth/hooks/useAuth";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Premium login modal that adapts to the device:
 *   - Desktop / tablet → centered Dialog with blur backdrop.
 *   - Mobile           → bottom sheet Drawer.
 *
 * Authentication is NOT implemented. The Google button calls
 * handleGoogleLogin(), a placeholder containing TODO comments for
 * wiring up Google OAuth via Google Cloud Console.
 */
export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const isMobile = useIsMobile();
  const { loginWithGoogle } = useAuth();

  /**
   * handleGoogleLogin — placeholder for Google OAuth.
   *
   * TODO: Connect Google OAuth using Google Cloud Console Client ID.
   * TODO: Exchange Google ID Token with backend.
   * TODO: Save authenticated user.
   */
  const handleGoogleLogin = () => {
    // TODO: Replace with:
    //   await loginWithGoogle();
    //   onOpenChange(false);
    void loginWithGoogle;
  };

  const Brand = (
    <div className="flex flex-col items-center text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        {/* Traffic cone icon reused as the SignalNow brand mark */}
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9.6 3.6 14.4 16.8" />
          <path d="M3.6 20.4h16.8" />
          <path d="M5.4 16.8h13.2" />
          <path d="M7.2 12.9h9.6" />
          <path d="M9 9h6" />
        </svg>
      </span>
      <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
        SignalNow 로그인
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Google 계정으로 로그인하여 즐겨찾기와 설정을 동기화하세요.
      </p>
    </div>
  );

  const GoogleSection = (
    <div className="mt-6 space-y-4">
      <GoogleSignInButton onClick={handleGoogleLogin}>
        Continue with Google
      </GoogleSignInButton>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        회원가입은 Google 계정을 통해 자동으로 진행됩니다.
      </p>

      {/* Trust indicator */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground/70">
        <ShieldCheck className="size-3.5" />
        <span>Google OAuth 2.0 기반 보안 인증</span>
      </div>
    </div>
  );

  const Footer = (
    <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/60">
      로그인 시 <span className="underline underline-offset-2">이용약관</span> 및{" "}
      <span className="underline underline-offset-2">개인정보처리방침</span>에 동의합니다.
    </p>
  );

  // Mobile: bottom sheet drawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-6 pb-8 pt-2">
          {/* Drag handle */}
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
          <DrawerHeader className="p-0">
            <DrawerTitle className="sr-only">SignalNow 로그인</DrawerTitle>
            <DrawerDescription className="sr-only">
              Google 계정으로 로그인
            </DrawerDescription>
          </DrawerHeader>
          {Brand}
          {GoogleSection}
          {Footer}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop / tablet: centered dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-sm overflow-hidden p-8 [animation-duration:300ms] [&>button]:right-4 [&>button]:top-4"
      >
        <DialogHeader className="p-0">
          <DialogTitle className="sr-only">SignalNow 로그인</DialogTitle>
          <DialogDescription className="sr-only">
            Google 계정으로 로그인
          </DialogDescription>
        </DialogHeader>
        {Brand}
        {GoogleSection}
        {Footer}
      </DialogContent>
    </Dialog>
  );
}

