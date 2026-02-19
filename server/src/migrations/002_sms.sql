CREATE TABLE IF NOT EXISTS sms_allowlist (
  phone_e164 TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_invite_codes (
  code TEXT PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_consent (
  phone_e164 TEXT PRIMARY KEY,
  consented_at TIMESTAMPTZ NOT NULL,
  consent_source TEXT NOT NULL,
  stopped_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_usage_daily (
  phone_e164 TEXT NOT NULL,
  day_date DATE NOT NULL,
  inbound_count INTEGER NOT NULL DEFAULT 0 CHECK (inbound_count >= 0),
  outbound_count INTEGER NOT NULL DEFAULT 0 CHECK (outbound_count >= 0),
  PRIMARY KEY (phone_e164, day_date)
);

CREATE TABLE IF NOT EXISTS sms_sessions (
  phone_e164 TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  last_menu_type TEXT CHECK (last_menu_type IN ('map', 'place', 'jobs')),
  last_menu_items_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_burst_limits (
  phone_e164 TEXT PRIMARY KEY,
  last_inbound_at TIMESTAMPTZ NOT NULL,
  last_warned_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_gate_notices (
  phone_e164 TEXT PRIMARY KEY,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_allowlist_status ON sms_allowlist(status);
CREATE INDEX IF NOT EXISTS idx_sms_invite_codes_world ON sms_invite_codes(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_usage_daily_day ON sms_usage_daily(day_date);
CREATE INDEX IF NOT EXISTS idx_sms_sessions_world_place ON sms_sessions(world_id, place_id);
