const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL_required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const DB_META = {
  client: "postgres",
};

const nowIso = () => new Date().toISOString();
const safeStr = (value) => String(value || "").trim();
const normalizeEmail = (value) => safeStr(value).toLowerCase();
const parseJsonSafe = (raw, fallback = {}) => {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const parseJsonArraySafe = (raw, fallback = []) => {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.values(parsed);
      return fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === "object") {
    return Object.values(raw);
  }
  return fallback;
};
const toJsonString = (value, fallback = {}) => {
  if (value === null || value === undefined) return JSON.stringify(fallback);
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value);
};

const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS ai_pick_candidates (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL DEFAULT '',
  candidate_index INTEGER NOT NULL DEFAULT 0,
  pick TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 0,
  analysis TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'MEDIO',
  provider TEXT NOT NULL DEFAULT 'openai',
  model_used TEXT NOT NULL DEFAULT '',
  is_claude_selected BOOLEAN NOT NULL DEFAULT false,
  claude_reasoning TEXT NOT NULL DEFAULT '',
  published_pick_id BIGINT REFERENCES ai_picks(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reto_parlays (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft',
  meta REAL NOT NULL DEFAULT 0,
  inversion REAL NOT NULL DEFAULT 0,
  legs_json TEXT NOT NULL DEFAULT '[]',
  combined_odds REAL NOT NULL DEFAULT 1,
  projected_win REAL NOT NULL DEFAULT 0,
  analysis TEXT NOT NULL DEFAULT '',
  current_leg INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  plan_tier TEXT NOT NULL DEFAULT 'reto_escalera',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_picks_event_id ON ai_picks(event_id);
CREATE INDEX IF NOT EXISTS idx_ai_picks_status ON ai_picks(status);
CREATE INDEX IF NOT EXISTS idx_sports_events_event_date ON sports_events(event_date);
CREATE INDEX IF NOT EXISTS idx_reto_parlays_status ON reto_parlays(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
`;

async function initDb() {
  await pool.query(SCHEMA_SQL);
  await pool.query("ALTER TABLE routines ADD COLUMN IF NOT EXISTS week_key TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS week_key TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assigned_for_week TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE ai_picks ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'");
  await pool.query("ALTER TABLE ai_picks ADD COLUMN IF NOT EXISTS full_data TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE ai_picks ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT ''");
  return DB_META;
}

function getWeekKey(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getAssignedForWeek(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
}

async function ensureUserRecord(userId, opts = {}) {
  const id = normalizeEmail(userId);
  if (!id) {
    throw new Error("email_required");
  }
  const now = nowIso();
  const email = id;
  const existingRes = await pool.query(
    `
    SELECT name, whatsapp, role, plan, goal, checkin_schedule AS "checkinSchedule", created_at AS "createdAt"
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  const existing = existingRes.rows[0] || null;
  const name = safeStr(opts.name) || safeStr(existing?.name) || "User";
  const whatsapp = safeStr(opts.whatsapp) || safeStr(existing?.whatsapp);
  const role = safeStr(opts.role) || safeStr(existing?.role) || "user";
  const plan = safeStr(opts.plan) || safeStr(existing?.plan) || "Free";
  const goal = safeStr(opts.goal) || safeStr(existing?.goal);
  const checkinSchedule = safeStr(opts.checkinSchedule) || safeStr(existing?.checkinSchedule);
  const createdAt = existing?.createdAt || now;

  await pool.query(
    `
    INSERT INTO users (id, name, email, whatsapp, role, plan, goal, checkin_schedule, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      whatsapp = EXCLUDED.whatsapp,
      role = EXCLUDED.role,
      plan = EXCLUDED.plan,
      goal = EXCLUDED.goal,
      checkin_schedule = EXCLUDED.checkin_schedule,
      updated_at = EXCLUDED.updated_at
    `,
    [id, name, email, whatsapp, role, plan, goal, checkinSchedule, createdAt, now]
  );

  await pool.query(
    `
    INSERT INTO metrics (user_id, updated_at)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [id, now]
  );

  return id;
}

async function ensureUser(payload) {
  const id = await ensureUserRecord(payload.email, payload);
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function getMetrics(userId) {
  const id = normalizeEmail(userId);
  if (!id) {
    return null;
  }
  const result = await pool.query("SELECT * FROM metrics WHERE user_id = $1", [id]);
  const metrics = result.rows[0];
  if (!metrics) {
    return null;
  }
  return {
    userId: id,
    streak: Number(metrics.streak || 0),
    bestStreak: Number(metrics.best_streak || 0),
    totalDays: Number(metrics.total_days || 0),
    completedDays: Number(metrics.completed_days || 0),
    failures: Number(metrics.failures || 0),
    xp: Number(metrics.xp || 0),
    updatedAt: metrics.updated_at,
  };
}

async function saveRoutine(payload) {
  const title = safeStr(payload.title);
  const target = safeStr(payload.target);
  const duration = safeStr(payload.duration);
  const createdBy = safeStr(payload.createdBy) || "admin";
  const weekKey = safeStr(payload.weekKey) || getWeekKey();
  const force = Boolean(payload.force);
  if (!title || !target || !duration) {
    throw new Error("routine_fields_required");
  }
  const now = nowIso();
  const existing = await pool.query(
    `
    SELECT id, title
    FROM routines
    WHERE week_key = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [weekKey]
  );
  if (existing.rows[0] && !force) {
    throw new Error(`routine_already_exists_for_week:${weekKey}`);
  }
  let routineId = null;
  if (existing.rows[0] && force) {
    const updateRes = await pool.query(
      `
      UPDATE routines
      SET title = $2,
          target = $3,
          duration = $4,
          created_by = $5,
          created_at = $6
      WHERE id = $1
      RETURNING id
      `,
      [existing.rows[0].id, title, target, duration, createdBy, now]
    );
    routineId = Number(updateRes.rows[0].id);
  } else {
    const result = await pool.query(
      `
      INSERT INTO routines (title, target, duration, week_key, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
      `,
      [title, target, duration, weekKey, createdBy, now]
    );
    routineId = Number(result.rows[0].id);
  }
  return {
    id: routineId,
    title,
    target,
    duration,
    weekKey,
    createdBy,
    createdAt: now,
  };
}

async function saveNutritionPlan(payload) {
  const title = safeStr(payload.title);
  const focus = safeStr(payload.focus);
  const note = safeStr(payload.note);
  const createdBy = safeStr(payload.createdBy) || "admin";
  if (!title || !focus || !note) {
    throw new Error("nutrition_fields_required");
  }
  const now = nowIso();
  const result = await pool.query(
    `
    INSERT INTO nutrition_plans (title, focus, note, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id
    `,
    [title, focus, note, createdBy, now]
  );
  return {
    id: Number(result.rows[0].id),
    title,
    focus,
    note,
    createdBy,
    createdAt: now,
  };
}

async function saveAssignments(payload) {
  const userIds = Array.isArray(payload.userIds) ? payload.userIds.map(normalizeEmail).filter(Boolean) : [];
  if (!userIds.length) {
    throw new Error("user_ids_required");
  }
  const mode = safeStr(payload.mode) || "admin_ai";
  const routine = safeStr(payload.routine);
  const diet = safeStr(payload.diet);
  const message = safeStr(payload.message);
  const createdBy = safeStr(payload.createdBy) || "admin";
  const weekKey = safeStr(payload.weekKey) || getWeekKey();
  const assignedForWeek = safeStr(payload.assignedForWeek) || getAssignedForWeek();
  const force = Boolean(payload.force);
  const now = nowIso();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = [];
    for (const userId of userIds) {
      await client.query(
        `
        INSERT INTO users (id, name, email, created_at, updated_at)
        VALUES ($1, 'User', $1, $2, $2)
        ON CONFLICT (id) DO NOTHING
        `,
        [userId, now]
      );
      await client.query(
        `
        INSERT INTO metrics (user_id, updated_at)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId, now]
      );
      const existingRes = await client.query(
        `
        SELECT week_key AS "weekKey"
        FROM assignments
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
      );
      const existingWeekKey = safeStr(existingRes.rows[0]?.weekKey);
      if (existingWeekKey === weekKey && !force) {
        throw new Error(`assignment_already_exists_for_week:${userId}:${weekKey}`);
      }
      await client.query(
        `
        INSERT INTO assignments (user_id, mode, routine, diet, message, week_key, assigned_for_week, created_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id) DO UPDATE SET
          mode = EXCLUDED.mode,
          routine = EXCLUDED.routine,
          diet = EXCLUDED.diet,
          message = EXCLUDED.message,
          week_key = EXCLUDED.week_key,
          assigned_for_week = EXCLUDED.assigned_for_week,
          created_by = EXCLUDED.created_by,
          updated_at = EXCLUDED.updated_at
        `,
        [userId, mode, routine, diet, message, weekKey, assignedForWeek, createdBy, now]
      );
      updated.push({ userId, mode, routine, diet, message, weekKey, assignedForWeek, updatedAt: now, forceApplied: force });
    }
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getFeed(userId) {
  const id = normalizeEmail(userId);
  const [routines, plans, assignment] = await Promise.all([
    pool.query("SELECT id, title, target, duration, week_key AS \"weekKey\", created_at AS \"createdAt\" FROM routines ORDER BY created_at DESC"),
    pool.query("SELECT id, title, focus, note, created_at AS \"createdAt\" FROM nutrition_plans ORDER BY created_at DESC"),
    pool.query(
      `
      SELECT user_id AS "userId", mode, routine, diet, message, week_key AS "weekKey", assigned_for_week AS "assignedForWeek", updated_at AS "updatedAt"
      FROM assignments
      WHERE user_id = $1
      `,
      [id]
    ),
  ]);
  return {
    routines: routines.rows,
    plans: plans.rows,
    assignment: assignment.rows[0] || null,
  };
}

async function searchUsers(rawSearch) {
  const term = safeStr(rawSearch);
  const needle = `%${term}%`;
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.whatsapp,
      u.role,
      COALESCE(s.plan_label, u.plan) AS plan,
      COALESCE(s.status, 'inactive') AS "subscriptionStatus",
      u.goal,
      u.checkin_schedule AS "checkinSchedule",
      op.answers_json AS "onboardingAnswers"
    FROM users u
    LEFT JOIN onboarding_profiles op ON op.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE u.name ILIKE $1 OR u.email ILIKE $1
    ORDER BY u.updated_at DESC
    LIMIT 50
    `,
    [needle]
  );
  return result.rows.map((row) => ({
    ...row,
    onboardingAnswers: parseJsonSafe(row.onboardingAnswers, {}),
  }));
}

async function saveCheckin(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }

  const status = safeStr(payload.status) || "pending";
  const responseSeconds = Math.max(0, Number(payload.responseSeconds || 0));
  const penaltyMinutes = Math.max(0, Number(payload.penaltyMinutes || 0));
  const dateKey = safeStr(payload.dateKey) || nowIso().slice(0, 10);
  const createdAt = nowIso();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO users (id, name, email, created_at, updated_at)
      VALUES ($1, 'User', $1, $2, $2)
      ON CONFLICT (id) DO NOTHING
      `,
      [userId, createdAt]
    );
    await client.query(
      `
      INSERT INTO metrics (user_id, updated_at)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId, createdAt]
    );
    await client.query(
      `
      INSERT INTO checkins (user_id, status, response_seconds, penalty_minutes, date_key, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [userId, status, responseSeconds, penaltyMinutes, dateKey, createdAt]
    );
    const current = await client.query("SELECT * FROM metrics WHERE user_id = $1 FOR UPDATE", [userId]);
    const row = current.rows[0];
    let streak = Number(row.streak || 0);
    let bestStreak = Number(row.best_streak || 0);
    let totalDays = Number(row.total_days || 0) + 1;
    let completedDays = Number(row.completed_days || 0);
    let failures = Number(row.failures || 0);
    let xp = Number(row.xp || 0);

    if (status === "yes") {
      streak += 1;
      completedDays += 1;
      xp += 120 + Math.min(20, streak);
    } else if (status === "no" || status === "timeout") {
      failures += 1;
      streak = 0;
      xp = Math.max(0, xp - 35);
    }
    if (streak > bestStreak) {
      bestStreak = streak;
    }

    await client.query(
      `
      UPDATE metrics
      SET streak = $1,
          best_streak = $2,
          total_days = $3,
          completed_days = $4,
          failures = $5,
          xp = $6,
          updated_at = $7
      WHERE user_id = $8
      `,
      [streak, bestStreak, totalDays, completedDays, failures, xp, nowIso(), userId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getMetrics(userId);
}

async function getWeeklyRanking() {
  const result = await pool.query(
    `
    SELECT u.name, u.email, m.streak, m.xp, m.completed_days AS "completedDays", m.total_days AS "totalDays"
    FROM metrics m
    INNER JOIN users u ON u.id = m.user_id
    ORDER BY (m.xp + (m.streak * 5)) DESC, m.updated_at DESC
    LIMIT 20
    `
  );
  return result.rows.map((row, index) => {
    const streak = Number(row.streak || 0);
    const xp = Number(row.xp || 0);
    const completedDays = Number(row.completedDays || 0);
    const totalDays = Number(row.totalDays || 0);
    const compliance = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
    const ascentIndex = Math.round((xp * 0.7) + (streak * 6) + (compliance * 1.1));
    return {
      rank: index + 1,
      user: row.name || row.email,
      ascentIndex,
    };
  });
}

function getStatusByCompliance(compliance) {
  if (compliance >= 80) return "green";
  if (compliance >= 55) return "yellow";
  return "red";
}

async function getAdminDashboard(dateKey) {
  const todayKey = safeStr(dateKey) || nowIso().slice(0, 10);
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.checkin_schedule AS "checkinSchedule",
      op.answers_json AS "onboardingAnswers",
      COALESCE(m.streak, 0) AS streak,
      COALESCE(m.total_days, 0) AS "totalDays",
      COALESCE(m.completed_days, 0) AS "completedDays",
      COALESCE(m.failures, 0) AS failures,
      COALESCE(m.xp, 0) AS xp,
      CASE
        WHEN COALESCE(m.total_days, 0) > 0 THEN ROUND((COALESCE(m.completed_days, 0)::numeric * 100) / m.total_days)
        ELSE 0
      END::int AS compliance,
      lc.date_key AS "lastCheckinDate",
      lc.status AS "lastCheckinStatus",
      a.updated_at AS "assignmentUpdatedAt"
    FROM users u
    LEFT JOIN onboarding_profiles op ON op.user_id = u.id
    LEFT JOIN metrics m ON m.user_id = u.id
    LEFT JOIN assignments a ON a.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT c.date_key, c.status
      FROM checkins c
      WHERE c.user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 1
    ) lc ON true
    WHERE LOWER(COALESCE(u.role, 'user')) <> 'admin'
    ORDER BY COALESCE(m.updated_at, u.updated_at) DESC, u.updated_at DESC
    LIMIT 200
    `
  );

  const users = result.rows.map((row) => {
    const compliance = Number(row.compliance || 0);
    return {
      id: row.id,
      name: row.name || "User",
      email: row.email || row.id,
      checkinSchedule: row.checkinSchedule || "",
      onboardingAnswers: parseJsonSafe(row.onboardingAnswers, {}),
      streak: Number(row.streak || 0),
      totalDays: Number(row.totalDays || 0),
      completedDays: Number(row.completedDays || 0),
      failures: Number(row.failures || 0),
      xp: Number(row.xp || 0),
      compliance,
      status: getStatusByCompliance(compliance),
      lastCheckinDate: row.lastCheckinDate || null,
      lastCheckinStatus: row.lastCheckinStatus || null,
      assignmentUpdatedAt: row.assignmentUpdatedAt || null,
    };
  });

  const pending = users.filter((u) => u.lastCheckinDate !== todayKey);
  const summary = {
    totalUsers: users.length,
    pendingToday: pending.length,
    green: users.filter((u) => u.status === "green").length,
    yellow: users.filter((u) => u.status === "yellow").length,
    red: users.filter((u) => u.status === "red").length,
  };
  return { dateKey: todayKey, summary, users, pending };
}

async function getAdminTimeline(userId, limit = 30) {
  const normalized = normalizeEmail(userId);
  const cap = Math.max(5, Math.min(100, Number(limit || 30)));
  const checkinsQuery = normalized
    ? pool.query(
        `
        SELECT c.created_at AS at, 'checkin' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               c.status, c.date_key AS "dateKey", c.response_seconds AS "responseSeconds"
        FROM checkins c
        INNER JOIN users u ON u.id = c.user_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2
        `,
        [normalized, cap]
      )
    : pool.query(
        `
        SELECT c.created_at AS at, 'checkin' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               c.status, c.date_key AS "dateKey", c.response_seconds AS "responseSeconds"
        FROM checkins c
        INNER JOIN users u ON u.id = c.user_id
        ORDER BY c.created_at DESC
        LIMIT $1
        `,
        [cap]
      );

  const assignmentsQuery = normalized
    ? pool.query(
        `
        SELECT a.updated_at AS at, 'assignment' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               a.mode, a.week_key AS "weekKey", a.assigned_for_week AS "assignedForWeek", a.created_by AS "createdBy"
        FROM assignments a
        INNER JOIN users u ON u.id = a.user_id
        WHERE a.user_id = $1
        ORDER BY a.updated_at DESC
        LIMIT $2
        `,
        [normalized, cap]
      )
    : pool.query(
        `
        SELECT a.updated_at AS at, 'assignment' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               a.mode, a.week_key AS "weekKey", a.assigned_for_week AS "assignedForWeek", a.created_by AS "createdBy"
        FROM assignments a
        INNER JOIN users u ON u.id = a.user_id
        ORDER BY a.updated_at DESC
        LIMIT $1
        `,
        [cap]
      );

  const alertsQuery = normalized
    ? pool.query(
        `
        SELECT s.created_at AS at, 'support_alert' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               s.message
        FROM support_alerts s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC
        LIMIT $2
        `,
        [normalized, cap]
      )
    : pool.query(
        `
        SELECT s.created_at AS at, 'support_alert' AS type, u.id AS "userId", u.name AS "userName", u.email AS "userEmail",
               s.message
        FROM support_alerts s
        INNER JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT $1
        `,
        [cap]
      );

  const [checkins, assignments, alerts] = await Promise.all([checkinsQuery, assignmentsQuery, alertsQuery]);
  return [...checkins.rows, ...assignments.rows, ...alerts.rows]
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, cap);
}

async function saveSupportAlert(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  const message = safeStr(payload.message) || "Solicita carga de rutina y dieta para iniciar.";
  const now = nowIso();
  await ensureUserRecord(userId, { name: "User", role: "user" });
  await pool.query(
    `
    INSERT INTO support_alerts (user_id, message, created_at)
    VALUES ($1,$2,$3)
    `,
    [userId, message, now]
  );
  return { userId, message, at: now };
}

async function getSubscription(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) {
    throw new Error("user_id_required");
  }
  const result = await pool.query(
    `
    SELECT user_id AS "userId", plan_id AS "planId", plan_label AS "planLabel", extras_json AS "extras",
           status, start_at AS "startAt", end_at AS "endAt", updated_at AS "updatedAt"
    FROM subscriptions
    WHERE user_id = $1
    LIMIT 1
    `,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      userId: normalized,
      planId: "free",
      planLabel: "Free",
      extras: {},
      status: "inactive",
      startAt: null,
      endAt: null,
      updatedAt: nowIso(),
    };
  }
  return {
    userId: row.userId,
    planId: row.planId || "free",
    planLabel: row.planLabel || "Free",
    extras: parseJsonSafe(row.extras, {}),
    status: row.status || "inactive",
    startAt: row.startAt || null,
    endAt: row.endAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function createPaymentRequest(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  await ensureUserRecord(userId, { name: safeStr(payload.name) || "User", role: "user" });
  const planId = safeStr(payload.planId) || "free";
  const planLabel = safeStr(payload.planLabel) || "Free";
  const extras = payload.extras && typeof payload.extras === "object" ? payload.extras : {};
  const method = safeStr(payload.method) || "transfer";
  const proofTarget = safeStr(payload.proofTarget) || "+52 000 000 0000";
  const now = nowIso();
  const existingRes = await pool.query(
    `
    SELECT id, user_id AS "userId", plan_id AS "planId", plan_label AS "planLabel", extras_json AS "extras",
           method, proof_target AS "proofTarget", status, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM payment_requests
    WHERE user_id = $1 AND plan_id = $2 AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, planId]
  );
  const existing = existingRes.rows[0];
  if (existing) {
    await pool.query(
      `
      INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
      VALUES ($1,$2,$3,$4::jsonb,'pending',NULL,NULL,$5)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        plan_label = EXCLUDED.plan_label,
        extras_json = EXCLUDED.extras_json,
        status = EXCLUDED.status,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        updated_at = EXCLUDED.updated_at
      `,
      [userId, planId, planLabel, toJsonString(extras, {}), now]
    );
    return {
      id: Number(existing.id),
      userId,
      planId,
      planLabel: existing.planLabel || planLabel,
      extras: parseJsonSafe(existing.extras, extras),
      method: existing.method || method,
      proofTarget: existing.proofTarget || proofTarget,
      status: existing.status || "pending",
      createdAt: existing.createdAt || now,
      updatedAt: existing.updatedAt || now,
      existing: true,
    };
  }
  const result = await pool.query(
    `
    INSERT INTO payment_requests (user_id, plan_id, plan_label, extras_json, method, proof_target, status, reviewed_by, note, created_at, updated_at)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,'pending','','',$7,$7)
    RETURNING id
    `,
    [userId, planId, planLabel, toJsonString(extras, {}), method, proofTarget, now]
  );
  await pool.query(
    `
    INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
    VALUES ($1,$2,$3,$4::jsonb,'pending',NULL,NULL,$5)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_label = EXCLUDED.plan_label,
      extras_json = EXCLUDED.extras_json,
      status = EXCLUDED.status,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, planId, planLabel, toJsonString(extras, {}), now]
  );
  return {
    id: Number(result.rows[0].id),
    userId,
    planId,
    planLabel,
    extras,
    method,
    proofTarget,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    existing: false,
  };
}

async function listPendingPaymentRequests() {
  const result = await pool.query(
    `
    SELECT p.id, p.user_id AS "userId", u.name AS "userName", u.email AS "userEmail",
           p.plan_id AS "planId", p.plan_label AS "planLabel", p.extras_json AS "extras",
           p.method, p.proof_target AS "proofTarget", p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
    FROM payment_requests p
    INNER JOIN users u ON u.id = p.user_id
    WHERE p.status = 'pending'
    ORDER BY p.created_at DESC
    LIMIT 200
    `
  );
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    extras: parseJsonSafe(row.extras, {}),
  }));
}

async function reviewPaymentRequest(payload) {
  const id = Number(payload.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("payment_id_required");
  }
  const action = safeStr(payload.action).toLowerCase();
  if (action !== "approve" && action !== "reject") {
    throw new Error("invalid_action");
  }
  const reqRes = await pool.query(
    `
    SELECT id, user_id AS "userId", plan_id AS "planId", plan_label AS "planLabel", extras_json AS "extras", status
    FROM payment_requests
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  const req = reqRes.rows[0];
  if (!req) {
    throw new Error("payment_not_found");
  }
  const now = nowIso();
  const reviewedBy = safeStr(payload.reviewedBy) || "admin";
  const note = safeStr(payload.note);
  const status = action === "approve" ? "approved" : "rejected";
  await pool.query(
    `
    UPDATE payment_requests
    SET status = $1, reviewed_by = $2, note = $3, updated_at = $4
    WHERE id = $5
    `,
    [status, reviewedBy, note, now, id]
  );

  if (action === "approve") {
    const durationDays = Math.max(1, Number(payload.durationDays || (String(req.planId || "").toLowerCase() === "retos" ? 30 : 30)));
    const end = new Date();
    end.setDate(end.getDate() + durationDays);
    await pool.query(
      `
      INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
      VALUES ($1,$2,$3,$4::jsonb,'active',$5,$6,$5)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        plan_label = EXCLUDED.plan_label,
        extras_json = EXCLUDED.extras_json,
        status = EXCLUDED.status,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        updated_at = EXCLUDED.updated_at
      `,
      [req.userId, req.planId || "free", req.planLabel || "Free", toJsonString(req.extras || {}, {}), now, end.toISOString()]
    );
    await pool.query("UPDATE users SET plan = $1, updated_at = $2 WHERE id = $3", [req.planLabel || "Free", now, req.userId]);
  } else {
    await pool.query(
      `
      INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
      VALUES ($1,'free','Free','{}'::jsonb,'inactive',NULL,NULL,$2)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        plan_label = EXCLUDED.plan_label,
        extras_json = EXCLUDED.extras_json,
        status = EXCLUDED.status,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        updated_at = EXCLUDED.updated_at
      `,
      [req.userId, now]
    );
    await pool.query("UPDATE users SET plan = 'Free', updated_at = $1 WHERE id = $2", [now, req.userId]);
  }
  return {
    id,
    status,
    userId: req.userId,
    subscription: await getSubscription(req.userId),
  };
}

async function getUserPayments(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) {
    throw new Error("user_id_required");
  }
  const result = await pool.query(
    `
    SELECT id, user_id AS "userId", plan_id AS "planId", plan_label AS "planLabel", extras_json AS "extras",
           method, proof_target AS "proofTarget", status, reviewed_by AS "reviewedBy", note,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM payment_requests
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 40
    `,
    [normalized]
  );
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    extras: parseJsonSafe(row.extras, {}),
  }));
}

