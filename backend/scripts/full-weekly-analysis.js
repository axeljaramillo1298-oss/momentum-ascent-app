/**
 * Full weekly analysis script (Momentum Apuestas).
 *
 * Cuando estén configuradas todas las credenciales en .env.analysis,
 * este script:
 *
 *   1. Consulta la BD Postgres prod y genera el dump de queries semanal
 *      (mismas queries que tmp/analysis-week-queries.js).
 *   2. Hace fetch de logs de Render últimos 7 días.
 *   3. Hace fetch de ejecuciones del scenario Make.com (webhook FB).
 *   4. Hace fetch de métricas básicas de FB Marketing API (boosts).
 *   5. Escribe el dump consolidado a tmp/full-weekly-analysis-<fecha>.txt.
 *
 * Hoy (2026-05-24) está en MODO STUB: solo la parte 1 funciona
 * (la BD ya es accesible). El resto queda como TODO con el flag
 * correcto y un mensaje claro indicando qué env var falta.
 *
 * Uso:
 *   node backend/scripts/full-weekly-analysis.js               # semana en curso
 *   node backend/scripts/full-weekly-analysis.js --week=2026-05-20  # semana específica
 *
 * Setup esperado: ver vault → Personal/Operaciones Momentum/
 *                 "Acceso para análisis futuros.md"
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// Carga .env.analysis si existe (junto al .env normal)
const envAnalysisPath = path.resolve(__dirname, "..", "..", ".env.analysis");
if (fs.existsSync(envAnalysisPath)) {
  try {
    require("dotenv").config({ path: envAnalysisPath });
  } catch {
    // dotenv puede no estar instalado en sub-paths; fallback manual
    const txt = fs.readFileSync(envAnalysisPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  }
}
// Carga .env normal (DATABASE_URL ya está ahí cuando corre desde el repo)
try {
  require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });
} catch {}

// ── Helpers ────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const logSection = (title) => {
  console.log("\n" + "=".repeat(80));
  console.log("### " + title);
  console.log("=".repeat(80));
};
const ymd = (d) => d.toISOString().slice(0, 10);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

// Calcula la ventana mié-sáb que termina más recientemente.
function weekWindowCdmx(weekStartArg) {
  let start;
  if (weekStartArg) {
    start = new Date(weekStartArg + "T00:00:00-06:00");
  } else {
    const now = new Date();
    // Encuentra el miércoles anterior (incluido hoy si hoy es mié)
    const dow = now.getUTCDay(); // 0=dom...6=sáb. Wed=3
    // CDMX dow ≈ UTC dow (mismo día casi siempre)
    const diff = (dow - 3 + 7) % 7;
    start = new Date(now);
    start.setUTCDate(start.getUTCDate() - diff);
    start.setUTCHours(6, 0, 0, 0); // 00:00 CDMX = 06:00 UTC
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // mié..sáb es 4 días, end = dom 00:00 CDMX
  return { fromUtc: start.toISOString(), toUtc: end.toISOString() };
}

// ── 1. BD analytics ────────────────────────────────────────────────
async function runDbAnalysis(window) {
  // Prioridad: ANALYSIS_DATABASE_URL (override explícito en .env.analysis para apuntar a prod)
  //           > DATABASE_URL (suele apuntar a localhost durante dev).
  // Si la única opción es localhost, avisa y salta.
  const conn = process.env.ANALYSIS_DATABASE_URL || process.env.DATABASE_URL;
  if (!conn) {
    logSection("BD analytics — SALTADA");
    log("Ni ANALYSIS_DATABASE_URL ni DATABASE_URL están definidas.");
    return;
  }
  if (/localhost|127\.0\.0\.1/.test(conn) && !process.env.ANALYSIS_DATABASE_URL) {
    logSection("BD analytics — SALTADA");
    log("DATABASE_URL apunta a localhost. Para correr contra prod define ANALYSIS_DATABASE_URL en .env.analysis.");
    log("Conn string de prod en vault → Personal/Operaciones Momentum/Acceso para análisis futuros.md");
    return;
  }
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  logSection("BD analytics — ventana " + window.fromUtc + " → " + window.toUtc);

  const queries = [
    { name: "Resumen total", sql: `
      SELECT COUNT(*)::int AS n,
        SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN p.result='lost' THEN 1 ELSE 0 END)::int AS lost,
        ROUND(100.0*SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN p.result IN ('won','lost') THEN 1 ELSE 0 END),0),1) AS wr
      FROM ai_picks p JOIN sports_events e ON e.id=p.event_id
      WHERE e.event_date >= $1 AND e.event_date < $2;` },
    { name: "WR por liga", sql: `
      SELECT e.league, COUNT(*)::int AS n,
        SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN p.result='lost' THEN 1 ELSE 0 END)::int AS lost,
        ROUND(100.0*SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN p.result IN ('won','lost') THEN 1 ELSE 0 END),0),1) AS wr
      FROM ai_picks p JOIN sports_events e ON e.id=p.event_id
      WHERE e.event_date >= $1 AND e.event_date < $2
      GROUP BY e.league ORDER BY n DESC;` },
    { name: "Calibración confidence", sql: `
      SELECT CASE
        WHEN p.confidence < 60 THEN '<60'
        WHEN p.confidence BETWEEN 60 AND 64 THEN '60-64'
        WHEN p.confidence BETWEEN 65 AND 69 THEN '65-69'
        WHEN p.confidence BETWEEN 70 AND 74 THEN '70-74'
        WHEN p.confidence BETWEEN 75 AND 79 THEN '75-79'
        WHEN p.confidence >= 80 THEN '80+' END AS bucket,
        COUNT(*)::int AS n,
        SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN p.result='lost' THEN 1 ELSE 0 END)::int AS lost,
        ROUND(100.0*SUM(CASE WHEN p.result='won' THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN p.result IN ('won','lost') THEN 1 ELSE 0 END),0),1) AS wr
      FROM ai_picks p JOIN sports_events e ON e.id=p.event_id
      WHERE e.event_date >= $1 AND e.event_date < $2
      GROUP BY bucket ORDER BY bucket;` },
    { name: "Top 10 picks fallidos por conf alta", sql: `
      SELECT p.confidence, p.plan_tier, e.league, p.market, p.pick,
        e.home_team || ' vs ' || e.away_team AS match,
        TO_CHAR(e.event_date AT TIME ZONE 'America/Mexico_City','MM-DD HH24:MI') AS kickoff
      FROM ai_picks p JOIN sports_events e ON e.id=p.event_id
      WHERE e.event_date >= $1 AND e.event_date < $2 AND p.result='lost'
      ORDER BY p.confidence DESC LIMIT 10;` },
  ];

  for (const q of queries) {
    log("\n--- " + q.name + " ---");
    try {
      const r = await client.query(q.sql, [window.fromUtc, window.toUtc]);
      if (!r.rows.length) log("(sin filas)");
      else console.table(r.rows);
    } catch (e) {
      log("ERR:", e.message);
    }
  }
  await client.end();
}

// ── 2. Render logs ─────────────────────────────────────────────────
async function fetchRenderLogs() {
  logSection("Render logs (últimos 7 días)");
  const token = process.env.RENDER_API_TOKEN;
  const svc = process.env.RENDER_SERVICE_ID;
  if (!token || !svc) {
    log("⏭️  RENDER_API_TOKEN o RENDER_SERVICE_ID no configurados. Ver vault:");
    log("    Personal/Operaciones Momentum/Acceso para análisis futuros.md");
    return;
  }
  // TODO: implementar fetch real cuando estén las credenciales
  log("TODO: implementar fetch a https://api.render.com/v1/services/${svc}/logs");
}

// ── 3. Make.com executions ─────────────────────────────────────────
async function fetchMakeExecutions() {
  logSection("Make.com executions del scenario momentum-ascent-fb");
  const token = process.env.MAKE_API_TOKEN;
  const scenarioId = process.env.MAKE_SCENARIO_ID;
  if (!token || !scenarioId) {
    log("⏭️  MAKE_API_TOKEN o MAKE_SCENARIO_ID no configurados.");
    return;
  }
  // TODO: implementar fetch a https://eu1.make.com/api/v2/scenarios/${scenarioId}/executions
  log("TODO: fetch a Make API");
}

// ── 4. FB Ads metrics ──────────────────────────────────────────────
async function fetchFbAdsMetrics() {
  logSection("FB Ads — métricas básicas");
  const token = process.env.FB_ACCESS_TOKEN;
  const adAccount = process.env.FB_AD_ACCOUNT_ID;
  if (!token || !adAccount) {
    log("⏭️  FB_ACCESS_TOKEN o FB_AD_ACCOUNT_ID no configurados.");
    return;
  }
  // TODO: implementar Graph API call
  log("TODO: fetch a graph.facebook.com/v18.0/" + adAccount + "/insights");
}

// ── Orquestador ────────────────────────────────────────────────────
(async () => {
  const window = weekWindowCdmx(args.week);
  log("Ventana semanal:", window.fromUtc, "→", window.toUtc);

  try {
    await runDbAnalysis(window);
  } catch (e) {
    log("ERR BD:", e.message);
  }

  await fetchRenderLogs();
  await fetchMakeExecutions();
  await fetchFbAdsMetrics();

  logSection("Fin");
  log("Para activar partes 2-4: completa el checklist de credenciales en");
  log("  C:\\Users\\Axel Garcia\\Documents\\Obsidian Vault\\Personal\\Operaciones Momentum\\Acceso para análisis futuros.md");
  log("y guarda los valores en .env.analysis (gitignored).");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
