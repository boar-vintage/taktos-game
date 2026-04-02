const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const IMPORT_RADIUS_M = 1000;
const MAX_RESULTS = 75;

export interface OsmPoi {
  osmId: string;
  name: string;
  category: 'food_bev' | 'retail';
  lat: number;
  lon: number;
  addressText: string;
}

function buildQuery(lat: number, lon: number): string {
  const around = `(around:${IMPORT_RADIUS_M},${lat},${lon})`;
  return `
[out:json][timeout:20];
(
  node["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery)$"]["name"]${around};
  node["shop"]["name"]${around};
  way["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery)$"]["name"]${around};
  way["shop"]["name"]${around};
);
out body center ${MAX_RESULTS};
`.trim();
}

function osmCategory(tags: Record<string, string>): 'food_bev' | 'retail' {
  const amenity = tags['amenity'] ?? '';
  if (/restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery/.test(amenity)) {
    return 'food_bev';
  }
  return 'retail';
}

function osmAddress(tags: Record<string, string>): string {
  const num = tags['addr:housenumber'] ?? '';
  const street = tags['addr:street'] ?? '';
  const city = tags['addr:city'] ?? '';
  if (num && street) return [num, street, city].filter(Boolean).join(', ');
  if (street) return [street, city].filter(Boolean).join(', ');
  return city || '';
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function queryPois(lat: number, lon: number): Promise<OsmPoi[]> {
  const body = buildQuery(lat, lon);

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(body)}`,
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status}`);
  }

  const json = (await res.json()) as { elements: OverpassElement[] };

  const pois: OsmPoi[] = [];
  const seen = new Set<string>();

  for (const el of json.elements) {
    const tags = el.tags ?? {};
    const name = tags['name'];
    if (!name) continue;

    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat === undefined || elLon === undefined) continue;

    const osmId = `osm:${el.type}:${el.id}`;
    if (seen.has(osmId)) continue;
    seen.add(osmId);

    pois.push({
      osmId,
      name,
      category: osmCategory(tags),
      lat: elLat,
      lon: elLon,
      addressText: osmAddress(tags),
    });
  }

  return pois;
}