async function setUserRole(payload) {
  const userId = normalizeEmail(payload?.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  const role = safeStr(payload?.role).toLowerCase() === "admin" ? "admin" : "user";
  const now = nowIso();
  await ensureUserRecord(userId, { name: safeStr(payload?.name) || "User", role });
  await pool.query("UPDATE users SET role = $1, updated_at = $2 WHERE id = $3", [role, now, userId]);
  const result = await pool.query("SELECT role FROM users WHERE id = $1 LIMIT 1", [userId]);
  return {
    userId,
    role: result.rows[0]?.role || role,
    updatedAt: now,
  };
}

async function grantSubscription(payload) {
  const userId = normalizeEmail(payload?.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  const planId = safeStr(payload?.planId) || "free";
  const planLabel = safeStr(payload?.planLabel) || "Free";
  const statusRaw = safeStr(payload?.status).toLowerCase();
  const status = ["active", "pending", "inactive"].includes(statusRaw) ? statusRaw : "active";
  const extras = payload?.extras && typeof payload.extras === "object" ? payload.extras : {};
  const now = nowIso();
  const durationDays = Math.max(1, Number(payload?.durationDays || 30));
  let startAt = null;
  let endAt = null;
  if (status === "active") {
    startAt = now;
    const end = new Date();
    end.setDate(end.getDate() + durationDays);
    endAt = end.toISOString();
  }
  await ensureUserRecord(userId, { name: safeStr(payload?.name) || "User", role: "user", plan: planLabel });
  await pool.query(
    `
    INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_label = EXCLUDED.plan_label,
      extras_json = EXCLUDED.extras_json,
      status = EXCLUDED.status,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, planId, planLabel, toJsonString(extras, {}), status, startAt, endAt, now]
  );
  await pool.query("UPDATE users SET plan = $1, updated_at = $2 WHERE id = $3", [planLabel, now, userId]);
  return getSubscription(userId);
}

async function getAppSetting(key, fallback = {}) {
  const normalizedKey = safeStr(key);
  if (!normalizedKey) return fallback;
  const result = await pool.query(
    `
    SELECT value_json AS value
    FROM app_settings
    WHERE key = $1
    LIMIT 1
    `,
    [normalizedKey]
  );
  return parseJsonSafe(result.rows[0]?.value, fallback);
}

async function setAppSetting(key, value) {
  const normalizedKey = safeStr(key);
  if (!normalizedKey) throw new Error("setting_key_required");
  const safeValue = value && typeof value === "object" ? value : {};
  const now = nowIso();
  await pool.query(
    `
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ($1,$2::jsonb,$3)
    ON CONFLICT (key) DO UPDATE SET
      value_json = EXCLUDED.value_json,
      updated_at = EXCLUDED.updated_at
    `,
    [normalizedKey, toJsonString(safeValue, {}), now]
  );
  return getAppSetting(normalizedKey, {});
}

async function recordAiUsage(payload) {
  const actorEmail = normalizeEmail(payload?.actorEmail);
  if (!actorEmail) throw new Error("actor_email_required");
  const targetUserIds = Array.isArray(payload?.targetUserIds)
    ? payload.targetUserIds.map(normalizeEmail).filter(Boolean)
    : [];
  const mode = safeStr(payload?.mode) || "admin_ai";
  const provider = safeStr(payload?.provider) || "fallback";
  const model = safeStr(payload?.model);
  const status = safeStr(payload?.status) || "served";
  const reason = safeStr(payload?.reason);
  const promptChars = Math.max(0, Number(payload?.promptChars || 0));
  const contextChars = Math.max(0, Number(payload?.contextChars || 0));
  const createdAt = safeStr(payload?.createdAt) || nowIso();
  const result = await pool.query(
    `
    INSERT INTO ai_usage_logs (
      actor_email, target_user_ids_json, mode, provider, model, status, reason, prompt_chars, context_chars, created_at
    )
    VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id
    `,
    [actorEmail, toJsonString(targetUserIds, []), mode, provider, model, status, reason, promptChars, contextChars, createdAt]
  );
  return {
    id: Number(result.rows[0]?.id || 0),
    actorEmail,
    targetUserIds,
    mode,
    provider,
    model,
    status,
    reason,
    promptChars,
    contextChars,
    createdAt,
  };
}

async function listAiUsageLogs(monthKey) {
  const normalizedMonth = safeStr(monthKey) || nowIso().slice(0, 7);
  const result = await pool.query(
    `
    SELECT actor_email AS "actorEmail",
           target_user_ids_json AS "targetUserIds",
           mode,
           provider,
           model,
           status,
           reason,
           prompt_chars AS "promptChars",
           context_chars AS "contextChars",
           created_at AS "createdAt"
    FROM ai_usage_logs
    WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = $1
    ORDER BY created_at DESC
    LIMIT 5000
    `,
    [normalizedMonth]
  );
  return result.rows.map((row) => ({
    actorEmail: normalizeEmail(row.actorEmail),
    targetUserIds: Array.isArray(row.targetUserIds)
      ? row.targetUserIds.map(normalizeEmail).filter(Boolean)
      : parseJsonArraySafe(row.targetUserIds, []).map(normalizeEmail).filter(Boolean),
    mode: row.mode || "admin_ai",
    provider: row.provider || "fallback",
    model: row.model || "",
    status: row.status || "served",
    reason: row.reason || "",
    promptChars: Number(row.promptChars || 0),
    contextChars: Number(row.contextChars || 0),
    createdAt: row.createdAt || null,
  }));
}

async function getAdminCsvReport(scope, userId) {
  const normalizedScope = safeStr(scope).toLowerCase() || "week";
  if (normalizedScope === "user") {
    const normalized = normalizeEmail(userId);
    if (!normalized) {
      throw new Error("user_id_required_for_user_scope");
    }
    const metaRes = await pool.query(
      `
      SELECT u.id, u.name, u.email,
             COALESCE(m.streak,0) AS streak,
             COALESCE(m.total_days,0) AS "totalDays",
             COALESCE(m.completed_days,0) AS "completedDays",
             COALESCE(m.failures,0) AS failures,
             COALESCE(m.xp,0) AS xp
      FROM users u
      LEFT JOIN metrics m ON m.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [normalized]
    );
    const meta = metaRes.rows[0];
    if (!meta) {
      throw new Error("user_not_found");
    }
    const checks = await pool.query(
      `
      SELECT c.date_key AS "dateKey", c.status, c.response_seconds AS "responseSeconds",
             c.penalty_minutes AS "penaltyMinutes", c.created_at AS at
      FROM checkins c
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 50
      `,
      [normalized]
    );
    const compliance = Number(meta.totalDays || 0) > 0 ? Math.round((Number(meta.completedDays || 0) * 100) / Number(meta.totalDays || 1)) : 0;
    return {
      filename: `admin_user_${meta.id.replace(/[^a-z0-9]+/gi, "_")}.csv`,
      rows: checks.rows.map((c) => ({
        userId: meta.id,
        userName: meta.name,
        userEmail: meta.email,
        streak: Number(meta.streak || 0),
        compliance,
        status: c.status,
        dateKey: c.dateKey,
        responseSeconds: Number(c.responseSeconds || 0),
        penaltyMinutes: Number(c.penaltyMinutes || 0),
        at: c.at,
      })),
    };
  }

  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const weekly = await pool.query(
    `
    SELECT c.date_key AS "dateKey",
           COUNT(*) AS total,
           SUM(CASE WHEN c.status = 'yes' THEN 1 ELSE 0 END) AS "yesCount",
           SUM(CASE WHEN c.status = 'no' THEN 1 ELSE 0 END) AS "noCount",
           SUM(CASE WHEN c.status = 'timeout' THEN 1 ELSE 0 END) AS "timeoutCount"
    FROM checkins c
    WHERE c.date_key >= $1 AND c.date_key <= $2
    GROUP BY c.date_key
    ORDER BY c.date_key DESC
    `,
    [fmt(from), fmt(today)]
  );
  return {
    filename: `admin_weekly_${fmt(today)}.csv`,
    rows: weekly.rows.map((r) => ({
      dateKey: r.dateKey,
      totalCheckins: Number(r.total || 0),
      yesCount: Number(r.yesCount || 0),
      noCount: Number(r.noCount || 0),
      timeoutCount: Number(r.timeoutCount || 0),
      compliance: Number(r.total || 0) > 0 ? Math.round((Number(r.yesCount || 0) * 100) / Number(r.total || 1)) : 0,
    })),
  };
}

async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const result = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [normalized]);
  return result.rows[0] || null;
}

