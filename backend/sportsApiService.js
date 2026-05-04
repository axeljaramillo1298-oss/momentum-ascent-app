const safeStr = (value) => String(value || "").trim();

const providerRaw = safeStr(process.env.SPORTS_API_PROVIDER || "mock").toLowerCase();
const apiKey = safeStr(process.env.SPORTS_API_KEY);

const normalizeProvider = (value) => {
  const current = safeStr(value).toLowerCase();
  if (["api-football", "api_football", "apifootball", "api sports", "apisports"].includes(current)) {
    return "api-football";
  }
  if (["the-odds-api", "theoddsapi", "odds-api", "the_odds_api"].includes(current)) {
    return "the-odds-api";
  }
  return current || "mock";
};

const provider = normalizeProvider(providerRaw);

const defaultBaseUrlByProvider = {
  "api-football": "https://v3.football.api-sports.io",
  "the-odds-api": "https://api.the-odds-api.com/v4",
};

const baseUrl = safeStr(process.env.SPORTS_API_BASE_URL) || defaultBaseUrlByProvider[provider] || "";

const todayKey = () => new Date().toISOString().slice(0, 10);
const MAX_EVENTS = Number.parseInt(process.env.SPORTS_API_MAX_EVENTS || "18", 10) || 18;

const TOP_LEAGUE_PATTERNS = [
  /uefa champions league/i,
  /uefa europa league/i,
  /uefa conference league/i,
  /\bpremier league\b/i,
  /\bla liga\b/i,
  /\bserie a\b/i,
  /\bbundesliga\b/i,
  /\bligue 1\b/i,
  /\bprimeira liga\b/i,
  /\bsaudi pro league\b/i,
  /\bliga mx\b/i,
  /\beredivisie\b/i,
  /\bcopa libertadores\b/i,
  /\bcopa sudamericana\b/i,
];

const LOW_PRIORITY_LEAGUE_PATTERNS = [
  /\bwomen\b/i,
  /\bfemenil\b/i,
  /\bfeminine\b/i,
  /\bfeminina\b/i,
  /\bu-?2[013]\b/i,
  /\bunder[- ]?\d+\b/i,
  /\byouth\b/i,
  /\breserve\b/i,
  /\bii\b/i,
  /\bu23\b/i,
  /\bu21\b/i,
  /\bu20\b/i,
  /\bu19\b/i,
  /\bnext pro\b/i,
  /\bsegunda\b/i,
  /\bdivision di honor\b/i,
  /\bcopa de la liga\b/i,
];

const FEATURED_TEAM_PATTERNS = [
  /real madrid/i,
  /barcelona/i,
  /atletico madrid/i,
  /manchester city/i,
  /manchester united/i,
  /liverpool/i,
  /arsenal/i,
  /chelsea/i,
  /tottenham/i,
  /newcastle/i,
  /psg/i,
  /marseille/i,
  /milan/i,
  /inter/i,
  /juventus/i,
  /napoli/i,
  /roma/i,
  /bayern/i,
  /dortmund/i,
  /leverkusen/i,
  /sporting/i,
  /benfica/i,
  /porto/i,
  /al hilal/i,
  /al nassr/i,
  /al ittihad/i,
  /club america/i,
  /tigres/i,
  /monterrey/i,
  /chivas/i,
  /pumas/i,
];

const matchesAnyPattern = (value, patterns = []) => patterns.some((pattern) => pattern.test(safeStr(value)));

const scoreFootballFixture = (row = {}) => {
  const leagueName = safeStr(row?.league?.name);
  const home = safeStr(row?.teams?.home?.name);
  const away = safeStr(row?.teams?.away?.name);
  let score = 0;

  if (matchesAnyPattern(leagueName, TOP_LEAGUE_PATTERNS)) score += 100;
  if (matchesAnyPattern(leagueName, LOW_PRIORITY_LEAGUE_PATTERNS)) score -= 80;
  if (matchesAnyPattern(home, FEATURED_TEAM_PATTERNS)) score += 20;
  if (matchesAnyPattern(away, FEATURED_TEAM_PATTERNS)) score += 20;
  if (/regular season|round|semi-finals|quarter-finals|final/i.test(safeStr(row?.league?.round))) score += 5;

  return score;
};

