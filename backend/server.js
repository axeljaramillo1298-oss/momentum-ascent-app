require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const { generateAiPlan, buildFallbackPlan, generateSportsPick, runDualAnalysis, analyzeMarketsGPT, claudeDecideMarket } = require("./ai");
const sportsApiService = require("./sportsApiService");
const { sendWhatsAppText, getWhatsAppConfigStatus } = require("./whatsapp");
const { startCoachOnboardingForUser, handleIncomingCoachMessage } = require("./coach-whatsapp");
const {
  DB_META,
  initDb,
  ensureUser,
  getUserByEmail,
  getFeed,
  getMetrics,
  getWeeklyRanking,
  getAdminDashboard,
  getAdminTimeline,
  getAdminCsvReport,
  upsertCoachFlow,
  getCoachFlowByPhone,
  getCoachFlowByUser,
  getSubscription,
  getUserPayments,
  saveAssignments,
  saveCheckin,
  createPaymentRequest,
  listPendingPaymentRequests,
  reviewPaymentRequest,
  setUserRole,
  grantSubscription,
  getAppSetting,
  setAppSetting,
  saveNutritionPlan,
  saveRoutine,
  saveOnboardingProfile,
  saveSupportAlert,
  searchUsers,
  deleteUser,
  recordAiUsage,
  listAiUsageLogs,
  upsertSportsEvent,
  getSportsEventById,
  getSportsEventsByDate,
  listRecentSportsEvents,
  saveEventStats,
  getLatestEventStats,
  saveAiPick,
  getLatestAiPickForEvent,
  listPicksByDate,
  listPickHistory,
  logApiSync,
  listApiSyncLogs,
  savePickCandidates,
  getPickCandidateById,
  markCandidatePublished,
} = require("./db");

const path = require("node:path");
const app = express();
const PORT = Number(process.env.PORT || 8787);
const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const GOD_MODE_USER = String(process.env.GOD_MODE_USER || "").trim();
const GOD_MODE_PASS = String(process.env.GOD_MODE_PASS || "").trim();
const GOD_MODE_SESSION_HOURS = Math.max(1, Number(process.env.GOD_MODE_SESSION_HOURS || 24));
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean)
);

// Per-admin passwords: "email:pass,email2:pass2"
const ADMIN_PASSWORDS = new Map(
  String(process.env.ADMIN_PASSWORDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx < 0) return null;
      return [entry.slice(0, idx).trim().toLowerCase(), entry.slice(idx + 1).trim()];
    })
    .filter(Boolean)
);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../www")));

const getRequestEmail = (req) => String(req.headers["x-user-email"] || "").trim().toLowerCase();
const getGodToken = (req) => String(req.headers["x-god-token"] || "").trim();
const GOD_SESSIONS = new Map();

// Rate limiting en memoria: max 10 intentos por IP en 15 min
const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const AI_MONTHLY_MAX_CALLS = Math.max(1, Number(process.env.OPENAI_MONTHLY_MAX_CALLS || 300));
const AI_ADMIN_MONTHLY_MAX_CALLS = Math.max(1, Number(process.env.OPENAI_ADMIN_MONTHLY_MAX_CALLS || 120));
const AI_TARGET_USER_MONTHLY_MAX_CALLS = Math.max(1, Number(process.env.OPENAI_TARGET_USER_MONTHLY_MAX_CALLS || 8));
const AI_COOLDOWN_MS = Math.max(0, Number(process.env.OPENAI_COOLDOWN_MS || 45_000));
const AI_MAX_USERS_PER_CALL = Math.max(1, Number(process.env.OPENAI_MAX_USERS_PER_CALL || 3));
const AI_MAX_PROMPT_CHARS = Math.max(300, Number(process.env.OPENAI_MAX_PROMPT_CHARS || 700));
const AI_MAX_CONTEXT_CHARS = Math.max(800, Number(process.env.OPENAI_MAX_CONTEXT_CHARS || 3500));
const ENABLE_LEGACY_MODULES = String(process.env.ENABLE_LEGACY_MODULES || "").trim().toLowerCase() === "true";
const getClientIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim() || "unknown";
const checkRateLimit = (ip) => {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(ip);
  if (!entry || entry.resetAt <= now) {
    RATE_LIMIT_MAP.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
};
const resetRateLimit = (ip) => RATE_LIMIT_MAP.delete(ip);
// Limpiar entradas expiradas cada 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of RATE_LIMIT_MAP.entries()) {
    if (entry.resetAt <= now) RATE_LIMIT_MAP.delete(ip);
  }
}, 30 * 60 * 1000);

const cleanupGodSessions = () => {
  const now = Date.now();
  for (const [token, session] of GOD_SESSIONS.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      GOD_SESSIONS.delete(token);
    }
  }
};
const isGodRequest = (req) => {
  cleanupGodSessions();
  const token = getGodToken(req);
  if (!token) return false;
  const session = GOD_SESSIONS.get(token);
  return Boolean(session && session.expiresAt > Date.now());
};

const defaultBillingTarget = {
  bankName: "BBVA",
  accountHolder: "Momentum Ascent",
  clabe: "012345678901234567",
  accountNumber: "",
  whatsapp: "+52 000 000 0000",
  note: "Referencia: tu correo de registro",
};

const getBillingTarget = async () => {
  const fromDb = await getAppSetting("billing_target", defaultBillingTarget);
  return { ...defaultBillingTarget, ...(fromDb && typeof fromDb === "object" ? fromDb : {}) };
};

const isAdminEmail = async (emailRaw) => {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email) return false;
  if (ADMIN_EMAILS.has(email)) return true;
  try {
    const user = await getUserByEmail(email);
    return String(user?.role || "").toLowerCase() === "admin";
  } catch {
    return false;
  }
};

const requireAdmin = async (req, res, next) => {
  if (isGodRequest(req)) {
    return next();
  }
  const email = getRequestEmail(req);
  if (await isAdminEmail(email)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "admin_only" });
};

const isCoachManageableUser = (user) => {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "admin") return false;
  const plan = String(user?.plan || "Free").trim().toLowerCase();
  const subscriptionStatus = String(user?.subscriptionStatus || "inactive").trim().toLowerCase();
  return subscriptionStatus === "active" || subscriptionStatus === "pending" || plan !== "free";
};

const requireGod = (req, res, next) => {
  if (isGodRequest(req)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "god_only" });
};

const canActAsAdmin = async (req) => {
  if (isGodRequest(req)) return true;
  const email = getRequestEmail(req);
  return isAdminEmail(email);
};

