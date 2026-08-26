declare namespace kakao.maps {
  interface MarkerOptions {
    position: LatLng;
    map?: Map;
    draggable?: boolean;
    zIndex?: number;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    getPosition(): LatLng;
  }
}
