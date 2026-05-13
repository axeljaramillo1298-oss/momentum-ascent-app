// backend/news-scraper.js
// NewsAPI.org integration with simple relevance scoring for sports events.
// Activable via NEWS_API_KEY. Degrades silently if missing.

const NEWS_API_KEY = String(process.env.NEWS_API_KEY || "").trim();
const NEWS_API_BASE = String(process.env.NEWS_API_BASE || "https://newsapi.org/v2").replace(/\/$/, "");

function safeStr(v) { return String(v == null ? "" : v).trim(); }

function normalizeForMatch(text) {
  return safeStr(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuery(parts) {
  return parts
    .filter(Boolean)
    .map((p) => `"${safeStr(p).replace(/"/g, "")}"`)
    .join(" OR ");
}

async function fetchSportsNews({ query, hoursOld = 12, pageSize = 10 } = {}) {
  if (!NEWS_API_KEY) {
    console.warn("[news-scraper] skipped — missing NEWS_API_KEY");
    return { ok: false, skipped: true, reason: "config_missing", articles: [] };
  }
  const q = safeStr(query);
  if (!q) {
    return { ok: false, error: "query_required", articles: [] };
  }
  const params = new URLSearchParams({
    q,
    sortBy: "publishedAt",
    pageSize: String(Math.max(1, Math.min(50, Number(pageSize) || 10))),
    language: "en",
  });
  const url = `${NEWS_API_BASE}/everything?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": NEWS_API_KEY },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === "error") {
      const err = json.message || `HTTP ${res.status}`;
      console.error("[news-scraper] error:", err);
      return { ok: false, error: err, articles: [] };
    }
    const rawArticles = Array.isArray(json.articles) ? json.articles : [];
    const cutoffMs = Date.now() - Math.max(0, Number(hoursOld) || 0) * 3600 * 1000;
    const articles = rawArticles
      .map((a) => ({
        title: safeStr(a?.title),
        description: safeStr(a?.description),
        source: safeStr(a?.source?.name),
        publishedAt: safeStr(a?.publishedAt),
        url: safeStr(a?.url),
      }))
      .filter((a) => a.title && a.url)
      .filter((a) => {
        if (!a.publishedAt) return true;
        const t = Date.parse(a.publishedAt);
        if (Number.isNaN(t)) return true;
        return t >= cutoffMs;
      });
    return { ok: true, articles };
  } catch (err) {
    console.error("[news-scraper] network error:", err.message || err);
    return { ok: false, error: String(err.message || err), articles: [] };
  }
}

function scoreNewsRelevance(article, event) {
  if (!article || !event) return 0;
  const homeTeam = normalizeForMatch(event.homeTeam || event.home_team);
  const awayTeam = normalizeForMatch(event.awayTeam || event.away_team);
  const league = normalizeForMatch(event.league);
  const haystack = normalizeForMatch(`${article.title || ""} ${article.description || ""}`);
  if (!haystack) return 0;

  let mentions = 0;
  const checks = [homeTeam, awayTeam].filter(Boolean);
  for (const term of checks) {
    if (term && haystack.includes(term)) mentions += 1;
  }
  if (league && haystack.includes(league)) mentions += 0.5;

  // Both teams mentioned => high signal
  const bothTeams = checks.length === 2 && checks.every((t) => haystack.includes(t));
  let score = 0;
  if (bothTeams) score = 1.0;
  else if (mentions >= 1) score = Math.min(0.9, 0.4 + 0.3 * mentions);
  else score = 0;

  // Penalty if article is older than 48h
  if (article.publishedAt) {
    const ageHours = (Date.now() - Date.parse(article.publishedAt)) / 3600000;
    if (Number.isFinite(ageHours) && ageHours > 48) score *= 0.7;
  }

  return Math.max(0, Math.min(1, score));
}

async function getRelevantNewsForEvent(event, { topK = 3, hoursOld = 24 } = {}) {
  if (!event) return [];
  const homeTeam = safeStr(event.homeTeam || event.home_team);
  const awayTeam = safeStr(event.awayTeam || event.away_team);
  const query = buildQuery([homeTeam, awayTeam]);
  if (!query) return [];

  const result = await fetchSportsNews({ query, hoursOld, pageSize: 20 });
  if (!result.ok) return [];

  const scored = result.articles
    .map((article) => ({ article, score: scoreNewsRelevance(article, event) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(10, Number(topK) || 3)));

  return scored;
}

module.exports = {
  fetchSportsNews,
  scoreNewsRelevance,
  getRelevantNewsForEvent,
};
