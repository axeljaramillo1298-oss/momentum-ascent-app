CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'Free',
  goal TEXT DEFAULT '',
  checkin_schedule TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  completed_days INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  duration TEXT NOT NULL,
  week_key TEXT NOT NULL DEFAULT '',
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nutrition_plans (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'admin_ai',
  routine TEXT DEFAULT '',
  diet TEXT DEFAULT '',
  message TEXT DEFAULT '',
  week_key TEXT NOT NULL DEFAULT '',
  assigned_for_week TEXT NOT NULL DEFAULT '',
  created_by TEXT DEFAULT 'admin',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_seconds INTEGER NOT NULL DEFAULT 0,
  penalty_minutes INTEGER NOT NULL DEFAULT 0,
  date_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS support_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  extras_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  method TEXT NOT NULL DEFAULT 'transfer',
  proof_target TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free',
  plan_label TEXT NOT NULL DEFAULT 'Free',
  extras_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'inactive',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_whatsapp_flows (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  target_user_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL DEFAULT 'admin_ai',
  provider TEXT NOT NULL DEFAULT 'fallback',
  model TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'served',
  reason TEXT DEFAULT '',
  prompt_chars INTEGER NOT NULL DEFAULT 0,
  context_chars INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sports_events (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS event_stats (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,
  source_api TEXT NOT NULL,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_picks (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,
  pick TEXT NOT NULL,
  market TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  analysis TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'MEDIO',
  model_used TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'generated',
  plan_tier TEXT NOT NULL DEFAULT 'free',
  full_data TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS api_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  source_api TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE routines ADD COLUMN IF NOT EXISTS week_key TEXT NOT NULL DEFAULT '';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS week_key TEXT NOT NULL DEFAULT '';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assigned_for_week TEXT NOT NULL DEFAULT '';
