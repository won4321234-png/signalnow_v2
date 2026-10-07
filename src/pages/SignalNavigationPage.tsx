import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  configureTrafficRegion,
  fetchSelectedIntersectionSignals,
  loadIntersectionsForViewport,
} from "@/services/viewportTrafficService";
import { DEFAULT_TRAFFIC_REGION, TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import type { ApproachDirection, Intersection, SignalPhaseState, TrafficSignal } from "@/types/traffic";
import "./signal-navigation.css";

type GeoState = {
  lat: number;
  lng: number;
  speed: number;
  acceleration: number;
  heading: number | null;
  timestamp: number;
};

type LiveIntersection = {
  intersection: Intersection;
  distance: number;
  signals: TrafficSignal[];
  receivedAt: number;
};

type PassageAnalysis = {
  phase: SignalPhaseState | null;
  remaining: number | undefined;
  eta: number | undefined;
  targetSpeed: number | undefined;
  currentSpeed: number;
  ratio: number | undefined;
  verdict: "pass" | "slow" | "after-change" | "stop" | "unknown";
  label: string;
  detail: string;
};

const directionAngles: Record<ApproachDirection, number> = {
  North: 0,
  NorthEast: 45,
  East: 90,
  SouthEast: 135,
  South: 180,
  SouthWest: 225,
  West: 270,
  NorthWest: 315,
};

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function angleDistance(a: number, b: number) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, 360 - d);
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = 6371008.8;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function bearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const y =
    Math.sin((b.lng - a.lng) * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180);
  const x =
    Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) -
    Math.sin(a.lat * Math.PI / 180) *
      Math.cos(b.lat * Math.PI / 180) *
      Math.cos((b.lng - a.lng) * Math.PI / 180);
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI);
}

function closestDirection(angle: number): ApproachDirection {
  return (Object.entries(directionAngles) as Array<[ApproachDirection, number]>)
    .sort((a, b) => angleDistance(angle, a[1]) - angleDistance(angle, b[1]))[0][0];
}

function signalColor(signal?: TrafficSignal) {
  if (!signal) return "unknown";
  if (signal.state === "protected-Movement-Allowed") return "green";
  if (signal.state === "protected-clearance") return "yellow";
  return "red";
}

function signalForApproach(
  signals: TrafficSignal[],
  position: GeoState,
  intersection: Intersection,
) {
  const direction = closestDirection(
    bearing(
      { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot },
      { lat: position.lat, lng: position.lng },
    ),
  );

  return (
    signals.find((s) => s.direction === direction && s.movement === "Straight") ??
    signals.find((s) => s.direction === direction && s.movement === "Bus") ??
    signals.find((s) => s.direction === direction)
  );
}

function remaining(
  signal: TrafficSignal | undefined,
  receivedAt: number,
  now: number,
) {
  if (!signal || signal.remainingSeconds == null) return undefined;
  return Math.max(
    0,
    signal.remainingSeconds - Math.max(0, now - receivedAt) / 1000,
  );
}

function formatDistance(distance: number) {
  if (distance < 1000) return String(Math.max(1, Math.round(distance)));
  return (distance / 1000).toFixed(1);
}

function formatSpeed(speed: number) {
  return Number.isFinite(speed)
    ? String(Math.max(0, Math.round(speed * 3.6)))
    : "0";
}

