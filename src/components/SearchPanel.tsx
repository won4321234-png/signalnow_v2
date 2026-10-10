import { useEffect, useRef, useState } from "react";
import { Car, Check, Footprints, MapPin, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Intersection, ViewMode } from "@/types/traffic";
import type { TrafficRegion, TrafficRegionId } from "@/data/regions";

interface SearchPanelProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  intersections?: Intersection[];
  searchIntersections?: Intersection[];
  searchLoading?: boolean;
  searchReady?: boolean;
  onLoadSearchIntersections?: () => void;
  onSelect?: (intersectionId: string) => void;
  modeOnly?: boolean;
  region: TrafficRegion;
  regions: TrafficRegion[];
  onRegionChange: (regionId: TrafficRegionId) => void;
}

export function SearchPanel({ mode, onModeChange, intersections = [], searchIntersections = [], searchLoading = false, searchReady = false, onLoadSearchIntersections, onSelect, modeOnly = false, region, regions, onRegionChange }: SearchPanelProps) {
  return (
    <div className={cn(
      "flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border/20 bg-card/80 glass elevation-4 p-2.5",
      modeOnly ? "w-auto" : "w-full max-w-[340px]",
    )}>
      <div className={cn("inline-flex min-w-0 items-center rounded-xl bg-muted/40 p-1", modeOnly ? "w-auto" : "w-full")}>
        <ModeButton active={mode === "driver"} onClick={() => onModeChange("driver")} icon={Car} label="운전자" />
        <ModeButton active={mode === "pedestrian"} onClick={() => onModeChange("pedestrian")} icon={Footprints} label="보행자" />
      </div>
      <RegionSelect region={region} regions={regions} onRegionChange={onRegionChange} />
      {!modeOnly && onSelect && <SearchInput intersections={intersections} searchIntersections={searchIntersections} searchLoading={searchLoading} searchReady={searchReady} onLoadSearchIntersections={onLoadSearchIntersections} onSelect={onSelect} />}
    </div>
  );
}

function RegionSelect({ region, regions, onRegionChange }: { region: TrafficRegion; regions: TrafficRegion[]; onRegionChange: (regionId: TrafficRegionId) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5">
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">지역 선택</span>
      <select value={region.id} onChange={(event) => {
        const nextId = event.target.value as TrafficRegionId;
        const nextRegion = regions.find((item) => item.id === nextId);
        if (nextRegion?.availability === "active") onRegionChange(nextId);
      }} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none">
        {regions.map((item) => <option key={item.id} value={item.id} disabled={item.availability !== "active"}>{item.name} · {item.statusLabel}</option>)}
      </select>
    </label>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Car; label: string }) {
  return <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-250 ease-out", active ? "bg-card text-foreground elevation-1" : "text-muted-foreground hover:text-foreground")}><Icon className={cn("size-3.5 transition-transform duration-250", active && "scale-110")} />{label}</button>;
}

function SearchInput({ searchIntersections, searchLoading, searchReady, onLoadSearchIntersections, onSelect }: { intersections: Intersection[]; searchIntersections: Intersection[]; searchLoading: boolean; searchReady: boolean; onLoadSearchIntersections?: () => void; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadRequestedRef = useRef(false);
  useEffect(() => { const handle = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", handle); return () => document.removeEventListener("mousedown", handle); }, []);
  useEffect(() => { if (!query.trim() || searchReady || searchLoading || loadRequestedRef.current || !onLoadSearchIntersections) return; loadRequestedRef.current = true; onLoadSearchIntersections(); }, [query, searchReady, searchLoading, onLoadSearchIntersections]);
  useEffect(() => { if (searchReady) loadRequestedRef.current = false; }, [searchReady]);
  const normalizedQuery = query.trim().toLowerCase();
  const results = normalizedQuery.length === 0 || !searchReady ? [] : searchIntersections.filter((i) => i.crsrdNm.toLowerCase().includes(normalizedQuery));
  const handleSelect = (id: string) => { setPendingId(id); setOpen(true); };
  const handleDone = () => { if (!pendingId) return; onSelect(pendingId); setPendingId(null); setQuery(""); setOpen(false); };
  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className={cn("flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent bg-muted/40 px-3.5 py-2.5 transition-all duration-200", "focus-within:bg-card focus-within:elevation-2", open && results.length > 0 && "bg-card elevation-2")}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input type="text" value={query} placeholder="교차로 검색" onChange={(e) => { setQuery(e.target.value); setPendingId(null); setOpen(true); }} onFocus={() => setOpen(true)} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground outline-none" aria-label="교차로 검색" />
        {query && <button type="button" aria-label="검색어 삭제" onClick={() => setQuery("")} className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-foreground active:scale-90"><X className="size-3.5" /></button>}
      </div>
      {open && query.trim() && <div className="animate-dropdown-in absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border/20 bg-card elevation-5" role="listbox">{searchLoading ? <div className="px-4 py-4 text-xs font-semibold text-muted-foreground">전체 교차로 데이터를 불러오는 중…</div> : !searchReady ? <div className="px-4 py-4 text-xs font-semibold text-muted-foreground">검색 데이터를 준비하는 중…</div> : results.length === 0 ? <div className="px-4 py-4 text-xs font-semibold text-muted-foreground">검색 결과가 없습니다</div> : <ul className="max-h-64 overflow-y-auto py-1">{results.map((intersection) => <li key={intersection.crsrdId}><button type="button" onClick={() => handleSelect(intersection.crsrdId)} className={cn("flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent/50", pendingId === intersection.crsrdId && "bg-accent/60")}><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><MapPin className="size-4" /></span><div className="flex min-w-0 flex-col gap-0.5"><span className="truncate text-sm font-semibold text-foreground">{intersection.crsrdNm}</span><span className="truncate font-mono text-[10px] text-muted-foreground">{intersection.crsrdId}</span></div></button></li>)}</ul>}{pendingId && <div className="flex items-center justify-between gap-2 border-t border-border/20 bg-muted/30 p-2"><span className="truncate px-1 text-[10px] font-semibold text-muted-foreground">선택됨 · 완료를 눌러 이동</span><button type="button" onClick={handleDone} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Check className="size-3.5" />완료</button></div>}</div>}
    </div>
  );
}

export default SearchPanel;
