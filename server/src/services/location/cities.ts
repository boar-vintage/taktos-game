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
