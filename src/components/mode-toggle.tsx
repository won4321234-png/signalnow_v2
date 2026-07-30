import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Single-click light ↔ dark toggle with a premium animated icon.
 *
 * Animation breakdown:
 *   – The outgoing icon rotates 180° while fading/scaling out.
 *   – The incoming icon rotates in from −180° while fading/scaling in.
 *   – The button itself has a press-scale micro-interaction.
 *   – The global page transition is handled by the CSS rule in index.css.
 */
export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  // Resolve the current active mode (ignore "system" — we treat it as light)
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        "active:scale-90 active:shadow-none",
        // Ripple pseudo-element via box-shadow trick on active
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      {/* Sun icon — visible in light mode */}
      <Sun
        className={cn(
          "absolute size-[1.1rem] transition-all duration-300 ease-out",
          isDark
            ? "rotate-[-180deg] scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100"
        )}
      />

      {/* Moon icon — visible in dark mode */}
      <Moon
        className={cn(
          "absolute size-[1.1rem] transition-all duration-300 ease-out",
          isDark
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-[180deg] scale-0 opacity-0"
        )}
      />

      <span className="sr-only">테마 변경</span>
    </Button>
  );
}
