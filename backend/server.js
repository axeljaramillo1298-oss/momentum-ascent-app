require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const { generateAiPlan, buildFallbackPlan, generateSportsPick, runDualAnalysis, analyzeMarketsGPT, claudeDecideMarket, scoutDayEventsGPT, generateRetoEscalera, selectTopPicksOfDay, calculateExpectedValue } = require("./ai");
const { generateEmbedding, findKNearest, hashText } = require("./embeddings");
const { rateLimitMiddleware } = require("./rate-limit");
const socialPublisher = require("./social-publisher");
const sportsApiService = require("./sportsApiService");
const { sendWhatsAppText, getWhatsAppConfigStatus } = require("./whatsapp");
const { startCoachOnboardingForUser, handleIncomingCoachMessage } = require("./coach-whatsapp");
const notifications = require("./notifications");
const newsScraper = require("./news-scraper");
const lineMovement = require("./line-movement");
const { startCronJobs } = require("./cron-jobs");
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
  updatePickResult,
  setPickFailReason,
  getUserBankroll,
  upsertUserBankroll,
  logUserPickBet,
  resolveUserPickBet,
  listUserBets,
  getUserBankrollStats,
  savePickEmbedding,
  getPickEmbedding,
  listAllPickEmbeddings,
  logRateLimitEvent,
  countRateLimitEvents,
  pruneOldRateLimitEvents,
  logApiSync,
  saveRetoDraft,
  publishReto,
  getActiveReto,
  getRetoById,
  listRetos,
  listAllRetos,
  updateRetoLegResult,
  updateRetoLegFields,
  deletePickAndCandidates,
  listApiSyncLogs,
  savePickCandidates,
  getPickCandidateById,
  markCandidatePublished,
  getOrCreateReferralCode,
  getReferralByCode,
  logReferralUse,
  listReferralUses,
  getReferralStats,
  logNotification,
  listNotifications,
  saveOddsSnapshot,
  listOddsSnapshots,
  getLatestOddsSnapshot,
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

