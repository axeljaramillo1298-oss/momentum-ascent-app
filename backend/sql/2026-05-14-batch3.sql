-- Embeddings
CREATE TABLE IF NOT EXISTS pick_embeddings (
  pick_id BIGINT PRIMARY KEY,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate limit
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON rate_limit_events(user_key, bucket, created_at);