async function upsertCoachFlow(payload) {
  const userId = normalizeEmail(payload.userId);
  const phone = safeStr(payload.phone);
  if (!userId) throw new Error("user_id_required");
  if (!phone) throw new Error("phone_required");
  const step = Math.max(0, Number(payload.step || 0));
  const status = safeStr(payload.status) || "active";
  const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  const now = nowIso();
  await pool.query(
    `
    INSERT INTO coach_whatsapp_flows (user_id, phone, step, status, answers_json, updated_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT (user_id) DO UPDATE SET
      phone = EXCLUDED.phone,
      step = EXCLUDED.step,
      status = EXCLUDED.status,
      answers_json = EXCLUDED.answers_json,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, phone, step, status, toJsonString(answers, {}), now]
  );
  return getCoachFlowByUser(userId);
}

async function getCoachFlowByPhone(phone) {
  const key = safeStr(phone);
  if (!key) return null;
  const result = await pool.query(
    `
    SELECT user_id AS "userId", phone, step, status, answers_json AS answers, updated_at AS "updatedAt"
    FROM coach_whatsapp_flows
    WHERE phone = $1
    LIMIT 1
    `,
    [key]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    phone: row.phone,
    step: Number(row.step || 0),
    status: row.status || "active",
    answers: parseJsonSafe(row.answers, {}),
    updatedAt: row.updatedAt || null,
  };
}

async function getCoachFlowByUser(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) return null;
  const result = await pool.query(
    `
    SELECT user_id AS "userId", phone, step, status, answers_json AS answers, updated_at AS "updatedAt"
    FROM coach_whatsapp_flows
    WHERE user_id = $1
    LIMIT 1
    `,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    phone: row.phone,
    step: Number(row.step || 0),
    status: row.status || "active",
    answers: parseJsonSafe(row.answers, {}),
    updatedAt: row.updatedAt || null,
  };
}

async function saveOnboardingProfile(payload) {
  const userId = normalizeEmail(payload?.email || payload?.userId);
  if (!userId) throw new Error("email_required");
  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};
  const now = nowIso();
  await ensureUserRecord(userId, {
    name: safeStr(answers.nombre) || "User",
    role: "user",
    goal: safeStr(answers.objetivo),
    checkinSchedule: safeStr(answers.horario),
    plan: safeStr(answers.plan) || "Free",
  });
  await pool.query(
    `
    INSERT INTO onboarding_profiles (user_id, answers_json, updated_at)
    VALUES ($1,$2::jsonb,$3)
    ON CONFLICT (user_id) DO UPDATE SET
      answers_json = EXCLUDED.answers_json,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, toJsonString(answers, {}), now]
  );
  return { userId, updatedAt: now };
}