const buildMockEvents = () => {
  const day = todayKey();
  return [
    {
      externalId: `mock-laliga-${day}-rm-bar`,
      sport: "football",
      league: "La Liga",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      eventDate: `${day}T19:00:00.000Z`,
      status: "scheduled",
      rawJson: {
        source: "mock",
        venue: "Santiago Bernabeu",
        marketFocus: ["match_winner", "both_teams_to_score", "total_goals"],
      },
      stats: {
        homeForm: ["W", "W", "D", "W", "W"],
        awayForm: ["W", "L", "W", "D", "W"],
        homeGoalsAvg: 2.2,
        awayGoalsAvg: 1.9,
        homeWinRate: 72,
        awayWinRate: 61,
        injuries: {
          home: ["Rotacion ligera en defensa"],
          away: ["Duda en mediocampo titular"],
        },
        h2h: {
          last5: "3 victorias Real Madrid, 1 empate, 1 victoria Barcelona",
          bothTeamsScoreRate: 80,
        },
      },
    },
    {
      externalId: `mock-ucl-${day}-city-psg`,
      sport: "football",
      league: "UEFA Champions League",
      homeTeam: "Manchester City",
      awayTeam: "PSG",
      eventDate: `${day}T20:00:00.000Z`,
      status: "scheduled",
      rawJson: {
        source: "mock",
        venue: "Etihad Stadium",
        marketFocus: ["total_goals", "asian_handicap", "shots"],
      },
      stats: {
        homeForm: ["W", "W", "W", "D", "W"],
        awayForm: ["W", "W", "L", "W", "D"],
        homeGoalsAvg: 2.4,
        awayGoalsAvg: 1.8,
        homeCleanSheetRate: 48,
        awayConcedeRate: 64,
        injuries: {
          home: [],
          away: ["Posible baja en lateral izquierdo"],
        },
        h2h: {
          last4GoalsAvg: 3.25,
          over25Rate: 75,
        },
      },
    },
    {
      externalId: `mock-nba-${day}-lakers-celtics`,
      sport: "basketball",
      league: "NBA",
      homeTeam: "Los Angeles Lakers",
      awayTeam: "Boston Celtics",
      eventDate: `${day}T03:30:00.000Z`,
      status: "scheduled",
      rawJson: {
        source: "mock",
        venue: "Crypto.com Arena",
        marketFocus: ["spread", "moneyline", "total_points"],
      },
      stats: {
        homeForm: ["W", "L", "W", "W", "W"],
        awayForm: ["W", "W", "W", "L", "W"],
        homePointsAvg: 117.8,
        awayPointsAvg: 119.1,
        homePace: 100.4,
        awayPace: 101.2,
        injuries: {
          home: ["Jugador con minutos limitados"],
          away: [],
        },
        h2h: {
          last5TotalsAvg: 229.4,
          overRate: 60,
        },
      },
    },
  ];
};

const normalizeEvent = (event = {}) => ({
  externalId: safeStr(event.externalId || event.id),
  sport: safeStr(event.sport || "football"),
  league: safeStr(event.league || "General"),
  homeTeam: safeStr(event.homeTeam || event.home_team),
  awayTeam: safeStr(event.awayTeam || event.away_team),
  eventDate: safeStr(event.eventDate || event.event_date),
  status: safeStr(event.status || "scheduled"),
  rawJson: event.rawJson && typeof event.rawJson === "object" ? event.rawJson : event,
  stats: event.stats && typeof event.stats === "object" ? event.stats : null,
});

const fetchJson = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`sports_api_${response.status}:${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
};

const fetchApiFootballToday = async () => {
  if (!apiKey || !baseUrl) return buildMockEvents();
  const day = todayKey();
  const data = await fetchJson(`${baseUrl.replace(/\/+$/, "")}/fixtures?date=${day}`, {
    "x-apisports-key": apiKey,
  });
  const rows = Array.isArray(data?.response) ? data.response : [];
  const rankedRows = [...rows]
    .map((row) => ({ row, score: scoreFootballFixture(row) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return safeStr(a.row?.fixture?.date).localeCompare(safeStr(b.row?.fixture?.date));
    })
    .map((item) => item.row);

  const prioritizedRows = rankedRows.filter((row) => scoreFootballFixture(row) > 0);
  const selectedRows = (prioritizedRows.length ? prioritizedRows : rankedRows).slice(0, MAX_EVENTS);

  return selectedRows.map((row) =>
    normalizeEvent({
      externalId: row?.fixture?.id,
      sport: "football",
      league: row?.league?.name,
      homeTeam: row?.teams?.home?.name,
      awayTeam: row?.teams?.away?.name,
      eventDate: row?.fixture?.date,
      status: row?.fixture?.status?.short || "scheduled",
      rawJson: row,
      stats: {
        venue: row?.fixture?.venue?.name || "",
        leagueRound: row?.league?.round || "",
      },
    })
  );
};

const fetchTheOddsToday = async () => {
  if (!apiKey || !baseUrl) return buildMockEvents();
  const day = todayKey();
  const data = await fetchJson(
    `${baseUrl.replace(/\/+$/, "")}/sports/upcoming/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=h2h,spreads,totals&dateFormat=iso`
  );
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((row) => String(row?.commence_time || "").startsWith(day))
    .slice(0, 12)
    .map((row) =>
      normalizeEvent({
        externalId: row?.id,
        sport: row?.sport_key?.includes("basketball") ? "basketball" : "football",
        league: row?.sport_title,
        homeTeam: row?.home_team,
        awayTeam: Array.isArray(row?.away_team) ? row.away_team[0] : row?.away_team || row?.teams?.find((t) => t !== row?.home_team),
        eventDate: row?.commence_time,
        status: "scheduled",
        rawJson: row,
        stats: {
          bookmakers: Array.isArray(row?.bookmakers) ? row.bookmakers.length : 0,
        },
      })
    );
};

async function getTodayEvents() {
  if (provider === "api-football") {
    return fetchApiFootballToday();
  }
  if (provider === "the-odds-api" || provider === "theoddsapi") {
    return fetchTheOddsToday();
  }
  return buildMockEvents();
}

async function getEventStats(event = {}) {
  const normalized = normalizeEvent(event);
  if (normalized.stats) {
    return {
      sourceApi: provider || "mock",
      statsJson: normalized.stats,
    };
  }
  const mock = buildMockEvents().find((item) => item.externalId === normalized.externalId);
  return {
    sourceApi: provider || "mock",
    statsJson: mock?.stats || {
      note: "Sin datos suficientes del proveedor; se usa contexto limitado.",
    },
  };
}

module.exports = {
  getTodayEvents,
  getEventStats,
};
