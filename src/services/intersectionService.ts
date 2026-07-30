import type {
  Intersection,
  IntersectionListResult,
  TrafficMarkerData,
} from "@/types/traffic";
import { MOCK_INTERSECTIONS, MOCK_MARKERS } from "@/data/mockData";

/**
 * Intersection service layer.
 *
 * This module is the ONLY place that knows where intersection data comes from.
 * UI components call these functions and never touch the data source directly,
 * so replacing the mock data with the real KLID API client later only requires
 * changing the bodies of these functions — no component changes are needed.
 */

/** Simulated network latency for the MVP (ms). */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all intersections and their map markers.
 * Returns a list of intersections plus their placeholder marker positions.
 */
export async function fetchIntersections(): Promise<IntersectionListResult> {
  await delay(MOCK_LATENCY_MS);
  return {
    intersections: MOCK_INTERSECTIONS,
    markers: MOCK_MARKERS,
  };
}

/**
 * Fetch a single intersection by its KLID id (`crsrdId`).
 * Returns `null` when no intersection matches, so callers can show an
 * empty/error state without throwing.
 */
export async function fetchIntersectionById(
  crsrdId: string
): Promise<Intersection | null> {
  await delay(MOCK_LATENCY_MS / 2);
  const found = MOCK_INTERSECTIONS.find((i) => i.crsrdId === crsrdId);
  return found ?? null;
}

/**
 * Returns the marker position for a given intersection id.
 * When Kakao Maps is integrated this will be replaced by a projection from
 * `mapCtptIntLat` / `mapCtptIntLot` to screen coordinates.
 */
export function markerForIntersection(
  crsrdId: string,
  markers: TrafficMarkerData[]
): TrafficMarkerData | null {
  return markers.find((m) => m.intersectionId === crsrdId) ?? null;
}

/** Lookup helper: find an intersection in a cached list by id. */
export function findIntersection(
  crsrdId: string,
  intersections: Intersection[]
): Intersection | null {
  return intersections.find((i) => i.crsrdId === crsrdId) ?? null;
}
