export type TrafficRegionId = "seoul" | "ulsan" | "busan";

export type TrafficRegionAvailability = "active" | "planned";

export interface TrafficRegion {
  id: TrafficRegionId;
  name: string;
  stdgCd: string;
  center: { lat: number; lng: number };
  level: number;
  /** Only active regions may be selected and queried by the client. */
  availability: TrafficRegionAvailability;
  /** Human-readable status shown in the region selector. */
  statusLabel: string;
}

export const TRAFFIC_REGIONS: Record<TrafficRegionId, TrafficRegion> = {
  seoul: {
    id: "seoul",
    name: "서울특별시",
    stdgCd: "1100000000",
    center: { lat: 37.5665, lng: 126.978 },
    level: 9,
    availability: "active",
    statusLabel: "서비스 중",
  },
  ulsan: {
    id: "ulsan",
    name: "울산광역시",
    stdgCd: "3100000000",
    center: { lat: 35.5383773, lng: 129.3113596 },
    level: 9,
    availability: "active",
    statusLabel: "서비스 중",
  },
  busan: {
    id: "busan",
    name: "부산광역시",
    stdgCd: "2600000000",
    center: { lat: 35.1796, lng: 129.0756 },
    level: 9,
    availability: "planned",
    statusLabel: "데이터 연동 검증 중",
  },
};

export const DEFAULT_TRAFFIC_REGION: TrafficRegionId = "seoul";

export function isTrafficRegionAvailable(regionId: TrafficRegionId): boolean {
  return TRAFFIC_REGIONS[regionId].availability === "active";
}
