import type {
  Intersection,
  TrafficMarkerData,
  TrafficSignal,
} from "@/types/traffic";

/**
 * Placeholder intersection data shaped exactly like the future KLID API
 * responses. Coordinates are realistic Seoul/Gyeonggi intersection
 * latitudes/longitudes so that swapping in the real API (or Kakao Maps)
 * requires no type changes.
 */

const now = Date.now();
const ts = (offset: number) => new Date(now - offset * 1000).toISOString();

function signal(
  direction: TrafficSignal["direction"],
  movement: TrafficSignal["movement"],
  state: TrafficSignal["state"],
  remainingSeconds: number,
  cycleSeconds: number
): TrafficSignal {
  return { direction, movement, state, remainingSeconds, cycleSeconds };
}

export const MOCK_INTERSECTIONS: Intersection[] = [
  {
    crsrdId: "CRSRD-11001",
    crsrdNm: "신복교차로",
    mapCtptIntLat: 37.2979,
    mapCtptIntLot: 126.9722,
    updatedAt: ts(3),
    signals: [
      signal("North", "Straight", "protected-Movement-Allowed", 18, 60),
      signal("North", "Left Turn", "stop-And-Remain", 42, 60),
      signal("East", "Straight", "protected-Movement-Allowed", 7, 55),
      signal("South", "Straight", "stop-And-Remain", 56, 70),
      signal("West", "Straight", "protected-Movement-Allowed", 13, 50),
    ],
  },
  {
    crsrdId: "CRSRD-22047",
    crsrdNm: "강남역 교차로",
    mapCtptIntLat: 37.4981,
    mapCtptIntLot: 127.0276,
    updatedAt: ts(5),
    signals: [
      signal("North", "Straight", "stop-And-Remain", 38, 65),
      signal("North", "Left Turn", "protected-clearance", 3, 25),
      signal("East", "Straight", "protected-Movement-Allowed", 22, 70),
      signal("East", "Right Turn", "protected-Movement-Allowed", 22, 70),
      signal("South", "Straight", "stop-And-Remain", 38, 65),
      signal("West", "Straight", "protected-Movement-Allowed", 22, 70),
    ],
  },
  {
    crsrdId: "CRSRD-33012",
    crsrdNm: "홍대입구 교차로",
    mapCtptIntLat: 37.5572,
    mapCtptIntLot: 126.9258,
    updatedAt: ts(8),
    signals: [
      signal("North", "Straight", "protected-Movement-Allowed", 31, 55),
      signal("North", "Pedestrian", "protected-Movement-Allowed", 31, 55),
      signal("East", "Straight", "stop-And-Remain", 24, 55),
      signal("South", "Straight", "protected-Movement-Allowed", 31, 55),
      signal("West", "Straight", "protected-clearance", 4, 40),
    ],
  },
  {
    crsrdId: "CRSRD-44088",
    crsrdNm: "종로2가 교차로",
    mapCtptIntLat: 37.5704,
    mapCtptIntLot: 126.9881,
    updatedAt: ts(12),
    signals: [
      signal("North", "Straight", "stop-And-Remain", 49, 60),
      signal("East", "Straight", "protected-Movement-Allowed", 11, 45),
      signal("East", "Left Turn", "protected-Movement-Allowed", 11, 45),
      signal("South", "Straight", "stop-And-Remain", 49, 60),
      signal("West", "Straight", "protected-Movement-Allowed", 11, 45),
    ],
  },
  {
    crsrdId: "CRSRD-55203",
    crsrdNm: "수원시청 교차로",
    mapCtptIntLat: 37.2636,
    mapCtptIntLot: 127.0286,
    updatedAt: ts(20),
    signals: [
      signal("North", "Straight", "protected-Movement-Allowed", 26, 50),
      signal("North", "Right Turn", "protected-Movement-Allowed", 26, 50),
      signal("East", "Straight", "stop-And-Remain", 19, 50),
      signal("South", "Straight", "protected-Movement-Allowed", 26, 50),
      signal("West", "Straight", "protected-clearance", 5, 35),
    ],
  },
];

/**
 * Marker positions on the map placeholder, expressed as percentages of the
 * map container. When Kakao Maps is integrated these will be replaced by
 * real lat/lng -> pixel projections.
 */
export const MOCK_MARKERS: TrafficMarkerData[] = [
  { intersectionId: "CRSRD-11001", position: { x: 28, y: 68 } },
  { intersectionId: "CRSRD-22047", position: { x: 54, y: 82 } },
  { intersectionId: "CRSRD-33012", position: { x: 38, y: 30 } },
  { intersectionId: "CRSRD-44088", position: { x: 62, y: 22 } },
  { intersectionId: "CRSRD-55203", position: { x: 76, y: 54 } },
];
