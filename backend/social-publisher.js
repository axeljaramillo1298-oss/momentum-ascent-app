/**
 * Social Publisher — arma texto editorial de un pick y dispara webhook a Make.com.
 *
 * Make.com escenario recomendado:
 *   Webhook (trigger) → Filter por channel → Facebook Pages / Instagram / X
 *
 * Payload enviado al webhook:
 *   {
 *     channel: 'facebook' | 'instagram' | 'x' | 'all',
 *     text: string,                 // post listo, editado por admin si lo cambió
 *     imageUrl: string | null,      // URL de la imagen (imgbb/CDN)
 *     scheduledAt: ISO | null,      // opcional, para programar publicación futura
 *     meta: { pickId, kind, league, market, confidence, isPremium }
 *   }
 *
 * Env vars:
 *   MAKE_WEBHOOK_URL  — URL del webhook generada por Make
 *   MAKE_WEBHOOK_AUTH — opcional, header "Authorization" o token. Si está,
 *                       se manda como header `x-make-auth` para validar en Make.
 */

const MAKE_WEBHOOK_URL = String(process.env.MAKE_WEBHOOK_URL || "").trim();
const MAKE_WEBHOOK_AUTH = String(process.env.MAKE_WEBHOOK_AUTH || "").trim();
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || "https://app.momentumascent.com").trim().replace(/\/+$/, "");

// ── Helpers ──────────────────────────────────────────────────────
function clean(s) { return String(s == null ? "" : s).trim(); }

function sportEmoji(sport) {
  const k = clean(sport).toLowerCase();
  if (k.includes("baseball") || k === "mlb") return "⚾";
  if (k.includes("basket") || k === "nba") return "🏀";
  if (k === "football_american" || k === "nfl") return "🏈";
  if (k.includes("hockey") || k === "nhl") return "🏒";
  if (k.includes("tennis") || k === "tenis") return "🎾";
  if (k === "ufc" || k.includes("mma")) return "🥊";
  return "⚽"; // default fútbol
}

function riskLabel(risk) {
  const r = clean(risk).toLowerCase();
  if (r === "bajo" || r === "low") return "BAJO";
  if (r === "alto" || r === "high") return "ALTO";
  return "MEDIO";
}

// ── Builders de texto por tipo de post ────────────────────────────
//
// Cada builder retorna { text, suggestedImagePrompt? }.
// El admin puede editar el text antes de mandarlo.

function buildPickFreeText(pick) {
  const home = clean(pick.homeTeam || pick.home_team);
  const away = clean(pick.awayTeam || pick.away_team);
  const league = clean(pick.league);
  const market = clean(pick.market);
  const pickStr = clean(pick.pick);
  const conf = Number(pick.confidence || 0);
  const risk = riskLabel(pick.riskLevel || pick.risk_level);
  const emoji = sportEmoji(pick.sport);
  const topBadge = pick.topRank ? `★ TOP ${pick.topRank} · ` : "";
  const analysis = clean(pick.analysisPreview || pick.analysis).slice(0, 280);

  return {
    text: `${emoji} PICK GRATIS — ${league.toUpperCase()}${topBadge ? ` · ${topBadge}` : ""}

${home} vs ${away}

📌 ${market}: ${pickStr}
🎯 Confianza: ${conf}% · Riesgo: ${risk}

${analysis}

Pick gratis, sin registro, sin truco.
Análisis dual: GPT-4o + Claude Sonnet.

📲 ${PUBLIC_APP_URL}

⚠️ Contenido informativo. Apuesta con responsabilidad.

#PickGratis #${clean(pick.sport || "Deportes")} #MomentumAscent`,
  };
}