app.use(cors({
  origin: (origin, cb) => {
    const rawAllowed = process.env.CORS_ALLOWED_ORIGINS || '';
    if (!rawAllowed || !origin) return cb(null, true); // dev: allow all; no origin = same-origin
    const allowed = new Set(rawAllowed.split(',').map(s => s.trim()).filter(Boolean));
    if (allowed.has(origin)) return cb(null, true);
    return cb(new Error('cors_not_allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../www"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  },
}));

const getRequestEmail = (req) => String(req.headers["x-user-email"] || "").trim().toLowerCase();
const getGodToken = (req) => String(req.headers["x-god-token"] || "").trim();
const GOD_SESSIONS = new Map();

// ── Rate limiting persistente (Batch 3) ───────────────────────────
// Para endpoints costosos de IA (generación de picks/retos/análisis)
const RL_DB = {
  logRateLimitEvent: (...args) => typeof logRateLimitEvent === "function" ? logRateLimitEvent(...args) : Promise.resolve({ ok: true }),
  countRateLimitEvents: (...args) => typeof countRateLimitEvents === "function" ? countRateLimitEvents(...args) : Promise.resolve(0),
};
const getUserKeyFromReq = (req) => getRequestEmail(req) || String(req.ip || req.connection?.remoteAddress || "anon");
const POLICY_AI_GEN = { bucket: "ai_generation", maxEvents: Math.max(5, Number(process.env.RATE_LIMIT_AI_PER_HOUR || 30)), windowMs: 60 * 60 * 1000 };
const aiGenLimiter = (typeof rateLimitMiddleware === "function")
  ? rateLimitMiddleware(POLICY_AI_GEN, getUserKeyFromReq, RL_DB)
  : (req, res, next) => next();

// Helper: texto contextual para embedding de un pick (los embeddings de "casos similares" se calculan sobre este texto)
function buildPickEmbedText(pick) {
  if (!pick) return "";
  const parts = [
    pick.league || pick.competition || "",
    `${pick.homeTeam || pick.home_team || ""} vs ${pick.awayTeam || pick.away_team || ""}`,
    pick.market || "",
    pick.pick || "",
    pick.analysis || pick.summary || "",
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 2000);
}

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
const defaultBankControl = {
  totalBank: 10000,
  unitPercent: 2,
  stopLossPercent: 6,
  maxExposurePercent: 10,
  targetPercent: 8,
  personalRule: "",
  tracking: {},
  updatedAt: "",
};

const getBillingTarget = async () => {
  const fromDb = await getAppSetting("billing_target", defaultBillingTarget);
  return { ...defaultBillingTarget, ...(fromDb && typeof fromDb === "object" ? fromDb : {}) };
};
const bankControlKeyForUser = (userIdRaw) => `bank_control:${String(userIdRaw || "").trim().toLowerCase()}`;
const getBankControlForUser = async (userIdRaw) => {
  const userId = String(userIdRaw || "").trim().toLowerCase();
  if (!userId) throw new Error("user_id_required");
  const stored = await getAppSetting(bankControlKeyForUser(userId), defaultBankControl);
  return {
    ...defaultBankControl,
    ...(stored && typeof stored === "object" ? stored : {}),
    tracking: stored?.tracking && typeof stored.tracking === "object" ? stored.tracking : {},
  };
};
const setBankControlForUser = async (userIdRaw, payload) => {
  const userId = String(userIdRaw || "").trim().toLowerCase();
  if (!userId) throw new Error("user_id_required");
  const current = await getBankControlForUser(userId);
  const next = {
    ...current,
    ...(payload && typeof payload === "object" ? payload : {}),
    totalBank: Math.max(0, Number(payload?.totalBank ?? current.totalBank ?? defaultBankControl.totalBank)),
    unitPercent: Math.max(0.25, Number(payload?.unitPercent ?? current.unitPercent ?? defaultBankControl.unitPercent)),
    stopLossPercent: Math.max(1, Number(payload?.stopLossPercent ?? current.stopLossPercent ?? defaultBankControl.stopLossPercent)),
    maxExposurePercent: Math.max(1, Number(payload?.maxExposurePercent ?? current.maxExposurePercent ?? defaultBankControl.maxExposurePercent)),
    targetPercent: Math.max(1, Number(payload?.targetPercent ?? current.targetPercent ?? defaultBankControl.targetPercent)),
    personalRule: String(payload?.personalRule ?? current.personalRule ?? "").trim(),
    tracking: payload?.tracking && typeof payload.tracking === "object" ? payload.tracking : current.tracking || {},
    updatedAt: new Date().toISOString(),
  };
  return setAppSetting(bankControlKeyForUser(userId), next);
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

const ANALYSIS_UPSELL = "Activa Apex para desbloquear el analisis completo.";
const normalizeViewerPlanId = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "free";
  if (raw.includes("coach_humano") || raw.includes("apex") || raw.includes("premium")) return "coach_humano";
  if (raw.includes("ai_coach") || raw.includes("ai picks") || raw.includes("coach ia")) return "ai_coach";
  if (raw.includes("reto") || raw.includes("comunidad")) return "retos";
  return "free";
};
const isPublishedPick = (pick) => String(pick?.status || "").trim().toLowerCase() === "published";
const filterPublishedPicks = (rows) => safeArray(rows).filter(isPublishedPick);
const summarizeAnalysis = (text = "", maxLen = 220) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const firstSentence = clean.match(/^(.{1,220}?[.!?])(?:\s|$)/);
  if (firstSentence?.[1]) return firstSentence[1].trim();
  return `${clean.slice(0, maxLen).trim()}...`;
};
const PICK_LOCKED_LABEL = "Solo Plan Premium. Activa All Picks o Apex para ver este pick.";
const redactPickForViewer = (pick, planId = "free") => {
  // Premium pick shown to free user: show match, hide pick + analysis
  if (pick?.pickLocked) {
    return {
      ...pick,
      pick: null,
      market: null,
      analysis: PICK_LOCKED_LABEL,
      analysisLocked: true,
      pickLocked: true,
      fullData: "",
    };
  }
  const normalizedPlan = normalizeViewerPlanId(planId);
  const fullAnalysis = String(pick?.analysis || "").trim();
  if (normalizedPlan === "coach_humano") {
    return {
      ...pick,
      analysis: fullAnalysis,
      analysisLocked: false,
      analysisPreview: summarizeAnalysis(fullAnalysis),
      analysisUpgradeLabel: "",
      fullData: pick?.fullData || "",
    };
  }
  const preview = summarizeAnalysis(fullAnalysis);
  const lockedText = preview ? `${preview} ${ANALYSIS_UPSELL}` : ANALYSIS_UPSELL;
  return {
    ...pick,
    analysis: lockedText,
    analysisLocked: true,
    analysisPreview: preview,
    analysisUpgradeLabel: ANALYSIS_UPSELL,
    fullData: "",
  };
};
const getViewerPlanId = async (req) => {
  if (isGodRequest(req)) return "coach_humano";
  const email = getRequestEmail(req);
  if (!email) return "free";
  if (await isAdminEmail(email)) return "coach_humano";
  try {
    const sub = await getSubscription(email);
    if (sub?.planId) return normalizeViewerPlanId(sub.planId);
    if (sub?.planLabel) return normalizeViewerPlanId(sub.planLabel);
  } catch {}
  try {
    const user = await getUserByEmail(email);
    return normalizeViewerPlanId(user?.plan || "free");
  } catch {
    return "free";
  }
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
const SPORTS_TIMEZONE = String(process.env.SPORTS_TIMEZONE || "America/Mexico_City").trim() || "America/Mexico_City";
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SPORTS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const toDateKey = (value = new Date()) => dateKeyFormatter.format(new Date(value));
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
const matchesDateKey = (value, dateKey) => {
  if (!value || !dateKey) return false;
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return false;
  return toDateKey(timestamp) === String(dateKey).trim();
};

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

// Sincronización de eventos.
// Por DEFAULT (useExternalApi=false) NO consume créditos de The Odds API:
// solo refresca eventos ya cargados en BD (manual upload o cargas previas).
// Si useExternalApi=true (flag explícito), trae eventos vía sportsApiService
// y consume créditos del proveedor configurado.
// Extrae las odds disponibles del event.rawJson (bookmakers de The Odds API)
// + statsJson.oddsSnapshot (manual editor) y las agrega al objeto stats
// que llega a la IA para que el prompt pueda calcular EV automáticamente.
function enrichStatsWithOdds(event, statsJson) {
  const baseStats = statsJson && typeof statsJson === "object" ? { ...statsJson } : {};
  // Si ya hay odds en stats (manual o snapshot), no las pisamos
  if (baseStats.odds || baseStats.oddsSnapshot) return baseStats;
  let rawJson = {};
  try {
    rawJson = typeof event?.rawJson === "string" ? JSON.parse(event.rawJson) : (event?.rawJson || {});
  } catch (_) { rawJson = {}; }
  const bookmakers = Array.isArray(rawJson?.bookmakers) ? rawJson.bookmakers : [];
  if (!bookmakers.length) return baseStats;
  // Resumen agregado por mercado (mediana de odds entre todas las casas)
  const byMarket = {};
  bookmakers.forEach((bm) => {
    const markets = Array.isArray(bm.markets) ? bm.markets : [];
    markets.forEach((mkt) => {
      const key = String(mkt.key || "").toLowerCase();
      if (!key) return;
      if (!byMarket[key]) byMarket[key] = {};
      const outcomes = Array.isArray(mkt.outcomes) ? mkt.outcomes : [];
      outcomes.forEach((o) => {
        const name = String(o.name || "");
        if (!name) return;
        const decimal = Number(o.price);
        if (!Number.isFinite(decimal) || decimal < 1.01 || decimal > 50) return;
        if (!byMarket[key][name]) byMarket[key][name] = [];
        byMarket[key][name].push(decimal);
      });
    });
  });
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const oddsSummary = {};
  for (const [marketKey, outcomes] of Object.entries(byMarket)) {
    oddsSummary[marketKey] = {};
    for (const [name, list] of Object.entries(outcomes)) {
      oddsSummary[marketKey][name] = Number(median(list).toFixed(2));
    }
  }
  baseStats.odds = oddsSummary; // {h2h:{home:1.85, away:2.10}, spreads:{...}, totals:{Over:1.92, Under:1.95}}
  baseStats.oddsSource = `${bookmakers.length} casa(s)`;
  return baseStats;
}

const syncSportsEvents = async (date, { useExternalApi = false } = {}) => {
  const provider = String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock";

  // Modo refresh local: NO llama a la API externa
  if (!useExternalApi) {
    const dateKey = date || toDateKey();
    const allRecent = await listRecentSportsEvents(400);
    const localEvents = allRecent.filter((event) => matchesDateKey(event?.eventDate, dateKey));
    await logApiSync({
      sourceApi: "local_refresh",
      endpoint: date ? `/local?date=${date}` : "/local",
      status: "ok",
      message: `Refresh local (sin consumir API ${provider}): ${localEvents.length} eventos en BD para ${dateKey}`,
    });
    return localEvents;
  }

  // Modo sync real: SÍ consume créditos de la API externa
  const trackedLeagues = await getTrackedLeagues();
  const events = await sportsApiService.getTodayEvents(date || null);
  const filteredEvents = Array.isArray(events) ? events.filter((event) => eventMatchesTrackedLeagues(event, trackedLeagues)) : [];
  const selectedEvents = filteredEvents.length ? filteredEvents : safeArray(events);
  const saved = [];
  for (const event of selectedEvents) {
    const row = await upsertSportsEvent(event);
    saved.push(row);
    if (event?.stats && typeof event.stats === "object") {
      await saveEventStats({
        eventId: row.id,
        sourceApi: provider,
        statsJson: event.stats,
      });
    }
  }
  await logApiSync({
    sourceApi: provider,
    endpoint: date ? `/fixtures?date=${date}` : "/today",
    status: "ok",
    message: `[SYNC REAL — consumió API ${provider}] Eventos: ${saved.length} de ${safeArray(events).length} (filtrados: ${filteredEvents.length})`,
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
      const safeCompare = (a, b) => {
        try {
          return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch { return false; }
      };
      if (!provided || !safeCompare(provided, configuredPassword)) {
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
    const godSafeCompare = (a, b) => {
      try {
        return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
      } catch { return false; }
    };
    if (!validUser || !godSafeCompare(password, GOD_MODE_PASS)) {
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

app.patch("/subscriptions/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = decodeURIComponent(req.params.userId).trim().toLowerCase();
    const { planId, planLabel, status, durationDays } = req.body;
    if (!userId) return res.status(400).json({ error: 'missing_user' });
    const result = await grantSubscription({ userId, planId: planId || 'free', planLabel: planLabel || 'Free', status: status || 'active', durationDays: Number(durationDays) || 30 });
    res.json({ ok: true, subscription: result });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get("/bank-control/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const bankControl = await getBankControlForUser(userId);
    res.json({ ok: true, bankControl });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "bank_control_failed") });
  }
});

app.post("/bank-control/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const bankControl = await setBankControlForUser(userId, req.body || {});
    res.json({ ok: true, bankControl });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "bank_control_save_failed") });
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
    let events = (await listRecentSportsEvents(400)).filter((event) => matchesDateKey(event?.eventDate, dateKey));
    if (!events.length) {
      events = await syncSportsEvents();
      events = events.filter((event) => matchesDateKey(event?.eventDate, dateKey));
    }
    const picks = filterPublishedPicks(await listPickHistory(500)).filter((pick) => matchesDateKey(pick?.eventDate, dateKey));
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
  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: RATE_LIMIT_WINDOW_MS });
  }
  try {
    const date = String(req.body?.date || "").trim() || null;
    // Por DEFAULT no consume créditos de The Odds API.
    // Solo si el caller pasa explícito useExternalApi=true (body o query) se llama al provider real.
    const useExternalApi = req.body?.useExternalApi === true
      || String(req.body?.useExternalApi || "").toLowerCase() === "true"
      || String(req.query?.useExternalApi || "").toLowerCase() === "true";
    const events = await syncSportsEvents(date, { useExternalApi });
    res.json({
      ok: true,
      count: events.length,
      events,
      mode: useExternalApi ? "external_api" : "local_refresh",
      provider: useExternalApi ? (String(process.env.SPORTS_API_PROVIDER || "mock").trim().toLowerCase() || "mock") : "local",
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

// ── Odds for a specific event (from rawJson bookmakers or statsJson oddsSnapshot) ──
app.get("/api/sports/events/:eventId/odds", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    const rawJson = (() => { try { return typeof event.rawJson === "string" ? JSON.parse(event.rawJson) : (event.rawJson || {}); } catch { return {}; } })();
    const bookmakers = Array.isArray(rawJson?.bookmakers) ? rawJson.bookmakers : [];

    // Also pull from statsJson oddsSnapshot if present
    const stats = await getLatestEventStats(eventId);
    const statsJson = (() => { try { return typeof stats?.statsJson === "string" ? JSON.parse(stats.statsJson) : (stats?.statsJson || {}); } catch { return {}; } })();
    const oddsSnapshot = statsJson?.oddsSnapshot || null;

    const MARKET_LABELS = { h2h: "1X2 / Moneyline", spreads: "Spread / Hándicap", totals: "Total O/U", btts: "Ambos Anotan" };

    const normalized = bookmakers.map((bm) => ({
      bookmaker: String(bm.title || bm.key || "Casa"),
      markets: (Array.isArray(bm.markets) ? bm.markets : []).map((mkt) => ({
        key: String(mkt.key || ""),
        label: MARKET_LABELS[mkt.key] || String(mkt.key || ""),
        outcomes: (Array.isArray(mkt.outcomes) ? mkt.outcomes : []).map((o) => ({
          name: String(o.name || ""),
          price: Number(o.price || 0),
          decimal: o.price > 0 ? Number((o.price / 100 + 1).toFixed(2)) : Number((1 - 100 / o.price).toFixed(2)),
        })),
      })),
    }));

    res.json({ ok: true, eventId, bookmakers: normalized, oddsSnapshot, hasOdds: normalized.length > 0 || !!oddsSnapshot });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "odds_failed") });
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

app.post("/api/picks/generate/:eventId", requireAdmin, aiGenLimiter, async (req, res) => {
  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: RATE_LIMIT_WINDOW_MS });
  }
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

    // Fetch broader history for performance feedback loop (resolved picks)
    const historyPicks = await listPickHistory(60).catch(() => []);

    const enrichedStats = enrichStatsWithOdds(event, stats?.statsJson || {});
    const aiPick = await generateSportsPick({
      event: {
        sport: event.sport,
        league: event.league,
        home_team: event.homeTeam,
        away_team: event.awayTeam,
        event_date: event.eventDate,
        status: event.status,
      },
      stats: enrichedStats,
      historicalContext,
      historyPicks,
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
app.post("/api/picks/generate-dual/:eventId", requireAdmin, aiGenLimiter, async (req, res) => {
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

    // Fetch broader history for performance feedback loop (resolved picks)
    const historyPicks = await listPickHistory(60).catch(() => []);

    const enrichedStatsDual = enrichStatsWithOdds(event, stats?.statsJson || {});
    const { candidates, claudeResult } = await runDualAnalysis({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate, status: event.status },
      stats: enrichedStatsDual,
      historicalContext,
      historyPicks,
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
        abstain: Boolean(claudeResult.abstain),
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
app.post("/api/picks/gpt-markets/:eventId", requireAdmin, aiGenLimiter, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId || 0);
    const event = await getSportsEventById(eventId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    let stats = await getLatestEventStats(eventId);
    if (!stats) {
      const pulledStats = await sportsApiService.getEventStats(event);
      stats = await saveEventStats({ eventId, sourceApi: pulledStats.sourceApi, statsJson: pulledStats.statsJson });
    }

    // Fetch broader history for performance feedback loop (resolved picks)
    const historyPicks = await listPickHistory(60).catch(() => []);

    const enrichedStatsMkt = enrichStatsWithOdds(event, stats?.statsJson || {});
    const markets = await analyzeMarketsGPT({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate },
      stats: enrichedStatsMkt,
      historyPicks,
    });

    res.json({ ok: true, eventId, event: { sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam, eventDate: event.eventDate }, markets });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "gpt_markets_failed") });
  }
});

