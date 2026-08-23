import type { CSSProperties } from "react";

const DIRECTIONS = [
  { key: "north", label: "북", arrow: "↑", position: "north", primary: true },
  { key: "northEast", label: "북동", arrow: "↗", position: "northEast", primary: false },
  { key: "east", label: "동", arrow: "→", position: "east", primary: true },
  { key: "southEast", label: "남동", arrow: "↘", position: "southEast", primary: false },
  { key: "south", label: "남", arrow: "↓", position: "south", primary: true },
  { key: "southWest", label: "남서", arrow: "↙", position: "southWest", primary: false },
  { key: "west", label: "서", arrow: "←", position: "west", primary: true },
  { key: "northWest", label: "북서", arrow: "↖", position: "northWest", primary: false },
] as const;

const POSITION_STYLES: Record<(typeof DIRECTIONS)[number]["position"], CSSProperties> = {
  north: { top: "8px", left: "50%", transform: "translateX(-50%)" },
  northEast: { top: "21%", right: "7%" },
  east: { top: "50%", right: "8px", transform: "translateY(-50%)" },
  southEast: { bottom: "21%", right: "7%" },
  south: { bottom: "8px", left: "50%", transform: "translateX(-50%)" },
  southWest: { bottom: "21%", left: "7%" },
  west: { top: "50%", left: "8px", transform: "translateY(-50%)" },
  northWest: { top: "21%", left: "7%" },
};

export function MapCompass() {
  return (
    <div
      className="pointer-events-none absolute right-4 top-[106px] z-30 flex h-[116px] w-[116px] items-center justify-center rounded-[32px] border border-white/80 bg-white/88 p-1 shadow-[0_10px_32px_rgba(15,23,42,0.20),0_2px_8px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/90 dark:bg-slate-950/86 sm:right-5 sm:top-[110px] sm:h-[120px] sm:w-[120px] sm:rounded-[34px]"
      aria-label="지도 방향 나침반"
      role="img"
    >
      <div className="relative h-full w-full overflow-hidden rounded-[28px] sm:rounded-[30px]" aria-hidden="true">
        <div className="absolute inset-[10px] rounded-full border border-slate-300/65 bg-white/20 dark:border-slate-600/70 dark:bg-slate-900/20" />
        <div className="absolute inset-[20px] rounded-full border border-slate-200/75 dark:border-slate-700/75" />
        <div className="absolute left-1/2 top-1/2 h-[2px] w-[46px] -translate-x-1/2 -translate-y-1/2 bg-slate-300/60 dark:bg-slate-700/70" />
        <div className="absolute left-1/2 top-1/2 h-[46px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-slate-300/60 dark:bg-slate-700/70" />

        {DIRECTIONS.map((direction) => (
          <div
            key={direction.key}
            className="absolute flex min-w-[34px] flex-col items-center justify-center gap-0.5 text-center leading-none"
            style={POSITION_STYLES[direction.position]}
            aria-label={`${direction.label}쪽`}
            title={`${direction.label}쪽`}
          >
            <span
              className={direction.primary
                ? direction.key === "north"
                  ? "text-[19px] font-black tracking-tight text-primary drop-shadow-[0_1px_2px_rgba(15,23,42,0.18)] sm:text-[20px]"
                  : "text-[16px] font-extrabold tracking-tight text-slate-900 drop-shadow-[0_1px_2px_rgba(15,23,42,0.14)] dark:text-slate-50 sm:text-[17px]"
                : "text-[12px] font-bold tracking-tight text-slate-600 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] dark:text-slate-300 sm:text-[13px]"
              }
            >
              {direction.label}
            </span>
            <span
              className={direction.key === "north"
                ? "text-[20px] font-bold text-primary sm:text-[21px]"
                : direction.primary
                  ? "text-[16px] font-semibold text-slate-600 dark:text-slate-300 sm:text-[17px]"
                  : "text-[14px] font-medium text-slate-400 dark:text-slate-500 sm:text-[15px]"
              }
            >
              {direction.arrow}
            </span>
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/95 bg-primary shadow-[0_3px_10px_rgba(15,23,42,0.24)] ring-2 ring-primary/20 dark:border-slate-900" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95" />
      </div>
    </div>
  );
}

export default MapCompass;