const requireSelfOrAdminByResolver = (resolver) => async (req, res, next) => {
  if (await canActAsAdmin(req)) {
    return next();
  }
  const actor = getRequestEmail(req);
  const target = String(resolver(req) || "").trim().toLowerCase();
  if (actor && target && actor === target) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "forbidden_user_scope" });
};

const requireSelfOrAdminByParam = (paramName = "userId") =>
  requireSelfOrAdminByResolver((req) => req.params?.[paramName]);
const requireSelfOrAdminByBody = (key = "userId") => requireSelfOrAdminByResolver((req) => req.body?.[key]);
const requireSelfOrAdminByAnyBodyField = (fields = ["userId"]) =>
  requireSelfOrAdminByResolver((req) => {
    const body = req.body || {};
    for (const field of fields) {
      const value = String(body?.[field] || "").trim();
      if (value) return value;
    }
    return "";
  });

const toPlainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const nowIso = () => new Date().toISOString();
const monthKeyNow = () => nowIso().slice(0, 7);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const uniqueEmails = (items) => [...new Set((Array.isArray(items) ? items : []).map(normalizeEmail).filter(Boolean))];
const isOpenAiServedLog = (row) => String(row?.provider || "").toLowerCase() === "openai" && String(row?.status || "") === "served";

const getAiLimits = () => ({
  monthlyMaxCalls: AI_MONTHLY_MAX_CALLS,
  adminMonthlyMaxCalls: AI_ADMIN_MONTHLY_MAX_CALLS,
  targetUserMonthlyMaxCalls: AI_TARGET_USER_MONTHLY_MAX_CALLS,
  cooldownMs: AI_COOLDOWN_MS,
  maxUsersPerCall: AI_MAX_USERS_PER_CALL,
  maxPromptChars: AI_MAX_PROMPT_CHARS,
  maxContextChars: AI_MAX_CONTEXT_CHARS,
});

const sanitizeAiPayload = (payload = {}) => {
  const promptRaw = String(payload.prompt || "").trim();
  const contextRaw = String(payload.context || "").trim();
  const fileTextRaw = String(payload.fileText || "").trim();
  return {
    prompt: promptRaw.slice(0, AI_MAX_PROMPT_CHARS),
    context: contextRaw.slice(0, AI_MAX_CONTEXT_CHARS),
    fileText: fileTextRaw.slice(0, AI_MAX_CONTEXT_CHARS),
    promptTrimmed: promptRaw.length > AI_MAX_PROMPT_CHARS,
    contextTrimmed: contextRaw.length > AI_MAX_CONTEXT_CHARS || fileTextRaw.length > AI_MAX_CONTEXT_CHARS,
  };
};

const summarizeAiUsage = ({ logs = [], actorEmail = "", targetUserIds = [] }) => {
  const openAiLogs = logs.filter(isOpenAiServedLog);
  const actor = normalizeEmail(actorEmail);
  const actorLogs = actor ? openAiLogs.filter((row) => normalizeEmail(row.actorEmail) === actor) : [];
  const actorLastAt = actorLogs
    .map((row) => Date.parse(row.createdAt || ""))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a)[0];
  const now = Date.now();
  const cooldownRemainingMs =
    AI_COOLDOWN_MS > 0 && Number.isFinite(actorLastAt) ? Math.max(0, actorLastAt + AI_COOLDOWN_MS - now) : 0;

  const targetCounts = new Map();
  for (const row of openAiLogs) {
    const rowTargets = uniqueEmails(row?.targetUserIds);
    for (const targetId of rowTargets) {
      targetCounts.set(targetId, Number(targetCounts.get(targetId) || 0) + 1);
    }
  }
  const selected = uniqueEmails(targetUserIds);
  const selectedTargetUsage = selected.map((userId) => ({ userId, count: Number(targetCounts.get(userId) || 0) }));
  const selectedTargetMax = selectedTargetUsage.reduce((max, item) => Math.max(max, item.count), 0);

  return {
    monthKey: monthKeyNow(),
    monthOpenAiCalls: openAiLogs.length,
    actorMonthOpenAiCalls: actorLogs.length,
    actorLastOpenAiCallAt: Number.isFinite(actorLastAt) ? new Date(actorLastAt).toISOString() : null,
    cooldownRemainingMs,
    selectedTargetUsage,
    selectedTargetMax,
    remainingGlobalCalls: Math.max(0, AI_MONTHLY_MAX_CALLS - openAiLogs.length),
    remainingActorCalls: Math.max(0, AI_ADMIN_MONTHLY_MAX_CALLS - actorLogs.length),
  };
};

const getAiQuotaReason = ({ summary, requestedUserCount = 0 }) => {
  if (requestedUserCount > AI_MAX_USERS_PER_CALL) return "ai_user_limit_exceeded";
  if (summary.monthOpenAiCalls >= AI_MONTHLY_MAX_CALLS) return "ai_global_monthly_limit_reached";
  if (summary.actorMonthOpenAiCalls >= AI_ADMIN_MONTHLY_MAX_CALLS) return "ai_admin_monthly_limit_reached";
  if (summary.cooldownRemainingMs > 0) return "ai_cooldown_active";
  if (summary.selectedTargetUsage.some((item) => item.count >= AI_TARGET_USER_MONTHLY_MAX_CALLS)) {
    return "ai_target_user_monthly_limit_reached";
  }
  return "";
};

const isWhatsAppOnboardingError = (value) => {
  const text = String(value?.message || value || "").toLowerCase();
  return (
    text.includes("whatsapp") ||
    text.includes("provider_error") ||
    text.includes("authentication error") ||
    text.includes("graph.facebook.com") ||
    text.includes("insufficient_quota") ||
    text.includes("missing_credentials")
  );
};

const normalizeWhatsAppOnboardingResult = (error) => {
  if (!isWhatsAppOnboardingError(error)) {
    return null;
  }
  return {
    ok: false,
    skipped: true,
    reason: "whatsapp_unavailable",
  };
};

const SPORTS_PICK_DISCLAIMER = "Contenido informativo. No garantiza ganancias. Apuesta con responsabilidad.";
const toDateKey = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
const isPickRecent = (pick, maxAgeHours = 8) => {
  const createdAt = Date.parse(String(pick?.createdAt || ""));
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= maxAgeHours * 60 * 60 * 1000;
};

