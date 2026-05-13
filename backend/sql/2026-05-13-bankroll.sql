-- Bankroll Tracker tables
-- NOTE: user_id is TEXT (not BIGINT) to match the existing users.id TEXT primary key
-- used across the codebase (see users.id, metrics.user_id, subscriptions.user_id, etc.)
CREATE TABLE IF NOT EXISTS user_bankroll (
  user_id TEXT PRIMARY KEY,
  initial_amount NUMERIC NOT NULL DEFAULT 0,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  default_unit NUMERIC NOT NULL DEFAULT 100,
  currency TEXT NOT NULL DEFAULT 'MXN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_pick_bets (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  pick_id BIGINT NOT NULL,
  stake NUMERIC NOT NULL,
  odds NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  payout NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_pick_bets_user ON user_pick_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pick_bets_pick ON user_pick_bets(pick_id);
