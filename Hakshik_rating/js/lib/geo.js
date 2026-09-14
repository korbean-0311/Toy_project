// 좌표 ↔ 식당 매핑

const EARTH_R = 6_371_000; // m

export function distanceMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/**
 * 좌표에 해당하는 식당을 찾는다.
 * 반경 안에 여러 곳이 걸리면 가장 가까운 곳을 고른다.
 * @returns {{cafeteria: object, distance: number} | null}
 */
export function matchCafeteria(coords, cafeterias) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

  let best = null;
  for (const c of cafeterias) {
    const distance = distanceMeters(coords, c);
    if (distance > c.radius_m) continue;
    if (!best || distance < best.distance) best = { cafeteria: c, distance };
  }
  return best;
}

/** 단말 위치권한으로 현재 좌표를 얻는다. 거부/실패하면 null. */
export function currentPosition({ timeout = 8000 } = {}) {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}