const DEFAULT_TRACKED_LEAGUES = [
  { key: "uefa-champions-league", label: "UEFA Champions League", sport: "football", priority: 100, enabled: true },
  { key: "uefa-europa-league", label: "UEFA Europa League", sport: "football", priority: 95, enabled: true },
  { key: "uefa-conference-league", label: "UEFA Conference League", sport: "football", priority: 90, enabled: true },
  { key: "premier-league", label: "Premier League", sport: "football", priority: 100, enabled: true },
  { key: "la-liga", label: "La Liga", sport: "football", priority: 100, enabled: true },
  { key: "serie-a", label: "Serie A", sport: "football", priority: 98, enabled: true },
  { key: "bundesliga", label: "Bundesliga", sport: "football", priority: 98, enabled: true },
  { key: "ligue-1", label: "Ligue 1", sport: "football", priority: 96, enabled: true },
  { key: "primeira-liga", label: "Primeira Liga", sport: "football", priority: 94, enabled: true },
  { key: "saudi-pro-league", label: "Saudi Pro League", sport: "football", priority: 92, enabled: true },
  { key: "liga-mx", label: "Liga MX", sport: "football", priority: 94, enabled: true },
  { key: "nba", label: "NBA", sport: "basketball", priority: 98, enabled: true },
];

const safeArray = (value) => (Array.isArray(value) ? value : []);
const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const normalizeLeagueLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const toObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {});
const mergeObjects = (...values) => Object.assign({}, ...values.map((item) => toObject(item)));

const getTrackedLeagues = async () => {
  const stored = await getAppSetting("sports_tracked_leagues", DEFAULT_TRACKED_LEAGUES);
  const list = safeArray(stored)
    .map((item) => ({
      key: slugify(item?.key || item?.label || ""),
      label: String(item?.label || "").trim(),
      sport: String(item?.sport || "football").trim().toLowerCase(),
      priority: Math.max(0, Number(item?.priority || 0)),
      enabled: item?.enabled !== false,
      externalLeagueId: Number(item?.externalLeagueId || 0) || null,
    }))
    .filter((item) => item.key && item.label);
  return list.length ? list : DEFAULT_TRACKED_LEAGUES;
};

const eventMatchesTrackedLeagues = (event, trackedLeagues = []) => {
  const normalizedLeague = normalizeLeagueLabel(event?.league);
  const normalizedSport = String(event?.sport || "").trim().toLowerCase();
  const rawLeagueId = Number(event?.rawJson?.league?.id || 0);
  return trackedLeagues.some((item) => {
    if (item.enabled === false) return false;
    if (item.sport && item.sport !== normalizedSport) return false;
    if (normalizeLeagueLabel(item.label) === normalizedLeague) return true;
    if (Number(item.externalLeagueId || 0) > 0 && Number(item.externalLeagueId) === rawLeagueId) return true;
    return false;
  });
};

const syncSportsEvents = async () => {
  const trackedLeagues = await getTrackedLeagues();
  const events = await sportsApiService.getTodayEvents();
  const filteredEvents = Array.isArray(events) ? events.filter((event) => eventMatchesTrackedLeagues(event, trackedLeagues)) : [];
  const selectedEvents = filteredEvents.length ? filteredEvents : safeArray(events);
  const saved = [];
  for (const event of selectedEvents) {
    const row = await upsertSportsEvent(event);
    saved.push(row);
    if (event?.stats && typeof event.stats === "object") {
      await saveEventStats({
        eventId: row.id,
        sourceApi: String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock",
        statsJson: event.stats,
      });
    }
  }
  await logApiSync({
    sourceApi: String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock",
    endpoint: "/today",
    status: "ok",
    message: `Eventos sincronizados: ${saved.length} de ${safeArray(events).length} (filtrados por ligas objetivo: ${filteredEvents.length})`,
  });
  return saved;
};

const requireLegacyModules = (req, res, next) => {
  if (ENABLE_LEGACY_MODULES) {
    return next();
  }
  return res.status(410).json({ ok: false, error: "legacy_disabled" });
};

const normalizeAuthPhone = (value) => String(value || "").replace(/\D+/g, "");

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "momentum-ascent-sports-backend",
    db: DB_META,
    now: new Date().toISOString(),
  });
});

app.post("/auth/login", async (req, res) => {
  try {
    const ip = getClientIp(req);
    const payload = req.body || {};
    const email = String(payload.email || "").trim().toLowerCase();
    const intent = String(payload.intent || "").trim().toLowerCase();
    const strictLogin = intent === "login";
    if (strictLogin && checkRateLimit(ip)) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: RATE_LIMIT_WINDOW_MS });
    }
    const previous = email ? await getUserByEmail(email) : null;
    const wasAdmin = String(previous?.role || "").toLowerCase() === "admin";
    const isAdminByAllowlist = ADMIN_EMAILS.has(email);
    if (strictLogin && !previous && !isAdminByAllowlist) {
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }
    const resolvedRole = wasAdmin || isAdminByAllowlist ? "admin" : "user";
    if (resolvedRole === "admin") {
      const configuredPassword = String(ADMIN_PASSWORDS.get(email) || "").trim();
      if (!configuredPassword) {
        return res.status(403).json({ ok: false, error: "admin_password_not_configured" });
      }
      const provided = String(payload.password || "").trim();
      if (!provided || provided !== configuredPassword) {
        return res.status(401).json({ ok: false, error: "invalid_password" });
      }
    } else if (strictLogin) {
      const expectedWhatsapp = normalizeAuthPhone(previous?.whatsapp || "");
      const providedWhatsapp = normalizeAuthPhone(payload.whatsapp || "");
      if (!expectedWhatsapp) {
        return res.status(409).json({ ok: false, error: "whatsapp_not_configured" });
      }
      if (!providedWhatsapp || providedWhatsapp !== expectedWhatsapp) {
        return res.status(401).json({ ok: false, error: "invalid_whatsapp" });
      }
    }
    const user = await ensureUser({
      ...payload,
      role: resolvedRole,
    });
    let onboardingProfile = null;
    if (ENABLE_LEGACY_MODULES) {
      try {
        const candidates = email ? await searchUsers(email) : [];
        onboardingProfile =
          candidates.find((candidate) => String(candidate?.id || candidate?.email || "").trim().toLowerCase() === email) || null;
      } catch (error) {
        console.warn("[backend] auth/login profile lookup skipped:", String(error?.message || error));
      }
    }
    if (strictLogin) {
      resetRateLimit(ip);
    }
    let onboarding = null;
    const isNew = !previous;
    const hasNewWhatsapp = !String(previous?.whatsapp || "").trim() && String(user?.whatsapp || "").trim();
    if (ENABLE_LEGACY_MODULES && (isNew || hasNewWhatsapp) && user?.whatsapp) {
      try {
        onboarding = await startCoachOnboardingForUser(user, {
          getCoachFlowByUser,
          upsertCoachFlow,
          saveOnboardingProfile,
          searchUsers,
        });
      } catch (err) {
        const normalized = normalizeWhatsAppOnboardingResult(err);
        if (!normalized) throw err;
        onboarding = normalized;
        console.warn("[backend] whatsapp onboarding skipped:", String(err.message || err));
      }
    }
    const metrics = ENABLE_LEGACY_MODULES
      ? await getMetrics(user.id)
      : {
          userId: user.id,
          streak: 0,
          bestStreak: 0,
          totalDays: 0,
          completedDays: 0,
          failures: 0,
          xp: 0,
        };
    const onboardingAnswers = toPlainObject(onboardingProfile?.onboardingAnswers);
    const onboardingComplete = ENABLE_LEGACY_MODULES
      ? Boolean(String(user?.goal || "").trim() || String(user?.checkin_schedule || "").trim() || Object.keys(onboardingAnswers).length)
      : true;
    res.json({
      ok: true,
      isNew,
      onboarding,
      onboardingProfile: {
        complete: onboardingComplete,
        answers: onboardingAnswers,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp || "",
        role: user.role || "user",
        plan: user.plan || "Free",
        goal: user.goal || "",
        checkin_schedule: user.checkin_schedule || "",
        onboardingComplete,
        onboardingAnswers,
      },
      metrics,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "login_failed") });
  }
});

