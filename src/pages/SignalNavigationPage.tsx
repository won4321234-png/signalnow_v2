import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  configureTrafficRegion,
  fetchSelectedIntersectionSignals,
  loadIntersectionsForViewport,
} from "@/services/viewportTrafficService";
import { DEFAULT_TRAFFIC_REGION, TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import type { ApproachDirection, Intersection, TrafficSignal } from "@/types/traffic";
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

const directionAngles: Record<ApproachDirection, number> = {
  North: 0, NorthEast: 45, East: 90, SouthEast: 135,
  South: 180, SouthWest: 225, West: 270, NorthWest: 315,
};

function regionFromStorage(): TrafficRegionId {
  const value = window.localStorage.getItem("signalnow-region");
  return value === "ulsan" || value === "seoul" ? value : DEFAULT_TRAFFIC_REGION;
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function angleDistance(a: number, b: number) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, 360 - d);
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371008.8;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x =
    Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) -
    Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.cos((b.lng - a.lng) * Math.PI / 180);
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI);
}

function closestDirection(angle: number): ApproachDirection {
  return (Object.entries(directionAngles) as Array<[ApproachDirection, number]>)
    .sort((a, b) => angleDistance(angle, a[1]) - angleDistance(angle, b[1]))[0][0];
}

function signalColor(signal?: TrafficSignal) {
  if (!signal) return "red";
  if (signal.state === "protected-Movement-Allowed") return "green";
  if (signal.state === "protected-clearance") return "yellow";
  return "red";
}

function signalForApproach(signals: TrafficSignal[], position: GeoState, intersection: Intersection) {
  const direction = closestDirection(
    bearing(
      { lat: intersection.mapCtptIntLat, lng: intersection.mapCtptIntLot },
      { lat: position.lat, lng: position.lng },
    ),
  );
  return signals.find((s) => s.direction === direction && s.movement === "Straight")
    ?? signals.find((s) => s.direction === direction && s.movement === "Bus")
    ?? signals.find((s) => s.direction === direction);
}

function formatDistance(distance: number) {
  if (distance < 1000) return String(Math.max(1, Math.round(distance))) + " m";
  return (distance / 1000).toFixed(1) + " km";
}

function formatSpeed(speed: number) {
  return Number.isFinite(speed) ? String(Math.max(0, Math.round(speed * 3.6))) : "0";
}

function remaining(signal: TrafficSignal | undefined, receivedAt: number, now: number) {
  if (!signal || signal.remainingSeconds == null) return undefined;
  return Math.max(0, Math.floor(signal.remainingSeconds - Math.max(0, now - receivedAt) / 1000));
}

