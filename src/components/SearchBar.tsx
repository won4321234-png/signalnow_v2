import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Intersection } from "@/types/traffic";

interface SearchBarProps {
  intersections: Intersection[];
  onSelect: (intersectionId: string) => void;
  className?: string;
}

export function SearchBar({ intersections, onSelect, className }: SearchBarProps) {
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
      ? intersections
      : intersections.filter((i) =>
          i.crsrdNm.toLowerCase().includes(query.trim().toLowerCase())
        );

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative z-20", className)}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border/50 bg-card/90 px-4 py-3 glass elevation-4 transition-all duration-250",
          "focus-within:border-primary/40 focus-within:elevation-5",
          open && "border-primary/40 elevation-5"
        )}
      >
        <Search className="size-4.5 shrink-0 text-muted-foreground transition-transform duration-200 focus-within:scale-110" />
        <input
          type="text"
          value={query}
          placeholder="교차로 검색"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground outline-none"
          aria-label="교차로 검색"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 삭제"
            onClick={() => setQuery("")}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-muted hover:text-foreground active:scale-90"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          className="animate-dropdown-in absolute left-0 right-0 top-full mt-2.5 overflow-hidden rounded-2xl border border-border/50 bg-card elevation-5"
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="px-5 py-4 text-sm font-medium text-muted-foreground">
              검색 결과가 없습니다
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1.5">
              {results.map((intersection) => (
                <li key={intersection.crsrdId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(intersection.crsrdId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent/60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-200 group-hover:scale-105">
                      <MapPin className="size-4.5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {intersection.crsrdNm}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {intersection.crsrdId}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