app.post("/god/login", async (req, res) => {
  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: RATE_LIMIT_WINDOW_MS });
  }
  try {
    if (!GOD_MODE_USER || !GOD_MODE_PASS) {
      return res.status(503).json({ ok: false, error: "god_mode_disabled" });
    }
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "").trim();
    const validUser = username.toLowerCase() === GOD_MODE_USER.toLowerCase();
    if (!validUser || password !== GOD_MODE_PASS) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
    resetRateLimit(ip); // reset al loguearse bien
    cleanupGodSessions();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + GOD_MODE_SESSION_HOURS * 60 * 60 * 1000;
    GOD_SESSIONS.set(token, { username, expiresAt });
    res.json({ ok: true, token, expiresAt: new Date(expiresAt).toISOString() });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "god_login_failed") });
  }
});

app.post("/god/logout", requireGod, async (req, res) => {
  const token = getGodToken(req);
  if (token) {
    GOD_SESSIONS.delete(token);
  }
  res.json({ ok: true });
});

app.get("/god/settings/billing-target", requireGod, async (req, res) => {
  try {
    const billing = await getBillingTarget();
    res.json({ ok: true, billing });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "god_billing_target_failed") });
  }
});

app.post("/god/settings/billing-target", requireGod, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const nextValue = {
      bankName: String(payload.bankName || "").trim(),
      accountHolder: String(payload.accountHolder || "").trim(),
      clabe: String(payload.clabe || "").trim(),
      accountNumber: String(payload.accountNumber || "").trim(),
      whatsapp: String(payload.whatsapp || "").trim(),
      note: String(payload.note || "").trim(),
    };
    const billing = await setAppSetting("billing_target", nextValue);
    res.json({ ok: true, billing: { ...defaultBillingTarget, ...billing } });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "god_billing_update_failed") });
  }
});

app.post("/god/users/role", requireGod, async (req, res) => {
  try {
    const result = await setUserRole(req.body || {});
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "god_set_role_failed") });
  }
});

app.post("/god/users/grant-plan", requireGod, async (req, res) => {
  try {
    const subscription = await grantSubscription(req.body || {});
    res.json({ ok: true, subscription });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "god_grant_plan_failed") });
  }
});

app.post("/god/users/delete", requireGod, async (req, res) => {
  try {
    const userId = String(req.body?.userId || req.body?.email || "").trim().toLowerCase();
    if (!userId) throw new Error("user_id_required");
    const result = await deleteUser(userId);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "god_delete_user_failed") });
  }
});

app.post("/coach/onboarding/start", requireLegacyModules, requireSelfOrAdminByAnyBodyField(["email", "userId"]), async (req, res) => {
  try {
    const email = String(req.body?.email || req.body?.userId || "").trim().toLowerCase();
    if (!email) throw new Error("email_required");
    const user = await getUserByEmail(email);
    if (!user) throw new Error("user_not_found");
    if (!String(user.whatsapp || "").trim()) throw new Error("whatsapp_required");
    let result;
    try {
      result = await startCoachOnboardingForUser(user, {
        getCoachFlowByUser,
        upsertCoachFlow,
        saveOnboardingProfile,
        searchUsers,
      });
    } catch (err) {
      const normalized = normalizeWhatsAppOnboardingResult(err);
      if (!normalized) throw err;
      result = normalized;
      console.warn("[backend] coach onboarding skipped:", String(err.message || err));
    }
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "coach_onboarding_start_failed") });
  }
});

app.post("/onboarding/profile", requireLegacyModules, requireSelfOrAdminByAnyBodyField(["email", "userId"]), async (req, res) => {
  try {
    const email = String(req.body?.email || req.body?.userId || "").trim().toLowerCase();
    if (!email) throw new Error("email_required");
    const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const result = await saveOnboardingProfile({ email, answers });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "onboarding_profile_failed") });
  }
});

app.get("/whatsapp/webhook", requireLegacyModules, (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  if (mode === "subscribe" && token && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("forbidden");
});

app.post("/whatsapp/webhook", requireLegacyModules, async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          if (msg?.type === "text") {
            await handleIncomingCoachMessage(msg, {
              getCoachFlowByPhone,
              upsertCoachFlow,
              saveOnboardingProfile,
              searchUsers,
            });
          }
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "whatsapp_webhook_failed") });
  }
});

app.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await searchUsers(req.query.search || "");
    const visibleUsers = isGodRequest(req) ? users : users.filter(isCoachManageableUser);
    res.json({ ok: true, users: visibleUsers });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "users_failed") });
  }
});

app.get("/feed/:userId", requireLegacyModules, requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const payload = await getFeed(userId);
    res.json({ ok: true, ...payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "feed_failed") });
  }
});

