import type { TrafficSignal } from "@/types/traffic";

export type PedestrianEstimateMode = "actual" | "estimated";
export type PedestrianEstimateStatus = "walk" | "wait" | "unknown";
export type PedestrianEstimateConfidence = "high" | "medium" | "low";

export interface PedestrianSignalEstimate {
  available: boolean;
  mode: PedestrianEstimateMode;
  status: PedestrianEstimateStatus;
  confidence: PedestrianEstimateConfidence;
  estimatedChangeInSeconds?: number;
  reason?: string;
}

type Observation = {
  signature: string;
  allVehicleRed: boolean;
  observedAt: number;
};

type IntersectionHistory = {
  observations: Observation[];
  redPhaseStarts: number[];
};

const histories = new Map<string, IntersectionHistory>();
const MIN_RED_PHASES_FOR_TIMED_ESTIMATE = 2;
const MAX_OBSERVATION_AGE_MS = 10 * 60 * 1000;
const VEHICLE_MOVEMENTS = new Set(["Straight", "Left Turn", "Right Turn", "U Turn", "Bus", "Bicycle"]);

function isVehicleSignal(signal: TrafficSignal): boolean {
  return VEHICLE_MOVEMENTS.has(signal.movement);
}

function isAllVehicleRed(signals: TrafficSignal[]): boolean {
  const vehicles = signals.filter(isVehicleSignal);
  return vehicles.length > 0 && vehicles.every((signal) => signal.state === "stop-And-Remain");
}

function signatureFor(signals: TrafficSignal[]): string {
  return signals.filter(isVehicleSignal).map((signal) => `${signal.direction}:${signal.movement}:${signal.state}`).sort().join("|");
}

function activePhaseRemaining(signals: TrafficSignal[]): number | undefined {
  const active = signals.filter(isVehicleSignal).filter((signal) => signal.state !== "stop-And-Remain").map((signal) => signal.remainingSeconds).filter((seconds): seconds is number => seconds !== undefined && Number.isFinite(seconds) && seconds >= 0);
  if (active.length === 0) return undefined;
  return Math.max(0, Math.min(...active.map(Math.floor)));
}

function getHistory(intersectionId: string): IntersectionHistory {
  const existing = histories.get(intersectionId);
  if (existing) return existing;
  const created: IntersectionHistory = { observations: [], redPhaseStarts: [] };
  histories.set(intersectionId, created);
  return created;
}

function observe(intersectionId: string, signals: TrafficSignal[]): IntersectionHistory {
  const history = getHistory(intersectionId);
  const now = Date.now();
  history.observations = history.observations.filter((item) => now - item.observedAt <= MAX_OBSERVATION_AGE_MS);
  const signature = signatureFor(signals);
  const allVehicleRed = isAllVehicleRed(signals);
  const previous = history.observations[history.observations.length - 1];
  if (!previous || previous.signature !== signature) {
    history.observations.push({ signature, allVehicleRed, observedAt: now });
    if (allVehicleRed && previous && !previous.allVehicleRed) {
      history.redPhaseStarts.push(now);
      history.redPhaseStarts = history.redPhaseStarts.slice(-MIN_RED_PHASES_FOR_TIMED_ESTIMATE - 2);
    }
  }
  return history;
}

/** Vehicle phases are never treated as actual pedestrian signals. */
export function estimatePedestrianSignal(intersectionId: string, signals: TrafficSignal[]): PedestrianSignalEstimate {
  const pedestrianSignals = signals.filter((signal) => signal.movement === "Pedestrian");
  if (pedestrianSignals.length > 0) {
    const preferred = pedestrianSignals.find((signal) => signal.state === "protected-Movement-Allowed") ?? pedestrianSignals[0];
    return { available: true, mode: "actual", status: preferred.state === "protected-Movement-Allowed" ? "walk" : "wait", confidence: "high", estimatedChangeInSeconds: preferred.remainingSeconds, reason: "actual pedestrian signal data is available" };
  }

  const vehicles = signals.filter(isVehicleSignal);
  if (vehicles.length === 0) return { available: false, mode: "estimated", status: "unknown", confidence: "low", reason: "vehicle signal data is unavailable" };

  const history = observe(intersectionId, signals);
  if (isAllVehicleRed(vehicles)) {
    return { available: true, mode: "estimated", status: "wait", confidence: history.redPhaseStarts.length >= MIN_RED_PHASES_FOR_TIMED_ESTIMATE ? "medium" : "low", reason: "all observed vehicle movements are stopped; this is only a candidate crossing window, not an actual pedestrian green signal" };
  }

  const remaining = activePhaseRemaining(vehicles);
  if (remaining === undefined) return { available: false, mode: "estimated", status: "unknown", confidence: "low", reason: "vehicle phase remaining time is unavailable" };
  if (history.redPhaseStarts.length < MIN_RED_PHASES_FOR_TIMED_ESTIMATE) return { available: false, mode: "estimated", status: "unknown", confidence: "low", reason: "the vehicle phase sequence has not been observed enough times to estimate a crossing window safely" };

  const intervals = history.redPhaseStarts.slice(1).map((start, index) => start - history.redPhaseStarts[index]);
  const recentInterval = intervals[intervals.length - 1];
  if (!recentInterval || recentInterval > MAX_OBSERVATION_AGE_MS) return { available: false, mode: "estimated", status: "unknown", confidence: "low", reason: "observed phase pattern is stale or insufficiently stable" };

  const lastRedStart = history.redPhaseStarts[history.redPhaseStarts.length - 1];
  const estimatedNextRedStart = lastRedStart + recentInterval;
  const secondsUntilCandidate = Math.max(0, Math.round((estimatedNextRedStart - Date.now()) / 1000));
  const bounded = Math.min(Math.max(secondsUntilCandidate, remaining), 180);
  return { available: true, mode: "estimated", status: "wait", confidence: "low", estimatedChangeInSeconds: bounded, reason: "repeated vehicle all-red phase observed; estimated crossing window is not an actual pedestrian signal" };
}

export function resetPedestrianSignalEstimation(intersectionId?: string): void {
  if (intersectionId) histories.delete(intersectionId);
  else histories.clear();
}
