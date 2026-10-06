import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  configureTrafficRegion,
  fetchSelectedIntersectionSignals,
  loadIntersectionsForViewport,
} from "@/services/viewportTrafficService";
import {
  DEFAULT_TRAFFIC_REGION,
  TRAFFIC_REGIONS,
  type TrafficRegionId,
} from "@/data/regions";
import { DIRECTION_LABELS_KO, type SignalColor } from "@/lib/signal";
import type { ApproachDirection, Intersection, TrafficSignal } from "@/types/traffic";
import "./signal-navigation.css";

type GeoState = {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
  acceleration: number;
  heading: number | null;
  timestamp: number;
};

type LiveIntersection = {
  intersection: Intersection;
  distance: number;
  signal?: TrafficSignal;
  receivedAt?: number;
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

function getRegionFromStorage(): TrafficRegionId {
  const stored = window.localStorage.getItem("signalnow-region");
  return stored === "ulsan" || stored === "seoul" ? stored : DEFAULT_TRAFFIC_REGION;
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, 360 - d);
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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
): number {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x =
    Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) -
    Math.sin(a.lat * Math.PI / 180) *
      Math.cos(b.lat * Math.PI / 180) *
      Math.cos((b.lng - a.lng) * Math.PI / 180);
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI);
}

function closestDirection(angle: number): ApproachDirection {
  return (Object.entries(directionAngles) as Array<[ApproachDirection, number]>)
    .sort((a, b) => angularDistance(angle, a[1]) - angularDistance(angle, b[1]))[0][0];
}

function signalColor(signal?: TrafficSignal): SignalColor {
  if (!signal) return "red";
  if (signal.state === "protected-Movement-Allowed") return "green";
  if (signal.state === "protected-clearance") return "yellow";
  return "red";
}

function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDistance(meters: number): string {
  if (meters < 1000) return Math.max(10, Math.round(meters / 10) * 10) + "m";
  return (meters / 1000).toFixed(1) + "km";
}

function formatSpeed(speedMps: number): string {
  if (!Number.isFinite(speedMps) || speedMps < 0.3) return "0";
  return String(Math.round(speedMps * 3.6));
}

function countdown(
  signal: TrafficSignal | undefined,
  receivedAt: number | undefined,
  now: number,
): number | undefined {
  if (!signal || (signal.remainingSeconds === undefined && signal.remainingSeconds !== 0)) return undefined;
  if (!receivedAt) return Math.max(0, Math.round(signal.remainingSeconds));
  return Math.max(
    0,
    Math.floor(signal.remainingSeconds - Math.max(0, now - receivedAt) / 1000),
  );
}

function findStraightSignal(
  signals: TrafficSignal[],
  position: GeoState,
  intersection: Intersection,
): TrafficSignal | undefined {
  const approachDirection = closestDirection(
    bearing(
      { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot },
      { lat: position.lat, lng: position.lng },
    ),
  );

  return (
    signals.find((s) => s.direction === approachDirection && s.movement === "Straight") ??
    signals.find((s) => s.direction === approachDirection && s.movement === "Bus") ??
    signals.find((s) => s.direction === approachDirection)
  );
}

function getApproaches(
  position: GeoState | null,
  intersections: Intersection[],
): Array<{ intersection: Intersection; distance: number }> {
  if (!position) return [];

  return intersections
    .map((intersection) => {
      const target = {
        lat: intersection.mapCtptIntLat,
        lng: intersection.mapCtptIntLot,
      };
      const distance = distanceMeters(position, target);
      const direction = bearing(position, target);
      const deviation = position.heading === null ? 0 : angularDistance(position.heading, direction);
      return { intersection, distance, deviation };
    })
    .filter((item) => item.distance <= 1800)
    .filter((item) => position.heading === null || item.deviation <= 90)
    .sort((a, b) => {
      const scoreA = a.distance + Math.max(0, a.deviation - 35) * 8;
      const scoreB = b.distance + Math.max(0, b.deviation - 35) * 8;
      return scoreA - scoreB;
    })
    .slice(0, 4)
    .map(({ intersection, distance }) => ({ intersection, distance }));
}

