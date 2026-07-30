import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The official four-color Google "G" logo as an inline SVG.
 * Used on the "Continue with Google" button.
 */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  /** Click handler — should call handleGoogleLogin(). */
  onClick: () => void;
  /** Disables the button (e.g. while a login request is in-flight). */
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Premium "Continue with Google" button with a ripple micro-interaction.
 *
 * The button itself performs NO authentication. The onClick handler
 * should call handleGoogleLogin(), which is a placeholder that contains
 * TODO comments for connecting Google OAuth.
 */
export function GoogleSignInButton({
  onClick,
  disabled,
  className,
  children,
}: GoogleSignInButtonProps) {
  const ripplesRef = useRef<HTMLSpanElement>(null);

  /**
   * Creates a ripple element at the click coordinates for a tactile
   * material-design-style feedback effect.
   */
  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const container = ripplesRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    ripple.className =
      "absolute rounded-full bg-black/10 animate-[ripple_600ms_ease-out]";
    container.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 600);
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        handleRipple(e);
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-center justify-center gap-3 rounded-xl",
        "bg-white px-4 py-3 text-sm font-medium text-gray-700",
        "border border-gray-200 shadow-sm",
        "transition-all duration-200 ease-out",
        "hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5",
        "active:translate-y-0 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm",
        className
      )}
    >
      <GoogleIcon className="size-5 shrink-0" />
      <span className="relative z-10">{children}</span>
      <span
        ref={ripplesRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
      />
    </button>
  );
}
