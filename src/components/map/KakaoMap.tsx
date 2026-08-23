import { useEffect, useRef, useCallback, useState } from "react";
import { MapPin, WifiOff } from "lucide-react";

import type { Intersection } from "@/types/traffic";
import { useKakaoLoader } from "@/hooks/useKakaoLoader";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { createMarkerElement, updateMarkerState } from "@/components/map/SignalMarker";
import { createIntersectionSignalOverlayElement, updateIntersectionSignalOverlayElement } from "@/components/map/IntersectionSignalOverlay";
import { CurrentLocationButton } from "@/components/map/CurrentLocationButton";
import { MapControls } from "@/components/map/MapControls";
import { cn } from "@/lib/utils";

type Viewport = { south: number; west: number; north: number; east: number };
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 } as const;
const DEFAULT_LEVEL = 9;
const VIEWPORT_PADDING_RATIO = 0.2;
const debugEnabled = () => new URLSearchParams(window.location.search).get("debug") === "1";

export interface KakaoMapProps {
  intersections: Intersection[];
  selectedIntersection: Intersection | null;
  selectedIntersectionId: string | null;
  favoriteIds: Set<string>;
  onSelectIntersection: (intersectionId: string) => void;
  onViewportChange?: (viewport: Viewport) => void;
  className?: string;
}

interface OverlayEntry { overlay: kakao.maps.CustomOverlay; element: HTMLElement; }
interface SignalOverlayEntry { overlay: kakao.maps.CustomOverlay; element: HTMLElement; }

function getViewport(map: kakao.maps.Map): Viewport | null {
  const bounds = map.getBounds?.();
  if (!bounds) return null;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latPad = (ne.getLat() - sw.getLat()) * VIEWPORT_PADDING_RATIO;
  const lngPad = (ne.getLng() - sw.getLng()) * VIEWPORT_PADDING_RATIO;
  return { south: sw.getLat() - latPad, west: sw.getLng() - lngPad, north: ne.getLat() + latPad, east: ne.getLng() + lngPad };
}