function SignalBar({
  item,
  now,
  maxHeight,
}: {
  item: LiveIntersection;
  now: number;
  maxHeight: number;
}) {
  const seconds = countdown(item.signal, item.receivedAt, now);
  const color = signalColor(item.signal);
  const etaSeconds =
    item.distance > 0
      ? Math.max(1, Math.round(item.distance / Math.max(0.8, 12)))
      : 1;
  const height = Math.max(82, Math.min(maxHeight, 82 + etaSeconds * 3.2));
  const activeRatio = item.signal?.remainingSeconds !== undefined
    ? Math.min(1, Math.max(0.12, item.signal.remainingSeconds / 60))
    : 0.2;

  return (
    <div className="sn-wave-column" style={{ height: height + "px" }}>
      <div className="sn-wave-track">
        <div className="sn-wave-segment sn-wave-red" />
        <div className="sn-wave-segment sn-wave-yellow" />
        <div className="sn-wave-segment sn-wave-green" />
        <div
          className={"sn-wave-active sn-wave-active-" + color}
          style={{ height: activeRatio * 100 + "%" }}
        />
        <div
          className="sn-wave-now"
          style={{
            bottom: Math.min(94, Math.max(8, activeRatio * 72 + 14)) + "%",
          }}
        />
      </div>
      <span className="sn-wave-index">{item.intersection.crsrdNm}</span>
      <strong className={"sn-wave-count sn-wave-count-" + color}>
        {seconds ?? "—"}
      </strong>
    </div>
  );
}

