import { pool } from './pool.js';

const places = [
  { name: 'Atlas Coffee', description: 'Startup pitch nights and hiring boards.', address: '101 Main Street' },
  { name: 'Forge Labs', description: 'Hardware + robotics storefront.', address: '108 Main Street' },
  { name: 'Signal Studio', description: 'Creative engineering collective.', address: '115 Main Street' },
  { name: 'Beacon Health', description: 'Digital health builders.', address: '122 Main Street' },
  { name: 'Northstar Fintech', description: 'Payments and fraud infrastructure.', address: '129 Main Street' },
  { name: 'Cinder AI', description: 'Applied ML product teams.', address: '136 Main Street' },
  { name: 'Orbit Logistics', description: 'Supply chain and operations tech.', address: '143 Main Street' }
];

const jobs = [
  ['Full-stack Engineer', 'Build high-velocity product features.'],
  ['DevOps Engineer', 'Own runtime and deployment reliability.'],
  ['Product Designer', 'Shape UX for power users.']
];

async function run() {
  const existing = await pool.query("SELECT id FROM worlds WHERE slug = 'core'");
  let coreWorldId: string;

  if (existing.rowCount) {
    coreWorldId = existing.rows[0]!.id;
  } else {
    const inserted = await pool.query(
      "INSERT INTO worlds (slug, name, is_core, status) VALUES ('core', 'Taktos Core World', TRUE, 'active') RETURNING id"
    );
    coreWorldId = inserted.rows[0]!.id;
  }

  const satellite = await pool.query(
    "INSERT INTO worlds (slug, name, is_core, status) VALUES ('techcrunch-world', 'TechCrunch World', FALSE, 'planned') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
  );
  const satelliteWorldId = satellite.rows[0]!.id;

  await pool.query(
    `INSERT INTO portals (from_world_id, to_world_id, name, is_required)
     VALUES ($1, $2, 'Return to Core', TRUE)
     ON CONFLICT (from_world_id, to_world_id, name) DO NOTHING`,
    [satelliteWorldId, coreWorldId]
  );

  await pool.query(
    `INSERT INTO satellite_agreements (world_id, rev_share_satellite, rev_share_core, api_fee_bps, payout_schedule)
     VALUES ($1, 7000, 3000, 250, 'monthly')
     ON CONFLICT (world_id) DO NOTHING`,
    [satelliteWorldId]
  );

  await pool.query(
    `INSERT INTO attribution_decay_rules (world_id, rules_json)
     VALUES ($1, '{"default":[{"days":30,"share_bps":8000},{"days":60,"share_bps":5000},{"days":90,"share_bps":2500}]}'::jsonb)
     ON CONFLICT DO NOTHING`,
    [satelliteWorldId]
  );

  for (const [index, place] of places.entries()) {
    const placeResult = await pool.query(
      `INSERT INTO places (world_id, name, description, address_text, is_featured)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [coreWorldId, place.name, place.description, place.address, index < 3]
    );

    let placeId = placeResult.rows[0]?.id as string | undefined;
    if (!placeId) {
      const row = await pool.query('SELECT id FROM places WHERE world_id = $1 AND name = $2', [coreWorldId, place.name]);
      placeId = row.rows[0]?.id;
    }

    if (!placeId) {
      continue;
    }

    for (const [title, description] of jobs) {
      await pool.query(
        `INSERT INTO jobs (place_id, title, description, location_text, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT DO NOTHING`,
        [placeId, title, description, place.address]
      );
    }
  }

  console.log('Seed complete');
  await pool.end();
}

run().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});
