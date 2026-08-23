export type TrafficRegionId = "seoul" | "ulsan";

export interface TrafficRegion {
  id: TrafficRegionId;
  name: string;
  stdgCd: string;
  center: { lat: number; lng: number };
  level: number;
}

export const TRAFFIC_REGIONS: Record<TrafficRegionId, TrafficRegion> = {
  seoul: {
    id: "seoul",
    name: "서울특별시",
    stdgCd: "1100000000",
    center: { lat: 37.5665, lng: 126.978 },
    level: 9,
  },
  ulsan: {
    id: "ulsan",
    name: "울산광역시",
    stdgCd: "3100000000",
    center: { lat: 35.5383773, lng: 129.3113596 },
    level: 9,
  },
};

export const DEFAULT_TRAFFIC_REGION: TrafficRegionId = "seoul";