async function deleteUser(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) {
    throw new Error("user_id_required");
  }
  const result = await pool.query(
    `
    DELETE FROM users
    WHERE id = $1
    RETURNING id, email, role
    `,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("user_not_found");
  }
  return {
    userId: row.id,
    email: row.email || row.id,
    role: row.role || "user",
    deleted: true,
  };
}

async function upsertSportsEvent(payload) {
  const externalId = safeStr(payload.externalId);
  if (!externalId) throw new Error("external_id_required");
  const now = nowIso();
  const result = await pool.query(
    `
    INSERT INTO sports_events (
      external_id, sport, league, home_team, away_team, event_date, status, raw_json, created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
    ON CONFLICT (external_id) DO UPDATE SET
      sport = EXCLUDED.sport,
      league = EXCLUDED.league,
      home_team = EXCLUDED.home_team,
      away_team = EXCLUDED.away_team,
      event_date = EXCLUDED.event_date,
      status = EXCLUDED.status,
      raw_json = EXCLUDED.raw_json,
      updated_at = EXCLUDED.updated_at
    RETURNING id
    `,
    [
      externalId,
      safeStr(payload.sport) || "football",
      safeStr(payload.league) || "General",
      safeStr(payload.homeTeam),
      safeStr(payload.awayTeam),
      safeStr(payload.eventDate) || now,
      safeStr(payload.status) || "scheduled",
      toJsonString(payload.rawJson && typeof payload.rawJson === "object" ? payload.rawJson : {}, {}),
      now,
    ]
  );
  return getSportsEventById(Number(result.rows[0]?.id || 0));
}