// ── Scout/rank today's events to find best betting opportunities ──────────
app.post("/api/picks/gpt-scout", requireAdmin, aiGenLimiter, async (req, res) => {
  try {
    const { events: eventList } = req.body || {};
    if (!Array.isArray(eventList) || !eventList.length) {
      return res.status(400).json({ ok: false, error: "events array required" });
    }
    const result = await scoutDayEventsGPT(eventList);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "scout_failed") });
  }
});

// Claude selects the best market from GPT analysis + today's portfolio context
app.post("/api/picks/claude-decide", requireAdmin, aiGenLimiter, async (req, res) => {
  try {
    const { eventId, gptMarkets } = req.body || {};
    if (!eventId || !gptMarkets) return res.status(400).json({ ok: false, error: "eventId and gptMarkets required" });

    const event = await getSportsEventById(Number(eventId));
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    let stats = await getLatestEventStats(Number(eventId));
    if (!stats) {
      const pulledStats = await sportsApiService.getEventStats(event);
      stats = await saveEventStats({
        eventId: Number(eventId),
        sourceApi: pulledStats.sourceApi,
        statsJson: pulledStats.statsJson,
      });
    }

    const publishedToday = filterPublishedPicks(await listPickHistory(20))
      .filter((p) => p.createdAt && toDateKey(p.createdAt) === toDateKey())
      .slice(0, 8)
      .map((p) => ({ market: p.market, pick: p.pick, riskLevel: p.riskLevel }));

    // Fetch broader history for performance feedback loop (resolved picks)
    const historyPicks = await listPickHistory(60).catch(() => []);

    const decision = await claudeDecideMarket({
      event: { sport: event.sport, league: event.league, home_team: event.homeTeam, away_team: event.awayTeam, event_date: event.eventDate },
      stats: stats?.statsJson || {},
      gptMarkets,
      publishedToday,
      historyPicks,
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
    const planTier = String(req.body?.planTier || "free");
    const fullData = String(req.body?.fullData || "");

    const savedPick = await saveAiPick({
      eventId: candidate.eventId,
      pick: candidate.pick,
      market: candidate.market,
      confidence: candidate.confidence,
      analysis: candidate.analysis,
      riskLevel: candidate.riskLevel,
      modelUsed: candidate.modelUsed || candidate.provider,
      status: "published",
      planTier,
      fullData,
      createdAt: new Date().toISOString(),
    });

    await markCandidatePublished(candidateId, savedPick.id);

    const event = await getSportsEventById(candidate.eventId);

    // Batch 4: snapshot inicial de odds (si vienen) + notificar admin via Telegram
    try {
      const initialOdds = Number(req.body?.odds);
      if (Number.isFinite(initialOdds) && initialOdds > 0 && typeof saveOddsSnapshot === "function") {
        await saveOddsSnapshot({ pickId: savedPick.id, odds: initialOdds, market: candidate.market, source: "publish" });
      }
    } catch (snapErr) {
      console.error("[publish-candidate] odds snapshot failed:", snapErr.message || snapErr);
    }
    try {
      await notifications.notifyPickPublished(
        { ...savedPick, sport: event?.sport, league: event?.league, homeTeam: event?.homeTeam, awayTeam: event?.awayTeam },
        { db: require("./db") }
      );
    } catch (notifErr) {
      console.error("[publish-candidate] notify failed:", notifErr.message || notifErr);
    }

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
    const { eventId, pick, market, confidence, analysis, riskLevel, modelUsed, planTier, fullData } = req.body || {};
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
      status: "published",
      planTier: String(planTier || "free"),
      fullData: String(fullData || ""),
      result: "",
      createdAt: new Date().toISOString(),
    });

    // Batch 4: snapshot inicial de odds (si vienen) + notificar admin via Telegram
    try {
      const initialOdds = Number(req.body?.odds);
      if (Number.isFinite(initialOdds) && initialOdds > 0 && typeof saveOddsSnapshot === "function") {
        await saveOddsSnapshot({ pickId: savedPick.id, odds: initialOdds, market: String(market), source: "publish" });
      }
    } catch (snapErr) {
      console.error("[publish-direct] odds snapshot failed:", snapErr.message || snapErr);
    }
    try {
      await notifications.notifyPickPublished(
        { ...savedPick, sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam },
        { db: require("./db") }
      );
    } catch (notifErr) {
      console.error("[publish-direct] notify failed:", notifErr.message || notifErr);
    }

    res.json({
      ok: true,
      pick: { ...savedPick, sport: event.sport, league: event.league, homeTeam: event.homeTeam, awayTeam: event.awayTeam, eventDate: event.eventDate, disclaimer: SPORTS_PICK_DISCLAIMER },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "publish_direct_failed") });
  }
});

