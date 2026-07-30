/**
 * Attaches Kakao Maps' native UI controls to the map instance.
 * Renders nothing itself — all work is done imperatively via the Kakao API.
 *
 * Controls added:
 *  - ZoomControl     → RIGHT
 *  - MapTypeControl  → TOPRIGHT  (satellite / hybrid / normal toggle)
 *  - ScaleControl    → BOTTOMRIGHT
 */

import { useEffect } from "react";

interface MapControlsProps {
  /** The Kakao map instance. Controls are added once when this becomes non-null. */
  map: kakao.maps.Map | null;
}

export function MapControls({ map }: MapControlsProps) {
  useEffect(() => {
    if (!map) return;

    const { ZoomControl, MapTypeControl, ScaleControl, ControlPosition } =
      window.kakao.maps;

    map.addControl(new ZoomControl(),    ControlPosition.RIGHT);
    map.addControl(new MapTypeControl(), ControlPosition.TOPRIGHT);
    map.addControl(new ScaleControl(),   ControlPosition.BOTTOMRIGHT);
    // kakao.maps.Map has no removeControl — controls live for the map's lifetime
  }, [map]);

  return null;
}
