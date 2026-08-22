/**
 * SignalNow traffic signal domain types.
 *
 * These types mirror the field names used by the Korean KLID (Korea Local Information)
 * traffic signal APIs so that the real API responses can be mapped directly with
 * minimal transformation once integration begins.
 */

/** KLID signal phase state values as returned by the official API. */
export type SignalPhaseState =
  /** A protected movement is currently allowed (green light). */
  | "protected-Movement-Allowed"
  /** The protected movement is ending; clear the intersection (yellow). */
  | "protected-clearance"
  /** All vehicles must stop and remain (red light). */
  | "stop-And-Remain";

/** Compass direction of an approach at an intersection. */
export type ApproachDirection =
  | "North"
  | "East"
  | "South"
  | "West"
  | "NorthEast"
  | "SouthEast"
  | "SouthWest"
  | "NorthWest";

/** Movement type available for a given approach. */
export type MovementType =
  | "Straight"
  | "Left Turn"
  | "Right Turn"
  | "U Turn"
  | "Pedestrian"
  | "Bus"
  | "Bicycle";

/**
 * A single signal for one movement at one approach.
 * Matches the per-movement granularity returned by KLID signal endpoints.
 */
export interface TrafficSignal {
  /** Direction of approach this signal governs. */
  direction: ApproachDirection;
  /** Movement this signal controls. */
  movement: MovementType;
  /** Current KLID signal phase. */
  state: SignalPhaseState;
  /** Remaining seconds until the phase changes. Static in the MVP. */
  remainingSeconds: number;
  /** Total seconds for the full signal cycle (used for progress display). */
  cycleSeconds: number;
}

/**
 * A traffic intersection. Field names follow the KLID intersection entity.
 */
export interface Intersection {
  /** KLID intersection id. */
  crsrdId: string;
  /** KLID intersection name (Korean + romanized label here). */
  crsrdNm: string;
  /** Standard administrative code for the service area (e.g. Seoul). */
  stdgCd?: string;
  /** Region name from the API. */
  lclgvNm?: string;
  /** Intersection latitude (KLID `mapCtptIntLat`). */
  mapCtptIntLat: number;
  /** Intersection longitude (KLID `mapCtptIntLot`). */
  mapCtptIntLot: number;
  /** English name when available from the API. */
  crsrdEngNm?: string;
  /** Lane width when available from the API. */
  laneWdth?: string;
  /** Speed limit type when available from the API. */
  lmtSpdTypeNm?: string;
  /** Speed limit when available from the API. */
  lmtSpd?: string;
  /** Registration timestamp when available from the API. */
  regDt?: string;
  /** Collection timestamp when available from the API. */
  totDt?: string;
  /** Signals for every approach at this intersection. */
  signals: TrafficSignal[];
  /** ISO timestamp the data was last refreshed. */
  updatedAt: string;
}

/**
 * A marker placed on the map placeholder.
 *
 * `x` / `y` are percentages (0–100) relative to the map container so they are
 * independent of the underlying map provider. When Kakao Maps is integrated,
 * these will be derived from `mapCtptIntLat` / `mapCtptIntLot` instead.
 */
export interface MarkerPosition {
  x: number;
  y: number;
}

/** A traffic marker rendered on the map, referencing an intersection. */
export interface TrafficMarkerData {
  intersectionId: string;
  position: MarkerPosition;
}

/** Loading / error / idle states for the intersection data fetch. */
export type DataStatus = "idle" | "loading" | "success" | "error";

/** App viewing mode — driver prioritizes vehicle signals, pedestrian prioritizes crossing signals. */
export type ViewMode = "driver" | "pedestrian";

/** Result envelope returned by the intersection service layer. */
export interface IntersectionListResult {
  intersections: Intersection[];
  markers: TrafficMarkerData[];
}
