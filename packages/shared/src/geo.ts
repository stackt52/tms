export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Road-distance estimate: great-circle × detour factor (Zambian trunk roads ≈ 1.2–1.3). */
export const ROAD_DETOUR_FACTOR = 1.25;

export function estimateRoadKm(a: GeoPoint, b: GeoPoint): number {
  return Math.round(haversineKm(a, b) * ROAD_DETOUR_FACTOR);
}
