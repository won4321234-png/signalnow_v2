import type { CSSProperties } from "react";

const DIRECTIONS = [
  { key: "north", label: "북", arrow: "↑", position: "north" },
  { key: "northEast", label: "북동", arrow: "↗", position: "northEast" },
  { key: "east", label: "동", arrow: "→", position: "east" },
  { key: "southEast", label: "남동", arrow: "↘", position: "southEast" },
  { key: "south", label: "남", arrow: "↓", position: "south" },
  { key: "southWest", label: "남서", arrow: "↙", position: "southWest" },
  { key: "west", label: "서", arrow: "←", position: "west" },
  { key: "northWest", label: "북서", arrow: "↖", position: "northWest" },
] as const;

const POSITION_STYLES: Record<(typeof DIRECTIONS)[number]["position"], CSSProperties> = {
  north: { top: "7px", left: "50%", transform: "translateX(-50%)" },
  northEast: { top: "22%", right: "8%" },
  east: { top: "50%", right: "7px", transform: "translateY(-50%)" },
  southEast: { bottom: "22%", right: "8%" },
  south: { bottom: "7px", left: "50%", transform: "translateX(-50%)" },
  southWest: { bottom: "22%", left: "8%" },
  west: { top: "50%", left: "7px", transform: "translateY(-50%)" },
  northWest: { top: "22%", left: "8%" },
};

export function MapCompass() {
  return (
    <div
      className="pointer-events-none absolute right-4 top-[104px] z-30 flex h-[92px] w-[92px] items-center justify-center rounded-[28px] border border-white/75 bg-white/86 shadow-[0_7px_24px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-slate-700/85 dark:bg-slate-950/82 sm:right-5 sm:top-[108px] sm:h-[96px] sm:w-[96px] sm:rounded-[30px]"
      aria-label="지도 방향 나침반"
      role="img"
    >
      <div className="relative h-full w-full" aria-hidden="true">
        <div className="absolute inset-[12px] rounded-full border border-slate-200/80 dark:border-slate-700/80" />
        <div className="absolute inset-[21px] rounded-full border border-slate-100/80 dark:border-slate-800/80" />

        {DIRECTIONS.map((direction) => (
          <div
            key={direction.key}
            className="absolute flex min-w-[28px] flex-col items-center justify-center gap-0.5 text-center"
            style={POSITION_STYLES[direction.position]}
            aria-label={`${direction.label}쪽`}
            title={`${direction.label}쪽`}
          >
            <span
              className={
                direction.key === "north"
                  ? "text-[17px] font-black leading-none text-primary drop-shadow-sm sm:text-[18px]"
                  : direction.key === "east" || direction.key === "south" || direction.key === "west"
                    ? "text-[13px] font-extrabold leading-none text-slate-800 dark:text-slate-100 sm:text-[14px]"
                    : "text-[10px] font-bold leading-none text-slate-500 dark:text-slate-400 sm:text-[11px]"
              }
            >
              {direction.label}
            </span>
            <span
              className={
                direction.key === "north"
                  ? "text-[17px] font-bold leading-[0.8] text-primary sm:text-[18px]"
                  : "text-[13px] font-semibold leading-[0.8] text-slate-400 dark:text-slate-500 sm:text-[14px]"
              }
            >
              {direction.arrow}
            </span>
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_2px_8px_rgba(15,23,42,0.22)] dark:border-slate-900" />
      </div>
    </div>
  );
}

export default MapCompass;
