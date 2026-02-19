CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('jobseeker', 'employer', 'recruiter', 'admin')),
  fraud_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_core BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  to_world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_world_id, to_world_id, name)
);

CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  address_text TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(world_id, name)
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(place_id, title, location_text)
);

CREATE TABLE IF NOT EXISTS presence (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unlock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'paid', 'refunded')),
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stripe_session_id TEXT,
  origin_world_id UUID REFERENCES worlds(id) ON DELETE SET NULL,
  attribution_world_id UUID REFERENCES worlds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS satellite_agreements (
  world_id UUID PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  rev_share_satellite INTEGER NOT NULL,
  rev_share_core INTEGER NOT NULL,
  api_fee_bps INTEGER NOT NULL,
  payout_schedule TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attribution_decay_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  rules_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_world_id ON places(world_id);
CREATE INDEX IF NOT EXISTS idx_jobs_place_id ON jobs(place_id);
CREATE INDEX IF NOT EXISTS idx_presence_world_id ON presence(world_id);
CREATE INDEX IF NOT EXISTS idx_presence_place_id ON presence(place_id);
CREATE INDEX IF NOT EXISTS idx_events_world_place_created ON events(world_id, place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unlock_transactions_world ON unlock_transactions(world_id, created_at DESC);
