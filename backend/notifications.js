// backend/notifications.js
// Unified notification dispatcher: Telegram (admin alerts) + Email (Resend).
// All providers degrade silently if config is missing — no crashes.

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_ADMIN_CHAT_ID = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || "Momentum Ascent <noreply@momentumascent.com>").trim();
const EMAIL_NIGHTLY_RECIPIENTS = String(process.env.EMAIL_NIGHTLY_RECIPIENTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let emailTemplates = null;
try { emailTemplates = require("./email-templates"); } catch (_) { emailTemplates = null; }

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toJsonSafe(value) {
  if (value == null) return null;
  try { return typeof value === "string" ? value : JSON.stringify(value); }
  catch (_) { return null; }
}

async function logToDb(db, entry) {
  if (!db || typeof db.logNotification !== "function") return;
  try {
    await db.logNotification(entry);
  } catch (err) {
    console.error("[notifications] logToDb failed:", err.message || err);
  }
}

// ─────────────────────────────────────────────────────────────
// TELEGRAM
// ─────────────────────────────────────────────────────────────
async function sendTelegram(text, opts = {}) {
  const chatId = String(opts.chatId || TELEGRAM_ADMIN_CHAT_ID || "").trim();
  const parseMode = String(opts.parseMode || "HTML");
  const silent = Boolean(opts.silent);

  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn("[notifications:telegram] skipped — missing TELEGRAM_BOT_TOKEN or chatId");
    return { ok: false, skipped: true, reason: "config_missing" };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: String(text || ""),
    parse_mode: parseMode,
    disable_notification: silent,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const err = json.description || `HTTP ${res.status}`;
      console.error("[notifications:telegram] error:", err);
      return { ok: false, error: err };
    }
    return { ok: true, messageId: json?.result?.message_id || null };
  } catch (err) {
    console.error("[notifications:telegram] network error:", err.message || err);
    return { ok: false, error: String(err.message || err) };
  }
}

// ─────────────────────────────────────────────────────────────
// EMAIL (Resend)
// ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text, from } = {}) {
  if (!RESEND_API_KEY) {
    console.warn("[notifications:email] skipped — missing RESEND_API_KEY");
    return { ok: false, skipped: true, reason: "config_missing" };
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);
  if (!recipients.length) {
    return { ok: false, error: "no_recipients" };
  }

  const payload = {
    from: String(from || EMAIL_FROM),
    to: recipients,
    subject: String(subject || "(sin asunto)"),
  };
  if (html) payload.html = String(html);
  if (text) payload.text = String(text);
  if (!html && !text) payload.text = "";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.message || json?.name || `HTTP ${res.status}`;
      console.error("[notifications:email] error:", err);
      return { ok: false, error: err };
    }
    return { ok: true, id: json?.id || null };
  } catch (err) {
    console.error("[notifications:email] network error:", err.message || err);
    return { ok: false, error: String(err.message || err) };
  }
}

// ─────────────────────────────────────────────────────────────
// DISPATCHER — registra resultado en notifications_log si db disponible
// ─────────────────────────────────────────────────────────────
async function dispatch({ channel, recipient, type, subject, payload, db, message, html, text } = {}) {
  const ch = String(channel || "").toLowerCase();
  let result = { ok: false, skipped: true, reason: "unsupported_channel" };

  if (ch === "telegram") {
    result = await sendTelegram(message || subject || "", { chatId: recipient || undefined });
  } else if (ch === "email") {
    result = await sendEmail({ to: recipient, subject, html, text });
  } else {
    console.warn("[notifications:dispatch] unsupported channel:", channel);
  }

  const status = result.ok ? "sent" : result.skipped ? "skipped" : "failed";
  await logToDb(db, {
    channel: ch,
    recipient: Array.isArray(recipient) ? recipient.join(",") : (recipient || ""),
    type: type || "other",
    subject: subject || null,
    payload: toJsonSafe(payload),
    status,
    error: result.error || (result.skipped ? result.reason : null) || null,
  });

  return result;
}

// ─────────────────────────────────────────────────────────────
// HIGH-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────
async function notifyPickPublished(pick, { db } = {}) {
  if (!pick) return { ok: false, error: "no_pick" };
  const match = `${pick.homeTeam || pick.home_team || "?"} vs ${pick.awayTeam || pick.away_team || "?"}`;
  const league = pick.league ? ` · ${pick.league}` : "";
  const market = pick.market || "—";
  const pickStr = pick.pick || "—";
  const confidence = pick.confidence != null ? ` (${pick.confidence}%)` : "";
  const text =
    `🎯 <b>Nuevo pick publicado</b>${league}\n` +
    `${escapeHtml(match)}\n` +
    `${escapeHtml(market)} → <b>${escapeHtml(pickStr)}</b>${confidence}`;

  const result = await sendTelegram(text, { silent: false });
  await logToDb(db, {
    channel: "telegram",
    recipient: TELEGRAM_ADMIN_CHAT_ID,
    type: "pick_published",
    subject: `Pick: ${match}`,
    payload: toJsonSafe({ pickId: pick.id, market, pick: pickStr, confidence: pick.confidence }),
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    error: result.error || (result.skipped ? result.reason : null) || null,
  });
  return result;
}

