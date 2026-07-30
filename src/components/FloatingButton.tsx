import { LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingButtonProps {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
}

export function FloatingButton({
  active = false,
  onClick,
  className,
  label = "내 위치로 이동",
}: FloatingButtonProps) {
  return (
    <Button
      type="button"
      variant="default"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "size-11 rounded-full bg-card text-foreground elevation-3 ring-1 ring-border/15 transition-all duration-250 ease-out",
        "hover:scale-105 hover:elevation-4 active:scale-90 sm:size-12",
        active && "ring-2 ring-primary/30 shadow-glow-primary",
        className
      )}
    >
      <LocateFixed className="size-5 text-primary sm:size-5.5" />
    </Button>
  );
}

export default FloatingButton;
