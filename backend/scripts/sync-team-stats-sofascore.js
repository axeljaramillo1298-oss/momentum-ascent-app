// backend/scripts/sync-team-stats-sofascore.js
//
// Sincroniza la tabla `team_stats` desde la API privada JSON de Sofascore
// para todos los equipos que aparecen en `sports_events` dentro de una ventana
// próxima (default: 2 días).
//
// Uso:
//   node backend/scripts/sync-team-stats-sofascore.js [opciones]
//
// Opciones:
//   --days N             Ventana de eventos próximos en días (default 2).
//   --league "MLB,LMB"   Filtra a una o más ligas (CSV, case-insensitive).
//   --dry-run            No upserta nada — solo imprime lo que haría.
//   --force              Ignora el cache de frescura (7 días) y refresca todo.
//   --delay-ms N         Delay entre llamadas a Sofascore en ms (default 1500).
//   --help               Muestra esta ayuda.
//
// Exit codes:
//   0  todo OK (o tasa de fallo <=10%)
//   1  fallos parciales (>10% de equipos fallaron)
//   2  error de argumentos / fatal de arranque
//
// Cron Render (ejemplo, ver README abajo):
//   0 */6 * * *   node backend/scripts/sync-team-stats-sofascore.js --days 2

const path = require("path");

// ---------- Defaults de entorno (mismo patrón que upsert-team-stats.js) ----------
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://momentumascent_user:cBFaJKyKYzHsTeM5BBEeBlpGD8wVD0Ls@dpg-d6kr23ntskes73ar0na0-a.oregon-postgres.render.com/momentumascent";
  process.env.DB_CLIENT = "postgres";
  process.env.PGSSL = "true";
}