async function getSportsEventByExternalId(externalId) {
  const result = await pool.query(
    `
    SELECT id, external_id AS "externalId", sport, league, home_team AS "homeTeam", away_team AS "awayTeam",
           event_date AS "eventDate", status, raw_json AS "rawJson", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sports_events
    WHERE external_id = $1
    LIMIT 1
    `,
    [safeStr(externalId)]
  );
  const row = result.rows[0];
  return row
    ? {
        ...row,
        id: Number(row.id),
        rawJson: parseJsonSafe(row.rawJson, {}),
      }
    : null;
}

async function getSportsEventById(id) {
  const result = await pool.query(
    `
    SELECT id, external_id AS "externalId", sport, league, home_team AS "homeTeam", away_team AS "awayTeam",
           event_date AS "eventDate", status, raw_json AS "rawJson", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sports_events
    WHERE id = $1
    LIMIT 1
    `,
    [Number(id || 0)]
  );
  const row = result.rows[0];
  return row
    ? {
        ...row,
        id: Number(row.id),
        rawJson: parseJsonSafe(row.rawJson, {}),
      }
    : null;
}

async function getSportsEventsByDate(dateKey) {
  const normalized = safeStr(dateKey) || nowIso().slice(0, 10);
  const result = await pool.query(
    `
    SELECT id, external_id AS "externalId", sport, league, home_team AS "homeTeam", away_team AS "awayTeam",
           event_date AS "eventDate", status, raw_json AS "rawJson", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sports_events
    WHERE TO_CHAR(event_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1
    ORDER BY event_date ASC
    `,
    [normalized]
  );
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    rawJson: parseJsonSafe(row.rawJson, {}),
  }));
}