// ── RETO ESCALERA ENDPOINTS ───────────────────────────────────────────────

// Admin: list ALL retos including drafts
app.get("/admin/retos", requireAdmin, async (req, res) => {
  try {
    const retos = await listAllRetos(50);
    res.json({ ok: true, retos });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || "retos_failed") });
  }
});

// Generate reto with Claude from scouted events
app.post("/api/reto/generate", requireAdmin, aiGenLimiter, async (req, res) => {
  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: RATE_LIMIT_WINDOW_MS });
  }
  try {
    const { events: eventList, inversion, meta, gptMarketsMap } = req.body || {};
    if (!Array.isArray(eventList) || !eventList.length) {
      return res.status(400).json({ ok: false, error: "events array required" });
    }
    const inv = Number(inversion || 500);
    const tgt = Number(meta || 5000);
    if (inv <= 0 || tgt <= inv) return res.status(400).json({ ok: false, error: "meta must be greater than inversion" });

    // Enrich events with real stats and odds from DB
    const enrichedEvents = await Promise.all(eventList.map(async (ev) => {
      const [dbEvent, latestStats] = await Promise.all([
        getSportsEventById(Number(ev.id)).catch(() => null),
        getLatestEventStats(Number(ev.id)).catch(() => null),
      ]);
      return { ...ev, rawJson: dbEvent?.rawJson || null, statsJson: latestStats?.statsJson || null };
    }));

    // Auto-run GPT market analysis for events missing pre-run data
    const autoGptMap = { ...(gptMarketsMap || {}) };
    await Promise.all(enrichedEvents.map(async (ev) => {
      if (autoGptMap[ev.id]) return;
      try {
        const enrichedStatsAuto = enrichStatsWithOdds(ev, ev.statsJson || {});
        const markets = await analyzeMarketsGPT({
          event: { sport: ev.sport, league: ev.league, home_team: ev.homeTeam, away_team: ev.awayTeam, event_date: ev.eventDate },
          stats: enrichedStatsAuto,
        });
        autoGptMap[ev.id] = markets;
      } catch { /* Claude works without it */ }
    }));

    const result = await generateRetoEscalera({ events: enrichedEvents, inversion: inv, meta: tgt, gptMarketsMap: autoGptMap });

    // Save as draft
    const saved = await saveRetoDraft({
      meta: tgt,
      inversion: inv,
      legs: result.legs,
      combinedOdds: result.combinedOdds,
      projectedWin: result.projectedWin,
      analysis: result.analysis,
      planTier: "reto_escalera",
    });

    res.json({ ok: true, retoId: saved.id, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "reto_generate_failed") });
  }
});

// Publish a draft reto
app.post("/api/reto/:id/publish", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await publishReto(id);
    res.json({ ok: true, retoId: id });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "reto_publish_failed") });
  }
});

// Get active reto (user-facing — requires auth but not admin)
app.get("/api/reto/active", async (req, res) => {
  try {
    const reto = await getActiveReto();
    res.json({ ok: true, reto: reto || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "reto_fetch_failed") });
  }
});

// Get reto history (user-facing)
app.get("/api/reto/history", async (req, res) => {
  try {
    const limit = Math.min(20, Number(req.query.limit || 10));
    const retos = await listRetos(limit);
    res.json({ ok: true, retos });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "reto_history_failed") });
  }
});

// Get reto by id (user-facing)
app.get("/api/reto/:id", async (req, res) => {
  try {
    const reto = await getRetoById(Number(req.params.id));
    if (!reto) return res.status(404).json({ error: 'not_found' });
    res.json({ reto });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

// Edit leg fields (pick, market, match, odds, analysis) — admin only
app.patch("/api/reto/:id/leg/:legIndex/fields", requireAdmin, async (req, res) => {
  try {
    const retoId = Number(req.params.id);
    const legIndex = Number(req.params.legIndex);
    const { pick, market, match, odds, analysis } = req.body || {};
    const updated = await updateRetoLegFields({ retoId, legIndex, pick, market, match, odds, analysis });
    res.json({ ok: true, reto: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "leg_fields_failed") });
  }
});

// Mark a leg result (admin only)
app.put("/api/reto/:id/leg/:legIndex/result", requireAdmin, async (req, res) => {
  try {
    const retoId = Number(req.params.id);
    const legIndex = Number(req.params.legIndex);
    const { result } = req.body || {};
    if (!result) return res.status(400).json({ ok: false, error: "result required" });
    const updated = await updateRetoLegResult({ retoId, legIndex, result: String(result) });
    res.json({ ok: true, reto: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "leg_result_failed") });
  }
});

app.delete("/admin/picks/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "pick id required" });
    const result = await deletePickAndCandidates(id);
    if (!result.deleted) return res.status(404).json({ ok: false, error: result.reason });
    res.json({ ok: true, eventId: result.eventId });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "delete_failed") });
  }
});

