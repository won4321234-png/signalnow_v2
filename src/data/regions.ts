export type TrafficRegionId =
  | "seoul" | "busan" | "daegu" | "incheon" | "gwangju" | "daejeon" | "ulsan" | "sejong"
  | "gyeonggi" | "gangwon" | "chungbuk" | "chungnam" | "jeonbuk" | "jeonnam"
  | "gyeongbuk" | "gyeongnam" | "jeju";

export type TrafficRegionAvailability = "active" | "planned";

export interface TrafficRegion {
  id: TrafficRegionId;
  name: string;
  stdgCd: string;
  center: { lat: number; lng: number };
  level: number;
  /** Active means the region can be queried through the shared provider; it does not guarantee upstream coverage. */
  availability: TrafficRegionAvailability;
  /** Human-readable status shown in the region selector. */
  statusLabel: string;
}

const queryable = (id: TrafficRegionId, name: string, stdgCd: string, lat: number, lng: number): TrafficRegion => ({
  id, name, stdgCd, center: { lat, lng }, level: 9, availability: "active", statusLabel: "연동 확인 필요",
});

export const TRAFFIC_REGIONS: Record<TrafficRegionId, TrafficRegion> = {
  seoul: { ...queryable("seoul", "서울특별시", "1100000000", 37.5665, 126.978), statusLabel: "기존 서비스" },
  busan: queryable("busan", "부산광역시", "2600000000", 35.1796, 129.0756),
  daegu: queryable("daegu", "대구광역시", "2700000000", 35.8714, 128.6014),
  incheon: queryable("incheon", "인천광역시", "2800000000", 37.4563, 126.7052),
  gwangju: queryable("gwangju", "광주광역시", "2900000000", 35.1595, 126.8526),
  daejeon: queryable("daejeon", "대전광역시", "3000000000", 36.3504, 127.3845),
  ulsan: { ...queryable("ulsan", "울산광역시", "3100000000", 35.5383773, 129.3113596), statusLabel: "기존 서비스" },
  sejong: queryable("sejong", "세종특별자치시", "3611000000", 36.4801, 127.2892),
  gyeonggi: queryable("gyeonggi", "경기도", "4100000000", 37.4138, 127.5183),
  gangwon: queryable("gangwon", "강원특별자치도", "4200000000", 37.8228, 128.1555),
  chungbuk: queryable("chungbuk", "충청북도", "4300000000", 36.6357, 127.4912),
  chungnam: queryable("chungnam", "충청남도", "4400000000", 36.6588, 126.6728),
  jeonbuk: queryable("jeonbuk", "전북특별자치도", "4500000000", 35.7175, 127.153),
  jeonnam: queryable("jeonnam", "전라남도", "4600000000", 34.8679, 126.991),
  gyeongbuk: queryable("gyeongbuk", "경상북도", "4700000000", 36.4919, 128.8889),
  gyeongnam: queryable("gyeongnam", "경상남도", "4800000000", 35.4606, 128.2132),
  jeju: queryable("jeju", "제주특별자치도", "5000000000", 33.4996, 126.5312),
};

export const DEFAULT_TRAFFIC_REGION: TrafficRegionId = "seoul";

export function isTrafficRegionAvailable(regionId: TrafficRegionId): boolean {
  return TRAFFIC_REGIONS[regionId].availability === "active";
}
