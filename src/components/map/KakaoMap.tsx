/**
 * Real Kakao Maps component that replaces the static MapPlaceholder.
 *
 * Responsibilities:
 *  - Loads the Kakao SDK via useKakaoLoader (singleton — never loads twice)
 *  - Creates the kakao.maps.Map instance once the SDK is ready
 *  - Syncs CustomOverlay markers with the `intersections` prop
 *  - Updates selection / favourite state without recreating overlays
 *  - Pans to the selected intersection and to the user's current location
 *  - Renders a loading skeleton and an error state
 *  - Adds native zoom, map-type, and scale controls via MapControls
 *  - Hosts the CurrentLocationButton as a floating React overlay
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { MapPin, WifiOff } from "lucide-react";

import type { Intersection } from "@/types/traffic";
import { useKakaoLoader } from "@/hooks/useKakaoLoader";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import {
  createMarkerElement,
  updateMarkerState,
} from "@/components/map/SignalMarker";
import { CurrentLocationButton } from "@/components/map/CurrentLocationButton";
import { MapControls } from "@/components/map/MapControls";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Geographic centre of South Korea */
const DEFAULT_CENTER = { lat: 36.5, lng: 127.8 } as const;
const DEFAULT_LEVEL  = 13;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KakaoMapProps {
  intersections: Intersection[];
  selectedIntersectionId: string | null;
  favoriteIds: Set<string>;
  onSelectIntersection: (intersectionId: string) => void;
  className?: string;
}

interface OverlayEntry {
  overlay: kakao.maps.CustomOverlay;
  element: HTMLElement;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KakaoMap({
  intersections,
  selectedIntersectionId,
  favoriteIds,
  onSelectIntersection,
  className,
}: KakaoMapProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<kakao.maps.Map | null>(null);
  const overlaysRef    = useRef<Map<string, OverlayEntry>>(new Map());
  const userMarkerRef  = useRef<kakao.maps.CustomOverlay | null>(null);
  const prevSelectedRef = useRef<string | null>(null);

  // Stable ref for the callback so marker click-handlers never go stale
  const onSelectRef = useRef(onSelectIntersection);
  onSelectRef.current = onSelectIntersection;

  // State version of the map instance — triggers dependent effects/components
  const [mapInstance, setMapInstance] = useState<kakao.maps.Map | null>(null);

  const { loaded: sdkLoaded, error: sdkError } = useKakaoLoader();
  const {
    getLocation,
    loading: locationLoading,
    error:   locationError,
    location,
  } = useCurrentLocation();

  // ── 1. Initialise map once SDK is ready ──────────────────────────────────────
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || mapRef.current) return;

    const map = new kakao.maps.Map(containerRef.current, {
      center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      level:  DEFAULT_LEVEL,
    });

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      // Clean up on unmount
      for (const { overlay } of overlaysRef.current.values()) overlay.setMap(null);
      overlaysRef.current.clear();
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
        userMarkerRef.current = null;
      }
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [sdkLoaded]);

  // ── 2. Sync intersection markers with the map ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapInstance || !map) return;

    const incoming = new Set(intersections.map((i) => i.crsrdId));

    // Remove overlays for intersections that have disappeared
    for (const [id, { overlay }] of overlaysRef.current) {
      if (!incoming.has(id)) {
        overlay.setMap(null);
        overlaysRef.current.delete(id);
      }
    }

    // Add new / update existing overlays
    for (const intersection of intersections) {
      const isSelected = selectedIntersectionId === intersection.crsrdId;
      const isFavorite = favoriteIds.has(intersection.crsrdId);
      const existing   = overlaysRef.current.get(intersection.crsrdId);

      if (existing) {
        updateMarkerState(existing.element, isSelected, isFavorite, intersection);
        existing.overlay.setZIndex(isSelected ? 20 : 10);
      } else {
        const element = createMarkerElement(intersection, isSelected, isFavorite);

        // Use a ref-backed handler so the closure never goes stale
        element.addEventListener("click", () =>
          onSelectRef.current(intersection.crsrdId),
        );

        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(
            intersection.mapCtptIntLat,
            intersection.mapCtptIntLot,
          ),
          content: element,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex:  isSelected ? 20 : 10,
        });
        overlay.setMap(map);
        overlaysRef.current.set(intersection.crsrdId, { overlay, element });
      }
    }
  }, [mapInstance, intersections, selectedIntersectionId, favoriteIds]);

  // ── 3. Update selection visuals without recreating overlays ─────────────────
  useEffect(() => {
    const prev = prevSelectedRef.current;
    const curr = selectedIntersectionId;
    if (prev === curr) return;

    // Deselect the previously selected marker
    if (prev) {
      const entry        = overlaysRef.current.get(prev);
      const intersection = intersections.find((i) => i.crsrdId === prev);
      if (entry && intersection) {
        updateMarkerState(entry.element, false, favoriteIds.has(prev), intersection);
        entry.overlay.setZIndex(10);
      }
    }

    // Select the newly chosen marker and pan to it
    if (curr) {
      const entry        = overlaysRef.current.get(curr);
      const intersection = intersections.find((i) => i.crsrdId === curr);
      if (entry && intersection) {
        updateMarkerState(entry.element, true, favoriteIds.has(curr), intersection);
        entry.overlay.setZIndex(20);
        mapRef.current?.panTo(
          new kakao.maps.LatLng(
            intersection.mapCtptIntLat,
            intersection.mapCtptIntLot,
          ),
        );
      }
    }

    prevSelectedRef.current = curr;
  }, [selectedIntersectionId, intersections, favoriteIds]);

  // ── 4. Move map to user's current location ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!location || !map) return;

    const latlng = new kakao.maps.LatLng(location.lat, location.lng);

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(latlng);
    } else {
      // Simple blue-dot marker for the user's position
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;background:var(--primary);border-radius:50%;" +
        "border:3px solid white;box-shadow:var(--shadow-md);flex-shrink:0;";

      const marker = new kakao.maps.CustomOverlay({
        position: latlng,
        content:  el,
        xAnchor:  0.5,
        yAnchor:  0.5,
        zIndex:   30,
      });
      marker.setMap(map);
      userMarkerRef.current = marker;
    }

    map.panTo(latlng);
    map.setLevel(5);
  }, [location]);

  const handleLocate = useCallback(() => getLocation(), [getLocation]);

  // ── SDK error state ──────────────────────────────────────────────────────────
  if (sdkError) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <WifiOff className="size-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            지도를 불러올 수 없습니다
          </p>
          <p className="text-xs text-muted-foreground">
            카카오맵 API 키를 확인하거나 네트워크 상태를 점검하세요
          </p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Kakao Maps container — must be full-size for the SDK to render */}
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="교차로 지도"
      />

      {/* Loading skeleton shown until the SDK fires its ready callback */}
      {!sdkLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-map-surface animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <MapPin className="size-10 animate-bounce text-primary" />
            <p className="text-sm font-medium text-muted-foreground">
              카카오맵 불러오는 중…
            </p>
          </div>
        </div>
      )}

      {/* Native Kakao controls (zoom / map-type / scale) — renders null */}
      <MapControls map={mapInstance} />

      {/* Current location floating button */}
      <CurrentLocationButton
        onLocate={handleLocate}
        loading={locationLoading}
        error={locationError}
        className="absolute bottom-24 right-4 z-20"
      />
    </div>
  );
}

export default KakaoMap;
