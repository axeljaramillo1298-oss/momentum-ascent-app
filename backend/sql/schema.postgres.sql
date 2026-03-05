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
