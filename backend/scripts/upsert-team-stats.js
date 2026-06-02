// CLI helper: inserta/actualiza team_stats desde JSON.
// Uso desde Bash (mismo proyecto):
//   node backend/scripts/upsert-team-stats.js path/to/stats.json
// O por stdin:
//   echo '[{...}]' | node backend/scripts/upsert-team-stats.js -
//
// El JSON puede ser un objeto único o un array. Cada item requiere
// teamName, league, sport. El resto de campos son opcionales.
//
// Cada deporte tiene sus campos típicos (ver upsertTeamStats en db-postgres.js).
//
// Ejemplo mínimo (fútbol):
//   { "teamName": "Manchester City", "league": "Premier League", "sport": "football",
//     "season": "2025-26", "cornersForAvg": 6.5, "cornersAgainstAvg": 3.8,
//     "bttsPct": 65, "over25Pct": 75, "formLast5": "W-W-W-D-W", "sampleSize": 12,
//     "sourceUrl": "https://www.sofascore.com/team/12345/manchester-city/statistics" }
//
// Ejemplo MLB:
//   { "teamName": "Dodgers", "league": "MLB", "sport": "baseball",
//     "season": "2026", "eraBullpen": 3.4, "opsTeam": 0.785, "opsVsLhp": 0.760,
//     "runsForAvg": 5.2, "sampleSize": 60, "formLast5": "W-W-L-W-W" }
const fs = require("fs");
const path = require("path");

(async () => {
  const argInput = process.argv[2];
  if (!argInput) {
    console.error("Uso: node backend/scripts/upsert-team-stats.js <archivo.json|->");
    process.exit(2);
  }

  // Asegurar conexión BD prod si no hay DATABASE_URL
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://momentumascent_user:cBFaJKyKYzHsTeM5BBEeBlpGD8wVD0Ls@dpg-d6kr23ntskes73ar0na0-a.oregon-postgres.render.com/momentumascent";
    process.env.DB_CLIENT = "postgres";
    process.env.PGSSL = "true";
  }

  let raw = "";
  if (argInput === "-") {
    raw = await new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    });
  } else {
    const filePath = path.resolve(argInput);
    if (!fs.existsSync(filePath)) {
      console.error(`Archivo no existe: ${filePath}`);
      process.exit(2);
    }
    raw = fs.readFileSync(filePath, "utf8");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error(`JSON inválido: ${e.message}`);
    process.exit(2);
  }

  const items = Array.isArray(payload) ? payload : [payload];
  console.log(`Procesando ${items.length} team_stats payloads...`);

  const db = require("../db");
  if (typeof db.upsertTeamStats !== "function") {
    console.error("upsertTeamStats no disponible en backend/db (¿postgres?)");
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (const item of items) {
    try {
      const result = await db.upsertTeamStats(item);
      console.log(`  OK  ${item.teamName || item.team_name} (${item.league} · ${item.sport})${result?.id ? ` → id ${result.id}` : ""}`);
      ok++;
    } catch (e) {
      console.error(`  FAIL  ${item.teamName || item.team_name || "?"}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`  OK:    ${ok}`);
  console.log(`  FAIL:  ${fail}`);
  console.log(`  Total: ${items.length}`);

  // Cerrar pool si está expuesto
  try {
    if (db.pool && typeof db.pool.end === "function") await db.pool.end();
  } catch (_) {}
  process.exit(fail > 0 ? 1 : 0);
})();
