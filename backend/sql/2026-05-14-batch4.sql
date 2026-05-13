-- BATCH 4 — Comunicaciones (notifications, line movement snapshots)
-- Apply against Postgres. SQLite equivalents are created automatically by db-sqlite.js.

CREATE TABLE IF NOT EXISTS notifications_log (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT,
  type TEXT,
  subject TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_log_lookup ON notifications_log(channel, sent_at);

CREATE TABLE IF NOT EXISTS pick_odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pick_id BIGINT NOT NULL,
  odds NUMERIC NOT NULL,
  market TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_pick ON pick_odds_snapshots(pick_id, snapshot_at);
