const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "fitnes.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'Free',
  goal TEXT DEFAULT '',
  checkin_schedule TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  completed_days INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  duration TEXT NOT NULL,
  created_by TEXT DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nutrition_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'admin_ai',
  routine TEXT DEFAULT '',
  diet TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_by TEXT DEFAULT 'admin',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_seconds INTEGER NOT NULL DEFAULT 0,
  penalty_minutes INTEGER NOT NULL DEFAULT 0,
  date_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  extras_json TEXT DEFAULT '{}',
  method TEXT NOT NULL DEFAULT 'transfer',
  proof_target TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free',
  plan_label TEXT NOT NULL DEFAULT 'Free',
  extras_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'inactive',
  start_at TEXT,
  end_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_whatsapp_flows (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  answers_json TEXT DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  target_user_ids_json TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL DEFAULT 'admin_ai',
  provider TEXT NOT NULL DEFAULT 'fallback',
  model TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'served',
  reason TEXT DEFAULT '',
  prompt_chars INTEGER NOT NULL DEFAULT 0,
  context_chars INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

const nowIso = () => new Date().toISOString();
const safeStr = (value) => String(value || "").trim();
const normalizeEmail = (value) => safeStr(value).toLowerCase();

const insertUserStmt = db.prepare(`
INSERT INTO users (id, name, email, whatsapp, role, plan, goal, checkin_schedule, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  whatsapp = excluded.whatsapp,
  role = excluded.role,
  plan = excluded.plan,
  goal = excluded.goal,
  checkin_schedule = excluded.checkin_schedule,
  updated_at = excluded.updated_at
`);

const ensureMetricsStmt = db.prepare(`
INSERT INTO metrics (user_id, updated_at)
VALUES (?, ?)
ON CONFLICT(user_id) DO NOTHING
`);

const getUserStmt = db.prepare("SELECT * FROM users WHERE id = ?");
const getMetricsStmt = db.prepare("SELECT * FROM metrics WHERE user_id = ?");
const getFeedRoutinesStmt = db.prepare("SELECT id, title, target, duration, created_at AS createdAt FROM routines ORDER BY created_at DESC");
const getFeedPlansStmt = db.prepare("SELECT id, title, focus, note, created_at AS createdAt FROM nutrition_plans ORDER BY created_at DESC");
const getAssignmentStmt = db.prepare(`
SELECT user_id AS userId, mode, routine, diet, message, updated_at AS updatedAt
FROM assignments
WHERE user_id = ?
`);

const insertRoutineStmt = db.prepare(`
INSERT INTO routines (title, target, duration, created_by, created_at)
VALUES (?, ?, ?, ?, ?)
`);

const insertNutritionStmt = db.prepare(`
INSERT INTO nutrition_plans (title, focus, note, created_by, created_at)
VALUES (?, ?, ?, ?, ?)
`);

const upsertAssignmentStmt = db.prepare(`
INSERT INTO assignments (user_id, mode, routine, diet, message, created_by, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  mode = excluded.mode,
  routine = excluded.routine,
  diet = excluded.diet,
  message = excluded.message,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at
`);

const insertCheckinStmt = db.prepare(`
INSERT INTO checkins (user_id, status, response_seconds, penalty_minutes, date_key, created_at)
VALUES (?, ?, ?, ?, ?, ?)
`);

const updateMetricsStmt = db.prepare(`
UPDATE metrics
SET streak = ?,
    best_streak = ?,
    total_days = ?,
    completed_days = ?,
    failures = ?,
    xp = ?,
    updated_at = ?
WHERE user_id = ?
`);

const searchUsersStmt = db.prepare(`
SELECT
  u.id,
  u.name,
  u.email,
  u.whatsapp,
  u.role,
  COALESCE(s.plan_label, u.plan) AS plan,
  COALESCE(s.status, 'inactive') AS subscriptionStatus,
  u.goal,
  u.checkin_schedule AS checkinSchedule,
  op.answers_json AS onboardingAnswers
FROM users u
LEFT JOIN onboarding_profiles op ON op.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.name LIKE ? OR u.email LIKE ?
ORDER BY u.updated_at DESC
LIMIT 50
`);

const rankingStmt = db.prepare(`
SELECT u.name, u.email, m.streak, m.xp, m.completed_days AS completedDays, m.total_days AS totalDays
FROM metrics m
INNER JOIN users u ON u.id = m.user_id
ORDER BY (m.xp + (m.streak * 5)) DESC, m.updated_at DESC
LIMIT 20
`);

const adminDashboardStmt = db.prepare(`
SELECT
  u.id,
  u.name,
  u.email,
  u.checkin_schedule AS checkinSchedule,
  op.answers_json AS onboardingAnswers,
  COALESCE(m.streak, 0) AS streak,
  COALESCE(m.total_days, 0) AS totalDays,
  COALESCE(m.completed_days, 0) AS completedDays,
  COALESCE(m.failures, 0) AS failures,
  COALESCE(m.xp, 0) AS xp,
  CAST(
    CASE
      WHEN COALESCE(m.total_days, 0) > 0 THEN ROUND((COALESCE(m.completed_days, 0) * 100.0) / m.total_days)
      ELSE 0
    END
    AS INTEGER
  ) AS compliance,
  (
    SELECT c.date_key
    FROM checkins c
    WHERE c.user_id = u.id
    ORDER BY c.created_at DESC
    LIMIT 1
  ) AS lastCheckinDate,
  (
    SELECT c.status
    FROM checkins c
    WHERE c.user_id = u.id
    ORDER BY c.created_at DESC
    LIMIT 1
  ) AS lastCheckinStatus,
  a.updated_at AS assignmentUpdatedAt
FROM users u
LEFT JOIN onboarding_profiles op ON op.user_id = u.id
LEFT JOIN metrics m ON m.user_id = u.id
LEFT JOIN assignments a ON a.user_id = u.id
WHERE LOWER(COALESCE(u.role, 'user')) <> 'admin'
ORDER BY COALESCE(m.updated_at, u.updated_at) DESC, u.updated_at DESC
LIMIT 200
`);

const timelineCheckinsAllStmt = db.prepare(`
SELECT
  c.created_at AS at,
  'checkin' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  c.status AS status,
  c.date_key AS dateKey,
  c.response_seconds AS responseSeconds
FROM checkins c
INNER JOIN users u ON u.id = c.user_id
ORDER BY c.created_at DESC
LIMIT ?
`);

const timelineCheckinsByUserStmt = db.prepare(`
SELECT
  c.created_at AS at,
  'checkin' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  c.status AS status,
  c.date_key AS dateKey,
  c.response_seconds AS responseSeconds
FROM checkins c
INNER JOIN users u ON u.id = c.user_id
WHERE c.user_id = ?
ORDER BY c.created_at DESC
LIMIT ?
`);

const timelineAssignmentsAllStmt = db.prepare(`
SELECT
  a.updated_at AS at,
  'assignment' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  a.mode AS mode,
  a.created_by AS createdBy
FROM assignments a
INNER JOIN users u ON u.id = a.user_id
ORDER BY a.updated_at DESC
LIMIT ?
`);

const timelineAssignmentsByUserStmt = db.prepare(`
SELECT
  a.updated_at AS at,
  'assignment' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  a.mode AS mode,
  a.created_by AS createdBy
FROM assignments a
INNER JOIN users u ON u.id = a.user_id
WHERE a.user_id = ?
ORDER BY a.updated_at DESC
LIMIT ?
`);

const timelineSupportAlertsAllStmt = db.prepare(`
SELECT
  s.created_at AS at,
  'support_alert' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  s.message AS message
FROM support_alerts s
INNER JOIN users u ON u.id = s.user_id
ORDER BY s.created_at DESC
LIMIT ?
`);

const timelineSupportAlertsByUserStmt = db.prepare(`
SELECT
  s.created_at AS at,
  'support_alert' AS type,
  u.id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  s.message AS message
FROM support_alerts s
INNER JOIN users u ON u.id = s.user_id
WHERE s.user_id = ?
ORDER BY s.created_at DESC
LIMIT ?
`);

const insertSupportAlertStmt = db.prepare(`
INSERT INTO support_alerts (user_id, message, created_at)
VALUES (?, ?, ?)
`);

const insertPaymentRequestStmt = db.prepare(`
INSERT INTO payment_requests (user_id, plan_id, plan_label, extras_json, method, proof_target, status, reviewed_by, note, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, 'pending', '', '', ?, ?)
`);

const pendingPaymentRequestsStmt = db.prepare(`
SELECT
  p.id,
  p.user_id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  p.plan_id AS planId,
  p.plan_label AS planLabel,
  p.extras_json AS extrasJson,
  p.method,
  p.proof_target AS proofTarget,
  p.status,
  p.created_at AS createdAt,
  p.updated_at AS updatedAt
FROM payment_requests p
INNER JOIN users u ON u.id = p.user_id
WHERE p.status = 'pending'
ORDER BY p.created_at DESC
LIMIT 200
`);

const pendingPaymentRequestByUserPlanStmt = db.prepare(`
SELECT
  id,
  user_id AS userId,
  plan_id AS planId,
  plan_label AS planLabel,
  extras_json AS extrasJson,
  method,
  proof_target AS proofTarget,
  status,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM payment_requests
WHERE user_id = ? AND plan_id = ? AND status = 'pending'
ORDER BY created_at DESC
LIMIT 1
`);

const paymentRequestByIdStmt = db.prepare(`
SELECT
  id,
  user_id AS userId,
  plan_id AS planId,
  plan_label AS planLabel,
  extras_json AS extrasJson,
  status
FROM payment_requests
WHERE id = ?
LIMIT 1
`);

const updatePaymentRequestStatusStmt = db.prepare(`
UPDATE payment_requests
SET status = ?, reviewed_by = ?, note = ?, updated_at = ?
WHERE id = ?
`);

const upsertSubscriptionStmt = db.prepare(`
INSERT INTO subscriptions (user_id, plan_id, plan_label, extras_json, status, start_at, end_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  plan_id = excluded.plan_id,
  plan_label = excluded.plan_label,
  extras_json = excluded.extras_json,
  status = excluded.status,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  updated_at = excluded.updated_at
`);

const upsertSettingStmt = db.prepare(`
INSERT INTO app_settings (key, value_json, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET
  value_json = excluded.value_json,
  updated_at = excluded.updated_at
`);

const getSettingStmt = db.prepare(`
SELECT key, value_json AS valueJson, updated_at AS updatedAt
FROM app_settings
WHERE key = ?
LIMIT 1
`);

const insertAiUsageStmt = db.prepare(`
INSERT INTO ai_usage_logs (
  actor_email, target_user_ids_json, mode, provider, model, status, reason, prompt_chars, context_chars, created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listAiUsageLogsStmt = db.prepare(`
SELECT
  actor_email AS actorEmail,
  target_user_ids_json AS targetUserIdsJson,
  mode,
  provider,
  model,
  status,
  reason,
  prompt_chars AS promptChars,
  context_chars AS contextChars,
  created_at AS createdAt
FROM ai_usage_logs
WHERE substr(created_at, 1, 7) = ?
ORDER BY created_at DESC
LIMIT 5000
`);

const getSubscriptionStmt = db.prepare(`
SELECT
  user_id AS userId,
  plan_id AS planId,
  plan_label AS planLabel,
  extras_json AS extrasJson,
  status,
  start_at AS startAt,
  end_at AS endAt,
  updated_at AS updatedAt
FROM subscriptions
WHERE user_id = ?
LIMIT 1
`);

const updateUserPlanStmt = db.prepare(`
UPDATE users
SET plan = ?, updated_at = ?
WHERE id = ?
`);

const updateUserRoleStmt = db.prepare(`
UPDATE users
SET role = ?, updated_at = ?
WHERE id = ?
`);

const userPaymentsStmt = db.prepare(`
SELECT
  id,
  user_id AS userId,
  plan_id AS planId,
  plan_label AS planLabel,
  extras_json AS extrasJson,
  method,
  proof_target AS proofTarget,
  status,
  reviewed_by AS reviewedBy,
  note,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM payment_requests
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 40
`);

const weeklyAggregateStmt = db.prepare(`
SELECT
  c.date_key AS dateKey,
  COUNT(*) AS total,
  SUM(CASE WHEN c.status = 'yes' THEN 1 ELSE 0 END) AS yesCount,
  SUM(CASE WHEN c.status = 'no' THEN 1 ELSE 0 END) AS noCount,
  SUM(CASE WHEN c.status = 'timeout' THEN 1 ELSE 0 END) AS timeoutCount
FROM checkins c
WHERE c.date_key >= ? AND c.date_key <= ?
GROUP BY c.date_key
ORDER BY c.date_key DESC
`);

const userReportMetricsStmt = db.prepare(`
SELECT
  u.id,
  u.name,
  u.email,
  COALESCE(m.streak, 0) AS streak,
  COALESCE(m.total_days, 0) AS totalDays,
  COALESCE(m.completed_days, 0) AS completedDays,
  COALESCE(m.failures, 0) AS failures,
  COALESCE(m.xp, 0) AS xp
FROM users u
LEFT JOIN metrics m ON m.user_id = u.id
WHERE u.id = ?
LIMIT 1
`);

const userReportCheckinsStmt = db.prepare(`
SELECT
  c.date_key AS dateKey,
  c.status,
  c.response_seconds AS responseSeconds,
  c.penalty_minutes AS penaltyMinutes,
  c.created_at AS at
FROM checkins c
WHERE c.user_id = ?
ORDER BY c.created_at DESC
LIMIT 50
`);

const upsertCoachFlowStmt = db.prepare(`
INSERT INTO coach_whatsapp_flows (user_id, phone, step, status, answers_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  phone = excluded.phone,
  step = excluded.step,
  status = excluded.status,
  answers_json = excluded.answers_json,
  updated_at = excluded.updated_at
`);

const upsertOnboardingProfileStmt = db.prepare(`
INSERT INTO onboarding_profiles (user_id, answers_json, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  answers_json = excluded.answers_json,
  updated_at = excluded.updated_at
`);

const getCoachFlowByPhoneStmt = db.prepare(`
SELECT user_id AS userId, phone, step, status, answers_json AS answersJson, updated_at AS updatedAt
FROM coach_whatsapp_flows
WHERE phone = ?
LIMIT 1
`);

const getCoachFlowByUserStmt = db.prepare(`
SELECT user_id AS userId, phone, step, status, answers_json AS answersJson, updated_at AS updatedAt
FROM coach_whatsapp_flows
WHERE user_id = ?
LIMIT 1
`);

function ensureUser(payload) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error("email_required");
  }
  const id = email;
  const existing = getUserStmt.get(id);
  const now = nowIso();
  const name = safeStr(payload.name) || (existing && existing.name) || "User";
  const whatsapp = safeStr(payload.whatsapp) || (existing && existing.whatsapp) || "";
  const role = safeStr(payload.role) || (existing && existing.role) || "user";
  const plan = safeStr(payload.plan) || (existing && existing.plan) || "Free";
  const goal = safeStr(payload.goal) || (existing && existing.goal) || "";
  const checkinSchedule = safeStr(payload.checkinSchedule) || (existing && existing.checkin_schedule) || "";
  const createdAt = (existing && existing.created_at) || now;

  insertUserStmt.run(id, name, email, whatsapp, role, plan, goal, checkinSchedule, createdAt, now);
  ensureMetricsStmt.run(id, now);
  return getUserStmt.get(id);
}

function getMetrics(userId) {
  const metrics = getMetricsStmt.get(userId);
  if (!metrics) {
    return null;
  }
  return {
    userId,
    streak: Number(metrics.streak || 0),
    bestStreak: Number(metrics.best_streak || 0),
    totalDays: Number(metrics.total_days || 0),
    completedDays: Number(metrics.completed_days || 0),
    failures: Number(metrics.failures || 0),
    xp: Number(metrics.xp || 0),
    updatedAt: metrics.updated_at,
  };
}

function saveRoutine(payload) {
  const title = safeStr(payload.title);
  const target = safeStr(payload.target);
  const duration = safeStr(payload.duration);
  const createdBy = safeStr(payload.createdBy) || "admin";
  if (!title || !target || !duration) {
    throw new Error("routine_fields_required");
  }
  const now = nowIso();
  const result = insertRoutineStmt.run(title, target, duration, createdBy, now);
  return {
    id: Number(result.lastInsertRowid),
    title,
    target,
    duration,
    createdBy,
    createdAt: now,
  };
}

function saveNutritionPlan(payload) {
  const title = safeStr(payload.title);
  const focus = safeStr(payload.focus);
  const note = safeStr(payload.note);
  const createdBy = safeStr(payload.createdBy) || "admin";
  if (!title || !focus || !note) {
    throw new Error("nutrition_fields_required");
  }
  const now = nowIso();
  const result = insertNutritionStmt.run(title, focus, note, createdBy, now);
  return {
    id: Number(result.lastInsertRowid),
    title,
    focus,
    note,
    createdBy,
    createdAt: now,
  };
}

function saveAssignments(payload) {
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

  const updated = [];
  db.exec("BEGIN");
  try {
    for (const userId of userIds) {
      ensureMetricsStmt.run(userId, now);
      upsertAssignmentStmt.run(userId, mode, routine, diet, message, createdBy, now);
      updated.push({
        userId,
        mode,
        routine,
        diet,
        message,
        updatedAt: now,
      });
    }
    db.exec("COMMIT");
    return updated;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getFeed(userId) {
  const routines = getFeedRoutinesStmt.all();
  const plans = getFeedPlansStmt.all();
  const assignment = getAssignmentStmt.get(userId) || null;
  return { routines, plans, assignment };
}

function searchUsers(rawSearch) {
  const term = safeStr(rawSearch);
  const needle = `%${term}%`;
  return searchUsersStmt.all(needle, needle);
}

function saveCheckin(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  ensureMetricsStmt.run(userId, nowIso());

  const status = safeStr(payload.status) || "pending";
  const responseSeconds = Math.max(0, Number(payload.responseSeconds || 0));
  const penaltyMinutes = Math.max(0, Number(payload.penaltyMinutes || 0));
  const dateKey = safeStr(payload.dateKey) || nowIso().slice(0, 10);
  const createdAt = nowIso();

  insertCheckinStmt.run(userId, status, responseSeconds, penaltyMinutes, dateKey, createdAt);

  const current = getMetricsStmt.get(userId);
  if (!current) {
    throw new Error("metrics_not_found");
  }

  let streak = Number(current.streak || 0);
  let bestStreak = Number(current.best_streak || 0);
  let totalDays = Number(current.total_days || 0) + 1;
  let completedDays = Number(current.completed_days || 0);
  let failures = Number(current.failures || 0);
  let xp = Number(current.xp || 0);

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

  updateMetricsStmt.run(streak, bestStreak, totalDays, completedDays, failures, xp, nowIso(), userId);
  return getMetrics(userId);
}

function getWeeklyRanking() {
  return rankingStmt.all().map((row, index) => {
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

function getAdminDashboard(dateKey) {
  const todayKey = safeStr(dateKey) || nowIso().slice(0, 10);
  const users = adminDashboardStmt.all().map((row) => {
    const compliance = Number(row.compliance || 0);
    const status = getStatusByCompliance(compliance);
    let onboardingAnswers = {};
    try {
      onboardingAnswers = row.onboardingAnswers ? JSON.parse(row.onboardingAnswers) : {};
    } catch {
      onboardingAnswers = {};
    }
    return {
      id: row.id,
      name: row.name || "User",
      email: row.email || row.id,
      checkinSchedule: row.checkinSchedule || "",
      onboardingAnswers,
      streak: Number(row.streak || 0),
      totalDays: Number(row.totalDays || 0),
      completedDays: Number(row.completedDays || 0),
      failures: Number(row.failures || 0),
      xp: Number(row.xp || 0),
      compliance,
      status,
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

function getAdminTimeline(userId, limit = 30) {
  const normalized = normalizeEmail(userId);
  const cap = Math.max(5, Math.min(100, Number(limit || 30)));
  const checkins = normalized ? timelineCheckinsByUserStmt.all(normalized, cap) : timelineCheckinsAllStmt.all(cap);
  const assignments = normalized ? timelineAssignmentsByUserStmt.all(normalized, cap) : timelineAssignmentsAllStmt.all(cap);
  const alerts = normalized ? timelineSupportAlertsByUserStmt.all(normalized, cap) : timelineSupportAlertsAllStmt.all(cap);
  return [...checkins, ...assignments, ...alerts]
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, cap);
}

function saveSupportAlert(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  const now = nowIso();
  const message = safeStr(payload.message) || "Solicita carga de rutina y dieta para iniciar.";
  ensureUser({ email: userId, name: safeStr(payload.name) || "User", role: "user" });
  ensureMetricsStmt.run(userId, now);
  insertSupportAlertStmt.run(userId, message, now);
  return { userId, message, at: now };
}

function parseJsonSafe(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, Number(days || 30)));
  return d.toISOString();
}

function getSubscription(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) {
    throw new Error("user_id_required");
  }
  const row = getSubscriptionStmt.get(normalized);
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
    extras: parseJsonSafe(row.extrasJson, {}),
    status: row.status || "inactive",
    startAt: row.startAt || null,
    endAt: row.endAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function createPaymentRequest(payload) {
  const userId = normalizeEmail(payload.userId);
  if (!userId) {
    throw new Error("user_id_required");
  }
  ensureUser({ email: userId, name: safeStr(payload.name) || "User", role: "user" });
  const planId = safeStr(payload.planId) || "free";
  const planLabel = safeStr(payload.planLabel) || "Free";
  const extras = payload.extras && typeof payload.extras === "object" ? payload.extras : {};
  const method = safeStr(payload.method) || "transfer";
  const proofTarget = safeStr(payload.proofTarget) || "+52 000 000 0000";
  const now = nowIso();
  const existing = pendingPaymentRequestByUserPlanStmt.get(userId, planId);
  if (existing) {
    upsertSubscriptionStmt.run(userId, planId, planLabel, JSON.stringify(extras), "pending", null, null, now);
    return {
      id: Number(existing.id),
      userId,
      planId,
      planLabel: existing.planLabel || planLabel,
      extras: parseJsonSafe(existing.extrasJson, extras),
      method: existing.method || method,
      proofTarget: existing.proofTarget || proofTarget,
      status: existing.status || "pending",
      createdAt: existing.createdAt || now,
      updatedAt: existing.updatedAt || now,
      existing: true,
    };
  }
  const result = insertPaymentRequestStmt.run(userId, planId, planLabel, JSON.stringify(extras), method, proofTarget, now, now);
  upsertSubscriptionStmt.run(userId, planId, planLabel, JSON.stringify(extras), "pending", null, null, now);
  return {
    id: Number(result.lastInsertRowid),
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

function listPendingPaymentRequests() {
  return pendingPaymentRequestsStmt.all().map((row) => ({
    id: Number(row.id),
    userId: row.userId,
    userName: row.userName || "User",
    userEmail: row.userEmail || row.userId,
    planId: row.planId,
    planLabel: row.planLabel,
    extras: parseJsonSafe(row.extrasJson, {}),
    method: row.method || "transfer",
    proofTarget: row.proofTarget || "",
    status: row.status || "pending",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function reviewPaymentRequest(payload) {
  const id = Number(payload.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("payment_id_required");
  }
  const action = safeStr(payload.action).toLowerCase();
  if (action !== "approve" && action !== "reject") {
    throw new Error("invalid_action");
  }
  const request = paymentRequestByIdStmt.get(id);
  if (!request) {
    throw new Error("payment_not_found");
  }
  const now = nowIso();
  const reviewedBy = safeStr(payload.reviewedBy) || "admin";
  const note = safeStr(payload.note);
  const status = action === "approve" ? "approved" : "rejected";
  updatePaymentRequestStatusStmt.run(status, reviewedBy, note, now, id);

  if (action === "approve") {
    const durationDays = Number(payload.durationDays || (String(request.planId || "").toLowerCase() === "retos" ? 30 : 30));
    const startAt = now;
    const endAt = addDaysIso(durationDays);
    upsertSubscriptionStmt.run(
      request.userId,
      request.planId || "free",
      request.planLabel || "Free",
      request.extrasJson || "{}",
      "active",
      startAt,
      endAt,
      now
    );
    updateUserPlanStmt.run(request.planLabel || "Free", now, request.userId);
  } else {
    upsertSubscriptionStmt.run(request.userId, "free", "Free", "{}", "inactive", null, null, now);
    updateUserPlanStmt.run("Free", now, request.userId);
  }

  return {
    id,
    status,
    userId: request.userId,
    subscription: getSubscription(request.userId),
  };
}

function getUserPayments(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) {
    throw new Error("user_id_required");
  }
  return userPaymentsStmt.all(normalized).map((row) => ({
    id: Number(row.id),
    userId: row.userId,
    planId: row.planId,
    planLabel: row.planLabel,
    extras: parseJsonSafe(row.extrasJson, {}),
    method: row.method || "transfer",
    proofTarget: row.proofTarget || "",
    status: row.status || "pending",
    reviewedBy: row.reviewedBy || "",
    note: row.note || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function setUserRole(payload) {
  const userId = normalizeEmail(payload?.userId);
  if (!userId) throw new Error("user_id_required");
  const role = safeStr(payload?.role).toLowerCase() === "admin" ? "admin" : "user";
  const now = nowIso();
  ensureUser({ email: userId, role, name: safeStr(payload?.name) || "User" });
  updateUserRoleStmt.run(role, now, userId);
  const row = getUserStmt.get(userId);
  return {
    userId,
    role: row?.role || role,
    updatedAt: now,
  };
}

function grantSubscription(payload) {
  const userId = normalizeEmail(payload?.userId);
  if (!userId) throw new Error("user_id_required");
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
    endAt = addDaysIso(durationDays);
  }
  ensureUser({ email: userId, name: safeStr(payload?.name) || "User", role: "user", plan: planLabel });
  upsertSubscriptionStmt.run(userId, planId, planLabel, JSON.stringify(extras), status, startAt, endAt, now);
  updateUserPlanStmt.run(planLabel, now, userId);
  return getSubscription(userId);
}

function getAppSetting(key, fallback = {}) {
  const normalizedKey = safeStr(key);
  if (!normalizedKey) return fallback;
  const row = getSettingStmt.get(normalizedKey);
  if (!row) return fallback;
  return parseJsonSafe(row.valueJson, fallback);
}

function setAppSetting(key, value) {
  const normalizedKey = safeStr(key);
  if (!normalizedKey) throw new Error("setting_key_required");
  const now = nowIso();
  const safeValue = value && typeof value === "object" ? value : {};
  upsertSettingStmt.run(normalizedKey, JSON.stringify(safeValue), now);
  return getAppSetting(normalizedKey, {});
}

function recordAiUsage(payload) {
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
  const result = insertAiUsageStmt.run(
    actorEmail,
    JSON.stringify(targetUserIds),
    mode,
    provider,
    model,
    status,
    reason,
    promptChars,
    contextChars,
    createdAt
  );
  return {
    id: Number(result.lastInsertRowid),
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

function listAiUsageLogs(monthKey) {
  const normalizedMonth = safeStr(monthKey) || nowIso().slice(0, 7);
  return listAiUsageLogsStmt.all(normalizedMonth).map((row) => ({
    actorEmail: normalizeEmail(row.actorEmail),
    targetUserIds: parseJsonSafe(row.targetUserIdsJson, []).map(normalizeEmail).filter(Boolean),
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

function getAdminCsvReport(scope, userId) {
  const normalizedScope = safeStr(scope).toLowerCase() || "week";
  if (normalizedScope === "user") {
    const normalized = normalizeEmail(userId);
    if (!normalized) {
      throw new Error("user_id_required_for_user_scope");
    }
    const meta = userReportMetricsStmt.get(normalized);
    if (!meta) {
      throw new Error("user_not_found");
    }
    const checks = userReportCheckinsStmt.all(normalized);
    const compliance = Number(meta.totalDays || 0) > 0 ? Math.round((Number(meta.completedDays || 0) * 100) / Number(meta.totalDays || 1)) : 0;
    const rows = checks.map((c) => ({
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
    }));
    return {
      filename: `admin_user_${meta.id.replace(/[^a-z0-9]+/gi, "_")}.csv`,
      rows,
    };
  }

  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const aggregates = weeklyAggregateStmt.all(fmt(from), fmt(today));
  const rows = aggregates.map((r) => ({
    dateKey: r.dateKey,
    totalCheckins: Number(r.total || 0),
    yesCount: Number(r.yesCount || 0),
    noCount: Number(r.noCount || 0),
    timeoutCount: Number(r.timeoutCount || 0),
    compliance: Number(r.total || 0) > 0 ? Math.round((Number(r.yesCount || 0) * 100) / Number(r.total || 1)) : 0,
  }));
  return {
    filename: `admin_weekly_${fmt(today)}.csv`,
    rows,
  };
}

function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return getUserStmt.get(normalized) || null;
}

function upsertCoachFlow(payload) {
  const userId = normalizeEmail(payload.userId);
  const phone = safeStr(payload.phone);
  if (!userId) throw new Error("user_id_required");
  if (!phone) throw new Error("phone_required");
  const step = Math.max(0, Number(payload.step || 0));
  const status = safeStr(payload.status) || "active";
  const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  const now = nowIso();
  upsertCoachFlowStmt.run(userId, phone, step, status, JSON.stringify(answers), now);
  return getCoachFlowByUser(userId);
}

function getCoachFlowByPhone(phone) {
  const key = safeStr(phone);
  if (!key) return null;
  const row = getCoachFlowByPhoneStmt.get(key);
  if (!row) return null;
  return {
    userId: row.userId,
    phone: row.phone,
    step: Number(row.step || 0),
    status: row.status || "active",
    answers: parseJsonSafe(row.answersJson, {}),
    updatedAt: row.updatedAt || null,
  };
}

function getCoachFlowByUser(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) return null;
  const row = getCoachFlowByUserStmt.get(normalized);
  if (!row) return null;
  return {
    userId: row.userId,
    phone: row.phone,
    step: Number(row.step || 0),
    status: row.status || "active",
    answers: parseJsonSafe(row.answersJson, {}),
    updatedAt: row.updatedAt || null,
  };
}

function saveOnboardingProfile(payload) {
  const userId = normalizeEmail(payload?.email || payload?.userId);
  if (!userId) throw new Error("email_required");
  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};
  const now = nowIso();
  ensureUser({
    email: userId,
    name: safeStr(answers.nombre) || "User",
    role: "user",
    goal: safeStr(answers.objetivo),
    checkinSchedule: safeStr(answers.horario),
    plan: safeStr(answers.plan) || "Free",
  });
  upsertOnboardingProfileStmt.run(userId, JSON.stringify(answers), now);
  return { userId, updatedAt: now };
}

function deleteUser(userId) {
  const normalized = normalizeEmail(userId);
  if (!normalized) throw new Error("user_id_required");
  const existing = getUserStmt.get(normalized);
  if (!existing) throw new Error("user_not_found");
  db.prepare("DELETE FROM users WHERE id = ?").run(normalized);
  return {
    userId: existing.id,
    email: existing.email || existing.id,
    role: existing.role || "user",
    deleted: true,
  };
}

const DB_META = {
  client: "sqlite",
  path: DB_PATH,
};

async function initDb() {
  return DB_META;
}

module.exports = {
  DB_META,
  DB_PATH,
  initDb,
  ensureUser: async (payload) => ensureUser(payload),
  getFeed: async (userId) => getFeed(userId),
  getMetrics: async (userId) => getMetrics(userId),
  getWeeklyRanking: async () => getWeeklyRanking(),
  saveAssignments: async (payload) => saveAssignments(payload),
  saveCheckin: async (payload) => saveCheckin(payload),
  saveNutritionPlan: async (payload) => saveNutritionPlan(payload),
  saveRoutine: async (payload) => saveRoutine(payload),
  saveSupportAlert: async (payload) => saveSupportAlert(payload),
  createPaymentRequest: async (payload) => createPaymentRequest(payload),
  listPendingPaymentRequests: async () => listPendingPaymentRequests(),
  reviewPaymentRequest: async (payload) => reviewPaymentRequest(payload),
  setUserRole: async (payload) => setUserRole(payload),
  grantSubscription: async (payload) => grantSubscription(payload),
  getAppSetting: async (key, fallback) => getAppSetting(key, fallback),
  setAppSetting: async (key, value) => setAppSetting(key, value),
  recordAiUsage: async (payload) => recordAiUsage(payload),
  listAiUsageLogs: async (monthKey) => listAiUsageLogs(monthKey),
  getSubscription: async (userId) => getSubscription(userId),
  getUserPayments: async (userId) => getUserPayments(userId),
  getUserByEmail: async (email) => getUserByEmail(email),
  searchUsers: async (search) => searchUsers(search),
  upsertCoachFlow: async (payload) => upsertCoachFlow(payload),
  getCoachFlowByPhone: async (phone) => getCoachFlowByPhone(phone),
  getCoachFlowByUser: async (userId) => getCoachFlowByUser(userId),
  saveOnboardingProfile: async (payload) => saveOnboardingProfile(payload),
  deleteUser: async (userId) => deleteUser(userId),
  getAdminDashboard: async (dateKey) => getAdminDashboard(dateKey),
  getAdminTimeline: async (userId, limit) => getAdminTimeline(userId, limit),
  getAdminCsvReport: async (scope, userId) => getAdminCsvReport(scope, userId),
};