app.put("/api/picks/:id/result", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { result } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "pick id required" });
    const updated = await updatePickResult({ id, result: String(result || "") });
    res.json({ ok: true, ...updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "result_update_failed") });
  }
});

// Registra la razón de fallo de un pick (alimenta el contexto de la IA en futuros picks similares)
app.post("/api/picks/:id/fail-reason", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "pick id required" });
    if (typeof setPickFailReason !== "function") {
      return res.status(501).json({ ok: false, error: "fail_reason_not_supported" });
    }
    const { reason, tags, notes } = req.body || {};
    const tagsArr = Array.isArray(tags) ? tags.filter((t) => t && typeof t === "string") : [];
    const result = await setPickFailReason(id, {
      reason: typeof reason === "string" ? reason.trim().slice(0, 80) : null,
      tags: tagsArr.length ? tagsArr : null,
      notes: typeof notes === "string" ? notes.trim().slice(0, 1000) : null,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = String(error?.message || "fail_reason_update_failed");
    const status = msg === "pick_not_found" ? 404 : msg === "pick_id_required" ? 400 : 500;
    res.status(status).json({ ok: false, error: msg });
  }
});

// ─── BANKROLL (vista logueada del usuario) ─────────────────
// GET /api/me/bankroll → estado actual del bankroll (404 si no configurado)
app.get("/api/me/bankroll", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof getUserBankroll !== "function") return res.status(501).json({ ok: false, error: "bankroll_not_supported" });
    const bankroll = await getUserBankroll(email);
    if (!bankroll) return res.status(404).json({ ok: false, error: "bankroll_not_configured" });
    res.json({ ok: true, bankroll });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "bankroll_get_failed") });
  }
});

// POST /api/me/bankroll → upsert (crea o actualiza)
app.post("/api/me/bankroll", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof upsertUserBankroll !== "function") return res.status(501).json({ ok: false, error: "bankroll_not_supported" });
    const { initialAmount, currentAmount, defaultUnit, currency } = req.body || {};
    const initial = Number(initialAmount);
    if (!Number.isFinite(initial) || initial <= 0) return res.status(400).json({ ok: false, error: "initialAmount_invalid" });
    const existing = await getUserBankroll(email);
    const bankroll = await upsertUserBankroll(email, {
      initialAmount: initial,
      currentAmount: Number.isFinite(Number(currentAmount)) ? Number(currentAmount) : (existing?.currentAmount ?? initial),
      defaultUnit: Number.isFinite(Number(defaultUnit)) && Number(defaultUnit) > 0 ? Number(defaultUnit) : 100,
      currency: typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase().slice(0, 6) : "MXN",
    });
    res.json({ ok: true, bankroll });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "bankroll_save_failed") });
  }
});

// POST /api/me/bets → registrar un bet seguido (log)
// Body: { pickId, stake, odds? }
app.post("/api/me/bets", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof logUserPickBet !== "function") return res.status(501).json({ ok: false, error: "bets_not_supported" });
    const pickId = Number(req.body?.pickId);
    const stake = Number(req.body?.stake);
    const odds = req.body?.odds == null ? null : Number(req.body.odds);
    if (!pickId) return res.status(400).json({ ok: false, error: "pickId_required" });
    if (!Number.isFinite(stake) || stake <= 0) return res.status(400).json({ ok: false, error: "stake_invalid" });
    if (odds !== null && (!Number.isFinite(odds) || odds < 1.01)) return res.status(400).json({ ok: false, error: "odds_invalid" });
    const bet = await logUserPickBet(email, pickId, { stake, odds });
    res.json({ ok: true, bet });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "bet_log_failed") });
  }
});

// GET /api/me/bets → lista de bets del usuario
app.get("/api/me/bets", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof listUserBets !== "function") return res.status(501).json({ ok: false, error: "bets_not_supported" });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const bets = await listUserBets(email, { limit });
    res.json({ ok: true, bets });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "bets_list_failed") });
  }
});

// ─── REFERIDOS (sistema MVP) ────────────────────────────────
// GET /api/me/referral → devuelve { code, shareUrl, stats }
app.get("/api/me/referral", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof getOrCreateReferralCode !== "function") return res.status(501).json({ ok: false, error: "referral_not_supported" });
    if (typeof getReferralStats !== "function") return res.status(501).json({ ok: false, error: "referral_not_supported" });
    const ref = await getOrCreateReferralCode(email);
    const stats = await getReferralStats(email);
    const baseUrl = String(process.env.PUBLIC_APP_URL || "https://app.momentumascent.com").replace(/\/+$/, "");
    const shareUrl = `${baseUrl}/registro.html?ref=${encodeURIComponent(ref.code)}`;
    res.json({ ok: true, code: ref.code, shareUrl, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "referral_get_failed") });
  }
});

// POST /api/me/referral/redeem → usuario logueado canjea código
// body: { code }
app.post("/api/me/referral/redeem", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof getReferralByCode !== "function") return res.status(501).json({ ok: false, error: "referral_not_supported" });
    if (typeof logReferralUse !== "function") return res.status(501).json({ ok: false, error: "referral_not_supported" });
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "code_required" });
    const ref = await getReferralByCode(code);
    if (!ref) return res.status(404).json({ ok: false, error: "code_not_found" });
    if (ref.ownerEmail === email) return res.status(400).json({ ok: false, error: "self_referral" });
    try {
      const result = await logReferralUse({ code: ref.code, referredEmail: email, referrerEmail: ref.ownerEmail });
      res.json({ ok: true, useId: result.useId, referrerEmail: ref.ownerEmail, code: ref.code });
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg === "self_referral_not_allowed") return res.status(400).json({ ok: false, error: "self_referral" });
      if (msg === "already_used") return res.status(400).json({ ok: false, error: "already_used" });
      throw err;
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "referral_redeem_failed") });
  }
});

// GET /api/me/referral/uses → lista de gente que usó mi código
app.get("/api/me/referral/uses", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof listReferralUses !== "function") return res.status(501).json({ ok: false, error: "referral_not_supported" });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const uses = await listReferralUses(email, { limit });
    res.json({ ok: true, uses });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "referral_uses_failed") });
  }
});

// GET /api/me/bets/stats → stats agregadas (ROI, WR, racha, etc.)
app.get("/api/me/bets/stats", async (req, res) => {
  try {
    const email = getRequestEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    if (typeof getUserBankrollStats !== "function") return res.status(501).json({ ok: false, error: "bets_not_supported" });
    const stats = await getUserBankrollStats(email);
    // Calcular racha de bets resueltos (sin tocar BD): listamos los últimos y contamos consecutivos
    let streak = 0;
    try {
      const recent = await listUserBets(email, { limit: 50 });
      const resolved = (recent || []).filter((b) => b.status === "won" || b.status === "lost");
      if (resolved.length) {
        const first = resolved[0].status;
        for (const b of resolved) { if (b.status === first) streak++; else break; }
        if (first === "lost") streak = -streak;
      }
    } catch (_) {}
    res.json({ ok: true, stats: { ...stats, streak } });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "bets_stats_failed") });
  }
});