// ---------- Parser CLI ----------
function parseArgs(argv) {
  const out = {
    days: 2,
    leagues: null, // array de string lower o null = sin filtro
    dryRun: false,
    force: false,
    delayMs: 1500,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--days":
        out.days = Math.max(1, parseInt(next(), 10) || 2);
        break;
      case "--league":
      case "--leagues": {
        const v = next() || "";
        out.leagues = v
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (out.leagues.length === 0) out.leagues = null;
        break;
      }
      case "--dry-run":
      case "--dryrun":
        out.dryRun = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--delay-ms":
      case "--delay":
        out.delayMs = Math.max(0, parseInt(next(), 10) || 1500);
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        console.warn(`[sync-team-stats] arg desconocido: ${a}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Uso: node backend/scripts/sync-team-stats-sofascore.js [opciones]

Opciones:
  --days N             Ventana de eventos próximos en días (default 2)
  --league "MLB,LMB"   Filtra ligas (CSV, case-insensitive)
  --dry-run            No upserta — solo imprime
  --force              Ignora cache de frescura de 7 días
  --delay-ms N         Delay entre llamadas Sofascore (default 1500)
  --help               Esta ayuda
`);
}

// ---------- Util ----------
function log(msg) {
  console.log(`[sync-team-stats] ${msg}`);
}
function warn(msg) {
  console.warn(`[sync-team-stats] WARN ${msg}`);
}
function err(msg) {
  console.error(`[sync-team-stats] ERROR ${msg}`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Carga deferida del cliente API (B1) ----------
function loadSofascoreClient() {
  try {
    const client = require("./sofascore-api-client");
    const req = ["searchTeam", "getTeamStats", "mapTeamStatsToSchema"];
    for (const fn of req) {
      if (typeof client[fn] !== "function") {
        throw new Error(`sofascore-api-client.${fn} no es una función`);
      }
    }
    return client;
  } catch (e) {
    err(`No se pudo cargar sofascore-api-client: ${e.message}`);
    throw e;
  }
}

// ---------- Query: equipos próximos N días ----------
async function fetchUpcomingTeams(pool, { days, leagues }) {
  const params = [days];
  let sql = `
    SELECT sport, league, home_team, away_team, event_date
    FROM sports_events
    WHERE event_date >= NOW()
      AND event_date <= NOW() + ($1 || ' days')::interval
      AND status NOT IN ('finished', 'cancelled', 'canceled', 'postponed')
  `;
  if (leagues && leagues.length) {
    params.push(leagues);
    sql += ` AND LOWER(league) = ANY($${params.length}::text[])`;
  }
  sql += ` ORDER BY event_date ASC`;
  const res = await pool.query(sql, params);

  // Deduplicar por (team, league, sport)
  const map = new Map();
  for (const row of res.rows) {
    const sport = (row.sport || "").toLowerCase();
    const league = row.league || "";
    for (const team of [row.home_team, row.away_team]) {
      if (!team) continue;
      const key = `${sport}::${league.toLowerCase()}::${team.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, { team, league, sport });
      }
    }
  }
  return Array.from(map.values());
}

// ---------- Check frescura del cache ----------
async function isFresh(pool, { team, league, sport }) {
  const res = await pool.query(
    `SELECT last_updated FROM team_stats
     WHERE LOWER(team_name) = LOWER($1)
       AND LOWER(league) = LOWER($2)
       AND LOWER(sport) = LOWER($3)
       AND last_updated > NOW() - INTERVAL '7 days'
     LIMIT 1`,
    [team, league, sport]
  );
  return res.rowCount > 0;
}

// ---------- Derivar season por defecto ----------
function defaultSeasonFor(sport) {
  const y = new Date().getUTCFullYear();
  switch ((sport || "").toLowerCase()) {
    case "football":
    case "soccer":
      // Temporadas europeas atraviesan año natural; aproximación
      return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    case "baseball":
    case "basketball":
    case "americanfootball":
    case "icehockey":
    default:
      return String(y);
  }
}

// ---------- Main ----------
(async () => {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  log(
    `arranque days=${args.days} leagues=${args.leagues ? args.leagues.join(",") : "ALL"} dryRun=${args.dryRun} force=${args.force} delayMs=${args.delayMs}`
  );

  // Cargar cliente Sofascore (stub o real)
  let client;
  try {
    client = loadSofascoreClient();
  } catch (_) {
    process.exit(2);
  }

  // Cargar db (para upsertTeamStats) y pool (para SELECTs directos)
  const db = require("../db");
  if (typeof db.upsertTeamStats !== "function") {
    err("db.upsertTeamStats no disponible (¿postgres?)");
    process.exit(2);
  }
  // db-postgres expone pool a través de require directo
  let pool;
  try {
    pool = require("../db-postgres").pool;
  } catch (_) {
    pool = db.pool;
  }
  if (!pool || typeof pool.query !== "function") {
    err("No se pudo obtener pool de postgres");
    process.exit(2);
  }

  // 1) Equipos a procesar
  let teams = [];
  try {
    teams = await fetchUpcomingTeams(pool, {
      days: args.days,
      leagues: args.leagues,
    });
  } catch (e) {
    err(`fetchUpcomingTeams falló: ${e.message}`);
    try { await pool.end(); } catch (_) {}
    process.exit(2);
  }
  log(`equipos únicos a procesar: ${teams.length}`);

  if (teams.length === 0) {
    log("nada que hacer.");
    try { await pool.end(); } catch (_) {}
    process.exit(0);
  }

  // 2) Loop
  let okCount = 0;
  let skipFreshCount = 0;
  let skipNotFoundCount = 0;
  let failCount = 0;
  const failures = []; // {team, league, sport, reason}

  for (let i = 0; i < teams.length; i++) {
    const { team, league, sport } = teams[i];
    const tag = `equipo="${team}" league="${league}" sport=${sport}`;

    // a) cache check
    if (!args.force) {
      try {
        if (await isFresh(pool, { team, league, sport })) {
          log(`${tag} -> SKIP (fresco <7d)`);
          skipFreshCount++;
          continue;
        }
      } catch (e) {
        warn(`${tag} -> cache check falló: ${e.message} (continuando)`);
      }
    }

    // b) resolver teamId
    let searchResult;
    try {
      searchResult = await client.searchTeam(team, sport);
    } catch (e) {
      err(`${tag} -> searchTeam excepción: ${e.message}`);
      failCount++;
      failures.push({ team, league, sport, reason: `searchTeam: ${e.message}` });
      await sleep(args.delayMs);
      continue;
    }
    if (!searchResult || (!searchResult.teamId && !searchResult.id)) {
      warn(`${tag} -> no encontrado en Sofascore (skip)`);
      skipNotFoundCount++;
      await sleep(args.delayMs);
      continue;
    }
    const teamId = searchResult.teamId || searchResult.id;

    // c) stats crudas
    let raw;
    try {
      raw = await client.getTeamStats(teamId, sport);
    } catch (e) {
      err(`${tag} id=${teamId} -> getTeamStats excepción: ${e.message}`);
      failCount++;
      failures.push({ team, league, sport, reason: `getTeamStats: ${e.message}` });
      await sleep(args.delayMs);
      continue;
    }
    if (!raw) {
      warn(`${tag} id=${teamId} -> getTeamStats devolvió null (skip)`);
      failCount++;
      failures.push({ team, league, sport, reason: "getTeamStats returned null" });
      await sleep(args.delayMs);
      continue;
    }

    // d) mapeo a schema
    let mapped;
    try {
      mapped = client.mapTeamStatsToSchema(raw, sport);
    } catch (e) {
      err(`${tag} id=${teamId} -> mapTeamStatsToSchema excepción: ${e.message}`);
      failCount++;
      failures.push({ team, league, sport, reason: `map: ${e.message}` });
      await sleep(args.delayMs);
      continue;
    }
    if (!mapped || typeof mapped !== "object") {
      warn(`${tag} id=${teamId} -> mapTeamStatsToSchema devolvió ${mapped} (skip)`);
      failCount++;
      failures.push({ team, league, sport, reason: "map returned null" });
      await sleep(args.delayMs);
      continue;
    }

    // e) enriquecer payload
    const payload = {
      ...mapped,
      teamName: team,
      league,
      sport,
      season: mapped.season || defaultSeasonFor(sport),
      source: mapped.source || "sofascore",
      sourceUrl:
        mapped.sourceUrl ||
        `https://www.sofascore.com/team/${searchResult.slug || ""}/${teamId}`,
      rawJson: mapped.rawJson || raw,
    };

    // f) upsert (o dry-run)
    if (args.dryRun) {
      log(`${tag} id=${teamId} -> DRY-RUN payload keys=${Object.keys(payload).join(",")}`);
      okCount++;
    } else {
      try {
        const result = await db.upsertTeamStats(payload);
        log(`${tag} -> OK id=${teamId}${result?.id ? ` row=${result.id}` : ""}`);
        okCount++;
      } catch (e) {
        err(`${tag} id=${teamId} -> upsertTeamStats falló: ${e.message}`);
        failCount++;
        failures.push({ team, league, sport, reason: `upsert: ${e.message}` });
      }
    }

    // g) delay entre equipos para no rate-limit Sofascore
    if (i < teams.length - 1) await sleep(args.delayMs);
  }

  // 3) Reporte final
  const total = teams.length;
  const attempted = okCount + failCount; // ignora skips para tasa
  const failRate = attempted > 0 ? failCount / attempted : 0;

  console.log("\n=== RESUMEN sync-team-stats-sofascore ===");
  console.log(`  Total equipos:        ${total}`);
  console.log(`  OK (upsert/dry-run):  ${okCount}`);
  console.log(`  Skip (fresco <7d):    ${skipFreshCount}`);
  console.log(`  Skip (no encontrado): ${skipNotFoundCount}`);
  console.log(`  FAIL:                 ${failCount}`);
  if (failures.length) {
    console.log(`\n  Detalle de fallos:`);
    for (const f of failures) {
      console.log(`    - ${f.team} (${f.league}/${f.sport}): ${f.reason}`);
    }
  }
  console.log(`  Fail-rate sobre intentos: ${(failRate * 100).toFixed(1)}%`);

  try { await pool.end(); } catch (_) {}

  // Exit code: 1 si >10% de los intentados fallaron
  const exitCode = failRate > 0.1 ? 1 : 0;
  process.exit(exitCode);
})().catch((e) => {
  err(`fatal: ${e.stack || e.message}`);
  process.exit(2);
});
