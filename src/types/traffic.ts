/**
 * SignalNow traffic signal domain types.
 *
 * These types mirror the field names used by the Korean KLID (Korea Local Information)
 * traffic signal APIs so that the real API responses can be mapped directly with
 * minimal transformation once integration begins.
 */

/** KLID signal phase state values as returned by the official API. */
export type SignalPhaseState =
  | "protected-Movement-Allowed"
  | "protected-clearance"
  | "stop-And-Remain";

export type ApproachDirection =
  | "North"
  | "East"
  | "South"
  | "West"
  | "NorthEast"
  | "SouthEast"
  | "SouthWest"
  | "NorthWest";

export type MovementType =
  | "Straight"
  | "Left Turn"
  | "Right Turn"
  | "U Turn"
  | "Pedestrian"
  | "Bus"
  | "Bicycle";

/** A single signal for one movement at one approach. */
export interface TrafficSignal {
  direction: ApproachDirection;
  movement: MovementType;
  state: SignalPhaseState;
  /** Undefined when the API did not provide a remaining-time field. */
  remainingSeconds?: number;
  cycleSeconds: number;
}

export interface Intersection {
  crsrdId: string;
  crsrdNm: string;
  stdgCd?: string;
  lclgvNm?: string;
  mapCtptIntLat: number;
  mapCtptIntLot: number;
  crsrdEngNm?: string;
  laneWdth?: string;
  lmtSpdTypeNm?: string;
  lmtSpd?: string;
  regDt?: string;
  totDt?: string;
  signals: TrafficSignal[];
  updatedAt: string;
}

export interface MarkerPosition {
  x: number;
  y: number;
}

export interface TrafficMarkerData {
  intersectionId: string;
  position: MarkerPosition;
}

export type DataStatus = "idle" | "loading" | "success" | "error";
export type ViewMode = "driver" | "pedestrian";

export interface IntersectionListResult {
  intersections: Intersection[];
  markers: TrafficMarkerData[];
}
