import { useEffect, useRef, useState } from "react";
import { MapPin, Search, TrafficCone, X } from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import { ProfileButton } from "@/auth/components/ProfileButton";
import { cn } from "@/lib/utils";
import type { Intersection } from "@/types/traffic";

interface HeaderProps {
  onLoginClick: () => void;
  onProfileClick: () => void;
  floating?: boolean;
  intersections?: Intersection[];
  onSelectIntersection?: (id: string) => void;
}

export function Header({
  onLoginClick,
  onProfileClick,
  floating = false,
  intersections = [],
  onSelectIntersection,
}: HeaderProps) {
  return (
    <header
      className={cn(
        "absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-4 px-4 sm:px-6",
        floating
          ? "glass supports-[backdrop-filter]:bg-card/60"
          : "border-b border-border/30 bg-card/80 glass"
      )}
    >
      {/* Left: Logo */}
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <TrafficCone className="size-4.5" />
        </span>
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-0.5">
            <span className="text-sm font-bold tracking-tight text-foreground">Signal</span>
            <span className="text-sm font-bold tracking-tight text-primary">Now</span>
          </div>
          <span className="hidden text-[10px] font-medium text-muted-foreground sm:block">
            실시간 교통 신호 정보
          </span>
        </div>
      </div>

      {/* Center: Search (desktop only) */}
      {intersections.length > 0 && onSelectIntersection && (
        <div className="hidden flex-1 lg:flex lg:max-w-md lg:mx-auto">
          <HeaderSearch
            intersections={intersections}
            onSelect={onSelectIntersection}
          />
        </div>
      )}

      {/* Right: status + controls */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full bg-background/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/20 sm:inline-flex">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal-green/50" />
            <span className="relative inline-flex size-1.5 rounded-full bg-signal-green" />
          </span>
          실시간
        </span>
        <ModeToggle />
        <ProfileButton onLoginClick={onLoginClick} onProfileClick={onProfileClick} />
      </div>
    </header>
  );
}

function HeaderSearch({
  intersections,
  onSelect,
}: {
  intersections: Intersection[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const results =
    query.trim().length === 0
      ? []
      : intersections.filter((i) =>
          i.crsrdNm.toLowerCase().includes(query.trim().toLowerCase())
        );

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border border-border/30 bg-background/60 px-4 py-2 transition-all duration-200",
          "focus-within:bg-card focus-within:border-border/60 focus-within:elevation-2",
          open && results.length > 0 && "bg-card border-border/60 elevation-2"
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          placeholder="교차로 검색 (예: 강남역, 신논현역)"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
        />
        <kbd className="hidden rounded border border-border/30 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:block">
          ⌘K
        </kbd>
        {query && (
          <button type="button" onClick={() => setQuery("")} className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="animate-dropdown-in absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border/30 bg-card elevation-5">
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((i) => (
              <li key={i.crsrdId}>
                <button
                  type="button"
                  onClick={() => handleSelect(i.crsrdId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <MapPin className="size-4" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{i.crsrdNm}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Header;
