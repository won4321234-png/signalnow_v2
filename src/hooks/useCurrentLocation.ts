/**
 * Browser geolocation plus server-side nearest-intersection lookup.
 * Location coordinates are used transiently for the lookup and are not persisted by this client hook.
 */

import { useState, useCallback, useEffect, useRef } from "react";

export type LocationError =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported"
  | "nearest_lookup_failed";

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface NearestIntersection {
  crsrdId: string;
  crsrdNm: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface UseCurrentLocationResult {
  getLocation: () => void;
  loading: boolean;
  error: LocationError | null;
  location: GeoCoords | null;
  nearestIntersection: NearestIntersection | null;
}

const NEAREST_LOOKUP_INTERVAL_MS = 5000;
const NEAREST_LOOKUP_MIN_MOVE_METERS = 25;

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
  const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng), stdgCd });
  const response = await fetch(`/api/location/nearest?${params.toString()}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Nearest intersection API ${response.status}`);
  const payload = await response.json() as { found?: boolean; distanceMeters?: number; intersection?: { crsrdId?: string; crsrdNm?: string; lat?: number; lng?: number } };
  if (!payload.found || !payload.intersection?.crsrdId) return null;
  const lat = Number(payload.intersection.lat);
  const lng = Number(payload.intersection.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    crsrdId: String(payload.intersection.crsrdId),
    crsrdNm: String(payload.intersection.crsrdNm ?? ""),
    lat,
    lng,
    distanceMeters: Number(payload.distanceMeters ?? distanceMeters(coords, { lat, lng })),
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

  const lookupNearest = useCallback((coords: GeoCoords) => {
    const now = Date.now();
    const previous = lastNearestLookupLocationRef.current;
    if (now - lastNearestLookupAtRef.current < NEAREST_LOOKUP_INTERVAL_MS) return;
    if (previous && distanceMeters(previous, coords) < NEAREST_LOOKUP_MIN_MOVE_METERS) return;

    lastNearestLookupAtRef.current = now;
    lastNearestLookupLocationRef.current = coords;
    nearestRequestRef.current?.abort();
    const controller = new AbortController();
    nearestRequestRef.current = controller;
    void findNearestIntersection(coords, controller.signal)
      .then((nearest) => {
        if (!controller.signal.aborted) setNearestIntersection(nearest);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          console.warn("[SignalNow] nearest intersection lookup failed", requestError);
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
      setError("unsupported");
      return;
    }

    setLoading(true);
    setError(null);

    const handleSuccess = (pos: GeolocationPosition) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(coords);
      setLoading(false);
      setError(null);
      lookupNearest(coords);
    };

    const handleError = (err: GeolocationPositionError) => {
      setLoading(false);
      if (err.code === 1) setError("permission_denied");
      else if (err.code === 2) setError("position_unavailable");
      else if (err.code === 3) setError("timeout");
      else setError("position_unavailable");
    };

    stopWatching();
    lastNearestLookupAtRef.current = 0;
    lastNearestLookupLocationRef.current = null;
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      timeout: 10_000,
      maximumAge: 5_000,
      enableHighAccuracy: true,
    });
  }, [lookupNearest, stopWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { getLocation, loading, error, location, nearestIntersection };
}