export function SignalNavigationPage() {
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => getRegionFromStorage());
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [position, setPosition] = useState<GeoState | null>(null);
  const [live, setLive] = useState<LiveIntersection[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef(0);
  const lastSignalLoadRef = useRef("");

  const region = TRAFFIC_REGIONS[regionId];

  const loadNearby = useCallback(
    async (nextRegion: TrafficRegionId, currentPosition: GeoState | null) => {
      configureTrafficRegion(nextRegion);
      const center = currentPosition ?? TRAFFIC_REGIONS[nextRegion].center;
      const latDelta = currentPosition ? 0.03 : 0.06;
      const lngDelta = currentPosition ? 0.035 : 0.07;

      try {
        const result = await loadIntersectionsForViewport(
          {
            south: center.lat - latDelta,
            west: center.lng - lngDelta,
            north: center.lat + latDelta,
            east: center.lng + lngDelta,
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
    void loadNearby(regionId, position);
  }, [loadNearby, regionId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPosition((previous) => {
          const current = { lat: p.coords.latitude, lng: p.coords.longitude };
          const elapsed =
            previous && p.timestamp > previous.timestamp
              ? (p.timestamp - previous.timestamp) / 1000
              : 0;
          const derivedSpeed =
            previous && elapsed > 0
              ? distanceMeters(previous, current) / elapsed
              : 0;
          const speed =
            p.coords.speed != null &&
            Number.isFinite(p.coords.speed) &&
            p.coords.speed >= 0
              ? p.coords.speed
              : derivedSpeed;
          const acceleration =
            previous && elapsed > 0 ? (speed - previous.speed) / elapsed : 0;

          return {
            lat: current.lat,
            lng: current.lng,
            accuracy: p.coords.accuracy,
            speed,
            acceleration,
            heading:
              p.coords.heading != null && Number.isFinite(p.coords.heading)
                ? p.coords.heading
                : previous?.heading ?? null,
            timestamp: p.timestamp,
          };
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!position) return;
    const timeout = window.setTimeout(() => {
      void loadNearby(regionId, position);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [position?.lat, position?.lng, regionId, loadNearby]);

  const candidates = useMemo(
    () => getApproaches(position, intersections),
    [position, intersections],
  );

  const loadSignals = useCallback(async () => {
    if (!position || candidates.length === 0) return;
    const requestId = ++requestRef.current;
    const next: LiveIntersection[] = [];

    for (const candidate of candidates.slice(0, 4)) {
      try {
        const result = await fetchSelectedIntersectionSignals(
          candidate.intersection.crsrdId,
          { forceRefresh: true },
        );
        if (requestId !== requestRef.current) return;

        next.push({
          intersection: candidate.intersection,
          distance: candidate.distance,
          signal: findStraightSignal(result.signals, position, candidate.intersection),
          receivedAt: Date.now(),
        });
      } catch {
        next.push({
          intersection: candidate.intersection,
          distance: candidate.distance,
        });
      }
    }

    setLive(next);
    lastSignalLoadRef.current = new Date().toISOString();
  }, [candidates, position]);

  useEffect(() => {
    if (!position || candidates.length === 0) return;
    void loadSignals();
    const interval = window.setInterval(() => void loadSignals(), 5000);
    return () => window.clearInterval(interval);
  }, [loadSignals, position, candidates.length]);

  const current = live[0];
  const nextSignals = live.slice(0, 3);
  const currentCountdown = countdown(current?.signal, current?.receivedAt, now);
  const currentColor = signalColor(current?.signal);
  const speedKmh = position ? formatSpeed(position.speed) : "—";
  const acceleration = position
    ? (position.acceleration >= 0 ? "+" : "") + position.acceleration.toFixed(1)
    : "—";

  const switchRegion = (nextRegion: TrafficRegionId) => {
    window.localStorage.setItem("signalnow-region", nextRegion);
    setRegionId(nextRegion);
    setIntersections([]);
    setLive([]);
  };

  return (
    <main className="sn-nav-page">
      <div className="sn-nav-map" aria-hidden="true">
        <div className="sn-map-grid" />
        <div className="sn-map-road sn-map-road-main" />
        <div className="sn-map-road sn-map-road-cross" />
        <div className="sn-map-route">
          {live.map((item, index) => (
            <div
              key={item.intersection.crsrdId}
              className={"sn-map-stop " + (index === 0 ? "is-current" : "")}
              style={{ top: (18 + index * 22) + "%" }}
            >
              <span />
              <b>{item.intersection.crsrdNm}</b>
              <small>{formatDistance(item.distance)}</small>
            </div>
          ))}
        </div>
      </div>

      <section className="sn-nav-panel" aria-label="신호 내비게이션">
        <header className="sn-panel-header">
          <div className="sn-time-pill">{formatClock()}</div>
          <div className="sn-panel-region">
            {region.name.replace("특별시", "").replace("광역시", "")}
          </div>
        </header>

        <div className="sn-panel-route">
          <button
            className="sn-route-back"
            onClick={() => window.history.back()}
            aria-label="뒤로"
          >
            <span />
          </button>
          <div className="sn-route-copy">
            <span className="sn-route-kicker">
              ↑ {current?.intersection.crsrdNm ?? "진행 경로 탐색 중"}
            </span>
            <strong>
              ↑ {live[1]?.intersection.crsrdNm ?? current?.intersection.crsrdNm ?? "교차로"}
            </strong>
          </div>
        </div>

        <div className="sn-target-row">
          <div className="sn-target-distance">
            <strong>{current ? Math.round(current.distance) : "—"}</strong>
            <span>m</span>
            <small>교차로까지</small>
          </div>
          <div className={"sn-target-signal sn-target-signal-" + currentColor}>
            <strong>{currentCountdown ?? "—"}</strong>
            <span>s</span>
          </div>
        </div>

        <div className="sn-wave-chart">
          {nextSignals.length > 0 ? (
            nextSignals.map((item) => (
              <SignalBar
                key={item.intersection.crsrdId}
                item={item}
                now={now}
                maxHeight={205}
              />
            ))
          ) : (
            <div className="sn-chart-empty">
              <span>●</span>
              <p>현재 위치에서<br />실시간 교차로를 찾는 중</p>
            </div>
          )}
        </div>

        <div className="sn-speed-readout">
          <strong>{speedKmh}</strong>
          <span>km/h</span>
        </div>

        <div className="sn-acceleration">
          <span>{acceleration} m/s²</span>
          <div className="sn-accel-scale">
            <i className="sn-accel-left">−</i>
            <b className="sn-accel-zero">0</b>
            <i className="sn-accel-right">+</i>
            <em
              style={{
                left:
                  Math.max(
                    8,
                    Math.min(92, 50 + (position?.acceleration ?? 0) * 18),
                  ) + "%",
              }}
            />
          </div>
        </div>

        <div className="sn-route-list">
          {live.slice(0, 5).map((item) => {
            const seconds = countdown(item.signal, item.receivedAt, now);
            const color = signalColor(item.signal);
            const direction = position
              ? closestDirection(
                  bearing(
                    {
                      lat: item.intersection.mapCtptIntLat,
                      lng: item.intersection.mapCtptIntLot,
                    },
                    { lat: position.lat, lng: position.lng },
                  ),
                )
              : null;

            return (
              <div key={item.intersection.crsrdId} className="sn-route-item">
                <span className={"sn-route-dot sn-route-dot-" + color} />
                <div>
                  <strong>
                    {direction ? DIRECTION_LABELS_KO[direction] : "↑"}{" "}
                    {item.intersection.crsrdNm}
                  </strong>
                  <small>
                    {formatDistance(item.distance)} · {seconds ?? "—"}초
                  </small>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="sn-panel-footer">
          <span className="sn-live-dot" />
          <span>실시간 신호 데이터</span>
          <span>{lastSignalLoadRef.current ? "LIVE" : "연결 중"}</span>
        </footer>
      </section>

      <div className="sn-region-switcher" aria-label="교통 데이터 지역">
        {(Object.keys(TRAFFIC_REGIONS) as TrafficRegionId[]).map((id) => (
          <button
            key={id}
            className={id === regionId ? "is-active" : ""}
            onClick={() => switchRegion(id)}
          >
            {TRAFFIC_REGIONS[id].name.replace("특별시", "").replace("광역시", "")}
          </button>
        ))}
      </div>
    </main>
  );
}
