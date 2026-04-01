CREATE TABLE IF NOT EXISTS admin_user_blocks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT '',
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unblocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  unblocked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_user_blocks_active
  ON admin_user_blocks(blocked_at DESC)
  WHERE unblocked_at IS NULL;
