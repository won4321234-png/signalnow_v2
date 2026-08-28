import type { ApproachDirection, Intersection, MovementType } from "@/types/traffic";

export type GroundTruthSource = "auto" | "manual" | "hybrid";
export type GroundTruthApproachState = "AUTO" | "MANUAL" | "FINAL";
export type IntersectionVerificationStatus = "UNREVIEWED" | "AUTO_READY" | "REVIEW_REQUIRED" | "MANUAL_ONLY" | "VERIFIED";
export type IntersectionType = "FOUR_WAY" | "T_JUNCTION" | "Y_JUNCTION" | "ROUNDABOUT" | "OFFSET_INTERSECTION" | "COMPLEX" | "OTHER";
export type CorrectionReason = "ROAD_AXIS_WRONG" | "OSM_GEOMETRY_WRONG" | "LANE_OFFSET_WRONG" | "INTERSECTION_CENTER_WRONG" | "DIRECTION_MAPPING_WRONG" | "SIGNAL_POSITION_WRONG" | "OTHER";
export type SignalRotationMap = Partial<Record<MovementType, number>>;

export interface LaneGroundTruth {
  laneIndex: number;
  laneType?: string;
  movement: MovementType | "LEFT_STRAIGHT" | "RIGHT_STRAIGHT" | "LEFT_RIGHT";
  bearing?: number;
  lateralOffsetMeters?: number;
  longitudinalOffsetMeters?: number;
  verified: boolean;
}

export interface ApproachGroundTruth {
  direction: ApproachDirection;
  /** Active editor always writes this explicitly. Optional only for backward compatibility with older stored layouts. */
  state?: GroundTruthApproachState;
  auto?: {
    roadBearing?: number;
    axisBearing?: number;
    distanceMeters?: number;
    confidence: number;
    wayId?: string | number;
    source?: string;
  };
  manual?: {
    roadBearing?: number;
    axisBearing?: number;
    distanceMeters?: number;
    offsetMeters?: { longitudinal: number; lateral: number };
    labelRotation?: number;
    /**
     * Manual rotation offsets for rendered signal arrows.
     * New data is stored per movement; a numeric value is accepted for legacy layouts.
     */
    signalRotation?: number | SignalRotationMap;
    signalPosition?: { lat: number; lng: number };
    lanes: LaneGroundTruth[];
    laneCount?: number;
    movements?: Array<"LEFT" | "STRAIGHT" | "RIGHT" | "UTURN">;
    correctionReason?: CorrectionReason;
    notes?: string;
    correctedAt?: string;
    correctedBy?: string;
  };
  final?: {
    roadBearing?: number;
    axisBearing?: number;
    distanceMeters?: number;
    offsetMeters?: { longitudinal: number; lateral: number };
    labelRotation?: number;
    /** Persisted movement-specific manual rotation offsets; numeric values remain valid for legacy data. */
    signalRotation?: number | SignalRotationMap;
    signalPosition?: { lat: number; lng: number };
    source: GroundTruthSource;
  };
  source: GroundTruthSource;
  confidence: number;
  verified: boolean;
  updatedAt: string;
}

export interface ManualIntersectionLayout {
  schemaVersion: 1;
  intersectionId: string;
  intersectionName: string;
  coordinate: { lat: number; lng: number };
  approaches: ApproachGroundTruth[];
  autoIntersectionType?: IntersectionType;
  manualIntersectionType?: IntersectionType;
  status: IntersectionVerificationStatus;
  metadata: {
    createdAt: string;
    updatedAt: string;
    verifiedAt?: string;
    verifiedBy?: string;
    notes?: string;
    correctionCount?: number;
    lastCorrectionReason?: CorrectionReason;
  };
}

export interface GroundTruthExport {
  schemaVersion: 1;
  generatedAt: string;
  exportedAt?: string;
  source?: "SignalNow Ground Truth Editor";
  intersections: ManualIntersectionLayout[];
}

export function createInitialLayout(intersection: Intersection): ManualIntersectionLayout {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    intersectionId: intersection.crsrdId,
    intersectionName: intersection.crsrdNm,
    coordinate: { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot },
    approaches: [],
    status: "UNREVIEWED",
    metadata: { createdAt: now, updatedAt: now, correctionCount: 0 },
  };
}

export function normalizeBearing(value: number): number {
  return ((value % 360) + 360) % 360;
}