app.get("/api/picks/today", async (req, res) => {
  try {
    const viewerPlanId = await getViewerPlanId(req);
    const isPremiumViewer = viewerPlanId !== "free";
    // Free users see premium picks locked (match visible, pick/analysis hidden)
    const filterByTier = (arr) =>
      filterPublishedPicks(arr).map((p) => {
        if ((p?.planTier || "free") === "premium" && !isPremiumViewer) return { ...p, pickLocked: true };
        return p;
      });
    const explicitDate = typeof req.query.date === "string" && req.query.date.trim();
    let dateKey = String(req.query.date || toDateKey()).trim();
    let picks = filterByTier((await listPickHistory(500)).filter((pick) => matchesDateKey(pick?.eventDate, dateKey)));
    if (!explicitDate) {
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowKey = toDateKey(tomorrowDate);
      const tomorrowPicks = filterByTier((await listPickHistory(500)).filter((pick) => matchesDateKey(pick?.eventDate, tomorrowKey)));
      const todayHasOnlyMock = picks.length > 0 && picks.every((pick) => String(pick?.externalId || "").startsWith("mock-"));
      const tomorrowHasCurated = tomorrowPicks.some((pick) => !String(pick?.externalId || "").startsWith("mock-"));
      if ((!picks.length || todayHasOnlyMock) && tomorrowHasCurated) {
        dateKey = tomorrowKey;
        picks = tomorrowPicks;
      }
    }
    if (!picks.length) {
      let events = (await listRecentSportsEvents(400)).filter((event) => matchesDateKey(event?.eventDate, dateKey));
      if (!events.length) {
        events = await syncSportsEvents();
        events = events.filter((event) => matchesDateKey(event?.eventDate, dateKey));
      }
      picks = filterByTier((await listPickHistory(500)).filter((pick) => matchesDateKey(pick?.eventDate, dateKey)));
      res.json({
        ok: true,
        date: dateKey,
        picks: enrichPicksWithTopRank(picks).map((pick) => redactPickForViewer({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER }, viewerPlanId)),
        eventsAvailable: events.length,
      });
      return;
    }
    res.json({
      ok: true,
      date: dateKey,
      picks: enrichPicksWithTopRank(picks).map((pick) => redactPickForViewer({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER }, viewerPlanId)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "picks_today_failed") });
  }
});

// Helper: enriquece picks con topRank (TOP 3 del día por score combinado)
function enrichPicksWithTopRank(picks){
  try {
    if (!Array.isArray(picks) || !picks.length || typeof selectTopPicksOfDay !== "function") return picks;
    const ranked = selectTopPicksOfDay(picks, { topN: 3, minConfidence: 60 });
    if (!ranked.length) return picks;
    const rankMap = new Map(ranked.map((p) => [p.id, p.topRank]));
    return picks.map((p) => (rankMap.has(p.id) ? { ...p, topRank: rankMap.get(p.id) } : p));
  } catch (_) {
    return picks;
  }
}

// TOP 3 picks del día (puede usarse desde marketing, scorecard, etc.)
app.get("/api/picks/top-today", async (req, res) => {
  try {
    const viewerPlanId = await getViewerPlanId(req);
    const isPremiumViewer = viewerPlanId !== "free";
    const dateKey = String(req.query.date || toDateKey()).trim();
    let picks = filterPublishedPicks((await listPickHistory(500)).filter((pick) => matchesDateKey(pick?.eventDate, dateKey)));
    picks = picks.map((p) => ((p?.planTier || "free") === "premium" && !isPremiumViewer) ? { ...p, pickLocked: true } : p);
    const ranked = (typeof selectTopPicksOfDay === "function")
      ? selectTopPicksOfDay(picks, { topN: 3, minConfidence: 60 })
      : picks.slice(0, 3);
    res.json({
      ok: true,
      date: dateKey,
      picks: ranked.map((pick) => redactPickForViewer({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER }, viewerPlanId)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "top_picks_failed") });
  }
});

// ── EMBEDDINGS para "casos similares" (Batch 3 #4) ────────────────
// POST /api/picks/:id/embed (admin) — genera y guarda el embedding del pick
// Si ya existe con mismo contextHash, devuelve cached. Útil para backfill.
app.post("/api/picks/:id/embed", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "pick id required" });
    if (typeof savePickEmbedding !== "function" || typeof generateEmbedding !== "function") {
      return res.status(501).json({ ok: false, error: "embeddings_not_supported" });
    }
    // Obtener pick desde historial (el getter directo getLatestAiPickForEvent no aplica acá)
    const allPicks = await listPickHistory(1000);
    const pick = allPicks.find((p) => Number(p.id) === id);
    if (!pick) return res.status(404).json({ ok: false, error: "pick_not_found" });
    const text = buildPickEmbedText(pick);
    if (!text) return res.status(400).json({ ok: false, error: "no_embeddable_text" });
    const newHash = hashText(text);
    const existing = await getPickEmbedding(id);
    if (existing && existing.contextHash === newHash) {
      return res.json({ ok: true, cached: true, pickId: id, model: existing.model, contextHash: newHash, dims: existing.embedding?.length || 0 });
    }
    const model = String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small");
    const embedding = await generateEmbedding(text, { model });
    await savePickEmbedding(id, { embedding, model, contextHash: newHash });
    res.json({ ok: true, cached: false, pickId: id, model, contextHash: newHash, dims: embedding.length });
  } catch (error) {
    const msg = String(error?.message || "embed_failed");
    res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/picks/similar/:id — devuelve los K picks más similares (k=5 default)
// Si el pick query no tiene embedding, lo genera al vuelo (cuesta 1 llamada OpenAI)
app.get("/api/picks/similar/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const k = Math.max(1, Math.min(20, Number(req.query.k) || 5));
    if (!id) return res.status(400).json({ ok: false, error: "pick id required" });
    if (typeof listAllPickEmbeddings !== "function" || typeof findKNearest !== "function") {
      return res.status(501).json({ ok: false, error: "embeddings_not_supported" });
    }
    const allPicks = await listPickHistory(1000);
    const queryPick = allPicks.find((p) => Number(p.id) === id);
    if (!queryPick) return res.status(404).json({ ok: false, error: "pick_not_found" });

    // Obtener/generar embedding del query
    let queryEmb = await getPickEmbedding(id);
    if (!queryEmb) {
      const text = buildPickEmbedText(queryPick);
      if (!text) return res.status(400).json({ ok: false, error: "no_embeddable_text" });
      const model = String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small");
      const embedding = await generateEmbedding(text, { model });
      await savePickEmbedding(id, { embedding, model, contextHash: hashText(text) });
      queryEmb = { embedding };
    }
    // Buscar similares
    const all = await listAllPickEmbeddings({ limit: 1000 });
    const others = all.filter((e) => Number(e.pickId) !== id);
    const nearest = findKNearest(queryEmb.embedding, others, k);
    // Enriquecer con detalles del pick
    const detailed = nearest.map((n) => {
      const detail = allPicks.find((p) => Number(p.id) === Number(n.pickId));
      return detail ? {
        pickId: n.pickId,
        similarity: Number(n.similarity.toFixed(4)),
        league: detail.league,
        homeTeam: detail.homeTeam || detail.home_team,
        awayTeam: detail.awayTeam || detail.away_team,
        market: detail.market,
        pick: detail.pick,
        result: detail.result,
        confidence: detail.confidence,
        eventDate: detail.eventDate || detail.event_date,
        failReason: detail.failReason || detail.fail_reason,
      } : { pickId: n.pickId, similarity: Number(n.similarity.toFixed(4)) };
    });
    res.json({ ok: true, queryPickId: id, count: detailed.length, similar: detailed });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "similar_failed") });
  }
});

// ── BATCH 4: NOTIFICATIONS + LINE MOVEMENT + NEWS ─────────────────────────

