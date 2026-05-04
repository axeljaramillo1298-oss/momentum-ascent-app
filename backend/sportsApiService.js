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
  return rows.slice(0, 12).map((row) =>
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