async function listRecentSportsEvents(limit = 50) {
  const result = await pool.query(
    `
    SELECT id, external_id AS "externalId", sport, league, home_team AS "homeTeam", away_team AS "awayTeam",
           event_date AS "eventDate", status, raw_json AS "rawJson", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sports_events
    ORDER BY event_date DESC, updated_at DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(200, Number(limit || 50)))]
  );
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    rawJson: parseJsonSafe(row.rawJson, {}),
  }));
}

async function saveEventStats(payload) {
  const eventId = Number(payload.eventId || 0);
  if (!eventId) throw new Error("event_id_required");
  const now = nowIso();
  const result = await pool.query(
    `
    INSERT INTO event_stats (event_id, source_api, stats_json, created_at)
    VALUES ($1,$2,$3::jsonb,$4)
    RETURNING id
    `,
    [
      eventId,
      safeStr(payload.sourceApi) || "mock",
      toJsonString(payload.statsJson && typeof payload.statsJson === "object" ? payload.statsJson : {}, {}),
      now,
    ]
  );
  return {
    id: Number(result.rows[0]?.id || 0),
    eventId,
    sourceApi: safeStr(payload.sourceApi) || "mock",
    statsJson: payload.statsJson && typeof payload.statsJson === "object" ? payload.statsJson : {},
    createdAt: now,
  };
}

async function getLatestEventStats(eventId) {
  const result = await pool.query(
    `
    SELECT id, event_id AS "eventId", source_api AS "sourceApi", stats_json AS "statsJson", created_at AS "createdAt"
    FROM event_stats
    WHERE event_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [Number(eventId || 0)]
  );
  const row = result.rows[0];
  return row
    ? {
        ...row,
        id: Number(row.id),
        eventId: Number(row.eventId),
        statsJson: parseJsonSafe(row.statsJson, {}),
      }
    : null;
}

async function saveAiPick(payload) {
  const eventId = Number(payload.eventId || 0);
  if (!eventId) throw new Error("event_id_required");
  const now = safeStr(payload.createdAt) || nowIso();
  const result = await pool.query(
    `
    INSERT INTO ai_picks (event_id, pick, market, confidence, analysis, risk_level, model_used, status, plan_tier, full_data, result, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id
    `,
    [
      eventId,
      safeStr(payload.pick),
      safeStr(payload.market),
      Math.max(0, Math.min(100, Number(payload.confidence || 0))),
      safeStr(payload.analysis),
      safeStr(payload.riskLevel) || "MEDIO",
      safeStr(payload.modelUsed),
      safeStr(payload.status) || "generated",
      safeStr(payload.planTier) || "free",
      safeStr(payload.fullData) || "",
      safeStr(payload.result) || "",
      now,
    ]
  );
  return {
    id: Number(result.rows[0]?.id || 0),
    eventId,
    pick: safeStr(payload.pick),
    market: safeStr(payload.market),
    confidence: Math.max(0, Math.min(100, Number(payload.confidence || 0))),
    analysis: safeStr(payload.analysis),
    riskLevel: safeStr(payload.riskLevel) || "MEDIO",
    modelUsed: safeStr(payload.modelUsed),
    status: safeStr(payload.status) || "generated",
    planTier: safeStr(payload.planTier) || "free",
    fullData: safeStr(payload.fullData) || "",
    result: safeStr(payload.result) || "",
    createdAt: now,
  };
}