app.get("/metrics/:userId", requireLegacyModules, requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const metrics = await getMetrics(userId);
    res.json({
      ok: true,
      metrics: metrics || {
        userId,
        streak: 0,
        bestStreak: 0,
        totalDays: 0,
        completedDays: 0,
        failures: 0,
        xp: 0,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "metrics_failed") });
  }
});

app.post("/admin/routines", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const routine = await saveRoutine(req.body || {});
    res.status(201).json({ ok: true, routine });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "routine_failed") });
  }
});

app.post("/admin/nutrition", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const plan = await saveNutritionPlan(req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "nutrition_failed") });
  }
});

app.post("/admin/assignments", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const assignments = await saveAssignments(payload);
    const sendWhatsapp = Boolean(payload.sendWhatsapp);
    const message = String(payload.message || "").trim();
    const userIds = Array.isArray(payload.userIds)
      ? payload.userIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean)
      : [];

    const whatsapp = [];
    if (sendWhatsapp && message && userIds.length) {
      for (const userId of userIds) {
        try {
          const candidates = await searchUsers(userId);
          const user = candidates.find((u) => String(u.id || u.email || "").trim().toLowerCase() === userId);
          const to = String(user?.whatsapp || "").trim();
          const result = await sendWhatsAppText({ to, body: message });
          whatsapp.push({ userId, to, ...result });
        } catch (error) {
          whatsapp.push({ userId, ok: false, skipped: false, reason: String(error.message || "unknown_error") });
        }
      }
    }

    res.status(201).json({ ok: true, assignments, whatsapp });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "assignments_failed") });
  }
});

app.get("/admin/ai-usage", requireAdmin, async (req, res) => {
  try {
    const actorEmail = normalizeEmail(getRequestEmail(req) || (isGodRequest(req) ? "god_mode" : ""));
    const targetUserIds = uniqueEmails(String(req.query.userIds || "").split(","));
    const logs = await listAiUsageLogs(monthKeyNow());
    const summary = summarizeAiUsage({ logs, actorEmail, targetUserIds });
    res.json({ ok: true, usage: summary, limits: getAiLimits() });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "ai_usage_failed") });
  }
});

app.post("/admin/ai-plan", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const actorEmail = normalizeEmail(getRequestEmail(req) || (isGodRequest(req) ? "god_mode" : ""));
    const sanitized = sanitizeAiPayload(payload);
    const requestedUserIds = uniqueEmails(payload.userIds);
    const userIds = requestedUserIds.slice(0, AI_MAX_USERS_PER_CALL);
    const usageLogs = await listAiUsageLogs(monthKeyNow());
    const usageSummary = summarizeAiUsage({ logs: usageLogs, actorEmail, targetUserIds: userIds });

    const users = [];
    for (const userId of userIds) {
      const found = await searchUsers(userId);
      const user = found.find((u) => String(u.id || u.email || "").trim().toLowerCase() === userId);
      if (user) users.push(user);
    }

    const quotaReason = getAiQuotaReason({
      summary: usageSummary,
      requestedUserCount: requestedUserIds.length,
    });
    const limits = getAiLimits();
    if (quotaReason) {
      const plan = buildFallbackPlan({
        users,
        prompt: sanitized.prompt,
        context: sanitized.context || sanitized.fileText,
        mode: payload.mode,
      });
      await recordAiUsage({
        actorEmail,
        targetUserIds: userIds,
        mode: String(payload.mode || "admin_ai"),
        provider: "fallback",
        model: "",
        status: "blocked",
        reason: quotaReason,
        promptChars: sanitized.prompt.length,
        contextChars: Math.max(sanitized.context.length, sanitized.fileText.length),
        createdAt: nowIso(),
      });
      return res.json({
        ok: true,
        plan,
        aiMeta: {
          provider: "fallback",
          model: null,
          reason: quotaReason,
          limits,
          usage: usageSummary,
          promptTrimmed: sanitized.promptTrimmed,
          contextTrimmed: sanitized.contextTrimmed,
        },
      });
    }

    let plan;
    let aiMeta = {
      provider: "fallback",
      model: null,
      reason: "unknown",
      limits,
      usage: usageSummary,
      promptTrimmed: sanitized.promptTrimmed,
      contextTrimmed: sanitized.contextTrimmed,
    };
    try {
      plan = await generateAiPlan({
        ...payload,
        prompt: sanitized.prompt,
        context: sanitized.context,
        fileText: sanitized.fileText,
        users,
      });
      const usageEntry = {
        actorEmail,
        targetUserIds: userIds,
        mode: String(payload.mode || "admin_ai"),
        provider: plan?.provider || "openai",
        model: plan?.model || "",
        status: "served",
        reason: "",
        promptChars: sanitized.prompt.length,
        contextChars: Math.max(sanitized.context.length, sanitized.fileText.length),
        createdAt: nowIso(),
      };
      await recordAiUsage(usageEntry);
      const nextUsageSummary = summarizeAiUsage({
        logs: [...usageLogs, usageEntry],
        actorEmail,
        targetUserIds: userIds,
      });
      aiMeta = {
        provider: plan?.provider || "openai",
        model: plan?.model || null,
        reason: null,
        limits,
        usage: nextUsageSummary,
        promptTrimmed: sanitized.promptTrimmed,
        contextTrimmed: sanitized.contextTrimmed,
      };
    } catch (err) {
      const reason = String(err?.message || err || "openai_error");
      console.warn("[backend] ai-plan fallback:", reason);
      await recordAiUsage({
        actorEmail,
        targetUserIds: userIds,
        mode: String(payload.mode || "admin_ai"),
        provider: "fallback",
        model: "",
        status: "fallback",
        reason,
        promptChars: sanitized.prompt.length,
        contextChars: Math.max(sanitized.context.length, sanitized.fileText.length),
        createdAt: nowIso(),
      });
      aiMeta = {
        provider: "fallback",
        model: null,
        reason,
        limits,
        usage: usageSummary,
        promptTrimmed: sanitized.promptTrimmed,
        contextTrimmed: sanitized.contextTrimmed,
      };
      plan = buildFallbackPlan({
        users,
        prompt: sanitized.prompt,
        context: sanitized.context || sanitized.fileText,
        mode: payload.mode,
      });
    }

    res.json({ ok: true, plan, aiMeta });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "ai_plan_failed") });
  }
});

app.post("/admin/coach/nudge", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();
    if (!userId) throw new Error("user_id_required");
    if (!message) throw new Error("message_required");

    const candidates = await searchUsers(userId);
    const user = candidates.find((u) => String(u.id || u.email || "").trim().toLowerCase() === userId);
    if (!user) throw new Error("user_not_found");

    const to = String(user.whatsapp || "").trim();
    const result = await sendWhatsAppText({ to, body: message });
    res.json({ ok: true, userId, to, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "coach_nudge_failed") });
  }
});