function buildPickPremiumTeaserText(pick) {
  const home = clean(pick.homeTeam || pick.home_team);
  const away = clean(pick.awayTeam || pick.away_team);
  const league = clean(pick.league);
  const conf = Number(pick.confidence || 0);
  const emoji = sportEmoji(pick.sport);

  return {
    text: `⭐ PICK PREMIUM PUBLICADO — ${league.toUpperCase()}

🔒 ${home} vs ${away}
🎯 Confianza: ${conf}% · Análisis IA Dual

Los suscriptores ya tienen el pick + análisis completo.
Tú puedes desbloquearlo desde $129 MXN/mes.

📲 ${PUBLIC_APP_URL}/planes

⚠️ Contenido informativo.

#MomentumAscent #Premium #${emoji.replace(/[^\w]/g, "")}`,
  };
}

function buildScorecardText({ date, won, lost, winRate, retoWon, retoData }) {
  const dateStr = date ? new Date(date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" }) : "";
  const retoLine = retoWon && retoData
    ? `\n🏔️ RETO AL CIELO ${retoData.invStr || ""}→ ${retoData.gainStr || ""} ✅`
    : retoWon
    ? `\n🏔️ RETO AL CIELO también cerró en VERDE ✅`
    : "";

  return {
    text: `📊 RESULTADOS · ${dateStr.toUpperCase()}

${won} ganados · ${lost} perdidos · ${winRate}% de acierto ✅${retoLine}

Cada pick publicado queda registrado.
Cada resultado verificable. Sin ediciones retroactivas.

Histórico público:
📲 ${PUBLIC_APP_URL}/trackrecord.html

⚠️ Contenido informativo. La confianza es una estimación estadística, no una garantía.

#MomentumAscent #Resultados #PicksConIA`,
  };
}

// ── Send to Make.com webhook ──────────────────────────────────────

async function sendToMakeWebhook(payload, { signal } = {}) {
  if (!MAKE_WEBHOOK_URL) {
    return { ok: false, skipped: true, reason: "MAKE_WEBHOOK_URL not configured" };
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (MAKE_WEBHOOK_AUTH) headers["x-make-auth"] = MAKE_WEBHOOK_AUTH;
    const r = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (!r.ok) return { ok: false, status: r.status, error: typeof body === "string" ? body.slice(0, 200) : (body?.error || `HTTP ${r.status}`) };
    return { ok: true, status: r.status, body };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// Composer principal — recibe un pick y arma payload listo para Make
function buildPickPayload(pick, { channels = ["facebook"], kind = "auto", scheduledAt = null, imageUrl = null, customText = null } = {}) {
  const isPremium = (pick.planTier || "free").toLowerCase() === "premium";
  let resolvedKind = kind;
  if (kind === "auto") resolvedKind = isPremium ? "premium_teaser" : "free_pick";

  let text;
  if (customText && customText.trim()) {
    text = customText.trim();
  } else if (resolvedKind === "free_pick") {
    text = buildPickFreeText(pick).text;
  } else if (resolvedKind === "premium_teaser") {
    text = buildPickPremiumTeaserText(pick).text;
  } else {
    text = buildPickFreeText(pick).text;
  }

  return {
    channel: channels.length === 1 ? channels[0] : "all",
    channels,
    text,
    imageUrl: imageUrl || null,
    scheduledAt: scheduledAt || null,
    meta: {
      pickId: pick.id,
      kind: resolvedKind,
      league: clean(pick.league),
      market: clean(pick.market),
      confidence: Number(pick.confidence || 0),
      isPremium,
      topRank: pick.topRank || null,
      homeTeam: clean(pick.homeTeam || pick.home_team),
      awayTeam: clean(pick.awayTeam || pick.away_team),
    },
  };
}

function getConfigStatus() {
  return {
    configured: !!MAKE_WEBHOOK_URL,
    hasAuth: !!MAKE_WEBHOOK_AUTH,
    webhookHost: MAKE_WEBHOOK_URL ? (new URL(MAKE_WEBHOOK_URL).host || "") : null,
    publicAppUrl: PUBLIC_APP_URL,
  };
}

module.exports = {
  buildPickFreeText,
  buildPickPremiumTeaserText,
  buildScorecardText,
  buildPickPayload,
  sendToMakeWebhook,
  getConfigStatus,
};
