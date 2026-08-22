/**
 * Ambient type declarations for the Kakao Maps JavaScript SDK.
 * The SDK is loaded dynamically at runtime — these declarations let TypeScript
 * understand the global `kakao` namespace without importing anything.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace kakao {
  namespace maps {
    /** Initializes the Kakao Maps SDK after the script tag loads (autoload=false). */
    function load(callback: () => void): void;

    /** Predefined positions for map controls. */
    const ControlPosition: {
      TOP: number;
      TOPLEFT: number;
      TOPRIGHT: number;
      LEFT: number;
      RIGHT: number;
      BOTTOMLEFT: number;
      BOTTOM: number;
      BOTTOMRIGHT: number;
    };

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(latlng: LatLng): void;
      contain(latlng: LatLng): boolean;
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    interface MapOptions {
      center: LatLng;
      level: number;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number, options?: { animate?: boolean | { duration?: number } }): void;
      getLevel(): number;
      panTo(latlng: LatLng): void;
      getBounds(): LatLngBounds;
      setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
      setMaxLevel(maxLevel: number): void;
      addControl(control: object, position: number): void;
    }

    class ZoomControl {}
    class MapTypeControl {}
    class ScaleControl {}

    interface CustomOverlayOptions {
      position: LatLng;
      content: HTMLElement | string;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
      map?: Map;
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
      setContent(content: HTMLElement | string): void;
      setZIndex(zIndex: number): void;
    }

    namespace event {
      function addListener(target: object, type: string, handler: (...args: any[]) => void): void;
      function removeListener(target: object, type: string, handler: (...args: any[]) => void): void;
    }
  }
}

/** Extend Window so the loader can check for SDK presence before injecting. */
interface Window {
  kakao: typeof kakao;
}