app.get("/admin/whatsapp-status", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, whatsapp: getWhatsAppConfigStatus() });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "whatsapp_status_failed") });
  }
});

app.post("/admin/whatsapp/test", requireLegacyModules, requireAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || "").trim();
    const body = String(req.body?.body || "Prueba tecnica desde Momentum Ascent.").trim();
    if (!to) throw new Error("phone_required");
    const result = await sendWhatsAppText({ to, body });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "whatsapp_test_failed") });
  }
});

app.post("/checkins", requireLegacyModules, requireSelfOrAdminByBody("userId"), async (req, res) => {
  try {
    const metrics = await saveCheckin(req.body || {});
    res.status(201).json({ ok: true, metrics });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "checkin_failed") });
  }
});

app.post("/support-alert", requireLegacyModules, requireSelfOrAdminByBody("userId"), async (req, res) => {
  try {
    const alert = await saveSupportAlert(req.body || {});
    res.status(201).json({ ok: true, alert });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "support_alert_failed") });
  }
});

app.post("/payments/request", requireSelfOrAdminByBody("userId"), async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? { ...req.body } : {};
    if (!String(payload.proofTarget || "").trim()) {
      const billing = await getBillingTarget();
      payload.proofTarget = String(billing.whatsapp || defaultBillingTarget.whatsapp);
    }
    const payment = await createPaymentRequest(payload);
    res.status(201).json({ ok: true, payment });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "payment_request_failed") });
  }
});

app.get("/billing-target", async (req, res) => {
  try {
    const billing = await getBillingTarget();
    res.json({ ok: true, billing });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "billing_target_failed") });
  }
});

app.get("/payments/pending", requireAdmin, async (req, res) => {
  try {
    const items = await listPendingPaymentRequests();
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "pending_payments_failed") });
  }
});

app.post("/payments/:id/review", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    const result = await reviewPaymentRequest({ id, ...(req.body || {}) });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "review_payment_failed") });
  }
});

app.get("/subscriptions/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const subscription = await getSubscription(userId);
    res.json({ ok: true, subscription });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "subscription_failed") });
  }
});

app.get("/payments/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const payments = await getUserPayments(userId);
    res.json({ ok: true, payments });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "payments_failed") });
  }
});

app.get("/mindset/daily", requireLegacyModules, (req, res) => {
  const phrases = [
    "Lee la cuota con criterio, no con impulso.",
    "Sin datos suficientes, la mejor jugada es bajar confianza.",
    "La ventaja esta en el proceso, no en perseguir resultados.",
    "Analiza el mercado antes de aceptar una narrativa facil.",
  ];
  const idx = new Date().getDate() % phrases.length;
  res.json({ ok: true, phrase: phrases[idx] });
});

app.get("/ranking/weekly", requireLegacyModules, async (req, res) => {
  try {
    const ranking = await getWeeklyRanking();
    res.json({ ok: true, ranking });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "ranking_failed") });
  }
});

app.get("/api/sports/events/today", async (req, res) => {
  try {
    const dateKey = String(req.query.date || toDateKey()).trim();
    let events = await getSportsEventsByDate(dateKey);
    if (!events.length) {
      events = await syncSportsEvents();
      events = events.filter((event) => String(event?.eventDate || "").slice(0, 10) === dateKey);
    }
    const picks = await listPicksByDate(dateKey);
    const picksByEvent = new Map(picks.map((pick) => [Number(pick.eventId), pick]));
    res.json({
      ok: true,
      date: dateKey,
      events: events.map((event) => ({
        ...event,
        latestPick: picksByEvent.get(Number(event.id)) || null,
      })),
    });
  } catch (error) {
    await logApiSync({
      sourceApi: String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock",
      endpoint: "/today",
      status: "error",
      message: String(error.message || "sports_today_failed"),
    }).catch(() => {});
    res.status(500).json({ ok: false, error: String(error.message || "sports_today_failed") });
  }
});

app.post("/api/sports/sync", requireAdmin, async (req, res) => {
  try {
    const events = await syncSportsEvents();
    res.json({
      ok: true,
      count: events.length,
      events,
      logs: await listApiSyncLogs(5),
    });
  } catch (error) {
    await logApiSync({
      sourceApi: String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock",
      endpoint: "/today",
      status: "error",
      message: String(error.message || "sports_sync_failed"),
    }).catch(() => {});
    res.status(500).json({ ok: false, error: String(error.message || "sports_sync_failed") });
  }
});

app.get("/api/sports/sync/logs", requireAdmin, async (req, res) => {
  try {
    const logs = await listApiSyncLogs(Number(req.query.limit || 10));
    const events = await listRecentSportsEvents(20);
    res.json({ ok: true, logs, events });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "sports_sync_logs_failed") });
  }
});

app.get("/api/sports/config/tracked-leagues", requireAdmin, async (req, res) => {
  try {
    const trackedLeagues = await getTrackedLeagues();
    res.json({ ok: true, trackedLeagues });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "tracked_leagues_failed") });
  }
});

app.post("/api/sports/config/tracked-leagues", requireAdmin, async (req, res) => {
  try {
    const input = safeArray(req.body?.trackedLeagues)
      .map((item) => ({
        key: slugify(item?.key || item?.label || ""),
        label: String(item?.label || "").trim(),
        sport: String(item?.sport || "football").trim().toLowerCase(),
        priority: Math.max(0, Number(item?.priority || 0)),
        enabled: item?.enabled !== false,
        externalLeagueId: Number(item?.externalLeagueId || 0) || null,
      }))
      .filter((item) => item.key && item.label);
    if (!input.length) {
      return res.status(400).json({ ok: false, error: "tracked_leagues_required" });
    }
    await setAppSetting("sports_tracked_leagues", input);
    res.json({ ok: true, trackedLeagues: input });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "tracked_leagues_save_failed") });
  }
});

