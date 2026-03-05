require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  DB_META,
  initDb,
  ensureUser,
  getFeed,
  getMetrics,
  getWeeklyRanking,
  getAdminDashboard,
  getAdminTimeline,
  getAdminCsvReport,
  getSubscription,
  getUserPayments,
  saveAssignments,
  saveCheckin,
  createPaymentRequest,
  listPendingPaymentRequests,
  reviewPaymentRequest,
  saveNutritionPlan,
  saveRoutine,
  saveSupportAlert,
  searchUsers,
} = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

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
    const user = await ensureUser(req.body || {});
    const metrics = await getMetrics(user.id);
    res.json({
      ok: true,
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

app.get("/users", async (req, res) => {
  try {
    const users = await searchUsers(req.query.search || "");
    res.json({ ok: true, users });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "users_failed") });
  }
});

app.get("/feed/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const payload = await getFeed(userId);
    res.json({ ok: true, ...payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "feed_failed") });
  }
});

app.get("/metrics/:userId", async (req, res) => {
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

app.post("/admin/routines", async (req, res) => {
  try {
    const routine = await saveRoutine(req.body || {});
    res.status(201).json({ ok: true, routine });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "routine_failed") });
  }
});

app.post("/admin/nutrition", async (req, res) => {
  try {
    const plan = await saveNutritionPlan(req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "nutrition_failed") });
  }
});

app.post("/admin/assignments", async (req, res) => {
  try {
    const assignments = await saveAssignments(req.body || {});
    res.status(201).json({ ok: true, assignments });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "assignments_failed") });
  }
});

app.post("/checkins", async (req, res) => {
  try {
    const metrics = await saveCheckin(req.body || {});
    res.status(201).json({ ok: true, metrics });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "checkin_failed") });
  }
});

app.post("/support-alert", async (req, res) => {
  try {
    const alert = await saveSupportAlert(req.body || {});
    res.status(201).json({ ok: true, alert });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "support_alert_failed") });
  }
});

app.post("/payments/request", async (req, res) => {
  try {
    const payment = await createPaymentRequest(req.body || {});
    res.status(201).json({ ok: true, payment });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "payment_request_failed") });
  }
});

app.get("/payments/pending", async (req, res) => {
  try {
    const items = await listPendingPaymentRequests();
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "pending_payments_failed") });
  }
});

app.post("/payments/:id/review", async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    const result = await reviewPaymentRequest({ id, ...(req.body || {}) });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "review_payment_failed") });
  }
});

app.get("/subscriptions/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    const subscription = await getSubscription(userId);
    res.json({ ok: true, subscription });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || "subscription_failed") });
  }
});

app.get("/payments/:userId", async (req, res) => {
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

app.get("/admin/dashboard", async (req, res) => {
  try {
    const dateKey = String(req.query.dateKey || "").trim();
    const dashboard = await getAdminDashboard(dateKey);
    res.json({ ok: true, ...dashboard });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || "admin_dashboard_failed") });
  }
});

app.get("/admin/timeline", async (req, res) => {
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

app.get("/admin/report.csv", async (req, res) => {
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
