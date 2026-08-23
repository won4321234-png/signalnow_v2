import type { CSSProperties } from "react";

const DIRECTIONS = [
  { key: "north", label: "북", short: "N", position: "north" },
  { key: "northEast", label: "북동", short: "NE", position: "northEast" },
  { key: "east", label: "동", short: "E", position: "east" },
  { key: "southEast", label: "남동", short: "SE", position: "southEast" },
  { key: "south", label: "남", short: "S", position: "south" },
  { key: "southWest", label: "남서", short: "SW", position: "southWest" },
  { key: "west", label: "서", short: "W", position: "west" },
  { key: "northWest", label: "북서", short: "NW", position: "northWest" },
] as const;

const POSITION_STYLES: Record<(typeof DIRECTIONS)[number]["position"], CSSProperties> = {
  north: { top: "5px", left: "50%", transform: "translateX(-50%)" },
  northEast: { top: "17%", right: "9%" },
  east: { top: "50%", right: "5px", transform: "translateY(-50%)" },
  southEast: { bottom: "17%", right: "9%" },
  south: { bottom: "5px", left: "50%", transform: "translateX(-50%)" },
  southWest: { bottom: "17%", left: "9%" },
  west: { top: "50%", left: "5px", transform: "translateY(-50%)" },
  northWest: { top: "17%", left: "9%" },
};

export function MapCompass() {
  return (
    <div
      className="pointer-events-none absolute right-4 top-[58px] z-30 flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/70 bg-white/82 shadow-[0_5px_18px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/78 sm:right-5 sm:top-[60px] sm:h-[72px] sm:w-[72px]"
      aria-label="지도 방향 나침반"
      role="img"
    >
      <div className="relative h-full w-full" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300/80 bg-white/80 shadow-sm dark:border-slate-600 dark:bg-slate-900/85" />
        <div className="absolute left-1/2 top-[12px] h-[22px] w-px -translate-x-1/2 bg-slate-300/90 dark:bg-slate-600/90" />
        <div className="absolute bottom-[12px] left-1/2 h-[22px] w-px -translate-x-1/2 bg-slate-300/70 dark:bg-slate-600/70" />
        <div className="absolute left-[12px] top-1/2 h-px w-[22px] -translate-y-1/2 bg-slate-300/70 dark:bg-slate-600/70" />
        <div className="absolute right-[12px] top-1/2 h-px w-[22px] -translate-y-1/2 bg-slate-300/70 dark:bg-slate-600/70" />

        {DIRECTIONS.map((direction) => (
          <span
            key={direction.key}
            className={
              direction.key === "north"
                ? "absolute min-w-4 text-center text-[12px] font-black leading-none text-primary"
                : direction.key === "east" || direction.key === "south" || direction.key === "west"
                  ? "absolute min-w-4 text-center text-[9px] font-extrabold leading-none text-slate-700 dark:text-slate-200"
                  : "absolute min-w-5 text-center text-[7px] font-bold leading-none text-slate-400 dark:text-slate-500"
            }
            style={POSITION_STYLES[direction.position]}
            title={direction.label}
          >
            {direction.short}
          </span>
        ))}

        <span className="absolute left-1/2 top-[6px] h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[7px] border-x-transparent border-b-primary" />
      </div>
    </div>
  );
}

export default MapCompass;
