/**
 * sofascore-api-client.js
 *
 * Cliente Node.js base para la API JSON privada de Sofascore (api.sofascore.com).
 *
 * Endpoints relevantes (descubiertos / documentados):
 *   GET /api/v1/search/all?q=<name>&page=0
 *       Buscador global (teams, players, tournaments).
 *
 *   GET /api/v1/team/{teamId}
 *       Info básica del equipo (nombre, slug, sport, manager, venue, primaryUniqueTournament).
 *
 *   GET /api/v1/team/{teamId}/statistics/seasons
 *       Lista de temporadas con stats disponibles por torneo, en formato:
 *       { uniqueTournamentSeasons: [{ uniqueTournament: {id,name}, seasons: [{id,name,year}] }] }
 *
 *   GET /api/v1/team/{teamId}/unique-tournament/{uniqueTournamentId}/season/{seasonId}/statistics/overall
 *       Stats agregadas para esa temporada (shape varía por sport).
 *
 *   GET /api/v1/team/{teamId}/events/last/0
 *       Últimos partidos (paginados de 30 en 30). Devuelve { events: [...] }.
 *       Usado para construir form_last_5.
 *
 *   GET /api/v1/tournament/{tournamentId}/season/{seasonId}/team-stats/{type}
 *       Rankings por categoría (ej. type=overall, type=goals, type=points).
 *
 * Bloqueo conocido:
 *   Sofascore filtra requests por TLS fingerprint (JA3) e IP. Desde IPs de
 *   datacenter / clientes no-navegador la API devuelve 403 incluso con headers
 *   perfectos. Soluciones:
 *     a) Correr desde una IP residencial (la VPS/laptop de Axel).
 *     b) Setear SOFASCORE_PROXY_URL apuntando a un proxy residencial o a
 *        scraping-as-a-service (ScraperAPI, ScrapingBee, etc.) que envuelva el
 *        request con un fingerprint válido.
 *     c) Usar curl-impersonate-chrome detrás de un wrapper (no incluido aquí).
 *
 * Variables de entorno:
 *   SOFASCORE_BASE_URL  (default https://api.sofascore.com)
 *   SOFASCORE_PROXY_URL (opcional, prefijo a anteponer: el cliente hará
 *                        `${PROXY_URL}${encodeURIComponent(target)}`)
 *   SOFASCORE_AUTH      (opcional, se manda como header `Authorization`)
 */

"use strict";

const BASE_URL = process.env.SOFASCORE_BASE_URL || "https://api.sofascore.com";
const PROXY_URL = process.env.SOFASCORE_PROXY_URL || ""; // ej. https://api.scraperapi.com/?api_key=XXX&url=
const AUTH = process.env.SOFASCORE_AUTH || "";

// Headers que mimean a Chrome 130 en Windows visitando sofascore.com.
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.sofascore.com/",
  Origin: "https://www.sofascore.com",
  "Sec-Ch-Ua":
    '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

// IDs de torneos conocidos (uniqueTournament IDs en Sofascore).
const KNOWN_TOURNAMENTS = {
  MLB: 11205,
  LMB: 11200,
  NBA: 132,
  NFL: 9464,
  // Football leagues comunes (referencia):
  PREMIER_LEAGUE: 17,
  LA_LIGA: 8,
  LIGA_MX: 11621,
  CHAMPIONS_LEAGUE: 7,
};

// -------------------------- fetch helper --------------------------