export function KakaoMap({ intersections, selectedIntersection, selectedIntersectionId, favoriteIds, onSelectIntersection, onViewportChange, className }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<Map<string, OverlayEntry>>(new Map());
  const signalOverlayRef = useRef<SignalOverlayEntry | null>(null);
  const userMarkerRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelectIntersection);
  const onViewportRef = useRef(onViewportChange);
  onSelectRef.current = onSelectIntersection;
  onViewportRef.current = onViewportChange;

  const [mapInstance, setMapInstance] = useState<kakao.maps.Map | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const { loaded: sdkLoaded, error: sdkError } = useKakaoLoader();
  const { getLocation, loading: locationLoading, error: locationError, location } = useCurrentLocation();

  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || mapRef.current) return;
    const map = new kakao.maps.Map(containerRef.current, { center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng), level: DEFAULT_LEVEL });
    let viewportTimer: number | null = null;
    const emitViewport = () => {
      if (viewportTimer) window.clearTimeout(viewportTimer);
      viewportTimer = window.setTimeout(() => {
        const viewport = getViewport(map);
        if (!viewport) return;
        setViewportRevision((revision) => revision + 1);
        onViewportRef.current?.(viewport);
      }, 150);
    };
    kakao.maps.event.addListener(map, "idle", emitViewport);
    mapRef.current = map;
    setMapInstance(map);
    emitViewport();
    return () => {
      kakao.maps.event.removeListener(map, "idle", emitViewport);
      if (viewportTimer) window.clearTimeout(viewportTimer);
      for (const { overlay } of overlaysRef.current.values()) overlay.setMap(null);
      overlaysRef.current.clear();
      if (signalOverlayRef.current) {
        signalOverlayRef.current.overlay.setMap(null);
        signalOverlayRef.current = null;
      }
      if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [sdkLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapInstance || !map) return;
    const bounds = map.getBounds?.();
    const visible = intersections.filter((intersection) => {
      if (!bounds) return true;
      return bounds.contain(new kakao.maps.LatLng(intersection.mapCtptIntLat, intersection.mapCtptIntLot));
    });
    const incoming = new Set(visible.map((intersection) => intersection.crsrdId));
    for (const [id, { overlay }] of overlaysRef.current) {
      if (!incoming.has(id)) { overlay.setMap(null); overlaysRef.current.delete(id); }
    }
    for (const intersection of visible) {
      const isSelected = selectedIntersectionId === intersection.crsrdId;
      const isFavorite = favoriteIds.has(intersection.crsrdId);
      const existing = overlaysRef.current.get(intersection.crsrdId);
      if (existing) {
        updateMarkerState(existing.element, isSelected, isFavorite, intersection);
        existing.overlay.setZIndex(isSelected ? 20 : 10);
        continue;
      }
      const element = createMarkerElement(intersection, isSelected, isFavorite);
      element.addEventListener("click", () => {
        if (debugEnabled()) console.log("[SignalNow debug] marker click", { intersectionId: intersection.crsrdId, crsrdId: intersection.crsrdId, hasCrsrdId: Boolean(intersection.crsrdId) });
        onSelectRef.current(intersection.crsrdId);
      });
      const overlay = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(intersection.mapCtptIntLat, intersection.mapCtptIntLot), content: element, xAnchor: 0.5, yAnchor: 1, zIndex: isSelected ? 20 : 10 });
      overlay.setMap(map);
      overlaysRef.current.set(intersection.crsrdId, { overlay, element });
    }
  }, [mapInstance, intersections, selectedIntersectionId, favoriteIds, viewportRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapInstance || !map) return;
    if (!selectedIntersection || selectedIntersectionId !== selectedIntersection.crsrdId || selectedIntersection.signals.length === 0) {
      if (signalOverlayRef.current) { signalOverlayRef.current.overlay.setMap(null); signalOverlayRef.current = null; }
      return;
    }
    const position = new kakao.maps.LatLng(selectedIntersection.mapCtptIntLat, selectedIntersection.mapCtptIntLot);
    const existing = signalOverlayRef.current;
    if (existing) {
      updateIntersectionSignalOverlayElement(existing.element, selectedIntersection);
      existing.overlay.setPosition(position);
      existing.overlay.setZIndex(15);
      return;
    }
    const element = createIntersectionSignalOverlayElement(selectedIntersection);
    const overlay = new kakao.maps.CustomOverlay({ position, content: element, xAnchor: 0.5, yAnchor: 0.5, zIndex: 15 });
    overlay.setMap(map);
    signalOverlayRef.current = { overlay, element };
  }, [mapInstance, selectedIntersection, selectedIntersectionId]);

  useEffect(() => {
    const previous = prevSelectedRef.current;
    const current = selectedIntersectionId;
    if (previous === current) return;
    if (previous) {
      const entry = overlaysRef.current.get(previous);
      const intersection = intersections.find((item) => item.crsrdId === previous);
      if (entry && intersection) { updateMarkerState(entry.element, false, favoriteIds.has(previous), intersection); entry.overlay.setZIndex(10); }
    }
    if (current) {
      const entry = overlaysRef.current.get(current);
      const intersection = intersections.find((item) => item.crsrdId === current);
      if (entry && intersection) {
        updateMarkerState(entry.element, true, favoriteIds.has(current), intersection);
        entry.overlay.setZIndex(20);
        mapRef.current?.panTo(new kakao.maps.LatLng(intersection.mapCtptIntLat, intersection.mapCtptIntLot));
      }
    }
    prevSelectedRef.current = current;
  }, [selectedIntersectionId, intersections, favoriteIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!location || !map) return;
    const latlng = new kakao.maps.LatLng(location.lat, location.lng);
    if (userMarkerRef.current) userMarkerRef.current.setPosition(latlng);
    else {
      const element = document.createElement("div");
      element.style.cssText = "width:16px;height:16px;background:var(--primary);border-radius:50%;border:3px solid white;box-shadow:var(--shadow-md);flex-shrink:0;";
      const marker = new kakao.maps.CustomOverlay({ position: latlng, content: element, xAnchor: 0.5, yAnchor: 0.5, zIndex: 30 });
      marker.setMap(map);
      userMarkerRef.current = marker;
    }
    map.panTo(latlng);
    map.setLevel(5);
  }, [location]);

  const handleLocate = useCallback(() => getLocation(), [getLocation]);

  if (sdkError) return <div className={cn("flex h-full w-full items-center justify-center bg-muted", className)}><div className="flex flex-col items-center gap-3 px-6 text-center"><WifiOff className="size-10 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">지도를 불러올 수 없습니다</p><p className="text-xs text-muted-foreground">카카오맵 API 키를 확인하거나 네트워크 상태를 점검하세요</p></div></div>;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="교차로 지도" />
      {!sdkLoaded && <div className="absolute inset-0 z-10 flex items-center justify-center bg-map-surface animate-fade-in"><div className="flex flex-col items-center gap-3"><MapPin className="size-10 animate-bounce text-primary" /><p className="text-sm font-medium text-muted-foreground">카카오맵 불러오는 중…</p></div></div>}
      <MapControls map={mapInstance} />
      <CurrentLocationButton onLocate={handleLocate} loading={locationLoading} error={locationError} className="absolute bottom-24 right-4 z-20" />
    </div>
  );
}

export default KakaoMap;
