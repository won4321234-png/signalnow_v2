import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Snap levels for the bottom sheet.
 * Desktop uses a fixed right panel so these only apply on mobile/tablet.
 */
export type SheetSnap = "collapsed" | "partial" | "full";

const COLLAPSED_PX = 80;
const PARTIAL_VH = 0.45;
const FULL_VH = 0.85;
const SWIPE_THRESHOLD = 6;
const FLICK_VELOCITY = 0.6;

interface UseBottomSheetOptions {
  open: boolean;
  initialSnap?: SheetSnap;
}

export function snapHeightPx(snap: SheetSnap, viewportHeight: number): number {
  switch (snap) {
    case "collapsed":
      return COLLAPSED_PX;
    case "partial":
      return Math.round(viewportHeight * PARTIAL_VH);
    case "full":
      return Math.round(viewportHeight * FULL_VH);
  }
}

interface UseBottomSheetResult {
  snap: SheetSnap;
  liveHeightPx: number | null;
  isDragging: boolean;
  setSnap: (snap: SheetSnap) => void;
  onDragStart: (clientY: number) => void;
  onDragMove: (clientY: number) => void;
  onDragEnd: (clientY: number) => void;
}

export function useBottomSheet({ open, initialSnap = "partial" }: UseBottomSheetOptions): UseBottomSheetResult {
  const [snap, setSnapState] = useState<SheetSnap>(initialSnap);
  const [liveHeightPx, setLiveHeightPx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startRef = useRef<number | null>(null);
  const snapRef = useRef<SheetSnap>(initialSnap);
  const lastClientYRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    if (!open) return;
    setSnapState(initialSnap);
    setLiveHeightPx(null);
  }, [open, initialSnap]);

  const onDragStart = useCallback((clientY: number) => {
    startRef.current = clientY;
    lastClientYRef.current = clientY;
    lastTimeRef.current = Date.now();
    setIsDragging(true);
  }, []);

  const onDragMove = useCallback((clientY: number) => {
    if (startRef.current === null) return;
    const vh = window.innerHeight;
    const base = snapHeightPx(snapRef.current, vh);
    const delta = clientY - startRef.current;
    const next = Math.min(vh, Math.max(COLLAPSED_PX - 40, base - delta));
    setLiveHeightPx(next);
    lastClientYRef.current = clientY;
    lastTimeRef.current = Date.now();
  }, []);

  const onDragEnd = useCallback((clientY: number) => {
    setIsDragging(false);
    if (startRef.current === null) {
      setLiveHeightPx(null);
      return;
    }

    const vh = window.innerHeight;
    const delta = clientY - startRef.current;
    startRef.current = null;

    const dt = Math.max(1, Date.now() - lastTimeRef.current);
    const velocity = Math.abs(clientY - lastClientYRef.current) / dt;
    const movingDown = delta > 0;
    const currentH = snapHeightPx(snapRef.current, vh);
    const newH = currentH - delta;
    const partialH = snapHeightPx("partial", vh);
    const fullH = snapHeightPx("full", vh);
    const collapsedH = snapHeightPx("collapsed", vh);

    if (velocity > FLICK_VELOCITY) {
      if (movingDown) {
        if (snapRef.current === "full") setSnapState("partial");
        else setSnapState("collapsed");
      } else {
        if (snapRef.current === "collapsed") setSnapState("partial");
        else setSnapState("full");
      }
    } else if (delta > SWIPE_THRESHOLD && newH < collapsedH + 30) {
      setSnapState("collapsed");
    } else if (newH > fullH - 80) {
      setSnapState("full");
    } else if (newH > partialH - 60) {
      setSnapState("partial");
    } else if (newH > collapsedH + 30) {
      setSnapState("partial");
    } else {
      setSnapState("collapsed");
    }
    setLiveHeightPx(null);
  }, []);

  const setSnap = useCallback((next: SheetSnap) => {
    setSnapState(next);
    setLiveHeightPx(null);
  }, []);

  return {
    snap,
    liveHeightPx,
    isDragging,
    setSnap,
    onDragStart,
    onDragMove,
    onDragEnd,
  };
}

export { COLLAPSED_PX, PARTIAL_VH, FULL_VH };
