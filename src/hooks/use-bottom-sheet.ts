import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Snap levels for the bottom sheet.
 *
 * Desktop uses a fixed right panel so these only apply on mobile/tablet.
 * Heights are computed dynamically (collapsed is a fixed pixel value;
 * partial and full are viewport-height fractions) per the UX spec.
 */
export type SheetSnap = "collapsed" | "partial" | "full";

/** Fixed collapsed height in pixels — leaves maximum map visibility. */
const COLLAPSED_PX = 80;
/** Half-expanded as a fraction of viewport height. */
const PARTIAL_VH = 0.45;
/** Fully expanded as a fraction of viewport height. */
const FULL_VH = 0.85;

/** Pixel delta threshold to register a drag as a swipe. */
const SWIPE_THRESHOLD = 6;
/** Velocity (px/15ms frame) above which a fast swipe snaps past thresholds. */
const FLICK_VELOCITY = 0.6;

interface UseBottomSheetOptions {
  /** Whether the sheet is open (an intersection is selected or sheet is visible). */
  open: boolean;
  /** Initial snap level when opened. */
  initialSnap?: SheetSnap;
}

interface BottomSheetDragState {
  /** Current snap level (discrete). */
  snap: SheetSnap;
  /** Live sheet height in pixels during a drag (null = not dragging). */
  liveHeightPx: number | null;
  /** Whether a drag gesture is in progress. */
  isDragging: boolean;
  /** Set the snap level. */
  setSnap: (snap: SheetSnap) => void;
  /** Begin a drag gesture. */
  onDragStart: (clientY: number) => void;
  /** Update the sheet height during a gesture. */
  onDragMove: (clientY: number) => void;
  /** End a gesture and settle to the nearest snap. */
  onDragEnd: (clientY: number) => void;
}

/** Compute the target pixel height for a snap level. */
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

/**
 * Drag-to-snap logic for the mobile/tablet bottom sheet. Handles touch and
 * pointer events, snaps to three levels (collapsed / partial / full), and
 * closes when swiped below the collapsed threshold.
 *
 * Heights are pixel-based so the collapsed state is a fixed 80px regardless of
 * viewport, matching the UX spec exactly.
 */
export function useBottomSheet({
  open,
  initialSnap = "partial",
}: UseBottomSheetOptions): BottomSheetDragState {
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

  // Reset to the initial snap whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setSnapState(initialSnap);
      setLiveHeightPx(null);
    }
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
    const delta = clientY - startRef.current; // + = dragging down
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

    // Flick velocity check for fast swipes.
    const dt = Math.max(1, Date.now() - lastTimeRef.current);
    const velocity = Math.abs(clientY - lastClientYRef.current) / dt;
    const movingDown = delta > 0;

    const currentH = snapHeightPx(snapRef.current, vh);
    const newH = currentH - delta;
    const partialH = snapHeightPx("partial", vh);
    const fullH = snapHeightPx("full", vh);
    const collapsedH = snapHeightPx("collapsed", vh);

    if (velocity > FLICK_VELOCITY) {
      // Fast flick: snap to the destination in the flick direction.
      if (movingDown) {
        if (snapRef.current === "full") setSnapState("partial");
        else if (snapRef.current === "partial") setSnapState("collapsed");
        else setSnapState("collapsed");
      } else {
        if (snapRef.current === "collapsed") setSnapState("partial");
        else if (snapRef.current === "partial") setSnapState("full");
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
