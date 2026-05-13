// backend/email-templates.js
// HTML templates en español para emails transaccionales.
// Diseño dark theme con acento naranja, fallback plain-text incluido.

const BRAND_ORANGE = "#FF6B00";
const BG_DARK = "#0d0f14";
const BG_CARD = "#161a22";
const TEXT_LIGHT = "#e8eaee";
const TEXT_MUTED = "#9aa1ad";
const BORDER = "#262b36";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shellHtml({ title, body, preheader = "" }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TEXT_LIGHT};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</span>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG_DARK};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:${BG_CARD};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 16px 28px;border-bottom:1px solid ${BORDER};">
              <div style="font-size:20px;font-weight:700;color:${BRAND_ORANGE};letter-spacing:0.5px;">MOMENTUM ASCENT</div>
              <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">Picks deportivos con IA</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:${TEXT_LIGHT};font-size:15px;line-height:1.55;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_MUTED};">
              Este correo se envió automáticamente desde Momentum Ascent.<br/>
              Si no esperabas recibirlo, puedes ignorarlo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function dailyResultsTemplate(stats = {}) {
  const date = escapeHtml(stats.date || new Date().toISOString().slice(0, 10));
  const totalPicks = Number(stats.totalPicks || 0);
  const won = Number(stats.won || 0);
  const lost = Number(stats.lost || 0);
  const pending = Number(stats.pending || 0);
  const winRate = stats.winRate == null ? "N/A" : `${stats.winRate}%`;
  const topPicks = Array.isArray(stats.topPicks) ? stats.topPicks.slice(0, 3) : [];

  const topRowsHtml = topPicks.length
    ? topPicks.map((p, i) => {
        const match = `${escapeHtml(p.homeTeam || "?")} vs ${escapeHtml(p.awayTeam || "?")}`;
        const resultLabel = p.result === "won"
          ? `<span style="color:#4caf50;font-weight:600;">GANÓ</span>`
          : p.result === "lost"
          ? `<span style="color:#e53935;font-weight:600;">PERDIÓ</span>`
          : `<span style="color:${TEXT_MUTED};">Pendiente</span>`;
        return `
          <tr>
            <td style="padding:10px 8px;border-bottom:1px solid ${BORDER};font-size:13px;">${i + 1}</td>
            <td style="padding:10px 8px;border-bottom:1px solid ${BORDER};font-size:13px;">${match}</td>
            <td style="padding:10px 8px;border-bottom:1px solid ${BORDER};font-size:13px;color:${TEXT_MUTED};">${escapeHtml(p.market || "")}</td>
            <td style="padding:10px 8px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;">${escapeHtml(p.pick || "")}</td>
            <td style="padding:10px 8px;border-bottom:1px solid ${BORDER};font-size:13px;">${resultLabel}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="5" style="padding:14px 8px;font-size:13px;color:${TEXT_MUTED};text-align:center;">Sin picks destacados hoy.</td></tr>`;

  const body = `
    <h1 style="font-size:22px;margin:0 0 6px 0;color:${TEXT_LIGHT};">Resumen del día</h1>
    <div style="font-size:13px;color:${TEXT_MUTED};margin-bottom:20px;">${date}</div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background:#0f1218;border:1px solid ${BORDER};border-radius:8px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Total picks</div>
          <div style="font-size:24px;font-weight:700;color:${TEXT_LIGHT};margin-top:4px;">${totalPicks}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="background:#0f1218;border:1px solid ${BORDER};border-radius:8px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Win rate</div>
          <div style="font-size:24px;font-weight:700;color:${BRAND_ORANGE};margin-top:4px;">${winRate}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="background:#0f1218;border:1px solid ${BORDER};border-radius:8px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Resueltos</div>
          <div style="font-size:24px;font-weight:700;color:${TEXT_LIGHT};margin-top:4px;">${won + lost}</div>
        </td>
      </tr>
    </table>

    <div style="margin-bottom:20px;font-size:14px;">
      <span style="color:#4caf50;">✅ Ganados: <b>${won}</b></span> &nbsp;·&nbsp;
      <span style="color:#e53935;">❌ Perdidos: <b>${lost}</b></span> &nbsp;·&nbsp;
      <span style="color:${TEXT_MUTED};">⏳ Pendientes: <b>${pending}</b></span>
    </div>

    <h2 style="font-size:16px;margin:24px 0 12px 0;color:${TEXT_LIGHT};">Top picks del día</h2>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;background:#0f1218;">
      <thead>
        <tr style="background:#1a1f2a;">
          <th align="left" style="padding:10px 8px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${BORDER};">#</th>
          <th align="left" style="padding:10px 8px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${BORDER};">Partido</th>
          <th align="left" style="padding:10px 8px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${BORDER};">Mercado</th>
          <th align="left" style="padding:10px 8px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${BORDER};">Pick</th>
          <th align="left" style="padding:10px 8px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${BORDER};">Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${topRowsHtml}
      </tbody>
    </table>

    <div style="margin-top:28px;text-align:center;">
      <a href="https://momentumascent.com/trackrecord.html" style="display:inline-block;background:${BRAND_ORANGE};color:#0d0f14;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Ver track record completo</a>
    </div>
  `;

  const html = shellHtml({
    title: `Resumen Momentum Ascent — ${date}`,
    body,
    preheader: `${totalPicks} picks · Win rate ${winRate}`,
  });

  const text = [
    `MOMENTUM ASCENT — Resumen del día (${date})`,
    "",
    `Total picks: ${totalPicks}`,
    `Win rate: ${winRate}`,
    `Resueltos: ${won + lost}`,
    `Ganados: ${won} · Perdidos: ${lost} · Pendientes: ${pending}`,
    "",
    "Top picks:",
    ...topPicks.map((p, i) => {
      const match = `${p.homeTeam || "?"} vs ${p.awayTeam || "?"}`;
      const tag = p.result === "won" ? "[GANÓ]" : p.result === "lost" ? "[PERDIÓ]" : "[Pendiente]";
      return `${i + 1}. ${tag} ${match} — ${p.market || ""} → ${p.pick || ""}`;
    }),
    "",
    "Track record: https://momentumascent.com/trackrecord.html",
  ].join("\n");

  return { html, text };
}

function welcomeTemplate(user = {}) {
  const name = escapeHtml(user.name || "Usuario");
  const body = `
    <h1 style="font-size:22px;margin:0 0 12px 0;color:${TEXT_LIGHT};">¡Bienvenido, ${name}!</h1>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
      Gracias por unirte a <b>Momentum Ascent</b>. Aquí encontrarás picks deportivos
      analizados por IA, track record verificable y herramientas de bankroll.
    </p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${TEXT_MUTED};">
      Empieza explorando los picks del día y configura tu bankroll para llevar el control.
    </p>
    <div style="margin-top:24px;text-align:center;">
      <a href="https://momentumascent.com" style="display:inline-block;background:${BRAND_ORANGE};color:#0d0f14;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Ir a la plataforma</a>
    </div>
  `;
  const html = shellHtml({
    title: "Bienvenido a Momentum Ascent",
    body,
    preheader: "Tu cuenta está activa — empieza ahora",
  });
  const text = [
    `¡Bienvenido, ${user.name || "Usuario"}!`,
    "",
    "Gracias por unirte a Momentum Ascent.",
    "Explora los picks del día: https://momentumascent.com",
  ].join("\n");
  return { html, text };
}

function streakAlertTemplate(streak = {}) {
  const type = String(streak.type || "lost");
  const count = Number(streak.count || 0);
  const label = type === "lost" ? "racha negativa" : "racha positiva";
  const color = type === "lost" ? "#e53935" : "#4caf50";
  const body = `
    <h1 style="font-size:22px;margin:0 0 12px 0;color:${color};">⚠️ Alerta de ${label}</h1>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
      Detectamos una <b>${label}</b> de <b>${count}</b> picks consecutivos.
    </p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${TEXT_MUTED};">
      Revisa los criterios de selección y considera pausar nuevos picks hasta validar la estrategia.
    </p>
  `;
  const html = shellHtml({
    title: `Alerta: ${label}`,
    body,
    preheader: `Racha ${type} = ${count}`,
  });
  const text = [
    `Alerta de ${label}`,
    `Picks consecutivos: ${count}`,
    "Revisa los criterios antes de publicar nuevos picks.",
  ].join("\n");
  return { html, text };
}

module.exports = {
  dailyResultsTemplate,
  welcomeTemplate,
  streakAlertTemplate,
};
