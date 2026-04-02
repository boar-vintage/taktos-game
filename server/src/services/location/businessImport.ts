import { pool } from '../../db/pool.js';
import type { SupportedCity } from './cities.js';
import { queryPois } from './overpass.js';

const SKIP_IMPORT_THRESHOLD = 10;

export async function getOrCreateCityWorld(city: SupportedCity): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM worlds WHERE slug = $1`,
    [city.slug]
  );
  if (existing.rowCount) {
    return existing.rows[0]!.id;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO worlds (slug, name, is_core, status)
     VALUES ($1, $2, FALSE, 'active')
     RETURNING id`,
    [city.slug, city.name]
  );
  return inserted.rows[0]!.id;
}

export async function importBusinessesForCity(
  city: SupportedCity,
  worldId: string,
  userLat: number,
  userLon: number
): Promise<void> {
  const count = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM places WHERE world_id = $1`,
    [worldId]
  );
  if (parseInt(count.rows[0]!.n, 10) >= SKIP_IMPORT_THRESHOLD) {
    return;
  }

  let pois;
  try {
    pois = await queryPois(userLat, userLon);
  } catch {
    return;
  }

  for (const poi of pois) {
    const biz = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, description, category, address_text, latitude, longitude, external_id, website_url, logo_url)
       VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE
         SET name = EXCLUDED.name,
             category = EXCLUDED.category,
             address_text = EXCLUDED.address_text,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             website_url = COALESCE(EXCLUDED.website_url, businesses.website_url),
             logo_url = COALESCE(EXCLUDED.logo_url, businesses.logo_url)
       RETURNING id`,
      [poi.name, poi.category, poi.addressText, poi.lat, poi.lon, poi.osmId, poi.websiteUrl, poi.logoUrl]
    );
    const businessId = biz.rows[0]!.id;

    await pool.query(
      `INSERT INTO places (world_id, name, description, address_text, business_id)
       VALUES ($1, $2, '', $3, $4)
       ON CONFLICT DO NOTHING`,
      [worldId, poi.name, poi.addressText, businessId]
    );
  }
}

export async function setUserHomeWorld(userId: string, worldId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET home_world_id = $1 WHERE id = $2`,
    [worldId, userId]
  );
}

export async function setUserHomeCoords(userId: string, lat: number, lon: number): Promise<void> {
  await pool.query(
    `UPDATE users SET home_lat = $2, home_lon = $3 WHERE id = $1`,
    [userId, lat, lon]
  );
}

export async function getUserHomeCoords(userId: string): Promise<{ lat: number; lon: number } | null> {
  const result = await pool.query<{ home_lat: number | null; home_lon: number | null }>(
    `SELECT home_lat, home_lon FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row || row.home_lat == null || row.home_lon == null) return null;
  return { lat: row.home_lat, lon: row.home_lon };
}

export async function getUserHomeWorldSlug(userId: string): Promise<string | null> {
  const result = await pool.query<{ slug: string }>(
    `SELECT w.slug FROM users u
     JOIN worlds w ON w.id = u.home_world_id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0]?.slug ?? null;
}
