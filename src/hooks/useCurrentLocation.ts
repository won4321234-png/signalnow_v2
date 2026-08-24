/**
 * Wraps the browser Geolocation API in a React hook.
 * Once the user grants permission, the hook continuously watches the
 * device position so the map can keep the user's location marker updated.
 */

import { useState, useCallback, useEffect, useRef } from "react";

export type LocationError =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported";

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface UseCurrentLocationResult {
  /** Request location permission and start continuous tracking. */
  getLocation: () => void;
  /** True while the initial location is being fetched. */
  loading: boolean;
  /** Null when there is no current location error. */
  error: LocationError | null;
  /** Most-recent successful location. */
  location: GeoCoords | null;
}

export function useCurrentLocation(): UseCurrentLocationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocationError | null>(null);
  const [location, setLocation] = useState<GeoCoords | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setError("unsupported");
      return;
    }

    setLoading(true);
    setError(null);

    const handleSuccess = (pos: GeolocationPosition) => {
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLoading(false);
      setError(null);
    };

    const handleError = (err: GeolocationPositionError) => {
      setLoading(false);
      if (err.code === 1) setError("permission_denied");
      else if (err.code === 2) setError("position_unavailable");
      else if (err.code === 3) setError("timeout");
      else setError("position_unavailable");
    };

    // Start a continuous watch. The browser will ask for permission here if
    // permission has not already been granted. Once granted, every position
    // update flows into `location`, keeping the map marker current.
    stopWatching();
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      timeout: 10_000,
      maximumAge: 5_000,
      enableHighAccuracy: true,
    });
  }, [stopWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { getLocation, loading, error, location };
}