// POST /api/admin/notify/test — manda un test al canal indicado
app.post("/api/admin/notify/test", requireAdmin, async (req, res) => {
  try {
    const channel = String(req.body?.channel || "telegram").toLowerCase();
    const recipient = req.body?.recipient || undefined;
    const message = String(req.body?.message || "🧪 Test notification — Momentum Ascent backend OK");
    const subject = String(req.body?.subject || "Test Momentum Ascent");
    const dbMod = require("./db");

    let result;
    if (channel === "telegram") {
      result = await notifications.dispatch({
        channel: "telegram",
        recipient,
        type: "test",
        subject,
        message,
        payload: { source: "admin_test" },
        db: dbMod,
      });
    } else if (channel === "email") {
      result = await notifications.dispatch({
        channel: "email",
        recipient,
        type: "test",
        subject,
        text: message,
        html: `<p>${String(message).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p>`,
        payload: { source: "admin_test" },
        db: dbMod,
      });
    } else {
      return res.status(400).json({ ok: false, error: "unsupported_channel" });
    }
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "notify_test_failed") });
  }
});

// GET /api/admin/notifications/log — listado paginado
app.get("/api/admin/notifications/log", requireAdmin, async (req, res) => {
  try {
    if (typeof listNotifications !== "function") {
      return res.status(501).json({ ok: false, error: "notifications_log_not_supported" });
    }
    const channel = req.query.channel ? String(req.query.channel) : undefined;
    const limit = Number(req.query.limit || 50);
    const rows = await listNotifications({ channel, limit });
    res.json({ ok: true, count: rows.length, notifications: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "notifications_log_failed") });
  }
});

// GET /api/admin/picks/:id/odds-snapshots — historial de snapshots para line movement
app.get("/api/admin/picks/:id/odds-snapshots", requireAdmin, async (req, res) => {
  try {
    if (typeof listOddsSnapshots !== "function") {
      return res.status(501).json({ ok: false, error: "odds_snapshots_not_supported" });
    }
    const pickId = Number(req.params.id || 0);
    if (!pickId) return res.status(400).json({ ok: false, error: "pick_id_required" });
    const snapshots = await listOddsSnapshots(pickId);
    let movement = null;
    if (snapshots.length >= 2) {
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];
      movement = lineMovement.detectSignificantMove({ oldOdds: first.odds, newOdds: last.odds });
    }
    res.json({ ok: true, pickId, count: snapshots.length, snapshots, movement });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "odds_snapshots_failed") });
  }
});

// POST /api/admin/picks/:id/odds-snapshot — agregar snapshot manual + detectar movimiento
app.post("/api/admin/picks/:id/odds-snapshot", requireAdmin, async (req, res) => {
  try {
    if (typeof saveOddsSnapshot !== "function") {
      return res.status(501).json({ ok: false, error: "odds_snapshots_not_supported" });
    }
    const pickId = Number(req.params.id || 0);
    if (!pickId) return res.status(400).json({ ok: false, error: "pick_id_required" });
    const odds = Number(req.body?.odds);
    if (!Number.isFinite(odds) || odds <= 0) {
      return res.status(400).json({ ok: false, error: "valid_odds_required" });
    }
    const market = req.body?.market ? String(req.body.market) : null;
    const source = String(req.body?.source || "manual");

    // Compare against previous snapshot BEFORE saving the new one
    const dbMod = require("./db");
    const comparison = await lineMovement.compareOddsForPick(pickId, odds, { db: dbMod });

    const saved = await saveOddsSnapshot({ pickId, odds, market, source });
    res.json({ ok: true, snapshot: saved, movement: comparison.change || null, previous: comparison.snapshot || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "odds_snapshot_failed") });
  }
});

// POST /api/admin/news/event-relevant — busca news relevantes para un evento
app.post("/api/admin/news/event-relevant", requireAdmin, async (req, res) => {
  try {
    const { homeTeam, awayTeam, league } = req.body || {};
    if (!homeTeam && !awayTeam) {
      return res.status(400).json({ ok: false, error: "homeTeam_or_awayTeam_required" });
    }
    const topK = Math.max(1, Math.min(10, Number(req.body?.topK) || 3));
    const hoursOld = Math.max(1, Math.min(168, Number(req.body?.hoursOld) || 24));
    const results = await newsScraper.getRelevantNewsForEvent({ homeTeam, awayTeam, league }, { topK, hoursOld });
    res.json({ ok: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "news_event_relevant_failed") });
  }
});

// ── SOCIAL PUBLISHER → Make.com webhook (Batch 5) ───────────────
// Status del módulo (¿está configurado MAKE_WEBHOOK_URL?)
app.get("/api/admin/social/status", requireAdmin, (req, res) => {
  res.json({ ok: true, ...socialPublisher.getConfigStatus() });
});

// GET preview del texto que se mandaría para un pick específico
app.get("/api/admin/social/preview/:pickId", requireAdmin, async (req, res) => {
  try {
    const pickId = Number(req.params.pickId);
    if (!pickId) return res.status(400).json({ ok: false, error: "pick_id_required" });
    const allPicks = await listPickHistory(500);
    const pick = allPicks.find((p) => Number(p.id) === pickId);
    if (!pick) return res.status(404).json({ ok: false, error: "pick_not_found" });
    const kind = String(req.query.kind || "auto");
    const payload = socialPublisher.buildPickPayload(pick, { kind });
    res.json({ ok: true, preview: payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "preview_failed") });
  }
});

// POST publicar un pick específico en redes (via Make webhook)
// Body: { pickId, channels?, kind?, scheduledAt?, imageUrl?, customText? }
app.post("/api/admin/social/publish", requireAdmin, async (req, res) => {
  try {
    const pickId = Number(req.body?.pickId);
    if (!pickId) return res.status(400).json({ ok: false, error: "pick_id_required" });
    const allPicks = await listPickHistory(500);
    const pick = allPicks.find((p) => Number(p.id) === pickId);
    if (!pick) return res.status(404).json({ ok: false, error: "pick_not_found" });

    const channels = Array.isArray(req.body?.channels) && req.body.channels.length
      ? req.body.channels.filter((c) => typeof c === "string").map((c) => c.toLowerCase())
      : ["facebook"];
    const kind = String(req.body?.kind || "auto");
    const scheduledAt = typeof req.body?.scheduledAt === "string" ? req.body.scheduledAt : null;
    const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null;
    const customText = typeof req.body?.customText === "string" ? req.body.customText : null;

    const payload = socialPublisher.buildPickPayload(pick, { channels, kind, scheduledAt, imageUrl, customText });
    const result = await socialPublisher.sendToMakeWebhook(payload);

    // Log en notifications_log si está la función
    if (typeof logNotification === "function") {
      try {
        await logNotification({
          channel: "make_webhook",
          recipient: payload.channel,
          type: "pick_published_social",
          subject: `${pick.homeTeam || ""} vs ${pick.awayTeam || ""}`,
          payload: JSON.stringify({ pickId, kind: payload.meta?.kind, channels, scheduledAt }),
          status: result.ok ? "sent" : "failed",
          error: result.ok ? null : String(result.error || result.reason || "unknown"),
        });
      } catch (_) {}
    }

    if (!result.ok) {
      const status = result.skipped ? 501 : 502;
      return res.status(status).json({ ok: false, ...result, payload });
    }
    res.json({ ok: true, result, payloadSent: payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "social_publish_failed") });
  }
});

