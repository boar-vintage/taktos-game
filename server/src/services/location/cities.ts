export interface SupportedCity {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export const SUPPORTED_CITIES: SupportedCity[] = [
  { slug: 'los-angeles', name: 'Los Angeles', lat: 34.0522, lon: -118.2437, radiusKm: 50 },
  { slug: 'san-diego',   name: 'San Diego',   lat: 32.7157, lon: -117.1611, radiusKm: 30 },
  { slug: 'austin',      name: 'Austin',      lat: 30.2672, lon:  -97.7431, radiusKm: 30 },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function findCity(lat: number, lon: number): SupportedCity | null {
  for (const city of SUPPORTED_CITIES) {
    if (haversineKm(lat, lon, city.lat, city.lon) <= city.radiusKm) {
      return city;
    }
  }
  return null;
}

export function getCityBySlug(slug: string): SupportedCity | null {
  return SUPPORTED_CITIES.find((c) => c.slug === slug) ?? null;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const;
const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function wayfinding(
  fromLat: number, fromLon: number,
  toLat: number,   toLon: number
): string {
  const dist = haversineKm(fromLat, fromLon, toLat, toLon);

  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLon - fromLon) * Math.PI) / 180;
  const bearing =
    (Math.atan2(
      Math.sin(Δλ) * Math.cos(φ2),
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    ) * 180 / Math.PI + 360) % 360;

  const idx = Math.round(bearing / 45) % 8;
  const arrow = ARROWS[idx]!;
  const label = LABELS[idx]!;

  const distStr = dist < 1
    ? `${Math.round(dist * 1000)}m`
    : `${dist.toFixed(1)}km`;

  return `${arrow} ${label} ${distStr}`;
}
