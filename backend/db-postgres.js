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
  databaseUrl: DATABASE_URL,
};

const nowIso = () => new Date().toISOString();
const safeStr = (value) => String(value || "").trim();
const normalizeEmail = (value) => safeStr(value).toLowerCase();

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
`;

async function initDb() {
  await pool.query(SCHEMA_SQL);
  return DB_META;
}

async function ensureUserRecord(userId, opts = {}) {
  const id = normalizeEmail(userId);
  if (!id) {
    throw new Error("email_required");
  }
  const now = nowIso();
  const email = id;
  const name = safeStr(opts.name) || "User";
  const whatsapp = safeStr(opts.whatsapp);
  const role = safeStr(opts.role) || "user";
  const plan = safeStr(opts.plan) || "Free";
  const goal = safeStr(opts.goal);
  const checkinSchedule = safeStr(opts.checkinSchedule);

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
    [id, name, email, whatsapp, role, plan, goal, checkinSchedule, now, now]
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
  if (!title || !target || !duration) {
    throw new Error("routine_fields_required");
  }
  const now = nowIso();
  const result = await pool.query(
    `
    INSERT INTO routines (title, target, duration, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id
    `,
    [title, target, duration, createdBy, now]
  );
  return {
    id: Number(result.rows[0].id),
    title,
    target,
    duration,
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
      await client.query(
        `
        INSERT INTO assignments (user_id, mode, routine, diet, message, created_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (user_id) DO UPDATE SET
          mode = EXCLUDED.mode,
          routine = EXCLUDED.routine,
          diet = EXCLUDED.diet,
          message = EXCLUDED.message,
          created_by = EXCLUDED.created_by,
          updated_at = EXCLUDED.updated_at
        `,
        [userId, mode, routine, diet, message, createdBy, now]
      );
      updated.push({ userId, mode, routine, diet, message, updatedAt: now });
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
    pool.query("SELECT id, title, target, duration, created_at AS \"createdAt\" FROM routines ORDER BY created_at DESC"),
    pool.query("SELECT id, title, focus, note, created_at AS \"createdAt\" FROM nutrition_plans ORDER BY created_at DESC"),
    pool.query(
      `
      SELECT user_id AS "userId", mode, routine, diet, message, updated_at AS "updatedAt"
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
    SELECT id, name, email, whatsapp, role, plan, goal, checkin_schedule AS "checkinSchedule"
    FROM users
    WHERE name ILIKE $1 OR email ILIKE $1
    ORDER BY updated_at DESC
    LIMIT 50
    `,
    [needle]
  );
  return result.rows;
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
               a.mode, a.created_by AS "createdBy"
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
               a.mode, a.created_by AS "createdBy"
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
    extras: row.extras || {},
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
  const result = await pool.query(
    `
    INSERT INTO payment_requests (user_id, plan_id, plan_label, extras_json, method, proof_target, status, reviewed_by, note, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,'pending','','',$7,$7)
    RETURNING id
    `,
    [userId, planId, planLabel, extras, method, proofTarget, now]
  );
  await pool.query(
    `
    INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
    VALUES ($1,$2,$3,$4,'pending',NULL,NULL,$5)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_label = EXCLUDED.plan_label,
      extras_json = EXCLUDED.extras_json,
      status = EXCLUDED.status,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, planId, planLabel, extras, now]
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
    extras: row.extras || {},
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
      VALUES ($1,$2,$3,$4,'active',$5,$6,$5)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        plan_label = EXCLUDED.plan_label,
        extras_json = EXCLUDED.extras_json,
        status = EXCLUDED.status,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        updated_at = EXCLUDED.updated_at
      `,
      [req.userId, req.planId || "free", req.planLabel || "Free", req.extras || {}, now, end.toISOString()]
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
    extras: row.extras || {},
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
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (user_id) DO UPDATE SET
      phone = EXCLUDED.phone,
      step = EXCLUDED.step,
      status = EXCLUDED.status,
      answers_json = EXCLUDED.answers_json,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, phone, step, status, answers, now]
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
    answers: row.answers || {},
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
    answers: row.answers || {},
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
    VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET
      answers_json = EXCLUDED.answers_json,
      updated_at = EXCLUDED.updated_at
    `,
    [userId, answers, now]
  );
  return { userId, updatedAt: now };
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
  getSubscription,
  getUserPayments,
  getUserByEmail,
  searchUsers,
  upsertCoachFlow,
  getCoachFlowByPhone,
  getCoachFlowByUser,
  saveOnboardingProfile,
  getAdminDashboard,
  getAdminTimeline,
  getAdminCsvReport,
};
