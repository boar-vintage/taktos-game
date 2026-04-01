CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_external_id ON businesses(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE places ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_places_business_id ON places(business_id) WHERE business_id IS NOT NULL;
