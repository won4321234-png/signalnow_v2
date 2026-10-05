/**
 * Browser geolocation plus server-side nearest-intersection lookup.
 * Coordinates are used transiently for lookup and are not persisted by this hook.
 */

import { useState, useCallback, useEffect, useRef } from "react";

export type LocationError =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported"
  | "nearest_lookup_failed"
  | "location_accuracy_low";

export interface GeoCoords { lat: number; lng: number; accuracy: number; heading: number | null; speedMps: number | null; accelerationMps2: number | null; }
export interface NearestIntersection { crsrdId: string; crsrdNm: string; lat: number; lng: number; distanceMeters: number; speedMps: number | null; accelerationMps2: number | null; accuracy: number; }
export interface UseCurrentLocationResult {
  getLocation: () => void;
  loading: boolean;
  error: LocationError | null;
  location: GeoCoords | null;
  nearestIntersection: NearestIntersection | null;
}

const NEAREST_LOOKUP_INTERVAL_MS = 2500;
const NEAREST_LOOKUP_MIN_MOVE_METERS = 12;
const MAX_USABLE_ACCURACY_METERS = 150;

function distanceMeters(a: GeoCoords, b: GeoCoords): number {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function findNearestIntersection(coords: GeoCoords, signal: AbortSignal): Promise<NearestIntersection | null> {
  const storedRegion = window.localStorage.getItem("signalnow-region");
  const stdgCd = storedRegion === "ulsan" ? "3100000000" : "1100000000";
  const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng), accuracy: String(coords.accuracy), stdgCd });
  const response = await fetch(`/api/location/nearest?${params.toString()}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Nearest intersection API ${response.status}`);
  const payload = await response.json() as { found?: boolean; reason?: string; distanceMeters?: number; intersection?: { crsrdId?: string; crsrdNm?: string; lat?: number; lng?: number } };
  if (!payload.found || !payload.intersection?.crsrdId) return null;
  const lat = Number(payload.intersection.lat);
  const lng = Number(payload.intersection.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    crsrdId: String(payload.intersection.crsrdId),
    crsrdNm: String(payload.intersection.crsrdNm ?? ""),
    lat,
    lng,
    distanceMeters: Number(payload.distanceMeters ?? distanceMeters(coords, { lat, lng, accuracy: coords.accuracy, heading: coords.heading, speedMps: coords.speedMps, accelerationMps2: coords.accelerationMps2 })),
    speedMps: coords.speedMps,
    accelerationMps2: coords.accelerationMps2,
    accuracy: coords.accuracy,
  };
}

export function useCurrentLocation(): UseCurrentLocationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocationError | null>(null);
  const [location, setLocation] = useState<GeoCoords | null>(null);
  const [nearestIntersection, setNearestIntersection] = useState<NearestIntersection | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const nearestRequestRef = useRef<AbortController | null>(null);
  const lastNearestLookupAtRef = useRef(0);
  const lastNearestLookupLocationRef = useRef<GeoCoords | null>(null);
  const previousSpeedSampleRef = useRef<{ speedMps: number; at: number } | null>(null);

  const lookupNearest = useCallback((coords: GeoCoords) => {
    const now = Date.now();
    const previous = lastNearestLookupLocationRef.current;
    if (now - lastNearestLookupAtRef.current < NEAREST_LOOKUP_INTERVAL_MS) return;
    if (previous && distanceMeters(previous, coords) < NEAREST_LOOKUP_MIN_MOVE_METERS) return;
    if (!Number.isFinite(coords.accuracy) || coords.accuracy > MAX_USABLE_ACCURACY_METERS) {
      nearestRequestRef.current?.abort();
      nearestRequestRef.current = null;
      setNearestIntersection(null);
      setError("location_accuracy_low");
      return;
    }

    lastNearestLookupAtRef.current = now;
    lastNearestLookupLocationRef.current = coords;
    nearestRequestRef.current?.abort();
    const controller = new AbortController();
    nearestRequestRef.current = controller;

    void findNearestIntersection(coords, controller.signal)
      .then((nearest) => {
        if (controller.signal.aborted) return;
        setNearestIntersection(nearest);
        if (nearest) setError(null);
        else setError(null);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          console.warn("[SignalNow] nearest intersection lookup failed", requestError);
          setNearestIntersection(null);
          setError("nearest_lookup_failed");
        }
      });
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    nearestRequestRef.current?.abort();
    nearestRequestRef.current = null;
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setLocation(null);
      setNearestIntersection(null);
      setError("unsupported");
      return;
    }

    setLoading(true);
    setError(null);
    setLocation(null);
    setNearestIntersection(null);

    const handleSuccess = (pos: GeolocationPosition) => {
      const accuracy = Number(pos.coords.accuracy);
      const coords: GeoCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(accuracy) ? accuracy : Number.POSITIVE_INFINITY,
        heading: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : null,
        speedMps: Number.isFinite(pos.coords.speed ?? NaN) && (pos.coords.speed ?? 0) >= 0 ? pos.coords.speed : null,
        accelerationMps2: null,
      };
      if (coords.speedMps !== null) {
        const now = Date.now();
        const previous = previousSpeedSampleRef.current;
        if (previous && now > previous.at) {
          const dt = (now - previous.at) / 1000;
          if (dt > 0.2 && dt < 15) coords.accelerationMps2 = (coords.speedMps - previous.speedMps) / dt;
        }
        previousSpeedSampleRef.current = { speedMps: coords.speedMps, at: now };
      }
      setLocation(coords);
      setLoading(false);
      setError(coords.accuracy <= MAX_USABLE_ACCURACY_METERS ? null : "location_accuracy_low");
      lookupNearest(coords);
    };

    const handleError = (err: GeolocationPositionError) => {
      setLoading(false);
      setLocation(null);
      setNearestIntersection(null);
      if (err.code === 1) setError("permission_denied");
      else if (err.code === 2) setError("position_unavailable");
      else if (err.code === 3) setError("timeout");
      else setError("position_unavailable");
    };

    stopWatching();
    lastNearestLookupAtRef.current = 0;
    lastNearestLookupLocationRef.current = null;
    previousSpeedSampleRef.current = null;
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      timeout: 10_000,
      maximumAge: 5_000,
      enableHighAccuracy: true,
    });
  }, [lookupNearest, stopWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { getLocation, loading, error, location, nearestIntersection };
}
