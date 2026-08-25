import { useEffect, useRef, useState } from "react";
import { Car, Footprints, MapPin, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Intersection, ViewMode } from "@/types/traffic";
import type { TrafficRegion, TrafficRegionId } from "@/data/regions";

interface SearchPanelProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  intersections?: Intersection[];
  onSelect?: (intersectionId: string) => void;
  modeOnly?: boolean;
  region: TrafficRegion;
  regions: TrafficRegion[];
  onRegionChange: (regionId: TrafficRegionId) => void;
}

export function SearchPanel({ mode, onModeChange, intersections = [], onSelect, modeOnly = false, region, regions, onRegionChange }: SearchPanelProps) {
  return (
    <div className={cn(
      "relative top-14 flex flex-col gap-2.5 rounded-2xl border border-border/20 bg-card/80 glass elevation-4 p-2.5",
      modeOnly ? "inline-flex w-auto" : "w-[calc(100vw-6rem)] max-w-[300px]",
    )}>
      <div className={cn("inline-flex items-center rounded-xl bg-muted/40 p-1", modeOnly ? "w-auto" : "w-full")}>
        <ModeButton active={mode === "driver"} onClick={() => onModeChange("driver")} icon={Car} label="운전자" />
        <ModeButton active={mode === "pedestrian"} onClick={() => onModeChange("pedestrian")} icon={Footprints} label="보행자" />
      </div>
      <RegionSelect region={region} regions={regions} onRegionChange={onRegionChange} />
      {!modeOnly && onSelect && <SearchInput intersections={intersections} onSelect={onSelect} />}
    </div>
  );
}

function RegionSelect({ region, regions, onRegionChange }: { region: TrafficRegion; regions: TrafficRegion[]; onRegionChange: (regionId: TrafficRegionId) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5">
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">지역 선택</span>
      <select value={region.id} onChange={(event) => onRegionChange(event.target.value as TrafficRegionId)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none">
        {regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Car; label: string }) {
  return <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-250 ease-out", active ? "bg-card text-foreground elevation-1" : "text-muted-foreground hover:text-foreground")}><Icon className={cn("size-3.5 transition-transform duration-250", active && "scale-110")} />{label}</button>;
}

function SearchInput({ intersections, onSelect }: { intersections: Intersection[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const handle = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", handle); return () => document.removeEventListener("mousedown", handle); }, []);
  const results = query.trim().length === 0 ? [] : intersections.filter((i) => i.crsrdNm.toLowerCase().includes(query.trim().toLowerCase()));
  const handleSelect = (id: string) => { onSelect(id); setQuery(""); setOpen(false); };
  return (
    <div ref={containerRef} className="relative">
      <div className={cn("flex items-center gap-2.5 rounded-xl border border-transparent bg-muted/40 px-3.5 py-2.5 transition-all duration-200", "focus-within:bg-card focus-within:elevation-2", open && results.length > 0 && "bg-card elevation-2")}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input type="text" value={query} placeholder="교차로 검색" onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground outline-none" aria-label="교차로 검색" />
        {query && <button type="button" aria-label="검색어 삭제" onClick={() => setQuery("")} className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-foreground active:scale-90"><X className="size-3.5" /></button>}
      </div>
      {open && results.length > 0 && <div className="animate-dropdown-in absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border/20 bg-card elevation-5" role="listbox"><ul className="max-h-64 overflow-y-auto py-1">{results.map((intersection) => <li key={intersection.crsrdId}><button type="button" onClick={() => handleSelect(intersection.crsrdId)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent/50"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><MapPin className="size-4" /></span><div className="flex min-w-0 flex-col gap-0.5"><span className="truncate text-sm font-semibold text-foreground">{intersection.crsrdNm}</span><span className="truncate font-mono text-[10px] text-muted-foreground">{intersection.crsrdId}</span></div></button></li>)}</ul></div>}
    </div>
  );
}

export default SearchPanel;
