/**
 * Wraps the browser Geolocation API in a React hook.
 * Handles the three standard error codes plus the "unsupported browser" case.
 */

import { useState, useCallback } from "react";

export type LocationError =
  | "permission_denied"    // User rejected the permission prompt
  | "position_unavailable" // GPS / network error
  | "timeout"              // Request took too long
  | "unsupported";         // Browser has no geolocation API

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface UseCurrentLocationResult {
  /** Trigger a one-shot location request. */
  getLocation: () => void;
  /** True while the browser is fetching the position. */
  loading: boolean;
  /** Null when there is no error; set after a failed request. */
  error: LocationError | null;
  /** Most-recent successful location, or null before the first success. */
  location: GeoCoords | null;
}

export function useCurrentLocation(): UseCurrentLocationResult {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<LocationError | null>(null);
  const [location, setLocation] = useState<GeoCoords | null>(null);

  const getLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setError("unsupported");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        // GeolocationPositionError codes: 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT
        if (err.code === 1)      setError("permission_denied");
        else if (err.code === 2) setError("position_unavailable");
        else if (err.code === 3) setError("timeout");
        else                     setError("position_unavailable");
      },
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: true },
    );
  }, []);

  return { getLocation, loading, error, location };
}