// POST test endpoint — manda un payload de prueba al webhook
app.post("/api/admin/social/test", requireAdmin, async (req, res) => {
  try {
    const payload = {
      channel: "test",
      channels: ["test"],
      text: req.body?.text || "🧪 Test desde Momentum Ascent — si ves esto en tu trigger de Make, el webhook está OK.",
      imageUrl: req.body?.imageUrl || null,
      scheduledAt: null,
      meta: { kind: "test", source: "admin", timestamp: new Date().toISOString() },
    };
    const result = await socialPublisher.sendToMakeWebhook(payload);
    if (!result.ok) {
      const status = result.skipped ? 501 : 502;
      return res.status(status).json({ ok: false, ...result, payloadSent: payload });
    }
    res.json({ ok: true, result, payloadSent: payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "social_test_failed") });
  }
});

// Scorecard del día — consumible por home, marketing, widgets externos
// Devuelve: { date, stats: { totalPicks, won, lost, pending, winRate }, topPicks: [...] }
app.get("/api/scorecard/latest", async (req, res) => {
  try {
    const viewerPlanId = await getViewerPlanId(req);
    const isPremiumViewer = viewerPlanId !== "free";
    const dateKey = String(req.query.date || toDateKey()).trim();
    const allHistory = filterPublishedPicks(await listPickHistory(500));
    let dayPicks = allHistory.filter((pick) => matchesDateKey(pick?.eventDate, dateKey));
    // Fallback: si hoy aún no hay picks, mostrar el día más reciente con picks
    if (!dayPicks.length) {
      const sortedByDate = allHistory
        .map((p) => ({ p, key: typeof toDateKey === "function" ? toDateKey(new Date(p.eventDate || p.event_date || p.createdAt || 0)) : "" }))
        .filter((x) => x.key)
        .sort((a, b) => (a.key < b.key ? 1 : -1));
      const latestKey = sortedByDate[0]?.key;
      if (latestKey) {
        dayPicks = allHistory.filter((pick) => matchesDateKey(pick?.eventDate, latestKey));
      }
    }
    const effectiveDate = dayPicks.length ? (toDateKey(new Date(dayPicks[0]?.eventDate || dayPicks[0]?.event_date || 0)) || dateKey) : dateKey;
    const won = dayPicks.filter((p) => p.result === "won").length;
    const lost = dayPicks.filter((p) => p.result === "lost").length;
    const voidC = dayPicks.filter((p) => p.result === "void").length;
    const pending = dayPicks.filter((p) => !p.result).length;
    const resolved = won + lost;
    const winRate = resolved ? Math.round((won / resolved) * 100) : null;

    // Top 3 picks del día con tier-lock para no-premium
    let topPicks = dayPicks.map((p) => ((p?.planTier || "free") === "premium" && !isPremiumViewer) ? { ...p, pickLocked: true } : p);
    const ranked = (typeof selectTopPicksOfDay === "function")
      ? selectTopPicksOfDay(topPicks, { topN: 3, minConfidence: 60 })
      : topPicks.slice(0, 3);

    res.json({
      ok: true,
      date: effectiveDate,
      stats: {
        totalPicks: dayPicks.length,
        won, lost, void: voidC, pending,
        winRate,
        resolved,
      },
      topPicks: ranked.map((pick) => redactPickForViewer({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER }, viewerPlanId)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "scorecard_latest_failed") });
  }
});

app.get("/api/picks/history", async (req, res) => {
  try {
    const viewerPlanId = await getViewerPlanId(req);
    const isPremiumViewer = viewerPlanId !== "free";
    const limit = Number(req.query.limit || 100);
    let picks = filterPublishedPicks(await listPickHistory(limit)).map((p) => {
      if ((p?.planTier || "free") === "premium" && !isPremiumViewer) return { ...p, pickLocked: true };
      return p;
    });
    // Tag con topRank solo los picks del día actual (TOP 3)
    const todayKey = toDateKey();
    const todayPicks = picks.filter((pick) => matchesDateKey(pick?.eventDate, todayKey));
    if (todayPicks.length && typeof selectTopPicksOfDay === "function") {
      try {
        const ranked = selectTopPicksOfDay(todayPicks, { topN: 3, minConfidence: 60 });
        const rankMap = new Map(ranked.map((p) => [p.id, p.topRank]));
        picks = picks.map((p) => (rankMap.has(p.id) ? { ...p, topRank: rankMap.get(p.id) } : p));
      } catch (_) {}
    }
    res.json({
      ok: true,
      picks: picks.map((pick) => redactPickForViewer({ ...pick, disclaimer: SPORTS_PICK_DISCLAIMER }, viewerPlanId)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "picks_history_failed") });
  }
});

// Stats agregados por mercado y tier para el panel de admin
app.get("/api/picks/stats", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days || 14)));
    const allPicks = await listPickHistory(500);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recent = allPicks.filter(p => {
      const d = new Date(p.eventDate || p.event_date || p.createdAt || p.created_at || 0);
      return d >= cutoff && (p.result === 'won' || p.result === 'lost');
    });

    // Aggregate by market
    const byMarket = {};
    const byTier = { free: { won: 0, lost: 0 }, premium: { won: 0, lost: 0 }, ai_coach: { won: 0, lost: 0 } };
    const byConfBucket = {};

    recent.forEach(p => {
      const market = String(p.market || 'unknown').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const tier = String(p.planTier || 'free').toLowerCase();
      const conf = Number(p.confidence || 0);
      const won = p.result === 'won';

      // by market
      if (!byMarket[market]) byMarket[market] = { won: 0, lost: 0, totalConf: 0 };
      won ? byMarket[market].won++ : byMarket[market].lost++;
      byMarket[market].totalConf += conf;

      // by tier
      const tierKey = tier === 'premium' || tier === 'coach_humano' ? 'premium' : tier === 'ai_coach' ? 'ai_coach' : 'free';
      if (byTier[tierKey]) { won ? byTier[tierKey].won++ : byTier[tierKey].lost++; }

      // by confidence bucket
      const bucket = conf >= 75 ? '75-80' : conf >= 70 ? '70-74' : conf >= 65 ? '65-69' : conf >= 60 ? '60-64' : '50-59';
      if (!byConfBucket[bucket]) byConfBucket[bucket] = { won: 0, lost: 0 };
      won ? byConfBucket[bucket].won++ : byConfBucket[bucket].lost++;
    });

    const calcWR = (d) => {
      const t = d.won + d.lost;
      return t > 0 ? Math.round(d.won / t * 100) : null;
    };

    const markets = Object.entries(byMarket).map(([market, d]) => ({
      market,
      won: d.won,
      lost: d.lost,
      total: d.won + d.lost,
      winRate: calcWR(d),
      avgConf: d.won + d.lost > 0 ? Math.round(d.totalConf / (d.won + d.lost)) : null,
    })).sort((a, b) => (b.winRate || 0) - (a.winRate || 0));

    res.json({
      ok: true,
      days,
      totalResolved: recent.length,
      byMarket: markets,
      byTier: Object.entries(byTier).map(([tier, d]) => ({ tier, ...d, total: d.won + d.lost, winRate: calcWR(d) })),
      byConfBucket: Object.entries(byConfBucket).map(([bucket, d]) => ({ bucket, ...d, total: d.won + d.lost, winRate: calcWR(d) })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'stats_failed' });
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
    // Batch 4: iniciar cron jobs (daily summary + streak alerts)
    try {
      startCronJobs({
        notifications,
        db: require("./db"),
        listPickHistory,
        toDateKey,
        matchesDateKey,
      });
    } catch (err) {
      console.error("[startup cron] failed:", err.message || err);
    }
  })
  .catch((error) => {
    console.error("[backend] failed to initialize db:", error.message || error);
    process.exit(1);
  });
