CREATE TABLE IF NOT EXISTS resume_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  dropped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  still_interested BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '180 days',
  UNIQUE(user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_drops_place_id ON resume_drops(place_id);
CREATE INDEX IF NOT EXISTS idx_resume_drops_user_id ON resume_drops(user_id);
