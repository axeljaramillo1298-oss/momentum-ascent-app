require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const { generateAiPlan, buildFallbackPlan } = require("./ai");
const { sendWhatsAppText } = require("./whatsapp");
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
} = require("./db");

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

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const getRequestEmail = (req) => String(req.headers["x-user-email"] || "").trim().toLowerCase();
const getGodToken = (req) => String(req.headers["x-god-token"] || "").trim();
const GOD_SESSIONS = new Map();
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

const requireAdmin = (req, res, next) => {
  if (isGodRequest(req)) {
    return next();
  }
  const email = getRequestEmail(req);
  if (email && ADMIN_EMAILS.has(email)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "admin_only" });
};

const requireGod = (req, res, next) => {
  if (isGodRequest(req)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "god_only" });
};

const canActAsAdmin = (req) => {
  if (isGodRequest(req)) return true;
  const email = getRequestEmail(req);
  return Boolean(email && ADMIN_EMAILS.has(email));
};

const requireSelfOrAdminByResolver = (resolver) => (req, res, next) => {
  if (canActAsAdmin(req)) {
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "fitnes-backend",
    db: DB_META,
    now: new Date().toISOString(),
  });
});

app.post("/auth/login", async (req, res) => {
  try {
    const payload = req.body || {};
    const email = String(payload.email || "").trim().toLowerCase();
    const enforcedRole = ADMIN_EMAILS.has(email) ? "admin" : "user";
    const previous = email ? await getUserByEmail(email) : null;
    const user = await ensureUser({
      ...payload,
      role: enforcedRole,
    });
    const isNew = !previous;
    const hasNewWhatsapp = !String(previous?.whatsapp || "").trim() && String(user?.whatsapp || "").trim();
    let onboarding = null;
    if ((isNew || hasNewWhatsapp) && user?.whatsapp) {
      try {
        onboarding = await startCoachOnboardingForUser(user, {
          getCoachFlowByUser,
          upsertCoachFlow,
        });
      } catch (err) {
        onboarding = { ok: false, error: String(err.message || err) };
        console.warn("[backend] whatsapp onboarding skipped:", String(err.message || err));
      }
    }
    const metrics = await getMetrics(user.id);
    res.json({
      ok: true,
      isNew,
      onboarding,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp || "",
        role: user.role || "user",
        plan: user.plan || "Free",
        goal: user.goal || "",
        checkin_schedule: user.checkin_schedule || "",
      },
      metrics,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "login_failed") });
  }
});

app.post("/god/login", async (req, res) => {
  try {
    if (!GOD_MODE_USER || !GOD_MODE_PASS) {
      return res.status(503).json({ ok: false, error: "god_mode_disabled" });
    }
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "").trim();
    if (username !== GOD_MODE_USER || password !== GOD_MODE_PASS) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
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

app.post("/coach/onboarding/start", requireSelfOrAdminByAnyBodyField(["email", "userId"]), async (req, res) => {
  try {
    const email = String(req.body?.email || req.body?.userId || "").trim().toLowerCase();
    if (!email) throw new Error("email_required");
    const user = await getUserByEmail(email);
    if (!user) throw new Error("user_not_found");
    if (!String(user.whatsapp || "").trim()) throw new Error("whatsapp_required");
    const result = await startCoachOnboardingForUser(user, {
      getCoachFlowByUser,
      upsertCoachFlow,
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "coach_onboarding_start_failed") });
  }
});

app.post("/onboarding/profile", requireSelfOrAdminByAnyBodyField(["email", "userId"]), async (req, res) => {
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

app.get("/whatsapp/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  if (mode === "subscribe" && token && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("forbidden");
});

app.post("/whatsapp/webhook", async (req, res) => {
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
    res.json({ ok: true, users });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "users_failed") });
  }
});

app.get("/feed/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const payload = await getFeed(userId);
    res.json({ ok: true, ...payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "feed_failed") });
  }
});

app.get("/metrics/:userId", requireSelfOrAdminByParam("userId"), async (req, res) => {
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

app.post("/admin/routines", requireAdmin, async (req, res) => {
  try {
    const routine = await saveRoutine(req.body || {});
    res.status(201).json({ ok: true, routine });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "routine_failed") });
  }
});

app.post("/admin/nutrition", requireAdmin, async (req, res) => {
  try {
    const plan = await saveNutritionPlan(req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "nutrition_failed") });
  }
});

app.post("/admin/assignments", requireAdmin, async (req, res) => {
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

app.post("/admin/ai-plan", requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const userIds = Array.isArray(payload.userIds)
      ? payload.userIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean)
      : [];

    const users = [];
    for (const userId of userIds.slice(0, 10)) {
      const found = await searchUsers(userId);
      const user = found.find((u) => String(u.id || u.email || "").trim().toLowerCase() === userId);
      if (user) users.push(user);
    }

    let plan;
    let aiMeta = {
      provider: "fallback",
      model: null,
      reason: "unknown",
    };
    try {
      plan = await generateAiPlan({
        ...payload,
        users,
      });
      aiMeta = {
        provider: plan?.provider || "openai",
        model: plan?.model || null,
        reason: null,
      };
    } catch (err) {
      const reason = String(err?.message || err || "openai_error");
      console.warn("[backend] ai-plan fallback:", reason);
      aiMeta = {
        provider: "fallback",
        model: null,
        reason,
      };
      plan = buildFallbackPlan({
        users,
        prompt: payload.prompt,
        context: payload.context || payload.fileText,
        mode: payload.mode,
      });
    }

    res.json({ ok: true, plan, aiMeta });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "ai_plan_failed") });
  }
});

app.post("/admin/coach/nudge", requireAdmin, async (req, res) => {
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

app.post("/checkins", requireSelfOrAdminByBody("userId"), async (req, res) => {
  try {
    const metrics = await saveCheckin(req.body || {});
    res.status(201).json({ ok: true, metrics });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "checkin_failed") });
  }
});

app.post("/support-alert", requireSelfOrAdminByBody("userId"), async (req, res) => {
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

app.get("/mindset/daily", (req, res) => {
  const phrases = [
    "La disciplina gana cuando la motivacion falla.",
    "No negocies con la excusa de hoy.",
    "La constancia de hoy paga la version de manana.",
    "Tu identidad se construye en dias normales.",
  ];
  const idx = new Date().getDate() % phrases.length;
  res.json({ ok: true, phrase: phrases[idx] });
});

app.get("/ranking/weekly", async (req, res) => {
  try {
    const ranking = await getWeeklyRanking();
    res.json({ ok: true, ranking });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "ranking_failed") });
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