async function getLatestAiPickForEvent(eventId) {
  const result = await pool.query(
    `
    SELECT p.id, p.event_id AS "eventId", e.external_id AS "externalId", e.sport, e.league,
           e.home_team AS "homeTeam", e.away_team AS "awayTeam", e.event_date AS "eventDate",
           e.status AS "eventStatus", p.pick, p.market, p.confidence, p.analysis,
           p.risk_level AS "riskLevel", p.model_used AS "modelUsed", p.status,
           p.plan_tier AS "planTier", p.full_data AS "fullData", p.result, p.created_at AS "createdAt"
    FROM ai_picks p
    INNER JOIN sports_events e ON e.id = p.event_id
    WHERE p.event_id = $1
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1
    `,
    [Number(eventId || 0)]
  );
  const row = result.rows[0];
  return row ? { ...row, id: Number(row.id), eventId: Number(row.eventId), confidence: Number(row.confidence || 0) } : null;
}

async function listPicksByDate(dateKey) {
  const normalized = safeStr(dateKey) || nowIso().slice(0, 10);
  const result = await pool.query(
    `
    SELECT p.id, p.event_id AS "eventId", e.external_id AS "externalId", e.sport, e.league,
           e.home_team AS "homeTeam", e.away_team AS "awayTeam", e.event_date AS "eventDate",
           e.status AS "eventStatus", p.pick, p.market, p.confidence, p.analysis,
           p.risk_level AS "riskLevel", p.model_used AS "modelUsed", p.status,
           p.plan_tier AS "planTier", p.full_data AS "fullData", p.result, p.created_at AS "createdAt"
    FROM ai_picks p
    INNER JOIN sports_events e ON e.id = p.event_id
    WHERE TO_CHAR(e.event_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1
    ORDER BY e.event_date ASC, p.created_at DESC
    `,
    [normalized]
  );
  return result.rows.map((row) => ({ ...row, id: Number(row.id), eventId: Number(row.eventId), confidence: Number(row.confidence || 0) }));
}

async function listPickHistory(limit = 100) {
  const result = await pool.query(
    `
    SELECT p.id, p.event_id AS "eventId", e.external_id AS "externalId", e.sport, e.league,
           e.home_team AS "homeTeam", e.away_team AS "awayTeam", e.event_date AS "eventDate",
           e.status AS "eventStatus", p.pick, p.market, p.confidence, p.analysis,
           p.risk_level AS "riskLevel", p.model_used AS "modelUsed", p.status,
           p.plan_tier AS "planTier", p.full_data AS "fullData", p.result, p.created_at AS "createdAt"
    FROM ai_picks p
    INNER JOIN sports_events e ON e.id = p.event_id
    ORDER BY p.created_at DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(500, Number(limit || 100)))]
  );
  return result.rows.map((row) => ({ ...row, id: Number(row.id), eventId: Number(row.eventId), confidence: Number(row.confidence || 0) }));
}

async function updatePickResult({ id, result }) {
  const allowed = ["won", "lost", "void", ""];
  const normalized = safeStr(result).toLowerCase();
  if (!allowed.includes(normalized)) throw new Error("invalid_result");
  await pool.query(`UPDATE ai_picks SET result = $1 WHERE id = $2`, [normalized, Number(id || 0)]);
  return { id: Number(id || 0), result: normalized };
}

async function savePickCandidates({ eventId, sessionId, candidates, claudeSelectedIndex, claudeReasoning, claudeModel, claudeFinalPick }) {
  const now = nowIso();
  const saved = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const isSelected = i === claudeSelectedIndex;
    const result = await pool.query(
      `INSERT INTO ai_pick_candidates (event_id, session_id, candidate_index, pick, market, confidence, analysis, risk_level, provider, model_used, is_claude_selected, claude_reasoning, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [Number(eventId), safeStr(sessionId), i, safeStr(c.pick), safeStr(c.market), Math.max(0, Math.min(100, Number(c.confidence || 0))), safeStr(c.analysis), safeStr(c.risk_level || "MEDIO"), safeStr(c.provider || "openai"), safeStr(c.model_used || "gpt-4o"), isSelected, isSelected ? safeStr(claudeReasoning) : "", now]
    );
    saved.push({ id: Number(result.rows[0]?.id || 0), eventId: Number(eventId), sessionId: safeStr(sessionId), candidateIndex: i, pick: safeStr(c.pick), market: safeStr(c.market), confidence: Math.max(0, Math.min(100, Number(c.confidence || 0))), analysis: safeStr(c.analysis), riskLevel: safeStr(c.risk_level || "MEDIO"), provider: safeStr(c.provider || "openai"), modelUsed: safeStr(c.model_used || "gpt-4o"), isClaudeSelected: isSelected, claudeReasoning: isSelected ? safeStr(claudeReasoning) : "", publishedPickId: null, createdAt: now });
  }

  // Save Claude's refined final pick as a separate candidate (candidateIndex = -1)
  if (claudeFinalPick && claudeFinalPick.pick) {
    const cr = await pool.query(
      `INSERT INTO ai_pick_candidates (event_id, session_id, candidate_index, pick, market, confidence, analysis, risk_level, provider, model_used, is_claude_selected, claude_reasoning, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [Number(eventId), safeStr(sessionId), -1, safeStr(claudeFinalPick.pick), safeStr(claudeFinalPick.market), Math.max(0, Math.min(100, Number(claudeFinalPick.confidence || 0))), safeStr(claudeFinalPick.analysis), safeStr(claudeFinalPick.risk_level || "MEDIO"), "claude-judge", safeStr(claudeModel || "claude-sonnet-4-6"), true, safeStr(claudeReasoning), now]
    );
    saved.push({ id: Number(cr.rows[0]?.id || 0), eventId: Number(eventId), sessionId: safeStr(sessionId), candidateIndex: -1, pick: safeStr(claudeFinalPick.pick), market: safeStr(claudeFinalPick.market), confidence: Math.max(0, Math.min(100, Number(claudeFinalPick.confidence || 0))), analysis: safeStr(claudeFinalPick.analysis), riskLevel: safeStr(claudeFinalPick.risk_level || "MEDIO"), provider: "claude-judge", modelUsed: safeStr(claudeModel || "claude-sonnet-4-6"), isClaudeSelected: true, claudeReasoning: safeStr(claudeReasoning), publishedPickId: null, createdAt: now });
  }

  return saved;
}

async function getPickCandidateById(id) {
  const result = await pool.query(
    `SELECT id, event_id AS "eventId", session_id AS "sessionId", candidate_index AS "candidateIndex",
     pick, market, confidence, analysis, risk_level AS "riskLevel", provider, model_used AS "modelUsed",
     is_claude_selected AS "isClaudeSelected", claude_reasoning AS "claudeReasoning",
     published_pick_id AS "publishedPickId", created_at AS "createdAt"
     FROM ai_pick_candidates WHERE id = $1`,
    [Number(id || 0)]
  );
  const row = result.rows[0];
  return row ? { ...row, id: Number(row.id), eventId: Number(row.eventId), confidence: Number(row.confidence || 0) } : null;
}

async function markCandidatePublished(candidateId, publishedPickId) {
  await pool.query(`UPDATE ai_pick_candidates SET published_pick_id = $1 WHERE id = $2`, [Number(publishedPickId || 0), Number(candidateId || 0)]);
}

async function logApiSync(payload) {
  const now = nowIso();
  const result = await pool.query(
    `
    INSERT INTO api_sync_logs (source_api, endpoint, status, message, created_at)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id
    `,
    [
      safeStr(payload.sourceApi) || "mock",
      safeStr(payload.endpoint) || "/today",
      safeStr(payload.status) || "ok",
      safeStr(payload.message),
      now,
    ]
  );
  return {
    id: Number(result.rows[0]?.id || 0),
    sourceApi: safeStr(payload.sourceApi) || "mock",
    endpoint: safeStr(payload.endpoint) || "/today",
    status: safeStr(payload.status) || "ok",
    message: safeStr(payload.message),
    createdAt: now,
  };
}

async function listApiSyncLogs(limit = 20) {
  const result = await pool.query(
    `
    SELECT id, source_api AS "sourceApi", endpoint, status, message, created_at AS "createdAt"
    FROM api_sync_logs
    ORDER BY created_at DESC, id DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(100, Number(limit || 20)))]
  );
  return result.rows.map((row) => ({ ...row, id: Number(row.id) }));
}