async function notifyDailyResults(stats, { db } = {}) {
  const s = stats || {};
  const date = s.date || new Date().toISOString().slice(0, 10);
  const winRate = s.winRate == null ? "N/A" : `${s.winRate}%`;
  const lines = [
    `📊 <b>Resumen del día — ${escapeHtml(date)}</b>`,
    `Picks: <b>${s.totalPicks || 0}</b> · Resueltos: <b>${(s.won || 0) + (s.lost || 0)}</b>`,
    `✅ Ganados: <b>${s.won || 0}</b> · ❌ Perdidos: <b>${s.lost || 0}</b> · ⏳ Pendientes: <b>${s.pending || 0}</b>`,
    `🎯 Win rate: <b>${winRate}</b>`,
  ];
  if (Array.isArray(s.topPicks) && s.topPicks.length) {
    lines.push("");
    lines.push("<b>Top picks del día:</b>");
    s.topPicks.slice(0, 3).forEach((p, i) => {
      const match = `${p.homeTeam || "?"} vs ${p.awayTeam || "?"}`;
      const resTag = p.result === "won" ? "✅" : p.result === "lost" ? "❌" : "⏳";
      lines.push(`${i + 1}. ${resTag} ${escapeHtml(match)} — ${escapeHtml(p.market || "")} → <b>${escapeHtml(p.pick || "")}</b>`);
    });
  }
  const tgText = lines.join("\n");
  const tgResult = await sendTelegram(tgText);
  await logToDb(db, {
    channel: "telegram",
    recipient: TELEGRAM_ADMIN_CHAT_ID,
    type: "daily_results",
    subject: `Daily results ${date}`,
    payload: toJsonSafe(s),
    status: tgResult.ok ? "sent" : tgResult.skipped ? "skipped" : "failed",
    error: tgResult.error || (tgResult.skipped ? tgResult.reason : null) || null,
  });

  // Email (nightly digest) — only if recipients configured
  let emailResult = { ok: false, skipped: true, reason: "no_recipients" };
  if (EMAIL_NIGHTLY_RECIPIENTS.length) {
    let html = "";
    let text = "";
    if (emailTemplates && typeof emailTemplates.dailyResultsTemplate === "function") {
      try {
        const tpl = emailTemplates.dailyResultsTemplate(s);
        html = tpl.html || "";
        text = tpl.text || "";
      } catch (err) {
        console.error("[notifications:dailyTemplate] failed:", err.message || err);
      }
    }
    if (!html && !text) text = tgText.replace(/<\/?[^>]+>/g, "");
    emailResult = await sendEmail({
      to: EMAIL_NIGHTLY_RECIPIENTS,
      subject: `Resumen Momentum Ascent — ${date}`,
      html,
      text,
    });
    await logToDb(db, {
      channel: "email",
      recipient: EMAIL_NIGHTLY_RECIPIENTS.join(","),
      type: "daily_results",
      subject: `Resumen Momentum Ascent — ${date}`,
      payload: toJsonSafe(s),
      status: emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed",
      error: emailResult.error || (emailResult.skipped ? emailResult.reason : null) || null,
    });
  }

  return { telegram: tgResult, email: emailResult };
}

async function notifyStreakAlert(streak, { db } = {}) {
  const type = String(streak?.type || "").toLowerCase();
  const count = Number(streak?.count || 0);
  if (type !== "lost" || count < 3) {
    return { ok: false, skipped: true, reason: "below_threshold" };
  }
  const text =
    `⚠️ <b>Alerta de racha negativa</b>\n` +
    `Picks perdidos consecutivos: <b>${count}</b>\n` +
    `Revisa estrategia/criterios antes de publicar nuevos picks.`;
  const result = await sendTelegram(text, { silent: false });
  await logToDb(db, {
    channel: "telegram",
    recipient: TELEGRAM_ADMIN_CHAT_ID,
    type: "streak_alert",
    subject: `Racha perdedora ${count}`,
    payload: toJsonSafe({ type, count }),
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    error: result.error || (result.skipped ? result.reason : null) || null,
  });
  return result;
}

module.exports = {
  sendTelegram,
  sendEmail,
  dispatch,
  notifyPickPublished,
  notifyDailyResults,
  notifyStreakAlert,
};