app.post("/api/sports/events/manual", requireAdmin, async (req, res) => {
  try {
    const sport = String(req.body?.sport || "football").trim().toLowerCase();
    const league = String(req.body?.league || "").trim();
    const homeTeam = String(req.body?.homeTeam || "").trim();
    const awayTeam = String(req.body?.awayTeam || "").trim();
    const eventDate = String(req.body?.eventDate || "").trim();
    if (!league || !homeTeam || !awayTeam || !eventDate) {
      return res.status(400).json({ ok: false, error: "manual_event_fields_required" });
    }
    const externalId =
      String(req.body?.externalId || "").trim() ||
      `manual-${toDateKey(eventDate)}-${slugify(league)}-${slugify(homeTeam)}-${slugify(awayTeam)}`;
    const rawJson = mergeObjects(req.body?.rawJson, {
      source: "manual",
      curated: true,
      importedFrom: "admin",
      tags: safeArray(req.body?.tags),
    });
    const event = await upsertSportsEvent({
      externalId,
      sport,
      league,
      homeTeam,
      awayTeam,
      eventDate,
      status: String(req.body?.status || "scheduled").trim() || "scheduled",
      rawJson,
    });
    if (req.body?.stats && typeof req.body.stats === "object") {
      await saveEventStats({
        eventId: event.id,
        sourceApi: "manual_editor",
        statsJson: req.body.stats,
      });
    }
    res.status(201).json({ ok: true, event });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "manual_event_failed") });
  }
});

app.get("/api/sports/events/:eventId/context", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });
    const latestStats = await getLatestEventStats(eventId);
    const latestPick = await getLatestAiPickForEvent(eventId);
    const result = toObject(event.rawJson?.resultManual);
    res.json({ ok: true, event, latestStats, latestPick, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "event_context_failed") });
  }
});

app.post("/api/sports/events/:eventId/manual-context", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });
    const payload = mergeObjects(req.body?.stats, {
      editorialNote: String(req.body?.editorialNote || "").trim(),
      sourceLinks: safeArray(req.body?.sourceLinks),
      injuries: safeArray(req.body?.injuries),
      form: toObject(req.body?.form),
      h2h: toObject(req.body?.h2h),
      oddsSnapshot: toObject(req.body?.oddsSnapshot),
      curated: true,
    });
    const stats = await saveEventStats({
      eventId,
      sourceApi: String(req.body?.sourceApi || "manual_editor").trim() || "manual_editor",
      statsJson: payload,
    });
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "manual_context_failed") });
  }
});

app.post("/api/sports/events/:eventId/result", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    const homeScore = Number(req.body?.homeScore);
    const awayScore = Number(req.body?.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
      return res.status(400).json({ ok: false, error: "result_scores_required" });
    }

    const resultManual = {
      homeScore,
      awayScore,
      winner:
        homeScore === awayScore
          ? "draw"
          : homeScore > awayScore
          ? event.homeTeam
          : event.awayTeam,
      note: String(req.body?.note || "").trim(),
      settledAt: new Date().toISOString(),
    };

    const updatedEvent = await upsertSportsEvent({
      externalId: event.externalId,
      sport: event.sport,
      league: event.league,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      eventDate: event.eventDate,
      status: String(req.body?.status || "finished").trim() || "finished",
      rawJson: mergeObjects(event.rawJson, { resultManual }),
    });

    await saveEventStats({
      eventId,
      sourceApi: "manual_result",
      statsJson: { resultManual },
    });

    res.json({ ok: true, event: updatedEvent, resultManual });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "event_result_failed") });
  }
});

app.post("/api/picks/generate/:eventId", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const force = Boolean(req.body?.force) || String(req.query.force || "").trim().toLowerCase() === "true";
    const event = await getSportsEventById(eventId);
    if (!event) {
      return res.status(404).json({ ok: false, error: "event_not_found" });
    }

    const existingPick = await getLatestAiPickForEvent(eventId);
    if (existingPick && !force && isPickRecent(existingPick, 12)) {
      return res.json({
        ok: true,
        cached: true,
        pick: {
          ...existingPick,
          disclaimer: SPORTS_PICK_DISCLAIMER,
        },
      });
    }

    let stats = await getLatestEventStats(eventId);
    if (!stats) {
      const pulledStats = await sportsApiService.getEventStats(event);
      stats = await saveEventStats({
        eventId,
        sourceApi: pulledStats.sourceApi,
        statsJson: pulledStats.statsJson,
      });
    }

    const historicalContext = (await listPickHistory(12))
      .filter((row) => Number(row.eventId) !== eventId)
      .slice(0, 8)
      .map((row) => ({
        league: row.league,
        market: row.market,
        confidence: row.confidence,
        riskLevel: row.riskLevel,
        createdAt: row.createdAt,
      }));

    const aiPick = await generateSportsPick({
      event: {
        sport: event.sport,
        league: event.league,
        home_team: event.homeTeam,
        away_team: event.awayTeam,
        event_date: event.eventDate,
        status: event.status,
      },
      stats: stats?.statsJson || {},
      historicalContext,
    });

    const savedPick = await saveAiPick({
      eventId,
      pick: aiPick.pick,
      market: aiPick.market,
      confidence: aiPick.confidence,
      analysis: aiPick.analysis,
      riskLevel: aiPick.risk_level,
      modelUsed: aiPick.model || aiPick.provider || "fallback",
      status: "generated",
      createdAt: new Date().toISOString(),
    });

    res.json({
      ok: true,
      cached: false,
      pick: {
        ...savedPick,
        sport: event.sport,
        league: event.league,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        eventDate: event.eventDate,
        disclaimer: SPORTS_PICK_DISCLAIMER,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "pick_generation_failed") });
  }
});

// Dual analysis: GPT-4o generates 3 candidates → Claude judges and picks the best
app.post("/api/picks/generate-dual/:eventId", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    let stats = await getLatestEventStats(eventId);
    if (!stats) {
      const pulledStats = await sportsApiService.getEventStats(event);
      stats = await saveEventStats({ eventId, sourceApi: pulledStats.sourceApi, statsJson: pulledStats.statsJson });
    }

    const historicalContext = (await listPickHistory(12))
      .filter((row) => Number(row.eventId) !== eventId)
      .slice(0, 8)
      .map((row) => ({ league: row.league, market: row.market, confidence: row.confidence, riskLevel: row.riskLevel, createdAt: row.createdAt }));

    const { candidates, claudeResult } = await runDualAnalysis({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate, status: event.status },
      stats: stats?.statsJson || {},
      historicalContext,
    });

    const sessionId = `dual-${eventId}-${Date.now()}`;
    const savedCandidates = await savePickCandidates({
      eventId,
      sessionId,
      candidates,
      claudeSelectedIndex: claudeResult.selectedIndex,
      claudeReasoning: claudeResult.reasoning,
      claudeModel: claudeResult.model,
      claudeFinalPick: claudeResult.finalPick,
    });

    const gptCandidates = savedCandidates.filter((c) => c.candidateIndex >= 0);
    const claudePick = savedCandidates.find((c) => c.candidateIndex === -1) || null;

    res.json({
      ok: true,
      sessionId,
      event: { id: event.id, sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam, eventDate: event.eventDate },
      candidates: gptCandidates,
      claudeSelection: {
        selectedIndex: claudeResult.selectedIndex,
        reasoning: claudeResult.reasoning,
        confidenceAdjustment: claudeResult.confidenceAdjustment,
        claudePickId: claudePick?.id || null,
        finalPick: { ...(claudePick || claudeResult.finalPick), disclaimer: SPORTS_PICK_DISCLAIMER },
        model: claudeResult.model,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "dual_analysis_failed") });
  }
});