function parseRetoRow(row) {
  if (!row) return null;
  let legs = [];
  try { legs = JSON.parse(row.legs_json || '[]'); } catch { legs = []; }
  return {
    id: Number(row.id),
    status: row.status || 'draft',
    meta: Number(row.meta || 0),
    inversion: Number(row.inversion || 0),
    legs,
    combinedOdds: Number(row.combined_odds || 1),
    projectedWin: Number(row.projected_win || 0),
    analysis: row.analysis || '',
    currentLeg: Number(row.current_leg || 0),
    result: row.result || '',
    planTier: row.plan_tier || 'reto_escalera',
    publishedAt: row.published_at || '',
    createdAt: row.created_at || '',
  };
}

async function saveRetoDraft(payload) {
  const now = new Date().toISOString();
  const result = await pool.query(
    `INSERT INTO reto_parlays
      (status, meta, inversion, legs_json, combined_odds, projected_win, analysis,
       current_leg, result, plan_tier, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      'draft',
      Number(payload.meta || 0),
      Number(payload.inversion || 0),
      JSON.stringify(payload.legs || []),
      Number(payload.combinedOdds || 1),
      Number(payload.projectedWin || 0),
      String(payload.analysis || ''),
      0,
      '',
      String(payload.planTier || 'reto_escalera'),
      now,
    ]
  );
  return { id: Number(result.rows[0].id) };
}

async function publishReto(id) {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE reto_parlays SET status='active', published_at=$1 WHERE id=$2`,
    [now, Number(id)]
  );
}

async function getActiveReto() {
  const result = await pool.query(
    `SELECT * FROM reto_parlays WHERE status='active' ORDER BY published_at DESC LIMIT 1`
  );
  return parseRetoRow(result.rows[0]);
}

async function getRetoById(id) {
  const result = await pool.query(
    `SELECT * FROM reto_parlays WHERE id=$1`,
    [Number(id)]
  );
  return parseRetoRow(result.rows[0]);
}

async function listRetos(limit = 20) {
  const result = await pool.query(
    `SELECT * FROM reto_parlays WHERE status != 'draft'
     ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit || 20)))]
  );
  return result.rows.map(parseRetoRow);
}

async function listAllRetos(limit = 50) {
  const result = await pool.query(
    `SELECT * FROM reto_parlays ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit || 50)))]
  );
  return result.rows.map(parseRetoRow);
}

async function updateRetoLegResult({ retoId, legIndex, result: legResult }) {
  const reto = await getRetoById(retoId);
  if (!reto) throw new Error('Reto not found');

  const legs = reto.legs;
  if (legIndex < 0 || legIndex >= legs.length) throw new Error('Invalid legIndex');

  legs[legIndex] = { ...legs[legIndex], result: legResult };

  const anyLost = legs.some(l => l.result === 'lost');
  const allWon = legs.every(l => l.result === 'won');
  const nextPending = legs.findIndex(l => !l.result || l.result === '');
  const newCurrentLeg = anyLost ? legIndex : (nextPending >= 0 ? nextPending : legs.length - 1);
  const newStatus = anyLost ? 'failed' : allWon ? 'completed' : 'active';
  const newResult = anyLost ? 'lost' : allWon ? 'won' : 'in_progress';

  await pool.query(
    `UPDATE reto_parlays
     SET legs_json=$1, current_leg=$2, status=$3, result=$4
     WHERE id=$5`,
    [JSON.stringify(legs), newCurrentLeg, newStatus, newResult, Number(retoId)]
  );
  return getRetoById(retoId);
}

async function deletePickAndCandidates(pickId) {
  // Get the event_id first so we can also clear its candidates
  const pickRes = await pool.query(`SELECT event_id FROM ai_picks WHERE id=$1`, [Number(pickId)]);
  if (!pickRes.rows.length) return { deleted: false, reason: "not_found" };
  const eventId = pickRes.rows[0].event_id;
  await pool.query(`DELETE FROM ai_pick_candidates WHERE event_id=$1`, [eventId]);
  await pool.query(`DELETE FROM ai_picks WHERE id=$1`, [Number(pickId)]);
  return { deleted: true, eventId };
}

module.exports = {
  DB_META,
  initDb,
  ensureUser,
  getFeed,
  getMetrics,
  getWeeklyRanking,
  saveAssignments,
  saveCheckin,
  saveNutritionPlan,
  saveRoutine,
  saveSupportAlert,
  createPaymentRequest,
  listPendingPaymentRequests,
  reviewPaymentRequest,
  setUserRole,
  grantSubscription,
  savePickCandidates,
  getPickCandidateById,
  markCandidatePublished,
  getAppSetting,
  setAppSetting,
  recordAiUsage,
  listAiUsageLogs,
  getSubscription,
  getUserPayments,
  getUserByEmail,
  searchUsers,
  upsertCoachFlow,
  getCoachFlowByPhone,
  getCoachFlowByUser,
  saveOnboardingProfile,
  deleteUser,
  upsertSportsEvent,
  getSportsEventByExternalId,
  getSportsEventById,
  getSportsEventsByDate,
  listRecentSportsEvents,
  saveEventStats,
  getLatestEventStats,
  saveAiPick,
  getLatestAiPickForEvent,
  listPicksByDate,
  listPickHistory,
  updatePickResult,
  logApiSync,
  listApiSyncLogs,
  getAdminDashboard,
  getAdminTimeline,
  getAdminCsvReport,
  saveRetoDraft,
  publishReto,
  getActiveReto,
  getRetoById,
  listRetos,
  listAllRetos,
  updateRetoLegResult,
  deletePickAndCandidates,
};