async function sofaFetch(path, { timeoutMs = 15000, extraHeaders = {} } = {}) {
  const target = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const url = PROXY_URL ? `${PROXY_URL}${encodeURIComponent(target)}` : target;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
  if (AUTH) headers["Authorization"] = AUTH;

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(
        `sofascore_http_${res.status}: ${text.slice(0, 200)}`
      );
      err.status = res.status;
      err.body = text;
      err.url = target;
      throw err;
    }
    if (!ct.includes("json")) {
      const err = new Error(
        `sofascore_non_json_response (ct=${ct}): ${text.slice(0, 200)}`
      );
      err.body = text;
      err.url = target;
      throw err;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// -------------------------- API surface --------------------------

/**
 * Busca un equipo por nombre. Devuelve el primer match con teamId/slug/sport.
 * Si no hay resultados, devuelve null.
 */
async function searchTeam(name) {
  if (!name) throw new Error("name_required");
  const q = encodeURIComponent(String(name).trim());
  const json = await sofaFetch(`/api/v1/search/all?q=${q}&page=0`);
  const results = Array.isArray(json?.results) ? json.results : [];
  const teamHit = results.find(
    (r) => r?.type === "team" && r?.entity && r.entity.id
  );
  if (!teamHit) return null;
  const e = teamHit.entity;
  return {
    teamId: e.id,
    name: e.name,
    slug: e.slug,
    sport: e.sport?.slug || e.category?.sport?.slug || null,
    country: e.country?.name || null,
    primaryTournamentId: e.tournament?.uniqueTournament?.id || null,
  };
}

/**
 * Info básica del equipo.
 */
async function getTeamInfo(teamId) {
  if (!teamId) throw new Error("teamId_required");
  return sofaFetch(`/api/v1/team/${teamId}`);
}

/**
 * Lista de torneos/temporadas con stats disponibles para un equipo.
 * Devuelve [{ uniqueTournament:{id,name}, seasons:[{id,name,year}] }]
 */
async function getTeamSeasons(teamId) {
  if (!teamId) throw new Error("teamId_required");
  const json = await sofaFetch(`/api/v1/team/${teamId}/statistics/seasons`);
  return Array.isArray(json?.uniqueTournamentSeasons)
    ? json.uniqueTournamentSeasons
    : [];
}

/**
 * Stats overall de una temporada concreta.
 * Si no se pasan utId/seasonId, intenta resolverlos con la temporada más reciente.
 */
async function getTeamSeasonOverall(teamId, { uniqueTournamentId, seasonId } = {}) {
  if (!teamId) throw new Error("teamId_required");
  let utId = uniqueTournamentId;
  let sId = seasonId;
  if (!utId || !sId) {
    const seasons = await getTeamSeasons(teamId);
    const first = seasons[0];
    if (!first || !first.seasons?.length) {
      throw new Error("no_seasons_available");
    }
    utId = utId || first.uniqueTournament?.id;
    sId = sId || first.seasons[0].id;
  }
  return sofaFetch(
    `/api/v1/team/${teamId}/unique-tournament/${utId}/season/${sId}/statistics/overall`
  );
}

/**
 * Últimos partidos del equipo (página 0 = más recientes, 30 por página).
 */
async function getTeamLastEvents(teamId, page = 0) {
  if (!teamId) throw new Error("teamId_required");
  return sofaFetch(`/api/v1/team/${teamId}/events/last/${page}`);
}

/**
 * Atajo: trae info + seasons + overall + últimos eventos en paralelo.
 * sportType es informativo (no cambia el endpoint, solo se guarda en el output).
 */
async function getTeamStats(teamId, sportType = null, { uniqueTournamentId, seasonId } = {}) {
  if (!teamId) throw new Error("teamId_required");
  const [info, seasonsList] = await Promise.all([
    getTeamInfo(teamId).catch((e) => ({ __error: e.message })),
    getTeamSeasons(teamId).catch(() => []),
  ]);
  let utId = uniqueTournamentId;
  let sId = seasonId;
  let seasonMeta = null;
  if (!utId || !sId) {
    const first = seasonsList[0];
    if (first && first.seasons?.length) {
      utId = utId || first.uniqueTournament?.id;
      sId = sId || first.seasons[0].id;
      seasonMeta = {
        uniqueTournament: first.uniqueTournament,
        season: first.seasons[0],
      };
    }
  }
  const [overall, lastEvents] = await Promise.all([
    utId && sId
      ? getTeamSeasonOverall(teamId, { uniqueTournamentId: utId, seasonId: sId }).catch(
          (e) => ({ __error: e.message })
        )
      : Promise.resolve(null),
    getTeamLastEvents(teamId, 0).catch((e) => ({ __error: e.message })),
  ]);
  return {
    sport: sportType,
    teamId,
    teamInfo: info,
    seasons: seasonsList,
    season: seasonMeta,
    overall,
    lastEvents,
  };
}

// -------------------------- mapping helpers --------------------------

function safeNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * form_last_5 string tipo "WWLDW" a partir de la lista de eventos.
 * El más reciente queda a la izquierda.
 */
function buildFormLast5(lastEventsJson, teamId) {
  if (!lastEventsJson || !Array.isArray(lastEventsJson.events)) return null;
  const finished = lastEventsJson.events
    .filter((ev) => ev?.status?.type === "finished")
    .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
    .slice(0, 5);
  if (!finished.length) return null;
  const letters = finished.map((ev) => {
    const isHome = ev.homeTeam?.id === teamId;
    const home = safeNum(ev.homeScore?.current);
    const away = safeNum(ev.awayScore?.current);
    if (home === null || away === null) return "?";
    if (home === away) return "D";
    const homeWon = home > away;
    return (isHome && homeWon) || (!isHome && !homeWon) ? "W" : "L";
  });
  return letters.join("");
}

/**
 * Mapea el JSON crudo de Sofascore al shape esperado por upsertTeamStats.
 * `sport` debe ser uno de: "football" | "basketball" | "baseball" | "ice-hockey".
 */
function mapTeamStatsToSchema(raw, sport) {
  if (!raw || !raw.teamInfo) return null;
  const team = raw.teamInfo?.team || raw.teamInfo || {};
  const overall = raw.overall?.statistics || raw.overall || {};
  const matchesPlayed =
    safeNum(overall.matches) ||
    safeNum(overall.matchesPlayed) ||
    safeNum(overall.appearances) ||
    null;

  const base = {
    teamName: team.name || null,
    teamSlug: team.slug || null,
    league:
      raw.season?.uniqueTournament?.name ||
      team.tournament?.name ||
      team.primaryUniqueTournament?.name ||
      null,
    sport: sport || team.sport?.slug || null,
    season: raw.season?.season?.name || raw.season?.season?.year || null,
    sampleSize: matchesPlayed,
    formLast5: buildFormLast5(raw.lastEvents, raw.teamId),
    source: "sofascore_api",
    sourceUrl: `https://www.sofascore.com/team/${
      sport || "football"
    }/${team.slug || ""}/${raw.teamId}`,
    rawJson: { overall, seasonMeta: raw.season },
  };

  const sp = (sport || "").toLowerCase();

  if (sp === "football" || sp === "soccer") {
    const goalsScored = safeNum(overall.goalsScored) ?? safeNum(overall.goals);
    const goalsConceded = safeNum(overall.goalsConceded);
    const corners = safeNum(overall.corners) ?? safeNum(overall.cornersTotal);
    const cornersAgainst = safeNum(overall.cornersAgainst);
    const cleanSheets = safeNum(overall.cleanSheets);
    const btts =
      safeNum(overall.bothTeamsScored) ?? safeNum(overall.bothTeamScoredCount);
    const over25 =
      safeNum(overall.scoringOver25) ?? safeNum(overall.over25Matches);
    return {
      ...base,
      goalsForAvg: matchesPlayed && goalsScored != null ? goalsScored / matchesPlayed : null,
      goalsAgainstAvg:
        matchesPlayed && goalsConceded != null ? goalsConceded / matchesPlayed : null,
      cornersForAvg: matchesPlayed && corners != null ? corners / matchesPlayed : null,
      cornersAgainstAvg:
        matchesPlayed && cornersAgainst != null
          ? cornersAgainst / matchesPlayed
          : null,
      bttsPct: matchesPlayed && btts != null ? (btts / matchesPlayed) * 100 : null,
      over25Pct:
        matchesPlayed && over25 != null ? (over25 / matchesPlayed) * 100 : null,
      cleanSheetsPct:
        matchesPlayed && cleanSheets != null
          ? (cleanSheets / matchesPlayed) * 100
          : null,
    };
  }

  if (sp === "basketball") {
    const ptsScored = safeNum(overall.pointsScored) ?? safeNum(overall.points);
    const ptsAgainst = safeNum(overall.pointsAgainst);
    return {
      ...base,
      pointsForAvg: matchesPlayed && ptsScored != null ? ptsScored / matchesPlayed : null,
      pointsAgainstAvg:
        matchesPlayed && ptsAgainst != null ? ptsAgainst / matchesPlayed : null,
      pace: safeNum(overall.pace) ?? null,
      offRating: safeNum(overall.offensiveRating) ?? null,
      defRating: safeNum(overall.defensiveRating) ?? null,
    };
  }

  if (sp === "baseball") {
    const runsScored = safeNum(overall.runsScored) ?? safeNum(overall.runs);
    const runsAgainst = safeNum(overall.runsAgainst);
    return {
      ...base,
      eraTeam:
        safeNum(overall.era) ??
        safeNum(overall.teamEra) ??
        safeNum(overall.pitchingEra),
      eraBullpen: safeNum(overall.bullpenEra) ?? null,
      opsTeam: safeNum(overall.ops) ?? safeNum(overall.battingOps),
      opsVsLhp: safeNum(overall.opsVsLeft) ?? null,
      opsVsRhp: safeNum(overall.opsVsRight) ?? null,
      runsForAvg:
        matchesPlayed && runsScored != null ? runsScored / matchesPlayed : null,
      runsAgainstAvg:
        matchesPlayed && runsAgainst != null ? runsAgainst / matchesPlayed : null,
    };
  }

  if (sp === "ice-hockey" || sp === "hockey") {
    return {
      ...base,
      goalsForPerGame: safeNum(overall.goalsForPerGame) ?? null,
      goalsAgainstPerGame: safeNum(overall.goalsAgainstPerGame) ?? null,
      powerPlayPct: safeNum(overall.powerPlayPercentage) ?? null,
      penaltyKillPct: safeNum(overall.penaltyKillPercentage) ?? null,
    };
  }

  return base;
}

// -------------------------- test runner --------------------------

async function testClient() {
  // Equipos de prueba: 1 MLB, 1 NBA, 1 selección de football.
  // IDs verificados en sofascore.com.
  const samples = [
    { name: "New York Yankees", sport: "baseball", knownId: 3503 },
    { name: "Los Angeles Lakers", sport: "basketball", knownId: 3433 },
    { name: "Mexico", sport: "football", knownId: 4699 },
  ];
  const out = [];
  for (const s of samples) {
    const entry = { sample: s };
    try {
      console.log(`\n--- ${s.name} (${s.sport}) ---`);
      let teamId = s.knownId;
      try {
        const search = await searchTeam(s.name);
        if (search?.teamId) teamId = search.teamId;
        entry.search = search;
        console.log("search ->", search);
      } catch (e) {
        console.log("search ERROR:", e.message);
        entry.searchError = e.message;
      }
      const raw = await getTeamStats(teamId, s.sport);
      const mapped = mapTeamStatsToSchema(raw, s.sport);
      entry.rawSummary = {
        hasTeamInfo: !!raw.teamInfo && !raw.teamInfo.__error,
        seasonsCount: raw.seasons?.length || 0,
        hasOverall: !!raw.overall && !raw.overall.__error,
        lastEventsCount: raw.lastEvents?.events?.length || 0,
      };
      entry.mapped = mapped;
      console.log("rawSummary ->", entry.rawSummary);
      console.log("mapped ->", JSON.stringify(mapped, null, 2));
    } catch (e) {
      console.log(`ERROR ${s.name}:`, e.message);
      entry.error = e.message;
    }
    out.push(entry);
  }
  return out;
}

module.exports = {
  // constants
  BASE_URL,
  KNOWN_TOURNAMENTS,
  DEFAULT_HEADERS,
  // raw http
  sofaFetch,
  // API
  searchTeam,
  getTeamInfo,
  getTeamSeasons,
  getTeamSeasonOverall,
  getTeamLastEvents,
  getTeamStats,
  // mapping
  buildFormLast5,
  mapTeamStatsToSchema,
  // dev
  testClient,
};

// CLI entrypoint: `node backend/scripts/sofascore-api-client.js`
if (require.main === module) {
  testClient()
    .then((res) => {
      const okCount = res.filter((r) => r.mapped && r.rawSummary?.hasOverall).length;
      console.log(`\n=== DONE. ${okCount}/${res.length} samples returned overall stats. ===`);
      process.exit(okCount > 0 ? 0 : 1);
    })
    .catch((e) => {
      console.error("FATAL:", e);
      process.exit(2);
    });
}