// GPT analyzes 5 markets for a single event — admin reviews before passing to Claude
app.post("/api/picks/gpt-markets/:eventId", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    let stats = await getLatestEventStats(eventId);
    if (!stats) {
      const pulledStats = await sportsApiService.getEventStats(event);
      stats = await saveEventStats({ eventId, sourceApi: pulledStats.sourceApi, statsJson: pulledStats.statsJson });
    }

    const markets = await analyzeMarketsGPT({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate },
      stats: stats?.statsJson || {},
    });

    res.json({ ok: true, eventId, event: { sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam, eventDate: event.eventDate }, markets });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "gpt_markets_failed") });
  }
});

// Claude selects the best market from GPT analysis + today's portfolio context
app.post("/api/picks/claude-decide", requireAdmin, async (req, res) => {
  try {
    const { eventId, gptMarkets } = req.body || {};
    if (!eventId || !gptMarkets) return res.status(400).json({ ok: false, error: "eventId and gptMarkets required" });

    const event = await getSportsEventById(Number(eventId));
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    const publishedToday = (await listPickHistory(20))
      .filter((p) => p.createdAt && p.createdAt.slice(0, 10) === toDateKey())
      .slice(0, 8)
      .map((p) => ({ market: p.market, pick: p.pick, riskLevel: p.riskLevel }));

    const decision = await claudeDecideMarket({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate },
      gptMarkets,
      publishedToday,
    });

    res.json({ ok: true, eventId, decision });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "claude_decide_failed") });
  }
});

// Publish a candidate (GPT or Claude) to the official ai_picks table
app.post("/api/picks/publish-candidate/:candidateId", requireAdmin, async (req, res) => {
  try {
    const candidateId = Number(req.params.candidateId || 0);
    const candidate = await getPickCandidateById(candidateId);
    if (!candidate) return res.status(404).json({ ok: false, error: "candidate_not_found" });

    const savedPick = await saveAiPick({
      eventId: candidate.eventId,
      pick: candidate.pick,
      market: candidate.market,
      confidence: candidate.confidence,
      analysis: candidate.analysis,
      riskLevel: candidate.riskLevel,
      modelUsed: candidate.modelUsed || candidate.provider,
      status: "generated",
      createdAt: new Date().toISOString(),
    });

    await markCandidatePublished(candidateId, savedPick.id);

    const event = await getSportsEventById(candidate.eventId);
    res.json({
      ok: true,
      pick: { ...savedPick, sport: event?.sport, league: event?.league, homeTeam: event?.homeTeam, awayTeam: event?.awayTeam, eventDate: event?.eventDate, disclaimer: SPORTS_PICK_DISCLAIMER },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "publish_failed") });
  }
});

// Publish a pick directly from Claude's market decision (no candidate record needed)
app.post("/api/picks/publish-direct", requireAdmin, async (req, res) => {
  try {
    const { eventId, pick, market, confidence, analysis, riskLevel, modelUsed } = req.body || {};
    if (!eventId || !pick || !market) return res.status(400).json({ ok: false, error: "eventId, pick and market required" });

    const event = await getSportsEventById(Number(eventId));
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    const savedPick = await saveAiPick({
      eventId: Number(eventId),
      pick: String(pick),
      market: String(market),
      confidence: Number(confidence || 60),
      analysis: String(analysis || "Seleccionado por Claude Sonnet."),
      riskLevel: String(riskLevel || "MEDIO"),
      modelUsed: String(modelUsed || "claude-decide"),
      status: "generated",
      createdAt: new Date().toISOString(),
    });

    res.json({
      ok: true,
      pick: { ...savedPick, sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam, eventDate: event.eventDate, disclaimer: SPORTS_PICK_DISCLAIMER },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "publish_direct_failed") });
  }
});

app.get("/api/picks/today", async (req, res) => {
  try {
    const dateKey = String(req.query.date || toDateKey()).trim();
    let picks = await listPicksByDate(dateKey);
    if (!picks.length) {
      let events = await getSportsEventsByDate(dateKey);
      if (!events.length) {
        events = await syncSportsEvents();
      }
      picks = await listPicksByDate(dateKey);
      res.json({
        ok: true,
        date: dateKey,
        picks: picks.map((pick) => ({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER })),
        eventsAvailable: events.length,
      });
      return;
    }
    res.json({
      ok: true,
      date: dateKey,
      picks: picks.map((pick) => ({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER })),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "picks_today_failed") });
  }
});

app.get("/api/picks/history", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const picks = await listPickHistory(limit);
    res.json({
      ok: true,
      picks: picks.map((pick) => ({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER })),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "picks_history_failed") });
  }
});

app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const dateKey = String(req.query.dateKey || "").trim();
    const dashboard = await getAdminDashboard(dateKey);
    res.json({ ok: true, ...dashboard });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "admin_dashboard_failed") });
  }
});

app.get("/admin/timeline", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim().toLowerCase();
    const limit = Number(req.query.limit || 30);
    const items = await getAdminTimeline(userId, limit);
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "admin_timeline_failed") });
  }
});

const csvEscape = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

app.get("/admin/report.csv", requireAdmin, async (req, res) => {
  try {
    const scope = String(req.query.scope || "week").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim().toLowerCase();
    const report = await getAdminCsvReport(scope, userId);
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    const headers = rows.length ? Object.keys(rows[0]) : ["empty"];
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${report.filename || "admin_report.csv"}\"`);
    res.status(200).send(csv);
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "admin_csv_failed") });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[backend] listening on http://localhost:${PORT}`);
      console.log(`[backend] db client: ${DB_META.client}`);
    });
  })
  .catch((error) => {
    console.error("[backend] failed to initialize db:", error.message || error);
    process.exit(1);
  });