function approaching(position: GeoState | null, intersections: Intersection[]) {
  if (!position) return [];
  return intersections
    .map((intersection) => {
      const distance = distanceMeters(position, {
        lat: intersection.mapCtptIntLat,
        lng: intersection.mapCtptIntLot,
      });
      const direction = bearing(position, {
        lat: intersection.mapCtptIntLat,
        lng: intersection.mapCtptIntLot,
      });
      const deviation = position.heading == null ? 0 : angleDistance(position.heading, direction);
      return { intersection, distance, deviation };
    })
    .filter((item) => item.distance <= 1800 && (position.heading == null || item.deviation <= 75))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

function SignalTimeline({
  item,
  now,
}: {
  item: LiveIntersection;
  now: number;
}) {
  const signal = signalForApproach(item.signals, {
    lat: item.intersection.mapCtptIntLat,
    lng: item.intersection.mapCtptIntLot,
    speed: 0,
    acceleration: 0,
    heading: null,
    timestamp: 0,
  }, item.intersection);
  const seconds = remaining(signal, item.receivedAt, now);
  const color = signalColor(signal);
  const cycle = Math.max(1, signal?.cycleSeconds ?? 60);
  const left = seconds == null ? 0.25 : Math.min(1, Math.max(0.08, seconds / cycle));
  const arrivalBand = Math.min(92, Math.max(8, 100 - left * 78));

  return (
    <div className="sn-signal-column">
      <div className="sn-signal-stack">
        <div className="sn-phase sn-phase-red" />
        <div className="sn-phase sn-phase-yellow" />
        <div className="sn-phase sn-phase-green" />
        <div
          className={"sn-phase-current sn-phase-current-" + color}
          style={{ height: Math.max(10, left * 100) + "%" }}
        />
        <div className="sn-arrival-line" style={{ bottom: arrivalBand + "%" }} />
      </div>
      <strong>{seconds ?? "—"}</strong>
    </div>
  );
}

export function SignalNavigationPage() {
  const [regionId, setRegionId] = useState<TrafficRegionId>(() => regionFromStorage());
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [position, setPosition] = useState<GeoState | null>(null);
  const [live, setLive] = useState<LiveIntersection[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef(0);

  const region = TRAFFIC_REGIONS[regionId];

  const loadNearby = useCallback(async (id: TrafficRegionId, current: GeoState | null) => {
    configureTrafficRegion(id);
    const center = current ?? TRAFFIC_REGIONS[id].center;
    try {
      const result = await loadIntersectionsForViewport({
        south: center.lat - (current ? 0.025 : 0.06),
        west: center.lng - (current ? 0.03 : 0.07),
        north: center.lat + (current ? 0.025 : 0.06),
        east: center.lng + (current ? 0.03 : 0.07),
      }, { loadAll: false });
      setIntersections(result);
    } catch {
      setIntersections([]);
    }
  }, []);

  useEffect(() => { void loadNearby(regionId, position); }, [loadNearby, regionId]);
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
          const elapsed = previous && p.timestamp > previous.timestamp
            ? (p.timestamp - previous.timestamp) / 1000
            : 0;
          const derived = previous && elapsed > 0 ? distanceMeters(previous, point) / elapsed : 0;
          const speed = p.coords.speed != null && Number.isFinite(p.coords.speed) && p.coords.speed >= 0
            ? p.coords.speed : derived;
          return {
            ...point,
            speed,
            acceleration: previous && elapsed > 0 ? (speed - previous.speed) / elapsed : 0,
            heading: p.coords.heading != null && Number.isFinite(p.coords.heading)
              ? p.coords.heading : previous?.heading ?? null,
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
    const timer = window.setTimeout(() => void loadNearby(regionId, position), 500);
    return () => window.clearTimeout(timer);
  }, [position?.lat, position?.lng, regionId, loadNearby]);

  const candidates = useMemo(() => approaching(position, intersections), [position, intersections]);

  const loadSignals = useCallback(async () => {
    if (!position || candidates.length === 0) return;
    const requestId = ++requestRef.current;
    const next: LiveIntersection[] = [];

    for (const candidate of candidates) {
      try {
        const result = await fetchSelectedIntersectionSignals(candidate.intersection.crsrdId, { forceRefresh: true });
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
    if (!position || candidates.length === 0) return;
    void loadSignals();
    const timer = window.setInterval(() => void loadSignals(), 5000);
    return () => window.clearInterval(timer);
  }, [loadSignals, position, candidates.length]);

  const first = live[0];
  const firstSignal = first && position ? signalForApproach(first.signals, position, first.intersection) : undefined;
  const firstSeconds = first ? remaining(firstSignal, first.receivedAt, now) : undefined;
  const speed = position ? formatSpeed(position.speed) : "0";
  const acceleration = position
    ? (position.acceleration >= 0 ? "+" : "") + position.acceleration.toFixed(1)
    : "0.0";

  const switchRegion = (id: TrafficRegionId) => {
    window.localStorage.setItem("signalnow-region", id);
    setRegionId(id);
    setIntersections([]);
    setLive([]);
  };

  return (
    <main className="sn-reference-nav">
      <section className="sn-reference-panel" aria-label="SignalNow 신호 내비게이션">
        <div className="sn-ref-time">{new Intl.DateTimeFormat("ko-KR", {
          hour: "numeric", minute: "2-digit", hour12: false,
        }).format(new Date())}</div>

        <div className="sn-ref-header">
          <div className="sn-ref-road-list">
            {live.map((item, index) => (
              <div className="sn-ref-road" key={item.intersection.crsrdId}>
                <span className={"sn-ref-road-light sn-ref-road-light-" + signalColor(
                  position ? signalForApproach(item.signals, position, item.intersection) : undefined
                )} />
                <span>↑ {item.intersection.crsrdNm}</span>
                {index === 0 && <small>{region.name.replace("특별시", "").replace("광역시", "")}</small>}
              </div>
            ))}
            {live.length === 0 && <div className="sn-ref-road sn-ref-loading">현재 위치의 신호를 불러오는 중</div>}
          </div>

          <button className="sn-ref-back" onClick={() => window.history.back()} aria-label="뒤로가기">
            <span />
          </button>
        </div>

        <div className="sn-ref-target">
          <div className="sn-ref-target-copy">
            <strong>{first ? Math.round(first.distance) : "—"}</strong>
            <span>m</span>
            <small>다음 신호</small>
          </div>
          <div className="sn-ref-target-count">
            <strong>{firstSeconds ?? "—"}</strong>
            <span>s</span>
          </div>
        </div>

        <div className="sn-ref-timeline">
          {live.length > 0 ? live.map((item) => (
            <SignalTimeline key={item.intersection.crsrdId} item={item} now={now} />
          )) : (
            <div className="sn-ref-empty-bars"><i /><i /><i /></div>
          )}
        </div>

        <div className="sn-ref-speed">
          <strong>{speed}</strong>
          <span>km/h</span>
        </div>

        <div className="sn-ref-accel">
          <span>{acceleration} m/s²</span>
          <div className="sn-ref-axis">
            <i>−</i><b>0</b><i>+</i>
            <em style={{
              left: Math.max(5, Math.min(95, 50 + (position?.acceleration ?? 0) * 18)) + "%",
            }} />
          </div>
        </div>
      </section>

      <div className="sn-ref-region">
        {(Object.keys(TRAFFIC_REGIONS) as TrafficRegionId[]).map((id) => (
          <button key={id} className={id === regionId ? "is-active" : ""} onClick={() => switchRegion(id)}>
            {TRAFFIC_REGIONS[id].name.replace("특별시", "").replace("광역시", "")}
          </button>
        ))}
      </div>
    </main>
  );
}