function regionForPosition(position: { lat: number; lng: number }): TrafficRegionId {
  return (Object.values(TRAFFIC_REGIONS) as Array<(typeof TRAFFIC_REGIONS)[TrafficRegionId]>)
    .map((region) => ({
      region,
      distance: distanceMeters(position, region.center),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.region.id ?? DEFAULT_TRAFFIC_REGION;
}

function approaching(position: GeoState | null, intersections: Intersection[]) {
  if (!position) return [];

  return intersections
    .map((intersection) => {
      const point = {
        lat: intersection.mapCtptIntLat,
        lng: intersection.mapCtptIntLot,
      };
      const distance = distanceMeters(position, point);
      const direction = bearing(position, point);
      const deviation =
        position.heading == null ? 0 : angleDistance(position.heading, direction);

      return { intersection, distance, deviation };
    })
    .filter(
      (item) =>
        item.distance <= 1800 &&
        (position.heading == null || item.deviation <= 75),
    )
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

function analyzePassage(
  item: LiveIntersection | undefined,
  position: GeoState | null,
  now: number,
): PassageAnalysis {
  if (!item || !position) {
    return {
      phase: null,
      remaining: undefined,
      eta: undefined,
      targetSpeed: undefined,
      currentSpeed: 0,
      ratio: undefined,
      verdict: "unknown",
      label: "신호 분석 대기",
      detail: "GPS와 실제 신호 데이터를 기다리는 중",
    };
  }

  const signal = signalForApproach(item.signals, position, item.intersection);
  const phase = signal?.state ?? null;
  const remainingSeconds = remaining(signal, item.receivedAt, now);
  const currentSpeed = Math.max(0, position.speed * 3.6);
  const distance = Math.max(1, item.distance);
  const eta = currentSpeed > 1 ? distance / (currentSpeed / 3.6) : undefined;
  const targetSpeed =
    remainingSeconds != null && remainingSeconds > 0
      ? (distance / remainingSeconds) * 3.6
      : undefined;

  if (!signal || remainingSeconds == null) {
    return {
      phase,
      remaining: remainingSeconds,
      eta,
      targetSpeed,
      currentSpeed,
      ratio: undefined,
      verdict: "unknown",
      label: "판단 불가",
      detail: "실제 신호 잔여시간이 없어 통과 여부를 계산할 수 없음",
    };
  }

  if (phase === "protected-Movement-Allowed") {
    const ratio = targetSpeed != null ? currentSpeed / Math.max(1, targetSpeed) : undefined;
    const pass = eta != null && eta <= remainingSeconds + 0.5;
    return {
      phase,
      remaining: remainingSeconds,
      eta,
      targetSpeed,
      currentSpeed,
      ratio,
      verdict: pass ? "pass" : "slow",
      label: pass ? "통과 가능" : "현재 속도로는 어려움",
      detail: pass
        ? "현재 속력으로 녹색 잔여시간 안에 도달 예상"
        : "녹색 종료 전에 도달하려면 더 빠른 속도가 필요",
    };
  }

  if (phase === "stop-And-Remain") {
    const arrivesAfterChange = eta != null && eta >= remainingSeconds;
    const ratio = targetSpeed != null ? currentSpeed / Math.max(1, targetSpeed) : undefined;
    return {
      phase,
      remaining: remainingSeconds,
      eta,
      targetSpeed,
      currentSpeed,
      ratio,
      verdict: arrivesAfterChange ? "after-change" : "stop",
      label: arrivesAfterChange ? "전환 후 도착 예상" : "현재 속도로 적색 도착",
      detail: arrivesAfterChange
        ? "현재 적색 잔여시간 이후 교차로 도착 예상"
        : "적색 종료 전에 교차로에 도착할 것으로 계산됨",
    };
  }

  const arrivesAfterYellow = eta != null && eta > remainingSeconds;
  const ratio = targetSpeed != null ? currentSpeed / Math.max(1, targetSpeed) : undefined;
  return {
    phase,
    remaining: remainingSeconds,
    eta,
    targetSpeed,
    currentSpeed,
    ratio,
    verdict: arrivesAfterYellow ? "slow" : "stop",
    label: arrivesAfterYellow ? "황색 종료 후 도착 예상" : "황색 구간 도착 예상",
    detail: arrivesAfterYellow
      ? "현재 속력 기준 황색 종료 뒤 교차로 도착"
      : "황색 잔여시간 안에 도착할 것으로 계산됨",
  };
}

function SignalTimeline({
  item,
  position,
  now,
}: {
  item: LiveIntersection;
  position: GeoState | null;
  now: number;
}) {
  const signal = position
    ? signalForApproach(item.signals, position, item.intersection)
    : undefined;
  const seconds = remaining(signal, item.receivedAt, now);
  const color = signalColor(signal);
  const cycle = Math.max(1, signal?.cycleSeconds ?? 60);
  const activeRatio =
    seconds == null ? 0 : Math.min(1, Math.max(0.04, seconds / cycle));
  const lineBottom = Math.min(94, Math.max(8, 8 + activeRatio * 84));

  return (
    <div className="sn-signal-column">
      <div className="sn-signal-stack" aria-label={signal ? `현재 ${color} 신호, ${Math.ceil(seconds ?? 0)}초` : "신호 데이터 없음"}>
        <div className="sn-phase sn-phase-red" />
        <div className="sn-phase sn-phase-yellow" />
        <div className="sn-phase sn-phase-green" />
        {signal && (
          <div
            className={`sn-phase-current sn-phase-current-${color}`}
            style={{ height: Math.max(7, activeRatio * 100) + "%" }}
          />
        )}
        {signal && (
          <div className="sn-arrival-line" style={{ bottom: lineBottom + "%" }} />
        )}
      </div>
      <strong>{seconds == null ? "—" : Math.ceil(seconds)}</strong>
    </div>
  );
}

export function SignalNavigationPage() {
  const [regionId, setRegionId] = useState<TrafficRegionId>(DEFAULT_TRAFFIC_REGION);
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [position, setPosition] = useState<GeoState | null>(null);
  const [live, setLive] = useState<LiveIntersection[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef(0);

  const loadNearby = useCallback(
    async (id: TrafficRegionId, current: GeoState | null) => {
      configureTrafficRegion(id);
      const center = current ?? TRAFFIC_REGIONS[id].center;
      try {
        const result = await loadIntersectionsForViewport(
          {
            south: center.lat - (current ? 0.025 : 0.06),
            west: center.lng - (current ? 0.03 : 0.07),
            north: center.lat + (current ? 0.025 : 0.06),
            east: center.lng + (current ? 0.03 : 0.07),
          },
          { loadAll: false },
        );
        setIntersections(result);
      } catch {
        setIntersections([]);
      }
    },
    [],
  );

  useEffect(() => {
    if (!position) return;
    const detected = regionForPosition(position);
    setRegionId((previous) => (previous === detected ? previous : detected));
  }, [position?.lat, position?.lng]);

  useEffect(() => {
    if (!position) return;
    void loadNearby(regionId, position);
  }, [loadNearby, regionId, position]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition((previous) => {
          const point = { lat: p.coords.latitude, lng: p.coords.longitude };
          const elapsed =
            previous && p.timestamp > previous.timestamp
              ? (p.timestamp - previous.timestamp) / 1000
              : 0;
          const derived =
            previous && elapsed > 0
              ? distanceMeters(previous, point) / elapsed
              : 0;
          const speed =
            p.coords.speed != null &&
            Number.isFinite(p.coords.speed) &&
            p.coords.speed >= 0
              ? p.coords.speed
              : derived;

          return {
            ...point,
            speed,
            acceleration:
              previous && elapsed > 0
                ? (speed - previous.speed) / elapsed
                : 0,
            heading:
              p.coords.heading != null && Number.isFinite(p.coords.heading)
                ? p.coords.heading
                : previous?.heading ?? null,
            timestamp: p.timestamp,
          };
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!position) return;
    const timer = window.setTimeout(
      () => void loadNearby(regionId, position),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [position?.lat, position?.lng, regionId, loadNearby]);

  const candidates = useMemo(
    () => approaching(position, intersections),
    [position, intersections],
  );

  const loadSignals = useCallback(async () => {
    if (!position || candidates.length === 0) {
      setLive([]);
      return;
    }

    const requestId = ++requestRef.current;
    const next: LiveIntersection[] = [];

    for (const candidate of candidates) {
      try {
        const result = await fetchSelectedIntersectionSignals(
          candidate.intersection.crsrdId,
          { forceRefresh: true },
        );

        if (requestId !== requestRef.current) return;

        next.push({
          intersection: candidate.intersection,
          distance: candidate.distance,
          signals: result.signals,
          receivedAt: Date.now(),
        });
      } catch {
        next.push({
          intersection: candidate.intersection,
          distance: candidate.distance,
          signals: [],
          receivedAt: Date.now(),
        });
      }
    }

    setLive(next);
  }, [candidates, position]);

  useEffect(() => {
    if (!position || candidates.length === 0) {
      setLive([]);
      return;
    }

    void loadSignals();
    const timer = window.setInterval(() => void loadSignals(), 5000);
    return () => window.clearInterval(timer);
  }, [loadSignals, position, candidates.length]);

  const first = live[0];
  const analysis = useMemo(
    () => analyzePassage(first, position, now),
    [first, position, now],
  );

  const currentSpeed = position ? formatSpeed(position.speed) : "0";
  const acceleration = position
    ? (position.acceleration >= 0 ? "+" : "") +
      position.acceleration.toFixed(1)
    : "0.0";

  const gaugeMax = Math.max(
    60,
    Math.ceil(
      Math.max(
        analysis.currentSpeed,
        analysis.targetSpeed ?? 0,
        1,
      ) * 1.25 / 10,
    ) * 10,
  );
  const gaugeCurrentPosition = Math.min(
    96,
    Math.max(4, (analysis.currentSpeed / gaugeMax) * 100),
  );
  const gaugeTargetPosition =
    analysis.targetSpeed == null
      ? undefined
      : Math.min(
          96,
          Math.max(4, (analysis.targetSpeed / gaugeMax) * 100),
        );

  return (
    <main className="sn-reference-nav">
      <section
        className="sn-reference-panel"
        aria-label="SignalNow 실시간 신호 내비게이션"
      >
        <div className="sn-ref-header">
          <div className="sn-ref-road-list">
            {live.map((item, index) => {
              const signal = position
                ? signalForApproach(item.signals, position, item.intersection)
                : undefined;
              return (
                <div className={`sn-ref-road sn-ref-road-${index}`} key={item.intersection.crsrdId}>
                  <span className={`sn-ref-road-light sn-ref-road-light-${signalColor(signal)}`} />
                  <span>{item.intersection.crsrdNm}</span>
                </div>
              );
            })}
            {live.length === 0 && (
              <div className="sn-ref-road sn-ref-loading">
                {position ? "주행 경로의 실제 신호를 찾는 중" : "GPS 위치 대기 중"}
              </div>
            )}
          </div>

          <button
            className="sn-ref-back"
            onClick={() => window.history.back()}
            aria-label="뒤로가기"
            type="button"
          >
            <span />
          </button>
        </div>

        <div className="sn-ref-target">
          <div className="sn-ref-target-copy">
            <strong>{first ? formatDistance(first.distance) : "—"}</strong>
            <span>{first && first.distance < 1000 ? "m" : first ? "km" : ""}</span>
            <small>다음 교차로</small>
          </div>

          <div className={`sn-ref-target-speed sn-ref-target-speed-${analysis.verdict}`}>
            <strong>
              {analysis.targetSpeed != null
                ? Math.round(Math.min(130, Math.max(0, analysis.targetSpeed)))
                : "—"}
            </strong>
            <span>km/h</span>
          </div>

          <div className="sn-ref-current-mini">
            <strong>{currentSpeed}</strong>
            <span>현재</span>
          </div>
        </div>

        <div className="sn-ref-timeline">
          {live.length > 0 ? (
            live.map((item) => (
              <SignalTimeline
                key={item.intersection.crsrdId}
                item={item}
                position={position}
                now={now}
              />
            ))
          ) : (
            <div className="sn-ref-no-signal">실제 신호 데이터 없음</div>
          )}
        </div>

        <div className="sn-ref-pass">
          <div className="sn-ref-pass-head">
            <span>신호 통과 판단</span>
            <strong className={`is-${analysis.verdict}`}>
              {analysis.label}
            </strong>
          </div>
          <div className="sn-pass-gauge" aria-label={analysis.detail}>
            <div className="sn-pass-track">
              <div
                className="sn-pass-fill"
                style={{ width: gaugeCurrentPosition + "%" }}
              />
              {analysis.targetSpeed != null && (
                <i
                  className="sn-pass-target"
                  style={{
                    left: gaugeTargetPosition + "%",
                  }}
                  title={`계산된 목표 속도 ${Math.round(analysis.targetSpeed)} km/h`}
                />
              )}
              <i
                className="sn-pass-current"
                style={{
                  left: gaugeCurrentPosition + "%",
                }}
                title={`현재 속도 ${Math.round(analysis.currentSpeed)} km/h`}
              />
            </div>
            <div className="sn-pass-scale">
              <span>0</span>
              <span>목표 {analysis.targetSpeed != null ? Math.round(analysis.targetSpeed) : "—"}</span>
              <span>{gaugeMax}</span>
            </div>
          </div>
          <p>{analysis.detail}</p>
        </div>

        <div className="sn-ref-speed">
          <strong>{currentSpeed}</strong>
          <span>km/h</span>
        </div>

        <div className="sn-ref-accel">
          <span>{acceleration} m/s²</span>
          <div className="sn-ref-axis">
            <i>−</i>
            <b>0</b>
            <i>+</i>
            <em
              style={{
                left:
                  Math.max(
                    5,
                    Math.min(95, 50 + (position?.acceleration ?? 0) * 18),
                  ) + "%",
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
