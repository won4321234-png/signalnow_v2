import type { TrafficSignal, SignalPhaseState } from "@/types/traffic";

export type SignalPredictionConfidence = "high" | "medium" | "low";

export interface SignalPrediction {
  available: boolean;
  confidence: SignalPredictionConfidence;
  currentState: SignalPhaseState;
  currentRemainingSeconds?: number;
  predictedNextState?: SignalPhaseState;
  predictedChangeInSeconds?: number;
  reason?: string;
}

const NEXT_PHASE: Partial<Record<SignalPhaseState, SignalPhaseState>> = {
  "protected-Movement-Allowed": "protected-clearance",
  "protected-clearance": "stop-And-Remain",
};

function validRemainingSeconds(signal: TrafficSignal): number | undefined {
  if (signal.remainingSeconds === undefined || !Number.isFinite(signal.remainingSeconds)) return undefined;
  return Math.max(0, Math.floor(signal.remainingSeconds));
}

/**
 * Conservative next-phase prediction. The KLID payload currently exposes the
 * current phase and remaining time, but the normalized project model does not
 * receive an authoritative next-phase field or a real cycle length. Therefore
 * red -> green is intentionally not guessed from a countdown alone.
 */
export function predictNextSignalPhase(signal: TrafficSignal): SignalPrediction {
  const remainingSeconds = validRemainingSeconds(signal);
  if (remainingSeconds === undefined) {
    return {
      available: false,
      confidence: "low",
      currentState: signal.state,
      reason: "remainingSeconds is unavailable",
    };
  }

  const nextState = NEXT_PHASE[signal.state];
  if (!nextState) {
    return {
      available: false,
      confidence: "low",
      currentState: signal.state,
      currentRemainingSeconds: remainingSeconds,
      reason: "the next phase cannot be determined safely from the available data",
    };
  }

  return {
    available: true,
    confidence: "high",
    currentState: signal.state,
    currentRemainingSeconds: remainingSeconds,
    predictedNextState: nextState,
    predictedChangeInSeconds: remainingSeconds,
    reason: "next phase follows the current signal phase transition",
  };
}
