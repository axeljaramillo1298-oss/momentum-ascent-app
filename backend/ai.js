const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = Math.max(5_000, Number(process.env.OPENAI_TIMEOUT_MS || 25_000));
const OPENAI_MAX_OUTPUT_TOKENS = Math.max(250, Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 900));
const OPENAI_MAX_PROMPT_CHARS = Math.max(300, Number(process.env.OPENAI_MAX_PROMPT_CHARS || 700));
const OPENAI_MAX_CONTEXT_CHARS = Math.max(800, Number(process.env.OPENAI_MAX_CONTEXT_CHARS || 3500));
const OPENAI_MAX_USERS_PER_CALL = Math.max(1, Number(process.env.OPENAI_MAX_USERS_PER_CALL || 3));
const OPENAI_WEB_SEARCH_ENABLED = String(process.env.OPENAI_WEB_SEARCH_ENABLED || "true").trim().toLowerCase() !== "false";
const OPENAI_WEB_SEARCH_MODEL = String(process.env.OPENAI_WEB_SEARCH_MODEL || "").trim() || "gpt-4.1-mini";
const { detectSportFallback, buildFallbackPlanForSport } = require("./sport-routine-fallbacks");

const safeStr = (value) => String(value || "").trim();

const buildFallbackPlan = ({ users = [], prompt = "", context = "", mode = "admin_ai" }) => {
  const names = users.map((u) => safeStr(u.name) || safeStr(u.email) || "User").join(", ") || "usuario";
  const sportProfile = detectSportFallback({ users, prompt, context });
  const basePlan = buildFallbackPlanForSport({
    sport: sportProfile.sport,
    goal: sportProfile.goal,
    level: sportProfile.level,
    time: sportProfile.time,
    place: sportProfile.place,
    prompt,
    mode,
    names,
  });
  const providerNote =
    mode === "ai_only"
      ? "Modo respaldo IA directo."
      : "Modo respaldo operador + IA, listo para editar antes de publicar.";

  return {
    provider: "fallback",
    sport: basePlan.sportLabel,
    routineText: [basePlan.routineText, `Destino: ${names}.`, providerNote].filter(Boolean).join("\n"),
    dietText: [basePlan.dietText, context ? `Contexto aplicado: ${safeStr(context).slice(0, 220)}.` : ""].filter(Boolean).join("\n"),
    messageText: basePlan.messageText || `Momentum update: ${names}, ya tienes una sugerencia base lista para revisar.`,
  };
};

const normalizeRiskLevel = (value) => {
  const normalized = safeStr(value).toUpperCase();
  if (normalized === "BAJO" || normalized === "MEDIO" || normalized === "ALTO") return normalized;
  return "MEDIO";
};

// ── IIHF Hockey Tiers (rev. 2026-05-24) ────────────────────────────
// Tier A = potencias históricas del mundial; Tier B = resto.
// Cuando Tier A vs Tier B, el margen final suele ser ≥2 goles en >60% de partidos.
//
// Update 2026-05-24 (análisis semanal):
//  · IIHF total semana (mié-sáb): 1-5 → 16.7% WR; histórico 9-10 → 47.4% WR.
//  · 5 de 6 Overs 5.5 IIHF de la semana fallaron (incl. Finlandia 70% conf y Suecia 68% conf).
//  · Conclusión: IIHF World Championship es un mercado estructuralmente difícil.
//    El prompt nuevo cap-ea confidence MAX = 65 en Overs 5+ goles dentro de IIHF,
//    incluso si hay tier mismatch (el mismatch parcial no garantiza goleo).
const IIHF_TIER_A_TEAMS = new Set([
  "canadá", "canada", "estados unidos", "usa", "estados-unidos",
  "suecia", "sweden", "finlandia", "finland",
  "chequia", "czech republic", "czechia", "república checa", "republica checa",
  "rusia", "russia", "suiza", "switzerland",
]);

// Tier intermedio (B+): selecciones que ya no son "fáciles" para Tier A. Si el rival
// del Tier A pertenece a este set, NO asumir goleada. Cap de confidence agresivo.
const IIHF_TIER_B_PLUS_TEAMS = new Set([
  "eslovaquia", "slovakia", "alemania", "germany", "letonia", "latvia",
  "dinamarca", "denmark", "noruega", "norway", "austria", "francia", "france",
]);
const teamTierBPlus = (team) => IIHF_TIER_B_PLUS_TEAMS.has(String(team || "").toLowerCase().trim());

const isIIHFEvent = (event = {}) => {
  const league = String(event.league || "").toLowerCase();
  return league.includes("iihf");
};

const teamTierA = (team) => IIHF_TIER_A_TEAMS.has(String(team || "").toLowerCase().trim());

const getIIHFMatchupTier = (event = {}) => {
  if (!isIIHFEvent(event)) return null;
  const home = String(event.home_team || event.homeTeam || "").trim();
  const away = String(event.away_team || event.awayTeam || "").trim();
  const homeA = teamTierA(home);
  const awayA = teamTierA(away);
  if (homeA && awayA) return { type: "A_vs_A", tierATeam: null, tierBTeam: null, home, away };
  if (homeA && !awayA) return { type: "mismatch", tierATeam: home, tierBTeam: away, home, away, tierAIsHome: true };
  if (!homeA && awayA) return { type: "mismatch", tierATeam: away, tierBTeam: home, home, away, tierAIsHome: false };
  return { type: "B_vs_B", tierATeam: null, tierBTeam: null, home, away };
};

// ── CONMEBOL Tiers (rev 2026-06-01) ─────────────────────────────────
// Tier-awareness para Libertadores / Sudamericana. Misma lógica que IIHF:
// cuando hay mismatch fuerte (A vs B), preferir Over goles o ML local
// fuerte. Cuando es mismatch parcial o A vs A, confidence MAX = 70.
//
// Update 2026-06-01 (análisis semanal):
//  · CONMEBOL Libertadores: 4-6 (40% WR), peor liga de la semana.
//  · 1X2 falló 3/4: Bolívar 1X (factor altura), Corinthians L (TierA),
//    Peñarol L (TierA). Solo LDU (TierA real) ganó.
//  · La "bomba" 82% conf (Fluminense U3.5) falló — equipo TierA con
//    rival mucho menor (La Guaira TierB) NO garantiza pocos goles;
//    el favorito sale a anotar.
//  · Sudamericana 2-2 más balanceado, pero Caracas 1X al 76% falló
//    (TierA visitante Botafogo no protegió empate).
const LIBERTADORES_TIER_A_TEAMS = new Set([
  "flamengo", "palmeiras", "boca juniors", "boca", "river plate", "river",
  "fluminense", "corinthians", "atlético mineiro", "atletico mineiro", "atlético-mg", "atletico-mg",
  "internacional", "são paulo", "sao paulo", "independiente del valle",
  "ldu", "ldu quito", "liga de quito", "vélez", "velez", "vélez sarsfield",
  "racing club", "estudiantes",
]);
const LIBERTADORES_TIER_B_TEAMS = new Set([
  "platense", "rosario central", "always ready", "bolívar", "bolivar",
  "central córdoba", "central cordoba", "carabobo", "deportivo táchira", "tachira",
  "barcelona sc", "alianza lima", "universitario", "sporting cristal",
  "cerro porteño", "cerro porteno", "olimpia", "libertad",
  "the strongest", "u. católica", "universidad católica", "universidad catolica",
]);
const SUDAMERICANA_TIER_A_TEAMS = new Set([
  "lanús", "lanus", "atlético nacional", "atletico nacional", "santos",
  "vasco da gama", "vasco", "athletico paranaense", "rb bragantino", "bragantino",
  "independiente", "huracán", "huracan", "fortaleza",
  "botafogo", // tier alto en clubes brasileños
]);
const LIBERTADORES_HIGH_ALTITUDE_HOMES = new Set([
  "bolívar", "bolivar", "the strongest", "always ready", // La Paz
  "ldu", "ldu quito", "liga de quito", // Quito
  "u. católica", "universidad católica de quito",
]);

const teamInSet = (team, set) => set.has(String(team || "").toLowerCase().trim());

const isConmebolEvent = (event = {}) => {
  const league = String(event.league || "").toLowerCase();
  return league.includes("libertadores") || league.includes("sudamericana") || league.includes("conmebol");
};

const getConmebolMatchupTier = (event = {}) => {
  if (!isConmebolEvent(event)) return null;
  const league = String(event.league || "").toLowerCase();
  const home = String(event.home_team || event.homeTeam || "").trim();
  const away = String(event.away_team || event.awayTeam || "").trim();
  const tierASet = league.includes("sudamericana") ? SUDAMERICANA_TIER_A_TEAMS : LIBERTADORES_TIER_A_TEAMS;
  const tierBSet = LIBERTADORES_TIER_B_TEAMS;
  const homeA = teamInSet(home, tierASet);
  const awayA = teamInSet(away, tierASet);
  const homeB = teamInSet(home, tierBSet);
  const awayB = teamInSet(away, tierBSet);
  const homeAltitude = teamInSet(home, LIBERTADORES_HIGH_ALTITUDE_HOMES);
  if (homeA && awayA) return { type: "A_vs_A", home, away, homeAltitude };
  // Mismatch explícito: A vs B conocido
  if (homeA && awayB) return { type: "mismatch", tierAIsHome: true, tierATeam: home, tierBTeam: away, home, away, homeAltitude };
  if (homeB && awayA) return { type: "mismatch", tierAIsHome: false, tierATeam: away, tierBTeam: home, home, away, homeAltitude };
  // Mismatch parcial: un equipo en Tier A y el otro no clasificado (asumir menor)
  if (homeA && !awayA) return { type: "mismatch", tierAIsHome: true, tierATeam: home, tierBTeam: away, home, away, homeAltitude };
  if (!homeA && awayA) return { type: "mismatch", tierAIsHome: false, tierATeam: away, tierBTeam: home, home, away, homeAltitude };
  return { type: "unknown", home, away, homeAltitude };
};

// ── Brasileirão Série A team tiers (rev 2026-06-01) ─────────────────
// Equipos top (g4-g6) vs equipos de media/baja tabla. ML visitante de
// equipos top/clásicos es engañoso: si el favorito visita a un rival
// de media tabla, no implica victoria automática.
//
// Update 2026-06-01: Brasileirão 6-3 en la semana, pero 3/4 ML 1X2
// fallaron el domingo 31: Vasco L (65%), Cruzeiro L (62%), São Paulo V (65%).
const BRASILEIRAO_TOP_TEAMS = new Set([
  "flamengo", "palmeiras", "fluminense", "corinthians", "atlético mineiro", "atletico mineiro", "atlético-mg",
  "internacional", "são paulo", "sao paulo", "botafogo", "athletico paranaense", "athletico-pr",
  "cruzeiro", "grêmio", "gremio", "santos",
]);
const isBrasileiraoEvent = (event = {}) => {
  const league = String(event.league || "").toLowerCase();
  if (!league.includes("brasileir")) return false;
  // Excluir Série B / C explícitos
  if (/serie\s*[bc]/.test(league) || /série\s*[bc]/.test(league)) return false;
  return true;
};

// ── MLB hour helper (CDMX) ──────────────────────────────────────────
// Update 2026-06-01: Unders MLB programados >= 19:00 CDMX fallaron 2/2
// en la semana (Giants U9.5 conf 72 y Dodgers U8.5 conf 70). Sin Unders
// nocturnos, MLB sería 6W-3L (66%) en vez de 7W-5L (58%).
const getEventHourCDMX = (event = {}) => {
  const dateStr = event.event_date || event.eventDate;
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // Convertir a hora CDMX (UTC-6)
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const cdmxDate = new Date(d.getTime() + cdmxOffsetMs);
    return cdmxDate.getUTCHours();
  } catch {
    return null;
  }
};

// ── Sport-specific addendum (inyecta reglas contextuales al prompt) ─────
const buildSportContextAdendum = (event = {}) => {
  const sport = String(event.sport || "").toLowerCase();
  const league = String(event.league || "").toLowerCase();
  const lines = [];

  // Baseball MLB / LMB
  if (sport.includes("baseball") || sport.includes("beisbol") || league.includes("mlb") || league.includes("liga mexicana")) {
    lines.push("⚾ BEISBOL — El pitcher abridor define ~60% del resultado. OBLIGATORIO: si en Stats NO hay info del pitcher abridor (nombre, ERA, WHIP, ponches recientes), confidence MAX = 55 para Totales y MAX = 60 para ML. Si lo tienes, cítalo en analysis (ej. 'X ERA 2.4 últimas 3 aperturas').");
    // Run Line visitante (+1.5): falló 0/1 en semana 25-may a 01-jun
    // (Braves +1.5 vs Reds conf 70 → lost). El mercado solo cubre si el
    // visitante pierde por <= 1 carrera o gana. Con equipo local fuerte
    // de bullpen sólido, el visitante pierde por 2+ con frecuencia.
    lines.push("⚾ MLB HANDICAP RUN LINE — Visitante +1.5: confidence MAX = 65 salvo evidencia explícita en Stats de bullpen débil del local (ERA bullpen >4.50) o cierre inestable (cerrador con blown saves recientes). Sin esa evidencia, descarta el mercado o mantén confidence ≤ 62.");
    // Unders MLB nocturnos (>= 19:00 CDMX): 0/2 en la semana, 2W-3L total.
    // Los partidos nocturnos suelen ser más altos en runs (clima, fatiga
    // del bullpen al final del día). Sin evidencia explícita de duelo de
    // abridores top, cap confidence en Unders nocturnos.
    const hr = getEventHourCDMX(event);
    if (Number.isFinite(hr) && hr >= 19) {
      lines.push(
        `⚾ MLB UNDER NOCTURNO — Partido programado ${hr}:00 CDMX. ` +
        `Unders MLB nocturnos (>=19:00 CDMX) fallaron 2/2 en la última semana. ` +
        `Confidence MAX en Under = 67 salvo que ambos abridores tengan ERA <3.50 confirmado en Stats. ` +
        `Si tu mejor pick es un Under aquí sin esa evidencia, prefiere otro mercado.`
      );
    }
  }

  // Basketball NBA / Playoffs (update 2026-05-24)
  // Histórico Overs NBA >=220: 6-4 (60% WR). Caso 2026-05-21: Knicks Over 221.5 lost con 68% conf.
  // Cap confidence en Overs altos para evitar parlays inestables.
  if (sport.includes("basket") || league.includes("nba")) {
    lines.push("🏀 BASKETBALL — Verifica si algún equipo viene de back-to-back (B2B): equipos en B2B suelen perder o cubrir menos puntos. En PLAYOFFS, NO asumas automáticamente que 'más posesiones = más puntos': la intensidad defensiva también sube. Para Over/Under cita ritmo (pace) específico si lo tienes en Stats; sin pace, confidence en totales MAX = 60. ⚠️ OVERS CON LÍNEA >=220 puntos: confidence MAX = 67 (datos internos: estos Overs ganan ~60% del tiempo, menos que la confianza típica de 68-70).");
  }

  // Hockey IIHF — tier awareness (rev 2026-05-24 tras análisis semanal)
  // Datos histórico: IIHF 9-10 → 47.4% WR (peor que coin flip).
  // Semana mié-sáb 2026-05-20/23: IIHF 1-5 → 16.7% WR (Overs 5.5 0-3).
  // Por eso: cap confidence MAX = 65 en Overs ≥5 goles dentro de IIHF.
  // Y si el rival del Tier A es Tier B+ (Eslovaquia, Letonia, Alemania, Dinamarca,
  // Noruega, Austria, Francia), NO asumir goleada — es mismatch parcial, no total.
  if (sport.includes("hockey") && league.includes("iihf")) {
    const tier = getIIHFMatchupTier(event);
    if (tier?.type === "mismatch") {
      const rivalBPlus = teamTierBPlus(tier.tierBTeam);
      if (rivalBPlus) {
        lines.push(
          `🏒 IIHF TIER MISMATCH PARCIAL — ${tier.tierATeam} (Tier A) vs ${tier.tierBTeam} (Tier B+, competitivo). ` +
          `Margen y goleo NO garantizados: en estos cruces el Tier A gana ~55% pero con scoreline cerrado. ` +
          `EVITA Overs 5.5+ (datos recientes: 0-3 en 2026-05-22). EVITA handicap -1.5 con confidence > 65. ` +
          `PREFIERE: ML ${tier.tierATeam} con cuota ≤1.55 (confidence MAX = 65), Under 5.5 o Under 6.5 si hay tendencia defensiva del Tier B+. ` +
          `Confidence MAX = 65 en CUALQUIER mercado de este partido.`
        );
      } else {
        lines.push(
          `🏒 IIHF TIER MISMATCH — ${tier.tierATeam} (Tier A: potencia mundial) vs ${tier.tierBTeam} (Tier B). ` +
          `Históricamente Tier A despacha por ≥2 goles en >60% de estos partidos. ` +
          `EVITA spread protector (+1.5, +2.5) al Tier B — pierde más del 50% del tiempo. ` +
          `PREFIERE: ML de ${tier.tierATeam}, Over 4.5 (no Over 5.5 — datos recientes muestran que 5.5 falla con frecuencia), o handicap -1.5 a favor de ${tier.tierATeam}. ` +
          `Confidence MAX en Over 5.5 = 65 (la línea es demasiado alta para confianza superior).`
        );
      }
    } else if (tier?.type === "A_vs_A") {
      lines.push("🏒 IIHF TIER A vs TIER A — Partido cerrado entre potencias mundiales. PREFIERE Under totales o BTTS (ambos anotan). Reduce confidence general en 5-8 puntos vs un mismatch. Confidence MAX = 65.");
    } else if (tier?.type === "B_vs_B") {
      lines.push("🏒 IIHF TIER B vs TIER B — Partido impredecible entre selecciones de menor nivel mundial. Confidence MAX = 60 en TODOS los mercados.");
    }
    // Cap global IIHF para Overs altos (independiente del tier)
    lines.push("🏒 IIHF GLOBAL — Overs 5.5+ históricamente fallan ~67% del tiempo en este torneo (dataset interno mayo 2026). NO recomiendes Over 5.5+ con confidence > 65 sin evidencia explícita (ej. ambos equipos promedian >3.5 GF/partido).");
  }

  // NHL Playoffs
  if (sport.includes("hockey") && (league.includes("nhl") || league.includes("playoff"))) {
    lines.push("🏒 NHL PLAYOFFS — Los partidos son históricamente más cerrados y bajos en goles que temporada regular. PREFIERE Under totales sobre Over. Si la serie está empatada (3-3 = Game 7), reduce confidence en favoritos por presión psicológica.");
  }

  // CONMEBOL Libertadores / Sudamericana — tier-awareness (rev 2026-06-01)
  // Análisis semanal: Libertadores 4-6 (40% WR). Fallos clave:
  //  - Fluminense U3.5 al 82% (Tier A vs B → favorito sale a anotar)
  //  - Bolívar 1X (factor altura La Paz no fue suficiente)
  //  - Corinthians L, Peñarol L (Tier A jugando ML local conf 65-70%)
  //  - Ind. Valle Over 1.5 al 72% (Tier A vs B no garantiza goleo grupos)
  // Sudamericana: Caracas o Empate al 76% falló (Botafogo Tier A no protegió empate visitante).
  if (isConmebolEvent(event)) {
    const tier = getConmebolMatchupTier(event);
    const isLibertadores = league.includes("libertadores");
    const isSudamericana = league.includes("sudamericana");
    if (tier?.type === "mismatch") {
      lines.push(
        `🏆 CONMEBOL TIER MISMATCH — ${tier.tierATeam} (Tier A: club tradicional grande) vs ${tier.tierBTeam} (Tier B). ` +
        `Históricamente Tier A gana ~55-60% de estos partidos, pero el goleo NO está garantizado en CONMEBOL (defensas conservadoras). ` +
        `EVITA Overs altos (≥3.5 goles) con confidence > 65 — el favorito puede ganar 1-0 o 2-0. ` +
        `EVITA Unders altos (≥3.5 protector) con confidence > 70 — el favorito sale a anotar y supera 3 con frecuencia. ` +
        `PREFIERE: ML ${tier.tierATeam} si cuota ≤ 1.60 (confidence MAX = 70), Over 1.5 (no Over 2.5/3.5), o handicap -1 a favor del Tier A.`
      );
    } else if (tier?.type === "A_vs_A") {
      lines.push("🏆 CONMEBOL TIER A vs TIER A — Partido cerrado entre clubes grandes (clásico continental). Reduce confidence general en 5-8 puntos vs mismatch. Confidence MAX = 65 en 1X2, MAX = 67 en Over/Under. PREFIERE Under 2.5 o BTTS Sí (ambos buenos en ataque).");
    }
    if (tier?.homeAltitude) {
      lines.push(
        `🏔 CONMEBOL FACTOR ALTITUD — ${tier.home} juega en altura (La Paz / Quito > 2500m). ` +
        `El factor altitud da ventaja al local pero NO garantiza victoria: confidence MAX en ML local = 68. ` +
        `Bolívar 1X al 68% falló el 2026-05-27 contra Ind. Rivadavia pese a la altura. ` +
        `Si vas con local en altura, exige forma reciente buena (4+ wins en últimos 5 partidos en casa).`
      );
    }
    if (isLibertadores) {
      lines.push("🏆 LIBERTADORES GLOBAL — Última semana 4-6 (40% WR). Fase de grupos: defensas conservadoras, muchos 1-0 / 0-0. Cap confidence MAX = 72 en CUALQUIER mercado de Libertadores fase grupos salvo evidencia explícita de tendencia (4+ partidos similares confirmados en Stats).");
    }
    if (isSudamericana) {
      lines.push("🏆 SUDAMERICANA GLOBAL — Equipos más parejos que Libertadores. Locales no son tan dominantes. Cap confidence MAX = 70 en ML local salvo tendencia 4-1 en últimos 5 confirmada.");
    }
  }

  // Copa Argentina + cups eliminatorios sudamericanos (rev 2026-06-02)
  // Patrón: Over 1.5 en torneos cup sudamericanos 1W-3L (25%) últimos 7 días.
  // Caso: Barracas vs Huracán Over 1.5 al 75% ⭐ TOP 1 falló martes 2-jun.
  // Razón: eliminatorias defensivas, equipos especulan; 0-0 / 1-0 / 0-1 común.
  if (sport.includes("foot") && (league.includes("copa argentina") || league.includes("copa libertadores") || league.includes("copa sudamericana"))) {
    lines.push(
      "🏆 CUP SUDAMERICANA (Copa Argentina/Libertadores/Sudamericana eliminación) — " +
      "Over 1.5 goles tiene WR 25% (1-3) últimos 7 días en esta plataforma. Los equipos especulan, " +
      "0-0 y 1-0 son frecuentes. Cap confidence MAX = 62 en Over 1.5 salvo que stats.team_stats " +
      "contenga goals_for_avg para AMBOS equipos Y la suma sea >= 2.8 goles (citarlo en analysis). " +
      "Sin team_stats explícito de goleo, descarta Over 1.5 — prefiere ML o handicap."
    );
  }

  // Amistosos internacionales TIER B (rev 2026-06-02)
  // Patrón: amistosos sin top-25 FIFA, 0W-3L últimos 14 días (Haiti-NZ, Wales-Ghana,
  // Bulgaria-Montenegro). Cuando al menos uno es TIER A real, 6W-0L (Mexico-Aus,
  // Croatia-Bel, Cape Verde-Ser, Czechia-Kos, Norway-Swe, Austria-Tun).
  if (sport.includes("foot") && league.includes("friendly")) {
    const FRIENDLY_TIER_A = new Set([
      // Europe top
      "spain","españa","france","francia","england","inglaterra","belgium","bélgica","belgica",
      "netherlands","holanda","países bajos","paises bajos","portugal","italy","italia",
      "germany","alemania","croatia","croacia","switzerland","suiza","denmark","dinamarca",
      "austria","sweden","suecia","czechia","república checa","republica checa","czech republic",
      "norway","noruega","poland","polonia","ukraine","ucrania","serbia",
      // Americas
      "argentina","brazil","brasil","uruguay","colombia","mexico","méxico","usa","united states",
      "estados unidos","chile","peru","perú","ecuador","canada","canadá",
      // Africa top
      "morocco","marruecos","senegal","egypt","egipto","tunisia","túnez","tunez","algeria","argelia",
      "nigeria","cameroon","camerún","camerun","ivory coast","costa de marfil","cape verde","cabo verde",
      // Asia top
      "japan","japón","japon","south korea","corea del sur","iran","irán","australia","saudi arabia",
      "arabia saudita","qatar",
    ]);
    const homeFr = String(event.home_team || event.homeTeam || "").toLowerCase().trim();
    const awayFr = String(event.away_team || event.awayTeam || "").toLowerCase().trim();
    const homeIsA = FRIENDLY_TIER_A.has(homeFr);
    const awayIsA = FRIENDLY_TIER_A.has(awayFr);
    if (!homeIsA && !awayIsA) {
      lines.push(
        `⚽ AMISTOSO TIER B — ${homeFr} vs ${awayFr}: ninguno top-25 FIFA confirmado. ` +
        `Histórico últimos 14 días: 0W-3L cuando ninguno es TIER A (Haiti-NZ, Wales-Ghana, Bulgaria-Montenegro). ` +
        `Cap confidence MAX = 63 en TODOS los mercados de este partido. ` +
        `Estos partidos son altamente impredecibles — rotación, alineaciones experimentales, intensidad baja. ` +
        `Si no hay valor claro de momios (cuota >= 1.80), prefiere NO publicar.`
      );
    } else if (homeIsA && awayIsA) {
      lines.push(
        `⚽ AMISTOSO TIER A vs TIER A — ${homeFr} vs ${awayFr}: ambos top-25 FIFA. ` +
        `Histórico 2W-0L últimos 14 días (Croatia-Belgium, Norway-Sweden). Confidence normal aplica, ` +
        `prefiere Under 2.5 o BTTS si ambos tienen estilo defensivo.`
      );
    }
    // mismatch A vs B: permitido pero con cap moderado
    if ((homeIsA && !awayIsA) || (!homeIsA && awayIsA)) {
      lines.push(
        `⚽ AMISTOSO MISMATCH — ${homeIsA ? homeFr : awayFr} (TIER A) vs ${homeIsA ? awayFr : homeFr} (TIER B). ` +
        `Confidence MAX = 67 en ML del TIER A salvo tendencia de forma 4-1 confirmada. ` +
        `Caso Wales-Ghana 2-jun: Wales TIER A perdió como local al 65% — los amistosos vs equipos menores no son automáticos.`
      );
    }
  }

  // Brasileirão Série A — rev 2026-06-01
  // 3/4 ML 1X2 fallaron el domingo 31. Picks de equipos top en
  // confidence 62-65% son demasiado optimistas: el campeonato es muy
  // parejo en la zona media-alta de la tabla.
  if (isBrasileiraoEvent(event)) {
    const homeRaw = String(event.home_team || event.homeTeam || "").trim();
    const awayRaw = String(event.away_team || event.awayTeam || "").trim();
    const homeTop = teamInSet(homeRaw, BRASILEIRAO_TOP_TEAMS);
    const awayTop = teamInSet(awayRaw, BRASILEIRAO_TOP_TEAMS);
    lines.push("⚽ BRASILEIRÃO SÉRIE A — Campeonato extremadamente parejo en zona media-alta. Locales NO dominan tanto como en otras ligas. ML LOCAL solo si forma 4-1 o mejor en últimos 5 en casa Y rival sin victorias en sus últimos 3 visitas. Sin esos datos: confidence MAX = 65 en ML 1X2.");
    if (awayTop && !homeTop) {
      lines.push(`⚽ BRASILEIRÃO — ${awayRaw} (top) visita a ${homeRaw} (media/baja). ML visitante NO es trivial en Brasileirão. Cap confidence MAX = 65 en ML visitante salvo tendencia 4+ wins en últimas 5 visitas confirmada. Prefiere Doble Oportunidad X2 o Over goles si hay valor.`);
    }
    if (homeTop && !awayTop) {
      lines.push(`⚽ BRASILEIRÃO — ${homeRaw} (top) recibe a ${awayRaw} (media/baja). ML local cap confidence MAX = 68. Empates son frecuentes (~25% del campeonato). Considera Doble Oportunidad 1X.`);
    }
  }

  // European football top-tier
  if (sport.includes("foot") && (league.includes("bundes") || league.includes("premier league") || league.includes("la liga") || league.includes("serie a") || league.includes("ligue 1"))) {
    lines.push("⚽ FÚTBOL EUROPEO TOP — Verifica si el equipo viene de partido de Champions/Europa League entre semana: la rotación de 4-6 titulares es regla, no excepción. Sin info explícita de rotación o lineup confirmado, evita confidence > 65 en MLs de favorito europeo top.");
  }

  return lines.length ? "\n\nCONTEXTO ESPECÍFICO DEL DEPORTE/LIGA:\n" + lines.join("\n") : "";
};

// ── Pick stability check for Reto Escalera legs ─────────────────────
// Filtra picks volátiles que no deberían ir en un parlay multi-leg.
//
// Update 2026-05-24 (análisis semanal):
//  · Excluye Overs NBA con threshold >= 220 puntos (aprendizaje 2026-05-21:
//    Knicks Over 221.5 falló con 68% confidence; histórico de Overs NBA >=220
//    es 6-4 → 60% WR, no apto para parlay 3+ legs).
//  · Excluye TODOS los picks IIHF con confidence < 70 (IIHF 47% WR histórico,
//    muy volátil para parlays).
//  · Excluye Overs IIHF de 5.5+ goles independiente del confidence (datos
//    semana mié-sáb: 0-3 en Overs 5.5 IIHF).
const isStablePickForParlay = (pick = {}) => {
  const market = String(pick.market || "").toLowerCase();
  const text = String(pick.pick || "").toLowerCase();
  const league = String(pick.league || "").toLowerCase();
  const conf = Number(pick.confidence || 0);

  // No usar ML visitante en legs (más volátil)
  if ((market.includes("1x2") || market.includes("moneyline") || market === "ml") && (text.includes("visitante") || text.includes("away"))) return false;

  // Confidence mínima 65 para legs de parlay
  if (conf < 65) return false;

  // NBA: excluir Overs con threshold >= 220 pts (no son suficientemente estables para parlay).
  // Match: "Over 220 pts", "Over 221.5 puntos", "Over 220.5", etc.
  if ((league.includes("nba") || league.includes("basketball")) && text.startsWith("over")) {
    const m = text.match(/over\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const total = parseFloat(m[1]);
      if (Number.isFinite(total) && total >= 220) return false;
    }
  }

  // IIHF: descartar Overs 5.5+ y exigir confidence >= 70 para cualquier mercado
  if (league.includes("iihf")) {
    if (text.startsWith("over")) {
      const m = text.match(/over\s*(\d+(?:\.\d+)?)/);
      if (m) {
        const total = parseFloat(m[1]);
        if (Number.isFinite(total) && total >= 5.5) return false;
      }
    }
    if (conf < 70) return false;
  }

  return true;
};

const buildFallbackSportsPick = ({ event = {}, stats = {}, historicalContext = [] }) => {
  const sport = safeStr(event.sport || "deporte");
  const league = safeStr(event.league || "liga");
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const hasStats = stats && Object.keys(stats).length > 0;
  const pick = sport === "basketball" ? `Over 221.5 puntos en ${home} vs ${away}` : `${home} o empate`;
  const market = sport === "basketball" ? "total_points" : "double_chance";
  const confidence = hasStats ? 64 : 42;
  const analysis = hasStats
    ? `${league}: ${home} vs ${away}. Se detecta contexto estadistico suficiente para una lectura conservadora del mercado ${market}.`
    : `${league}: ${home} vs ${away}. Hay datos limitados, por eso la lectura se mantiene conservadora y con confianza baja.`;
  return {
    provider: "fallback",
    model: "fallback-sports",
    pick,
    market,
    confidence,
    risk_level: hasStats ? "MEDIO" : "ALTO",
    analysis: `${analysis} Historial consultado: ${Array.isArray(historicalContext) ? historicalContext.length : 0} referencia(s).`,
    disclaimer: "Contenido informativo. No garantiza ganancias.",
  };
};

// ── Performance feedback loop ─────────────────────────────────────
// Build a compact performance summary from past resolved picks so the
// IA can self-calibrate based on its real win rate per league/market.
function buildPerformanceContext(picks, options = {}) {
  if (!Array.isArray(picks) || picks.length === 0) return null;
  const { league, market, minResolved = 5, maxRecent = 30 } = options;

  const isResolved = (p) => p && (p.result === "won" || p.result === "lost");
  const resolvedAll = picks.filter(isResolved);
  const resolved = resolvedAll.slice(0, Math.max(1, Number(maxRecent) || 30));
  if (resolved.length < Math.max(1, Number(minResolved) || 5)) return null;

  const norm = (v) => safeStr(v).toLowerCase();
  const wonCount = (arr) => arr.filter((p) => p.result === "won").length;
  const lostCount = (arr) => arr.filter((p) => p.result === "lost").length;
  const wr = (arr) => (arr.length ? Math.round((wonCount(arr) / arr.length) * 100) : 0);

  // Global stats
  const total = resolved.length;
  const won = wonCount(resolved);
  const lost = lostCount(resolved);
  const winRate = wr(resolved);

  // Group helper
  const groupBy = (arr, keyFn) => {
    const map = new Map();
    for (const p of arr) {
      const k = keyFn(p);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    return map;
  };

  const buildBuckets = (map, minCount = 2) => {
    const list = [];
    for (const [key, arr] of map.entries()) {
      if (arr.length < minCount) continue;
      list.push({
        key,
        total: arr.length,
        won: wonCount(arr),
        lost: lostCount(arr),
        winRate: wr(arr),
      });
    }
    return list.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
  };

  const byLeagueMap = groupBy(resolved, (p) => safeStr(p.league));
  const byMarketMap = groupBy(resolved, (p) => norm(p.market));
  const byLeague = buildBuckets(byLeagueMap, 2).slice(0, 5);
  const byMarket = buildBuckets(byMarketMap, 2).slice(0, 5);

  // Auto-detected inefficient / efficient combos liga+mercado (Batch 3 #5)
  // Combos con >= 4 picks resueltos: si WR < 40% son ineficientes (evitar),
  // si WR >= 70% son fuertes (explotar). La IA ve esto explícito en el prompt.
  const byComboMap = groupBy(resolved, (p) => {
    const lg = safeStr(p.league);
    const mk = norm(p.market);
    return lg && mk ? `${lg}|${mk}` : null;
  });
  const allCombos = buildBuckets(byComboMap, 4);
  const inefficientCombos = allCombos.filter((c) => c.winRate < 40).slice(0, 3);
  const efficientCombos = allCombos.filter((c) => c.winRate >= 70).slice(0, 3);
  const formatCombo = (c) => {
    const [lg, mk] = c.key.split("|");
    return `${lg}+${mk.toUpperCase()} (${c.won}-${c.lost}, ${c.winRate}%)`;
  };

  // Calibration on high-confidence picks (>= 70)
  const highConf = resolved.filter((p) => Number(p.confidence || 0) >= 70);
  let calibration = null;
  if (highConf.length >= 3) {
    const realWR = wonCount(highConf) / highConf.length; // 0..1
    const avgConf =
      highConf.reduce((s, p) => s + Number(p.confidence || 0), 0) / highConf.length / 100; // 0..1
    const factor = avgConf > 0 ? realWR / avgConf : 1;
    let status = "calibrado";
    if (factor < 0.85) status = "sobre-confiable";
    else if (factor > 1.1) status = "sub-confiable";
    calibration = {
      sampleSize: highConf.length,
      avgConfidence: Math.round(avgConf * 100),
      realWinRate: Math.round(realWR * 100),
      factor: Number(factor.toFixed(2)),
      status,
    };
  }

  // Current streak — pick most recent, count consecutive same result
  let streak = null;
  if (resolved.length) {
    const firstType = resolved[0].result; // 'won' | 'lost'
    let count = 0;
    for (const p of resolved) {
      if (p.result === firstType) count++;
      else break;
    }
    streak = { type: firstType, count };
  }

  // Optional league-specific stats
  let leagueSpecific = null;
  if (league) {
    const arr = resolved.filter((p) => safeStr(p.league) === safeStr(league));
    if (arr.length >= 2) {
      leagueSpecific = {
        league: safeStr(league),
        total: arr.length,
        won: wonCount(arr),
        lost: lostCount(arr),
        winRate: wr(arr),
      };
    }
  }

  // Optional market-specific stats
  let marketSpecific = null;
  if (market) {
    const arr = resolved.filter((p) => norm(p.market) === norm(market));
    if (arr.length >= 2) {
      marketSpecific = {
        market: safeStr(market),
        total: arr.length,
        won: wonCount(arr),
        lost: lostCount(arr),
        winRate: wr(arr),
      };
    }
  }

  // Build promptText (~700 chars max, Spanish)
  const lines = [];
  lines.push(`PERFORMANCE HISTORICA (ultimos ${total} picks resueltos):`);
  lines.push(`- WR global: ${winRate}% (${won}W-${lost}L)`);
  if (byLeague.length) {
    const best = byLeague.slice(0, 2).map((b) => `${b.key} ${b.winRate}% (${b.won}-${b.lost})`).join(", ");
    lines.push(`- Mejores ligas: ${best}`);
    const worst = [...byLeague].reverse().slice(0, 1).map((b) => `${b.key} ${b.winRate}% (${b.won}-${b.lost})`).join(", ");
    if (worst && worst !== best) lines.push(`- Peores ligas: ${worst}`);
  }
  if (byMarket.length) {
    const best = byMarket.slice(0, 2).map((b) => `${b.key.toUpperCase()} ${b.winRate}% (${b.won}-${b.lost})`).join(", ");
    lines.push(`- Mejores mercados: ${best}`);
    const worst = [...byMarket].reverse().slice(0, 1).map((b) => `${b.key.toUpperCase()} ${b.winRate}% (${b.won}-${b.lost})`).join(", ");
    if (worst && worst !== best) lines.push(`- Peores mercados: ${worst}`);
  }
  if (calibration) {
    const hint =
      calibration.status === "sobre-confiable"
        ? "estas declarando mas confianza de la real, baja conf"
        : calibration.status === "sub-confiable"
        ? "podrias ser mas asertivo cuando hay datos"
        : "confianza alineada con resultados reales";
    lines.push(
      `- Calibracion: con conf>=70% declaras ${calibration.avgConfidence}% y aciertas ${calibration.realWinRate}% (${calibration.status}, ${hint})`
    );
  }
  if (streak && streak.count >= 2) {
    const sign = streak.type === "won" ? "+" : "-";
    lines.push(`- Racha: ${sign}${streak.count} ${streak.type === "won" ? "ganados" : "perdidos"} consecutivos`);
  }
  if (leagueSpecific) {
    lines.push(
      `- En esta liga (${leagueSpecific.league}): WR ${leagueSpecific.winRate}% (${leagueSpecific.won}-${leagueSpecific.lost})`
    );
  }
  if (marketSpecific) {
    lines.push(
      `- En este mercado (${marketSpecific.market}): WR ${marketSpecific.winRate}% (${marketSpecific.won}-${marketSpecific.lost})`
    );
  }
  if (inefficientCombos.length) {
    lines.push(`- EVITAR (combos con WR < 40% historico): ${inefficientCombos.map(formatCombo).join(", ")}`);
  }
  if (efficientCombos.length) {
    lines.push(`- EXPLOTAR (combos con WR >= 70%): ${efficientCombos.map(formatCombo).join(", ")}`);
  }
  lines.push(
    "INSTRUCCION: considera tu historial. Si la liga/mercado tiene WR bajo, se conservador; si alto, mas asertivo. Si el evento coincide con un combo de EVITAR, descarta o usa confianza baja. Calibra confidence con base en tu tasa real."
  );

  let promptText = lines.join("\n");
  if (promptText.length > 700) promptText = promptText.slice(0, 697) + "...";

  return {
    summary: { winRate, won, lost, total },
    byLeague,
    byMarket,
    calibration,
    streak,
    inefficientCombos,
    efficientCombos,
    ...(leagueSpecific ? { leagueSpecific } : {}),
    ...(marketSpecific ? { marketSpecific } : {}),
    promptText,
  };
}

// ── Expected Value calculation ────────────────────────────────────
// Compares declared confidence (model probability) vs implied market
// probability from decimal odds. Returns null if odds is missing or
// out of a reasonable range.
function calculateExpectedValue(confidence, odds) {
  const conf = Number(confidence);
  const o = Number(odds);
  if (!Number.isFinite(conf) || conf < 0 || conf > 100) return null;
  if (!Number.isFinite(o) || o < 1.01 || o > 50) return null;

  const p = conf / 100;
  const marketP = 1 / o;
  const ev = p * (o - 1) - (1 - p); // expected value per 1 unit stake
  const edge = p - marketP;

  let recommendation = "neutral";
  if (edge >= 0.05 && ev > 0.10) recommendation = "strong";
  else if (edge > 0 && ev > 0) recommendation = "positive";
  else if (ev < -0.05) recommendation = "avoid";
  else recommendation = "neutral"; // ev within -0.05..0.05

  return {
    ev: Number(ev.toFixed(4)),
    evPercent: Number((ev * 100).toFixed(2)),
    edge: Number(edge.toFixed(4)),
    recommendation,
  };
}

// ── Streak insurance ──────────────────────────────────────────────
// Detects N+ consecutive recent losses among resolved picks (most-recent
// first). When triggered, the IA should be more selective: raise the
// effective confidence threshold and avoid weak markets.
function shouldApplyStreakInsurance(picks, options = {}) {
  const lossThreshold = Math.max(1, Number(options.lossThreshold) || 3);
  const minConfidenceBump = Math.max(1, Number(options.minConfidenceBump) || 8);

  const inactive = {
    active: false,
    consecutiveLosses: 0,
    confidenceBump: 0,
    instruction: "",
  };

  if (!Array.isArray(picks) || picks.length === 0) return inactive;

  const isResolved = (p) => p && (p.result === "won" || p.result === "lost");
  let consecutiveLosses = 0;
  for (const p of picks) {
    if (!isResolved(p)) continue;
    if (p.result === "lost") {
      consecutiveLosses++;
    } else {
      break;
    }
  }

  if (consecutiveLosses < lossThreshold) {
    return { ...inactive, consecutiveLosses };
  }

  const baseThreshold = 65;
  const bump = minConfidenceBump;
  const instruction =
    `⚠️ STREAK INSURANCE ACTIVO: ${consecutiveLosses} pérdidas seguidas. ` +
    `Sé más selectivo. Solo recomienda picks con confidence muy alta (>= ${baseThreshold + bump}%) ` +
    `y descarta mercados con WR histórico < 60%. Si no hay candidatos claros, NO publiques.`;

  return {
    active: true,
    consecutiveLosses,
    confidenceBump: bump,
    instruction,
  };
}

// ── Top picks of the day ──────────────────────────────────────────
// Ranks picks by a combined score (confidence + league WR + EV when
// odds are available). Does not mutate inputs — returns shallow copies
// with `topScore` and `topRank` fields added.
//
// Update 2026-06-01 (análisis semanal):
//  · Default minConfidence subió de 60 → 70.
//  · Razón: en la semana 25-may a 01-jun, picks <70% confidence ganaron
//    77% (banda 60-64) y picks 70+ ganaron 56% (descalibración fuerte).
//  · Aun así, TOPs deben representar lo más sólido del día: si nada
//    pasa el umbral, regresa vacío (mejor 0 TOPs que TOPs débiles).
//  · El umbral configurable se mantiene por compatibilidad histórica.
function selectTopPicksOfDay(picks, options = {}) {
  const topN = Math.max(1, Number(options.topN) || 3);
  const minConfidence = Math.max(0, Number(options.minConfidence) || 70);

  if (!Array.isArray(picks) || picks.length === 0) return [];

  const scored = [];
  for (const p of picks) {
    if (!p) continue;
    const confidence = Number(p.confidence || 0);
    if (confidence < minConfidence) continue;

    const leagueWR = Number(
      p.leagueHistoricalWR != null ? p.leagueHistoricalWR : 50
    );

    let evContribution = confidence; // default when no odds
    let evInfo = null;
    if (p.odds != null) {
      evInfo = calculateExpectedValue(confidence, p.odds);
      if (evInfo) {
        // Map evPercent (~-100..+100) into a 0..100 contribution.
        // 0% EV → 50, +20% EV → 70, -20% EV → 30 (clamped 0..100).
        const mapped = 50 + evInfo.evPercent;
        evContribution = Math.max(0, Math.min(100, mapped));
      }
    }

    const topScore = Number(
      (0.6 * confidence + 0.2 * leagueWR + 0.2 * evContribution).toFixed(2)
    );

    scored.push({
      pick: { ...p },
      topScore,
      evInfo,
    });
  }

  scored.sort((a, b) => b.topScore - a.topScore);

  const top = scored.slice(0, topN).map((entry, idx) => {
    const out = { ...entry.pick, topScore: entry.topScore, topRank: idx + 1 };
    if (entry.evInfo) out.expectedValue = entry.evInfo;
    return out;
  });

  return top;
}

const extractJsonObject = (raw) => {
  const text = safeStr(raw);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const createOpenAiBody = (model, systemPrompt, userPrompt) => ({
  model,
  temperature: 0.4,
  max_tokens: OPENAI_MAX_OUTPUT_TOKENS,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
});

const callOpenAiOnce = async ({ apiKey, model, systemPrompt, userPrompt }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(createOpenAiBody(model, systemPrompt, userPrompt)),
      signal: controller.signal,
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`openai_${response.status}:${rawText.slice(0, 300)}`);
    }
    const data = rawText ? JSON.parse(rawText) : {};
    const content = safeStr(data?.choices?.[0]?.message?.content);
    return { content, model };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("openai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const extractResponsesText = (payload = {}) => {
  const direct = safeStr(payload?.output_text);
  if (direct) return direct;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const textParts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = safeStr(part?.text || part?.content || "");
      if (text) textParts.push(text);
    }
  }
  return textParts.join("\n").trim();
};

const callOpenAiWebSearchOnce = async ({ apiKey, model, instructions, input }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS + 25_000);
  try {
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        max_output_tokens: Math.max(900, OPENAI_MAX_OUTPUT_TOKENS),
        text: {
          format: {
            type: "json_schema",
            name: "sports_market_analysis",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                ml: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pick: { type: "string" },
                    conf: { type: "integer" },
                    nota: { type: "string" },
                  },
                  required: ["pick", "conf", "nota"],
                },
                goles: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pick: { type: "string" },
                    conf: { type: "integer" },
                    nota: { type: "string" },
                  },
                  required: ["pick", "conf", "nota"],
                },
                btts: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pick: { type: "string" },
                    conf: { type: "integer" },
                    nota: { type: "string" },
                  },
                  required: ["pick", "conf", "nota"],
                },
                handicap: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pick: { type: "string" },
                    line: { type: "string" },
                    conf: { type: "integer" },
                    nota: { type: "string" },
                  },
                  required: ["pick", "line", "conf", "nota"],
                },
                corners: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pick: { type: "string" },
                    conf: { type: "integer" },
                    nota: { type: "string" },
                  },
                  required: ["pick", "conf", "nota"],
                },
                resumen: { type: "string" },
                research_summary: { type: "string" },
              },
              required: ["ml", "goles", "btts", "handicap", "corners", "resumen", "research_summary"],
            },
          },
        },
      }),
      signal: controller.signal,
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`openai_web_${response.status}:${rawText.slice(0, 400)}`);
    }
    const data = rawText ? JSON.parse(rawText) : {};
    const content = extractResponsesText(data);
    return { content, model };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("openai_web_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

async function generateAiPlan(payload = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const fallbackModels = String(process.env.OPENAI_MODEL_FALLBACKS || "")
    .split(",")
    .map((v) => safeStr(v))
    .filter(Boolean);
  const prompt = safeStr(payload.prompt).slice(0, OPENAI_MAX_PROMPT_CHARS);
  const context = safeStr(payload.context || payload.fileText).slice(0, OPENAI_MAX_CONTEXT_CHARS);
  const mode = safeStr(payload.mode) || "admin_ai";
  const users = Array.isArray(payload.users) ? payload.users.slice(0, OPENAI_MAX_USERS_PER_CALL) : [];

  if (!apiKey) throw new Error("openai_key_missing");

  const coachStyle = mode === "ai_only" ? "asistente IA directo" : "asistente IA con validacion de admin";
  const userSummary = users
    .map((u, idx) => `${idx + 1}. ${safeStr(u.name) || "User"} | ${safeStr(u.email)} | plan:${safeStr(u.plan) || "n/a"}`)
    .join("\n");

  const systemPrompt = [
    "Eres un asistente interno para una plataforma digital.",
    "Debes responder SOLO JSON valido con esta estructura:",
    '{"routineText":"...","dietText":"...","messageText":"..."}',
    "Texto en espanol, concreto y util para el operador.",
    "No uses markdown.",
  ].join(" ");

  const userPrompt = [
    `Modo: ${coachStyle}.`,
    `Usuarios:\n${userSummary || "Sin usuarios especificos"}`,
    `Objetivo del admin: ${prompt || "Generar una sugerencia estructurada"}`,
    `Contexto extra: ${context || "Sin contexto"}`,
    "Genera contenido breve y estructurado usando el contexto disponible.",
    "messageText debe ser corto y util como nota operativa.",
  ].join("\n\n");

  const modelsToTry = [model, ...fallbackModels.filter((m) => m !== model)];
  let content = "";
  let usedModel = model;
  let lastError = null;
  for (const candidateModel of modelsToTry) {
    try {
      const out = await callOpenAiOnce({
        apiKey,
        model: candidateModel,
        systemPrompt,
        userPrompt,
      });
      content = out.content;
      usedModel = out.model;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;

  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("openai_invalid_json");
  }

  return {
    provider: "openai",
    model: usedModel,
    routineText: safeStr(parsed.routineText),
    dietText: safeStr(parsed.dietText),
    messageText: safeStr(parsed.messageText),
  };
}

async function generateSportsPick({ event = {}, stats = {}, historicalContext = [], historyPicks = [] } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const fallbackModels = String(process.env.OPENAI_MODEL_FALLBACKS || "")
    .split(",")
    .map((v) => safeStr(v))
    .filter(Boolean);

  if (!apiKey) {
    return buildFallbackSportsPick({ event, stats, historicalContext });
  }

  const perfCtx = buildPerformanceContext(historyPicks, { league: event.league });
  const perfBlock = perfCtx ? `\n\n${perfCtx.promptText}\n` : "";
  const streakInsurance = shouldApplyStreakInsurance(historyPicks);
  const insuranceBlock = streakInsurance.active ? `\n\n${streakInsurance.instruction}\n` : "";

  const sportAdendum = buildSportContextAdendum(event);

  const systemPrompt = [
    "Eres un analista de picks deportivos para un MVP informativo.",
    "Debes responder SOLO JSON valido con esta estructura exacta:",
    '{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO | MEDIO | ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."}',
    "No prometas ganancias.",
    "No uses palabras como seguro, garantizado o apuesta garantizada.",
    "Si hay pocos datos, reduce confidence y dilo claramente.",
    "Si en Stats hay odds (cuotas decimales), considera el Expected Value: tu probabilidad implicita (confidence/100) debe superar a la implicita del mercado (1/odds) para que haya valor.",
    "Si la muestra histórica disponible es N<5 partidos, confidence MAX = 55.",
    "analysis debe ser breve, claro y en español. OBLIGATORIO: cita AL MENOS UN STAT NUMÉRICO específico del JSON Stats (ej. 'Liverpool 8/10 visitas con victoria', 'pace 102', 'ERA 2.4'). Si no hay stats numéricos, di explícitamente 'sin stats numéricos disponibles' en analysis.",
    sportAdendum,
  ].filter(Boolean).join(" ");

  const userPrompt = [
    `Evento: ${safeStr(event.league)} | ${safeStr(event.home_team || event.homeTeam)} vs ${safeStr(event.away_team || event.awayTeam)}.`,
    `Deporte: ${safeStr(event.sport)}.`,
    `Fecha: ${safeStr(event.event_date || event.eventDate)}.`,
    `Estado: ${safeStr(event.status)}.`,
    `Stats JSON: ${JSON.stringify(stats || {}).slice(0, OPENAI_MAX_CONTEXT_CHARS)}`,
    `Contexto historico: ${JSON.stringify(historicalContext || []).slice(0, OPENAI_MAX_CONTEXT_CHARS)}`,
    perfBlock ? perfBlock.trim() : "",
    insuranceBlock ? insuranceBlock.trim() : "",
    "Elige un mercado razonable segun los datos disponibles.",
    "Si hay odds en Stats, calcula mentalmente el EV y prefiere mercados con valor positivo.",
    "Recuerda: la respuesta DEBE seguir EXACTAMENTE el JSON descrito en el sistema. No agregues campos.",
  ].filter(Boolean).join("\n\n");

  const modelsToTry = [model, ...fallbackModels.filter((m) => m !== model)];
  let content = "";
  let usedModel = model;
  let lastError = null;
  for (const candidateModel of modelsToTry) {
    try {
      const out = await callOpenAiOnce({
        apiKey,
        model: candidateModel,
        systemPrompt,
        userPrompt,
      });
      content = out.content;
      usedModel = out.model;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    return buildFallbackSportsPick({ event, stats, historicalContext });
  }

  const parsed = extractJsonObject(content);
  if (!parsed) {
    return buildFallbackSportsPick({ event, stats, historicalContext });
  }

  return {
    provider: "openai",
    model: usedModel,
    pick: safeStr(parsed.pick) || buildFallbackSportsPick({ event, stats, historicalContext }).pick,
    market: safeStr(parsed.market) || "moneyline",
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence || 0))),
    risk_level: normalizeRiskLevel(parsed.risk_level),
    analysis: safeStr(parsed.analysis) || "Analisis no disponible.",
    disclaimer: "Contenido informativo. No garantiza ganancias.",
  };
}

// ── ANTHROPIC / CLAUDE ──────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const CLAUDE_TIMEOUT_MS = 40_000;

const callClaudeOnce = async ({ apiKey, systemPrompt, userPrompt, maxTokens = 1500 }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) throw new Error(`claude_${response.status}:${rawText.slice(0, 300)}`);
    const data = JSON.parse(rawText);
    const content = safeStr(data?.content?.[0]?.text);
    return { content, model: CLAUDE_MODEL };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("claude_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

// Fallback when GPT key is missing — returns 3 hardcoded picks
const buildFallbackMultiplePicks = ({ event = {}, stats = {} }) => {
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const sport = safeStr(event.sport || "deporte");
  const league = safeStr(event.league || "Liga");
  const hasStats = stats && Object.keys(stats).length > 0;
  return [
    { pick: home, market: "1X2", confidence: hasStats ? 58 : 42, risk_level: "MEDIO", analysis: `${home} como favorito en ${league}. Lectura conservadora por datos ${hasStats ? "disponibles" : "limitados"}.`, disclaimer: "Contenido informativo. No garantiza ganancias.", provider: "fallback" },
    { pick: sport === "basketball" ? "Over 221.5" : "Over 2.5 goles", market: sport === "basketball" ? "total_points" : "over_under", confidence: hasStats ? 55 : 38, risk_level: "MEDIO", analysis: `Mercado de totales para ${home} vs ${away}. Capacidad ofensiva de ambos equipos analizada.`, disclaimer: "Contenido informativo. No garantiza ganancias.", provider: "fallback" },
    { pick: `${home} o Empate`, market: "double_chance", confidence: hasStats ? 65 : 48, risk_level: "BAJO", analysis: `Doble oportunidad cubriendo dos resultados. Mayor margen de seguridad a menor cuota.`, disclaimer: "Contenido informativo. No garantiza ganancias.", provider: "fallback" },
  ];
};

// GPT-4o generates 3 complete pick candidates in different markets
async function generateMultiplePicksGPT({ event = {}, stats = {}, historicalContext = [], historyPicks = [] } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o";
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "deporte");
  const date = safeStr(event.event_date || event.eventDate || "");

  if (!apiKey) return buildFallbackMultiplePicks({ event, stats });

  const perfCtx = buildPerformanceContext(historyPicks, { league: event.league });
  const perfBlock = perfCtx ? `\n${perfCtx.promptText}\n` : "";

  const sportAdendum = buildSportContextAdendum(event);

  const systemPrompt = [
    "Eres un analista deportivo experto para un servicio informativo de picks deportivos.",
    "Para el evento indicado, genera EXACTAMENTE 3 picks en mercados DISTINTOS.",
    "Responde SOLO JSON valido con esta estructura exacta:",
    '{"picks":[{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."},{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."},{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."}]}',
    "Reglas:",
    "- Los 3 picks DEBEN ser en mercados diferentes (ej: 1X2, Over/Under, Ambos marcan, Handicap, BTTS, Double Chance)",
    "- analysis: 3-4 oraciones en español con razonamiento estadístico claro. OBLIGATORIO citar AL MENOS UN STAT NUMÉRICO específico del JSON Stats por cada pick (ej. 'Liverpool 8/10 visitas con victoria', 'pace 102 posesiones', 'ERA 2.4'). Si no hay stats numéricos, dilo explícitamente.",
    "- confidence: entero 0-100. Si la muestra histórica es N<5 partidos, confidence MAX = 55. Si faltan datos clave del deporte (pitcher en MLB, pace en NBA), confidence MAX = 60 en mercados afectados.",
    "- NO prometas ganancias. NO uses 'seguro', 'garantizado', 'apuesta segura'",
    "- market debe ser el nombre técnico del mercado (ej: 1X2, over_under, both_teams_score, handicap)",
    sportAdendum,
  ].filter(Boolean).join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sport}`,
    `Fecha: ${date}`,
    `Estado: ${safeStr(event.status || "scheduled")}`,
    `\nEstadisticas disponibles:\n${JSON.stringify(stats || {}).slice(0, 4000)}`,
    `\nContexto historico (ultimos picks del sistema):\n${JSON.stringify(historicalContext || []).slice(0, 1500)}`,
    perfBlock ? `\n${perfBlock.trim()}` : "",
    `\nGenera exactamente 3 picks en mercados completamente diferentes. Cada pick necesita analisis completo con razonamiento coherente con los datos disponibles.`,
    `\nMantén EXACTAMENTE el formato JSON descrito en el sistema. No agregues campos extra.`,
  ].filter(Boolean).join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS + 20000);
    let content = "";
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          max_tokens: 2500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const rawText = await response.text().catch(() => "");
      if (!response.ok) throw new Error(`openai_${response.status}`);
      const data = rawText ? JSON.parse(rawText) : {};
      content = safeStr(data?.choices?.[0]?.message?.content);
    } catch {
      clearTimeout(timer);
      return buildFallbackMultiplePicks({ event, stats });
    }

    const parsed = extractJsonObject(content);
    if (!parsed || !Array.isArray(parsed.picks) || parsed.picks.length < 2) {
      return buildFallbackMultiplePicks({ event, stats });
    }

    return parsed.picks.slice(0, 3).map((p) => ({
      pick: safeStr(p.pick) || "Pick no disponible",
      market: safeStr(p.market) || "moneyline",
      confidence: Math.max(0, Math.min(100, Number(p.confidence || 0))),
      risk_level: normalizeRiskLevel(p.risk_level),
      analysis: safeStr(p.analysis) || "Analisis no disponible.",
      disclaimer: "Contenido informativo. No garantiza ganancias.",
      provider: `openai-${model}`,
    }));
  } catch {
    return buildFallbackMultiplePicks({ event, stats });
  }
}

// Claude acts as judge: evaluates GPT candidates and selects the best one
async function selectBestPickWithClaude({ event = {}, candidates = [], historyPicks = [] } = {}) {
  const apiKey = safeStr(process.env.ANTHROPIC_API_KEY);
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "deporte");
  const date = safeStr(event.event_date || event.eventDate || "");

  if (!apiKey || !candidates.length) {
    const bestIdx = candidates.reduce((bi, c, i) => (c.confidence > (candidates[bi]?.confidence || 0) ? i : bi), 0);
    const best = candidates[bestIdx] || candidates[0] || {};
    return { selectedIndex: bestIdx, reasoning: "Seleccion automatica por confianza maxima (Claude no disponible).", confidenceAdjustment: 0, finalPick: { ...best, provider: "fallback-judge" }, model: "fallback-judge" };
  }

  const sportAdendum = buildSportContextAdendum(event);

  const systemPrompt = [
    "Eres un analista deportivo senior. Tu rol es JUEZ: evalúas picks generados por GPT-4o y eliges el MEJOR — o te abstienes si ninguno vale.",
    "Criterios de evaluación:",
    "1. Solidez del razonamiento estadístico con los datos disponibles",
    "2. Coherencia entre confianza numérica, nivel de riesgo y análisis escrito",
    "3. Valor real del mercado sugerido para el tipo de evento",
    "4. Precisión y claridad del análisis en español",
    "5. Cumplimiento de las reglas del deporte/liga (ver contexto al final)",
    "ABSTENCIÓN: Si NINGÚN candidato cumple criterios básicos (todos con confidence <55, todos sin stats numéricos citados, todos contradicen reglas del deporte, todos con EV negativo claro), responde con selected_index = -1 y explica por qué te abstienes.",
    "Responde SOLO JSON válido con esta estructura:",
    '{"selected_index":0,"abstain":false,"reasoning":"Explicación breve (2-4 oraciones en español)","confidence_adjustment":0,"final_pick":{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"Análisis refinado del pick seleccionado","disclaimer":"Contenido informativo. No garantiza ganancias."}}',
    "selected_index: 0, 1, 2 (índice base-0 del candidato elegido) o -1 (abstención)",
    "abstain: true SI Y SOLO SI selected_index = -1. En ese caso, final_pick puede omitirse o ser un objeto vacío.",
    "confidence_adjustment: entero entre -10 y +10 que ajusta la confianza del pick elegido",
    "final_pick: versión refinada del pick seleccionado, puedes mejorar el análisis manteniendo mercado y pick base. OBLIGATORIO citar al menos un stat numérico en analysis.",
    "NO prometas ganancias. NO uses 'seguro', 'garantizado'.",
    sportAdendum,
  ].filter(Boolean).join(" ");

  const candidatesText = candidates
    .map((c, i) => [`--- Candidato ${i + 1} ---`, `Mercado: ${c.market}`, `Pick: ${c.pick}`, `Confianza GPT: ${c.confidence}%`, `Riesgo GPT: ${c.risk_level}`, `Analisis: ${c.analysis}`].join("\n"))
    .join("\n\n");

  // Build performance context — use first candidate's market as hint when available
  const candidateMarket = candidates[0]?.market || "";
  const perfCtx = buildPerformanceContext(historyPicks, { league: event.league, market: candidateMarket });
  const perfBlock = perfCtx ? `\n${perfCtx.promptText}\n` : "";

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sport}`,
    `Fecha: ${date}`,
    ``,
    `Picks candidatos generados por GPT-4o:`,
    candidatesText,
    perfBlock ? perfBlock.trim() : "",
    `Evalua los ${candidates.length} candidatos y elige el mejor con razonamiento claro.`,
    `Recuerda: la respuesta DEBE seguir EXACTAMENTE el JSON definido en el sistema.`,
  ].filter(Boolean).join("\n");

  try {
    const { content, model } = await callClaudeOnce({ apiKey, systemPrompt, userPrompt, maxTokens: 1200 });
    const parsed = extractJsonObject(content);
    if (!parsed) throw new Error("claude_invalid_json");

    const rawIdx = Number(parsed.selected_index ?? 0);
    const abstainFlag = Boolean(parsed.abstain) || rawIdx === -1 || rawIdx < 0;

    // Abstention path — Claude rejects all candidates
    if (abstainFlag) {
      return {
        selectedIndex: -1,
        abstain: true,
        reasoning: safeStr(parsed.reasoning) || "Claude se abstuvo: ningún candidato cumple los criterios mínimos para este evento.",
        confidenceAdjustment: 0,
        finalPick: {
          pick: "—",
          market: "abstención",
          confidence: 0,
          risk_level: "ALTO",
          analysis: safeStr(parsed.reasoning) || "Sin pick recomendado para este evento.",
          disclaimer: "Contenido informativo. No garantiza ganancias.",
          provider: "claude-judge-abstain",
        },
        model,
      };
    }

    const selectedIndex = Math.max(0, Math.min(candidates.length - 1, rawIdx));
    const selectedCandidate = candidates[selectedIndex] || candidates[0];
    const rawFinal = parsed.final_pick || {};

    return {
      selectedIndex,
      abstain: false,
      reasoning: safeStr(parsed.reasoning) || "Claude selecciono el pick con mayor solidez estadistica.",
      confidenceAdjustment: Math.max(-10, Math.min(10, Number(parsed.confidence_adjustment || 0))),
      finalPick: {
        pick: safeStr(rawFinal.pick) || selectedCandidate.pick,
        market: safeStr(rawFinal.market) || selectedCandidate.market,
        confidence: Math.max(0, Math.min(100, Number(rawFinal.confidence || selectedCandidate.confidence))),
        risk_level: normalizeRiskLevel(rawFinal.risk_level || selectedCandidate.risk_level),
        analysis: safeStr(rawFinal.analysis) || selectedCandidate.analysis,
        disclaimer: "Contenido informativo. No garantiza ganancias.",
        provider: "claude-judge",
      },
      model,
    };
  } catch {
    const bestIdx = candidates.reduce((bi, c, i) => (c.confidence > (candidates[bi]?.confidence || 0) ? i : bi), 0);
    const best = candidates[bestIdx] || candidates[0] || {};
    return { selectedIndex: bestIdx, reasoning: "Seleccion por confianza maxima (error en evaluacion Claude).", confidenceAdjustment: 0, finalPick: { ...best, provider: "fallback-judge" }, model: "fallback-judge" };
  }
}

// Orchestrate: GPT generates 3 candidates → Claude judges → return all
async function runDualAnalysis({ event = {}, stats = {}, historicalContext = [], historyPicks = [] } = {}) {
  const candidates = await generateMultiplePicksGPT({ event, stats, historicalContext, historyPicks });
  const claudeResult = await selectBestPickWithClaude({ event, candidates, historyPicks });
  return { candidates, claudeResult };
}

// ── GPT: analyze 5 key betting markets — short and direct ──────────────
// ── Sport-specific market config ──────────────────────────
const getSportMarketConfig = (sport, home, away) => {
  const s = (sport || "").toLowerCase();
  const RULES = [
    "No prometas ganancias ni uses palabras como seguro o garantizado.",
    "La confianza es entero 0-100; reducela si faltan datos.",
    "Cada nota es max 1 oracion corta y basada en datos.",
    "No inventes lesiones, odds, bajas ni resultados.",
    "Usa los Stats como fuente primaria.",
    "Si odds y estadistica se contradicen, refleja eso con menor confianza.",
    "El resumen menciona los factores que mas pesaron.",
  ];

  if (s.includes("basket") || s.includes("nba")) {
    return {
      label: "basquetbol/NBA",
      markets: "ml (ganador ML), total puntos (Over/Under), spread (handicap puntos), primera mitad (ganador), cuartos (total cuartos/ritmo)",
      jsonSchema: '{"ml":{"pick":"Local|Visitante","conf":65,"nota":""},"goles":{"pick":"Over 221.5|Under 221.5 pts","conf":60,"nota":""},"btts":{"pick":"Local 1ra mitad|Visitante 1ra mitad","conf":55,"nota":""},"handicap":{"pick":"Local -5.5|Visitante +5.5","line":"-5.5","conf":58,"nota":""},"corners":{"pick":"Over 48.5|Under 48.5 pts 1er cuarto","conf":52,"nota":""},"resumen":"1 oracion"}',
      criteria: ["Forma ultimos 5 partidos y racha de victorias.", "Pace (ritmo de juego): posesiones por 48 min de cada equipo. Es determinante para Over/Under. Sin este dato, conf en total_points no debe superar 60.", "Promedio de puntos anotados y recibidos por equipo.", "Rendimiento de anotacion en casa vs visita.", "Jugadores clave: lesiones o descanso de titulares.", "H2H si disponible."],
      fallback: { ml: { pick: "Local", conf: 55, nota: "Ventaja de cancha local." }, goles: { pick: "Over 221.5 pts", conf: 52, nota: "Promedio de puntos del torneo." }, btts: { pick: "Local 1ra mitad", conf: 50, nota: "Local suele controlar el inicio." }, handicap: { pick: "Local -5.5", line: "-5.5", conf: 48, nota: "Leve favorito local." }, corners: { pick: "Over 48.5 pts 1er cuarto", conf: 45, nota: "Ritmo alto esperado." }, resumen: `${home} vs ${away} — basquetbol, datos limitados.` },
    };
  }
  if (s.includes("beisbol") || s.includes("baseball") || s.includes("mlb")) {
    return {
      label: "béisbol/MLB",
      markets: "ml (ganador), total carreras (Over/Under), btts (1ra entrada anota o no), run line (-1.5/+1.5), ponches del pitcher abridor",
      jsonSchema: '{"ml":{"pick":"Local|Visitante","conf":65,"nota":""},"goles":{"pick":"Over 8.5|Under 8.5 carreras","conf":60,"nota":""},"btts":{"pick":"Si anota 1ra entrada|No anota 1ra entrada","conf":55,"nota":""},"handicap":{"pick":"Local -1.5|Visitante +1.5","line":"-1.5","conf":58,"nota":""},"corners":{"pick":"Pitcher Over 5.5|Pitcher Under 5.5 Ks","conf":52,"nota":""},"resumen":"1 oracion"}',
      criteria: ["OBLIGATORIO: Pitcher abridor de cada equipo (nombre, ERA, WHIP, ponches en ultimas 3 aperturas). Sin este dato, la confianza en totales no puede superar 55.", "Lineup ofensivo: promedio al bate y OBP vs tipo de pitcher.", "Bullpen: efectividad si el partido se extiende.", "Rendimiento en casa vs visita de cada equipo.", "H2H reciente si disponible.", "Clima o condiciones si hay datos."],
      fallback: { ml: { pick: "Local", conf: 55, nota: "Pitcher y ventaja de campo local." }, goles: { pick: "Over 8.5 carreras", conf: 52, nota: "Promedio de carreras del torneo." }, btts: { pick: "No anota 1ra entrada", conf: 50, nota: "Abridores suelen dominar el inicio." }, handicap: { pick: "Local -1.5", line: "-1.5", conf: 48, nota: "Local favorito por run line." }, corners: { pick: "Pitcher Over 5.5 Ks", conf: 45, nota: "Buen abridor esperado." }, resumen: `${home} vs ${away} — béisbol, datos limitados.` },
    };
  }
  if (s.includes("tenis") || s.includes("tennis")) {
    return {
      label: "tenis",
      markets: "ml (ganador partido), juegos totales (Over/Under), ganador del 1er set, handicap de juegos, break de servicio en 1er set",
      jsonSchema: '{"ml":{"pick":"Jugador A|Jugador B","conf":65,"nota":""},"goles":{"pick":"Over 22.5|Under 22.5 juegos","conf":60,"nota":""},"btts":{"pick":"Jugador A 1er set|Jugador B 1er set","conf":55,"nota":""},"handicap":{"pick":"Jugador A -3.5|Jugador B +3.5 juegos","line":"-3.5","conf":58,"nota":""},"corners":{"pick":"Si hay break 1er set|No hay break 1er set","conf":52,"nota":""},"resumen":"1 oracion"}',
      criteria: ["Ranking ATP/WTA y forma reciente ultimos 5 partidos.", "Rendimiento en la superficie del torneo.", "H2H si disponible.", "Condicion fisica o lesiones reportadas.", "Stats de servicio y retorno si disponibles.", "Etapa del torneo y nivel de motivacion."],
      fallback: { ml: { pick: home, conf: 55, nota: "Mejor ranking y forma reciente." }, goles: { pick: "Over 22.5 juegos", conf: 52, nota: "Promedio de juegos en torneo." }, btts: { pick: `${home} 1er set`, conf: 50, nota: "Ventaja de ranking en inicio." }, handicap: { pick: `${home} -3.5`, line: "-3.5", conf: 48, nota: "Diferencia de nivel esperada." }, corners: { pick: "Si hay break 1er set", conf: 45, nota: "Ambos servidores variables." }, resumen: `${home} vs ${away} — tenis, datos limitados.` },
    };
  }
  if (s.includes("nfl") || (s.includes("americano") && !s.includes("soccer"))) {
    return {
      label: "fútbol americano/NFL",
      markets: "ml (ganador partido), total puntos (Over/Under), spread (handicap puntos), primera mitad, total touchdowns",
      jsonSchema: '{"ml":{"pick":"Local|Visitante","conf":65,"nota":""},"goles":{"pick":"Over 48.5|Under 48.5 pts","conf":60,"nota":""},"btts":{"pick":"Local 1ra mitad|Visitante 1ra mitad","conf":55,"nota":""},"handicap":{"pick":"Local -6.5|Visitante +6.5","line":"-6.5","conf":58,"nota":""},"corners":{"pick":"Over 3.5|Under 3.5 touchdowns","conf":52,"nota":""},"resumen":"1 oracion"}',
      criteria: ["QB performance: QBR, TDs, INTs ultimos 3 juegos.", "Linea ofensiva y defensiva.", "Running game y eficiencia ofensiva.", "Lesiones de jugadores clave.", "H2H si disponible.", "Temperatura/viento si hay datos."],
      fallback: { ml: { pick: "Local", conf: 55, nota: "Ventaja de campo local." }, goles: { pick: "Over 48.5 pts", conf: 52, nota: "Ritmo de anotacion esperado." }, btts: { pick: "Local 1ra mitad", conf: 50, nota: "Local domina inicio." }, handicap: { pick: "Local -6.5", line: "-6.5", conf: 48, nota: "Local favorito por spread." }, corners: { pick: "Over 3.5 TDs", conf: 45, nota: "Partido con ritmo ofensivo." }, resumen: `${home} vs ${away} — NFL, datos limitados.` },
    };
  }
  if (s.includes("ufc") || s.includes("mma")) {
    return {
      label: "UFC/MMA",
      markets: "ml (ganador de la pelea), total rounds (Over/Under), llega o no a decision, handicap de rounds, metodo de victoria",
      jsonSchema: '{"ml":{"pick":"Peleador A|Peleador B","conf":65,"nota":""},"goles":{"pick":"Over 2.5 rounds|Under 2.5 rounds","conf":60,"nota":""},"btts":{"pick":"Si llega a decision|No llega a decision","conf":55,"nota":""},"handicap":{"pick":"Peleador A -1.5 rounds|Peleador B +1.5 rounds","line":"-1.5","conf":58,"nota":""},"corners":{"pick":"Peleador A por KO/TKO o SUB|Peleador B por KO/TKO o SUB","conf":52,"nota":""},"resumen":"1 oracion"}',
      criteria: [
        "Forma en ultimas 5 peleas y racha reciente.",
        "Metodo de victoria/derrota en ultimas 5 peleas.",
        "Volumen de golpeo, defensa de golpeo y absorcion si hay datos.",
        "Takedown accuracy, takedown defense y amenaza de sumision.",
        "Corte de peso, short notice, lesiones o bajas confirmadas.",
        "Durabilidad, cardio, alcance, stance y nivel del oponente reciente.",
        "Odds de moneyline, rounds y method props si existen.",
      ],
      fallback: {
        ml: { pick: home, conf: 55, nota: "Ligera ventaja por perfil reciente." },
        goles: { pick: "Over 2.5 rounds", conf: 52, nota: "Combate con espacio para lectura media." },
        btts: { pick: "No llega a decision", conf: 50, nota: "Posible definicion antes de las tarjetas." },
        handicap: { pick: `${home} -1.5 rounds`, line: "-1.5", conf: 48, nota: "Mayor presión ofensiva esperada." },
        corners: { pick: `${home} por KO/TKO o SUB`, conf: 45, nota: "Ruta de finalizacion mas probable." },
        resumen: `${home} vs ${away} — UFC/MMA, datos limitados.`,
      },
    };
  }
  // Default: soccer/futbol
  return {
    label: "fútbol",
    markets: "1X2 ML (Local/Empate/Visitante), Goles Over/Under, BTTS (ambos anotan), Hándicap Asiático, Corners Over/Under",
    jsonSchema: '{"ml":{"pick":"Local|Empate|Visitante","conf":65,"nota":""},"goles":{"pick":"Over 2.5|Under 2.5","conf":60,"nota":""},"btts":{"pick":"Si|No","conf":55,"nota":""},"handicap":{"pick":"descripcion exacta del handicap","line":"0.5|1|etc","conf":58,"nota":""},"corners":{"pick":"Over 9.5|Under 9.5","conf":52,"nota":""},"resumen":"1 oracion de contexto"}',
    criteria: ["Forma ultimos 5 partidos de cada equipo (obligatorio para BTTS: cuantos partidos ambos anotaron).", "Para BTTS: cuenta explicita de partidos donde ambos equipos anotaron en las ultimas 8 jornadas.", "Lesiones o bajas relevantes confirmadas.", "Rendimiento local/visita de la temporada.", "Historial H2H reciente.", "Odds disponibles y movimientos de linea.", "Produccion ofensiva/defensiva y tendencia de totales y corners."],
    fallback: { ml: { pick: home, conf: 55, nota: "Favorito local por localia." }, goles: { pick: "Over 2.5", conf: 52, nota: "Promedio de goles del torneo." }, btts: { pick: "Si", conf: 50, nota: "Ambos equipos tienen capacidad ofensiva." }, handicap: { pick: `${home} -0.5`, line: "-0.5", conf: 48, nota: "Leve ventaja local." }, corners: { pick: "Over 9.5", conf: 45, nota: "Ritmo de juego abierto esperado." }, resumen: `${home} vs ${away} — fútbol, datos limitados.` },
  };
};

async function analyzeMarketsGPT({ event = {}, stats = {}, historyPicks = [] } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o";
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "futbol");
  const date = safeStr(event.event_date || event.eventDate || "");
  const sportCfg = getSportMarketConfig(sport, home, away);

  const mkFallback = () => ({ ...sportCfg.fallback, provider: "fallback" });
  if (!apiKey) return mkFallback();

  const perfCtx = buildPerformanceContext(historyPicks, { league: event.league });
  const perfBlock = perfCtx ? perfCtx.promptText : "";
  const streakInsurance = shouldApplyStreakInsurance(historyPicks);
  const insuranceBlock = streakInsurance.active ? streakInsurance.instruction : "";

  const systemPrompt = [
    `Eres un analista deportivo senior especializado en ${sportCfg.label} para una plataforma premium de apuestas deportivas.`,
    `Para el evento dado, analiza EXACTAMENTE estos 5 mercados de ${sportCfg.label}: ${sportCfg.markets}.`,
    "Responde SOLO JSON valido con esta estructura exacta (sin texto adicional):",
    sportCfg.jsonSchema,
    "Reglas obligatorias:",
    "1. No prometas ganancias ni uses palabras como seguro, garantizado o free money.",
    "2. La confianza es un entero 0-100; reducela si faltan datos.",
    "3. Cada nota es max 1 oracion corta y directa basada en datos.",
    "4. No inventes lesiones, odds, bajas ni resultados.",
    "5. Usa primero los Stats proporcionados.",
    "6. Si hay forma reciente, lesiones, H2H, rendimiento local/visita u odds, consideralos obligatoriamente.",
    "7. Si odds y estadistica se contradicen, refleja eso con menor confianza.",
    "8. El resumen menciona que factores pesaron mas.",
    "9. BTTS (ambos anotan): Solo asigna conf >= 65 si tienes evidencia de que AMBOS equipos anotaron en al menos 6 de sus ultimos 8 partidos. Sin ese dato, pon conf <= 55.",
    "10. Handicap asiatico: Solo asigna conf >= 65 si hay una ventaja clara de forma (al menos 4-1 en ultimos 5 partidos) o diferencia significativa de nivel. Sin ese dato, pon conf <= 58. NOTA: Handicap historico en esta plataforma rinde 71% WR (15-6) — es un mercado robusto cuando hay data, no lo descartes por defecto en partidos parejos con cuota ML castigada (<1.40).",
    // ── Corners: regla específica (rev 2026-06-01) ──────────────
    // Histórico: 1 pick en 337 (0% WR). El mercado es ignorado por GPT/Claude.
    // Causa: data de corners por equipo casi nunca está en Stats. Decisión:
    // explicitar la regla — solo elegir Corners si hay data clara, sino conf baja.
    "10b. Corners: SOLO asigna conf >= 60 si Stats.team_stats.home.corners_for_avg Y Stats.team_stats.away.corners_for_avg estan presentes (campos reales en nuestra BD). Cita ambos valores numericos en la nota (ej. 'Local 6.5/p, Visit 5.8/p, proyeccion 10.7'). Si Stats.team_stats.projected_corners_total existe, usalo para elegir linea: Over X.5 si projected >= X+1; Under X.5 si projected <= X-1; diferencia < 1 corner = conf MAX 60. Sin esos campos: conf <= 50 y nota 'team_stats sin corners'. NUNCA inventes — historico 0% WR / 337 picks sin data.",
    "11. Totales en beisbol: La conf del mercado goles debe reflejar ERA del pitcher abridor. Si Stats.team_stats trae era_bullpen/runs_for_avg/runs_against_avg de ambos equipos, citalos en la nota. Si no tienes ERA en Stats, pon conf <= 55 en goles y explica que falta el pitcher.",
    "12. Totales en basketball: Incluye pace (ritmo de juego) de ambos equipos si esta en Stats. Si Stats.team_stats.home.pace Y away.pace existen, citalos exacto en la nota. Sin pace, conf del total no debe superar 60.",
    "13. Antes de asignar cualquier conf >= 70: lista mentalmente 2 factores en contra del pick. Si existen 2 o mas factores en contra, reduce conf entre 8 y 12 puntos.",
    // ── Cap 75+ DURO (rev 2026-06-02, post-fallo Barracas TOP 1) ────────
    // Caso martes 2-jun: TOP 1 Barracas vs Huracán Over 1.5 al 75% perdió;
    // analysis genérico sin un solo número ("es muy poco frecuente que un
    // partido termine 0-0"). Reglas previas (calibración semanal) no se
    // respetaron. Esta es DURA: la nota DEBE contener 3 números concretos.
    "13b. CAP DURO 75+ (rev 2026-06-02): para asignar confidence >= 75 en CUALQUIER mercado, la nota DEBE contener AL MENOS 3 números concretos verificables (formato 'X.Y' o 'X-Y' o 'X%'): ejemplos válidos = ERA 2.4, forma 4-1, H2H 7-3, promedio goles 1.8, OPS 0.785, pace 102.3, corners 6.5/p. Frases genéricas como 'es poco frecuente', 'suelen anotar', 'rara vez termina 0-0' NO cuentan como evidencia numérica. Si no puedes incluir 3 números reales en la nota, confidence MAX = 72. SIN EXCEPCIONES.",
    "14. Si en Stats hay odds (cuotas decimales) de un mercado, considera el Expected Value: tu probabilidad implicita (conf/100) debe superar a la implicita del mercado (1/odds) para que el pick tenga valor. Cuando hay odds, ajusta tu conf y nota considerando el EV.",
    // ── 15. team_stats por deporte (rev 2026-06-01) ──────────────────
    // Inyectado desde sportsApiService.getEventStats con shape:
    //   stats.team_stats = { source:'db', home:{...}, away:{...},
    //                        projected_corners_total?, projected_goals_total? }
    // Los valores son numbers reales (no strings).
    "15. TEAM_STATS (BD interna): Si Stats incluye `team_stats` con source='db', esos son datos reales de nuestra base por equipo. USALOS como fuente PRIMARIA y cita el valor numerico exacto en la nota cuando apliques.",
    "15a. FUTBOL — team_stats.home/away contiene: corners_for_avg, corners_against_avg, btts_pct, over_25_pct, goals_for_avg, goals_against_avg, clean_sheets_pct, form_last_5. Mercado BTTS: aprueba SOLO si home.btts_pct >= 60 Y away.btts_pct >= 60 (citalos). Mercado Goles Over 2.5: aprueba si over_25_pct promedio >= 60 O projected_goals_total >= 2.8. Mercado Corners: ver regla 10b.",
    "15b. BEISBOL (MLB/LMB) — team_stats.home/away contiene: era_team, era_bullpen, ops_team, ops_vs_lhp, ops_vs_rhp, runs_for_avg, runs_against_avg. Run Line +1.5 visitante (regla 3c): SOLO conf >= 65 si home.era_bullpen > 4.50 explicito (citalo). Mercado ML: usa ops_vs_lhp/rhp del bateo del rival vs mano del abridor. Totales: cita runs_for_avg + era_bullpen de ambos.",
    "15c. BASKETBALL (NBA) — team_stats.home/away contiene: pace, off_rating, def_rating, points_for_avg, points_against_avg. Totales Over linea L: requiere (home.pace + away.pace) / 2 >= 100 Y suma off_rating + def_rating del rival favorable. Cita pace exacto en nota. Sin pace de ambos: conf MAX 60 (regla 12).",
    "15d. HOCKEY (NHL/IIHF) — team_stats.home/away contiene: goals_for_per_game, goals_against_per_game, power_play_pct, penalty_kill_pct. Totales (goles): cita goals_for_per_game de ambos. Puck Line: PP% del favorito > 22 favorece -1.5. Sin power_play_pct/PK%: conf totales MAX 62.",
    "15e. REGLA TRANSVERSAL — Si team_stats esta AUSENTE para este evento (no aparece la clave o source != 'db'), conf MAX GLOBAL en todos los mercados de este evento = 65. Esto es deliberado: en la ultima semana el 100% de picks 75+% sin team_stats fallaron.",
    `Criterios prioritarios para ${sportCfg.label}:`,
    ...sportCfg.criteria,
    buildSportContextAdendum(event),
  ].filter(Boolean).join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sportCfg.label}`,
    `Fecha: ${date}`,
    // team_stats viene primero y entero (no se trunca); el resto se corta a 4000
    ...(stats?.team_stats ? [`team_stats (BD, prioritario): ${JSON.stringify(stats.team_stats)}`] : ["team_stats: NO DISPONIBLE — aplica regla 15e (conf MAX 65 en todos los mercados)"]),
    stats && Object.keys(stats).length ? `Stats restantes: ${JSON.stringify({ ...stats, team_stats: undefined }).slice(0, 4000)}` : "Stats: limitados",
    perfBlock ? `\n${perfBlock}` : "",
    insuranceBlock ? `\n${insuranceBlock}` : "",
    `Analiza los 5 mercados de ${sportCfg.label} usando SOLO la informacion disponible.`,
    "Si Stats incluye odds para un mercado, evalua el Expected Value y prefiere mercados con valor positivo.",
    "Si no hay datos suficientes para un mercado, baja confianza y explica brevemente.",
    "Mantén EXACTAMENTE el JSON descrito en el sistema; no agregues campos.",
  ].filter(Boolean).join("\n");

  try {
    if (OPENAI_WEB_SEARCH_ENABLED) {
      const instructions = [
        systemPrompt,
        `Debes consultar la web para buscar informacion reciente del partido de ${sportCfg.label}.`,
        "Busca lesiones, bajas, forma reciente, rendimiento local/visita, H2H y odds o lineas de mercado.",
        "Si la web no confirma un dato, no lo inventes.",
        "Usa la busqueda web para complementar Stats, no para contradecirlos sin explicarlo.",
      ].join(" ");
      const webInput = [`${userPrompt}`, "", "Consulta online informacion reciente y util del evento."].join("\n");
      try {
        const { content, model: webModel } = await callOpenAiWebSearchOnce({ apiKey, model: OPENAI_WEB_SEARCH_MODEL, instructions, input: webInput });
        const parsed = extractJsonObject(content);
        if (parsed) return { ...parsed, provider: `openai-web-${webModel}` };
      } catch {
        // fallback to standard below
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS + 10000);
    let content = "";
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.3, max_tokens: 800, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const rawText = await response.text().catch(() => "");
      if (!response.ok) throw new Error(`openai_${response.status}`);
      const data = rawText ? JSON.parse(rawText) : {};
      content = safeStr(data?.choices?.[0]?.message?.content);
    } catch {
      clearTimeout(timer);
      return mkFallback();
    }
    const parsed = extractJsonObject(content);
    if (!parsed) return mkFallback();
    return { ...parsed, provider: `openai-${model}` };
  } catch {
    return mkFallback();
  }
}

// ── Claude: independent second-pass review + choose best market ──
async function claudeDecideMarket({ event = {}, gptMarkets = {}, publishedToday = [], stats = {}, historyPicks = [] } = {}) {
  const apiKey = safeStr(process.env.ANTHROPIC_API_KEY);
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "").toLowerCase();
  // Sports where a draw/empate is NOT a valid outcome
  const noDrawSport = ["baseball","beisbol","basketball","baloncesto","hockey","tennis","tenis","nfl","americano"].some(s => sport.includes(s));

  const mkFallbackDecide = () => {
    const opts = [
      { key: "1X2", d: gptMarkets.ml },
      { key: "Goles", d: gptMarkets.goles },
      { key: "BTTS", d: gptMarkets.btts },
      { key: "Handicap", d: gptMarkets.handicap },
      { key: "Corners", d: gptMarkets.corners },
    ];
    const best = opts.reduce((a, b) => ((b.d?.conf || 0) > (a.d?.conf || 0) ? b : a), opts[0]);
    const pick = best.d?.pick || "—";
    const mercado = best.key;
    // derive safe pick from the fallback best
    let safe_pick = pick;
    let safe_mercado = mercado;
    const golesMatch = pick.match(/^(Over|Under)\s+([\d.]+)/i);
    const cornersMatch = mercado === "Corners" && pick.match(/^Over\s+([\d.]+)/i);
    if (mercado === "1X2" || mercado === "ML") {
      if (!noDrawSport) {
        // Soccer: DC 1X (local+empate) only. If pick is the away team, use goles or keep ML — X2 DC has 25% WR.
        const pickIsHome = pick.toLowerCase().includes("local") || pick.toLowerCase().includes(home.toLowerCase());
        if (pickIsHome) {
          safe_pick = `${home} o Empate`;
          safe_mercado = "Doble Oportunidad";
        } else {
          // Away team picked — use goles Over if available, else keep ML
          const g = gptMarkets.goles;
          if (g?.pick?.match(/^Over/i) && (g.conf || 0) >= 62) {
            safe_pick = g.pick; safe_mercado = "Goles";
          } else {
            safe_pick = pick; // same ML, no X2 DC
          }
        }
      } else if (sport.includes("baseball") || sport.includes("beisbol")) {
        // Baseball — no draw. Use conservative run total if available, else keep ML
        const g = gptMarkets.goles;
        const m = g?.pick?.match(/^(Over|Under)\s+([\d.]+)/i);
        if (m) {
          const dir = m[1].toLowerCase() === "over" ? "Over" : "Under";
          const val = parseFloat(m[2]);
          safe_pick = dir === "Over" ? `Over ${val - 0.5} carreras` : `Under ${val + 0.5} carreras`;
          safe_mercado = "Goles";
        } else {
          safe_pick = pick;
        }
      } else if (sport.includes("basketball") || sport.includes("baloncesto")) {
        // Basketball — safe: use Over/Under total (independent of winner).
        // NEVER use handicap/spread as safe for ML: spread requires winning by X+ which is
        // HARDER than just winning (ML). Total is truly independent and easier to defend.
        const g = gptMarkets.goles;
        if (g?.pick) {
          safe_pick = g.pick.includes("pts") ? g.pick : g.pick + " pts";
          safe_mercado = "Goles";
        } else {
          safe_pick = pick;
        }
      } else {
        // Hockey, NFL, tennis — no draw. Prefer spread/handicap if available, else keep ML
        const h = gptMarkets.handicap;
        if (h?.pick) {
          safe_pick = h.pick;
          safe_mercado = "Handicap";
        } else {
          safe_pick = pick;
        }
      }
    } else if (mercado === "BTTS" && /si/i.test(pick)) {
      // Over 0.5 goles has terrible odds (~1.10). Use Over 1.5 (~1.50) or GPT goles pick
      const g = gptMarkets.goles;
      if (g?.pick?.match(/^Over/i)) {
        safe_pick = g.pick; safe_mercado = "Goles";
      } else {
        safe_pick = `Over 1.5 goles`; safe_mercado = "Goles";
      }
    } else if (mercado === "Doble Oportunidad" || mercado === "DC") {
      // DC covers win+draw — safe must be EASIER, not ML (which is harder).
      // Use Over 1.5 goles (both teams attacking = goals likely, ~1.50 odds)
      // or GPT goles Over pick if available
      const g = gptMarkets.goles;
      if (g?.pick?.match(/^Over/i)) {
        safe_pick = g.pick; safe_mercado = "Goles";
      } else {
        safe_pick = `Over 1.5 goles`; safe_mercado = "Goles";
      }
    } else if (mercado === "Handicap") {
      // Handicap safe: reduce the line by 0.5 to make it less demanding
      const lineMatch = pick.match(/([-+]?\d+\.?\d*)/);
      if (lineMatch) {
        const line = parseFloat(lineMatch[1]);
        const isMinus = line < 0;
        const saferLine = isMinus ? (line + 0.5).toFixed(1) : (line - 0.5).toFixed(1);
        safe_pick = pick.replace(lineMatch[0], saferLine);
      } else {
        safe_pick = gptMarkets.ml?.pick || pick;
        safe_mercado = gptMarkets.ml?.pick ? "1X2" : mercado;
      }
    } else if (cornersMatch) {
      const val = parseFloat(cornersMatch[1]);
      safe_pick = `Over ${val - 1}.5 corners`;
    } else if (golesMatch) {
      const dir = golesMatch[1].toLowerCase();
      const val = parseFloat(golesMatch[2]);
      // For basketball totals: prefer spread (better odds than shifting line)
      if (sport.includes("basketball") || sport.includes("baloncesto")) {
        const h = gptMarkets.handicap;
        if (h?.pick && h?.conf >= 50) {
          safe_pick = h.pick; safe_mercado = "Handicap";
        } else {
          // Shift only 0.5 for basketball (221.5 → 222 is minimal but acceptable)
          safe_pick = dir === "over" ? `Over ${val - 0.5} pts` : `Under ${val + 0.5} pts`;
        }
      } else if (sport.includes("baseball") || sport.includes("beisbol")) {
        // Baseball lines move in 0.5 increments (8.5 → 8.0/9.0 are valid)
        safe_pick = dir === "over" ? `Over ${val - 0.5} carreras` : `Under ${val + 0.5} carreras`;
      } else {
        // Soccer lines are always X.5 — shift by 1 to stay on valid lines (2.5 → 1.5/3.5)
        safe_pick = dir === "over" ? `Over ${val - 1} goles` : `Under ${val + 1} goles`;
      }
    }
    return {
      mercado, pick, confianza: best.d?.conf || 50, riesgo: "MEDIO",
      razonamiento: "Seleccion por maxima confianza (Claude no disponible).", tipo: "moderada",
      safe_pick, safe_mercado, safe_confianza: Math.min(100, (best.d?.conf || 50) + 10), safe_riesgo: "BAJO",
      safe_razonamiento: "Version mas conservadora del mismo mercado.", model: "fallback",
    };
  };

  if (!apiKey) return mkFallbackDecide();

  const marketsText = [
    `1X2 (ML): ${gptMarkets.ml?.pick} — Conf: ${gptMarkets.ml?.conf}% — ${gptMarkets.ml?.nota}`,
    `Goles: ${gptMarkets.goles?.pick} — Conf: ${gptMarkets.goles?.conf}% — ${gptMarkets.goles?.nota}`,
    `BTTS: ${gptMarkets.btts?.pick} — Conf: ${gptMarkets.btts?.conf}% — ${gptMarkets.btts?.nota}`,
    `Handicap: ${gptMarkets.handicap?.pick} (${gptMarkets.handicap?.line}) — Conf: ${gptMarkets.handicap?.conf}% — ${gptMarkets.handicap?.nota}`,
    `Corners: ${gptMarkets.corners?.pick} — Conf: ${gptMarkets.corners?.conf}% — ${gptMarkets.corners?.nota}`,
  ].join("\n");

  const publishedText = publishedToday.length
    ? publishedToday.map((p) => `${p.market}: ${p.pick} (riesgo: ${p.riskLevel})`).join(", ")
    : "Ninguno aun";

  const systemPrompt = [
    "Eres el selector de picks de Momentum Ascent.",
    "GPT-4o ya analizo 5 mercados de un partido.",
    "Tu rol NO es aceptar ciegamente ese analisis: debes hacer una segunda lectura independiente del evento y contrastarla contra GPT.",
    "Evalua lesiones, bajas, forma de los ultimos 5 partidos, rendimiento local/visita, H2H y odds si existen en Stats.",
    "Luego elige el mercado que mas conviene publicar y genera una version SEGURA DIFERENTE.",
    `Deporte: ${safeStr(event.sport || "futbol")}. Liga: ${league}.`,
    noDrawSport
      ? "IMPORTANTE: Este deporte NO tiene empates. Nunca uses 'Doble Oportunidad' ni 'o Empate' en el pick ni en safe_pick."
      : "Este deporte puede tener empate (futbol/soccer). Doble Oportunidad es valida cuando hay genuina incertidumbre.",
    "=== REGLAS DE VERSION SEGURA (CRITICAS) ===",
    "REGLA ABSOLUTA 1: El safe_pick NUNCA puede ser identico al pick normal (mismo mercado + mismo pick). Siempre debe ser un mercado o linea DIFERENTE.",
    "REGLA ABSOLUTA 2: safe_confianza SIEMPRE debe ser MAYOR que confianza del pick normal. El pick seguro es mas facil de acertar — si no puedes asignarle mayor confianza, elige otro safe.",
    "REGLA ABSOLUTA 3: El safe_pick debe tener momios con valor real (cuota estimada >= 1.35). NO muevas lineas de totals tan lejos que los momios sean -300 o peores. Si el safe conservador de ese mercado tiene cuota < 1.35, cambia a un mercado diferente con mejores momios. Ejemplos de safe con buenos momios: spread/handicap (~1.87), primera mitad ML, Over 1.5 goles (~1.55). Ejemplos de safe con MALOS momios (prohibidos): Under 224 pts en basketball (cuota ~1.15), DC de equipo dominante (cuota ~1.08).",
    noDrawSport
      ? [
          "Reglas safe por deporte (sin empate):",
          "- Normal=ML beisbol: safe = el pick 'goles' de GPT (Over/Under carreras) si la nota menciona ERA. Si no hay ERA: safe = el spread/run line de GPT si disponible, sino el pick de goles AS-IS aunque no haya ERA (es diferente al ML).",
          "- Normal=ML basketball: safe = Over/Under puntos de GPT AS-IS (mercado independiente del ganador, cuota ~1.87). NUNCA uses Handicap/spread como safe de ML — el spread exige ganar por X+ puntos que es MAS dificil que solo ganar (ML). El Over/Under total es verdaderamente independiente y mas facil de defender.",
          "- Normal=ML hockey/NFL/tenis: safe = spread/handicap de GPT si disponible. Si no: ML mismo equipo, subir conf 5pp.",
          "- Normal=Goles Over X.5: safe = Over (X-0.5) mismas unidades, conf +5pp. Verifica que cuota estimada >= 1.40.",
          "- Normal=Goles Under X.5: safe = Under (X+0.5) mismas unidades, conf +5pp. Si Under (X+0.5) tendria cuota < 1.35 (linea muy baja), usa spread/handicap o primera mitad en su lugar.",
          "- Normal=Handicap: safe = misma direccion con linea 0.5 mas conservadora (ej: -5.5 → -5.0, o +3.5 → +4.0), conf +5pp. Si la linea ajustada tendria momios < 1.35, usa ML del mismo equipo.",
        ].join(" ")
      : [
          "Reglas safe por mercado (futbol/soccer):",
          "- Normal=ML (1X2 ganador) LOCAL: safe = 'Local o Empate' (DC 1X), conf +8pp. Normal=ML (1X2 ganador) VISITANTE: safe = Over/Under goles de GPT si conf >= 62%, sino mismo ML visitante con conf +5pp — NUNCA X2 DC (visitante+empate) como safe: win rate historico 25%.",
          "- Normal=DC (Doble Oportunidad): safe DEBE SER DIFERENTE y MAS FACIL. DC ya cubre win+draw, algo mas facil seria Over 1.5 goles (~1.50 odds) o el Over de GPT si hay confianza. NUNCA uses ML como safe de DC (ML es mas dificil que DC).",
          "- Normal=Goles Over X.5: safe = Over (X-1).5, conf +8pp.",
          "- Normal=Goles Under X.5: safe = Under (X+1).5, conf +8pp.",
          "- Normal=BTTS Si: safe = Over 1.5 goles (~1.50 odds) o el Over de GPT si disponible. NUNCA Over 0.5 goles (momios ~1.10, sin valor).",
          "- Normal=Handicap -X: safe = handicap -X+0.5, conf +5pp.",
          "- Normal=Corners Over X.5: safe = Over (X-1).5, conf +5pp.",
        ].join(" "),
    "=== REGLAS DE SELECCION DE MERCADO NORMAL ===",
    noDrawSport
      ? "1. ML cuando la ventaja es moderada y los momios dan valor (cuota estimada >= 1.45). Si el favorito es tan claro que su ML tiene cuota < 1.40, prefiere Over/Under, Spread o Handicap — mejor valor. NOTA: Handicap rinde 71% WR historico (15-6) en esta plataforma, considéralo cuando ML está castigado por cuota muy baja."
      : "1. ML o DC solo si la ventaja es MODERADA y los momios son razonables (cuota ML >= 1.40, DC >= 1.20). Si el favorito es tan aplastante que ML o DC tendrian cuotas castigadas, prefiere Goles Over/Under o Handicap asiatico. PRIORIDAD HISTORICA (rev 2026-06-01): DC y Doble Oportunidad rinden 100% WR (8-0) en esta plataforma cuando aplican (favorito LOCAL con cuota ML entre 1.30 y 1.70). Si el contexto cumple ese rango, prefiere DC 1X sobre ML directo — mejor valor + mejor WR observado.",
    "2. BTTS: PROHIBIDO salvo que GPT mencione EXPLICITAMENTE que ambos equipos anotaron en 7+ de sus ultimos 8 partidos. Sin ese dato exacto, descarta BTTS — win rate historico 0% cuando se publica sin datos solidos.",
    "3. Handicap/Spread: REGLA REVISADA (rev 2026-06-01) — historico actualizado de esta plataforma muestra 71% WR (15-6, conf prom 70.4%). Reglas:",
    "   3a. Handicap es mercado VIABLE cuando hay ventaja clara: H2H >= 6/10 a favor + forma reciente 3-2 o mejor + diferencia de nivel o motivación clara.",
    "   3b. Cuando ML del favorito tiene cuota < 1.40 (favorito muy claro), Handicap asiático -0.5/-1.5 da mejor valor que ML directo. NO descartes por defecto en partidos asimétricos.",
    "   3c. Run Line +1.5 visitante (MLB): SOLO si bullpen del local es flojo (ERA bullpen > 4.0) o el local viene de 2+ derrotas. Sin esa evidencia, conf MAX 65 — caso Reds-Braves +1.5 dom 31 falló al 70% sin evidencia.",
    "   3d. Si todos los criterios fallan (sin H2H, sin forma, sin contexto), descarta Handicap.",
    "4b. Corners: SOLO elige Corners como mercado normal si gptMarkets.corners.conf >= 65 Y la nota de GPT cita un promedio numérico de corners para ambos equipos (ej. 'Local 6.5/partido, Visit 4.8/partido'). Sin esa cita explícita, NUNCA elijas Corners. Histórico: 1 pick en 337 (0% WR) — el mercado es de baja confiabilidad sin data específica.",
    // ── DATA OBLIGATORIA DESDE team_stats (rev 2026-06-01) ────────────
    // Las stats vienen ahora desde BD en stats.team_stats con source='db'.
    // El juez DEBE leer esos campos antes de aprobar mercados dependientes.
    "4c. CORNERS via team_stats: PROHIBIDO aprobar pick de Corners sin citar `stats.team_stats.home.corners_for_avg` Y `stats.team_stats.away.corners_against_avg` en razonamiento. Si esos campos faltan en stats, RECHAZA Corners y elige otro mercado. Si `stats.team_stats.projected_corners_total` existe, valida linea: Over X.5 requiere projected >= X+0.5; Under X.5 requiere projected <= X-0.5; diferencia < 1 corner = RECHAZA. Si projected diverge >= 2 corners de la linea, Corners es candidato fuerte (conf hasta 75).",
    "4d. GOLES futbol via team_stats: si `stats.team_stats.projected_goals_total` existe, valida: Over 2.5 requiere projected >= 2.8; Under 2.5 requiere projected <= 2.2. Cita el numero en razonamiento.",
    "4e. BTTS via team_stats: aprueba SOLO si stats.team_stats.home.btts_pct >= 60 Y stats.team_stats.away.btts_pct >= 60 (cita ambos %). Sin esos campos, RECHAZA BTTS (regla 2 reforzada).",
    "4. Totales beisbol: elige Over/Under si la nota de GPT menciona ERA o pitch de cualquier lanzador. Si stats.team_stats.home.era_bullpen o away.era_bullpen existen, citalos. Sin ninguna mencion de ERA y sin era_bullpen en team_stats, elige ML.",
    "5. Totales basketball: elige Over/Under si la nota menciona pace o ritmo. Si stats.team_stats.home.pace Y away.pace existen, citalos en razonamiento (ej. 'pace 101.3 vs 99.8'). Sin pace en team_stats ni en nota, prefiere ML.",
    "5b. Totales hockey: cita stats.team_stats.home.power_play_pct y penalty_kill_pct si existen. Over goles requiere PP% combinado >= 22 o PK% combinado <= 78.",
    "5c. team_stats AUSENTE: si stats.team_stats no esta o source != 'db' para el deporte de este evento, confianza MAX FINAL del pick elegido = 65 (todos los mercados). Esto refleja que sin data real, el modelo descalibra (semana 2026-05-25 a 2026-06-01: 100% WR perdedora en picks 75+ sin team_stats).",
    noDrawSport
      ? "6. MMA CRITICO: en peleas de MMA el mercado Corners = metodo de victoria (KO/TKO/SUB) — win rate historico 0%. PROHIBIDO elegir Corners en MMA. Usa SOLO ML (ganador de la pelea) o Goles (Over/Under de rondas). Si GPT da alta conf a Corners en MMA, elige ML del mismo peleador. Para Over/Under beisbol o totales con favorito muy claro: Over/Under es el mercado con mejor valor."
      : "6. DC REGLA CRITICA: DC solo cuando el equipo favorecido es LOCAL (resultado = '1X', local+empate). Si el equipo favorecido es VISITANTE, usa ML directo — NUNCA X2 DC (visitante+empate): win rate historico X2 DC = 25% vs 100% de DC 1X. DC tampoco aplica si el favorito es tan dominante que ML < 1.40 — prefiere Over/Under.",
    "7. Si ML y Goles tienen confianza similar (diferencia <= 5pp) Y hay un favorito claro, elige Goles por mejor valor de momios.",
    "7b. En futbol europeo (soccer), Over/Under Goles solo si conf GPT en ese mercado especifico >= 65%. Con conf < 65% en goles, prefiere ML o DC 1X.",
    `8. DIVERSIDAD: Picks ya publicados hoy: [${publishedText}]. Si ya hay 2+ picks de ML o DC hoy, prefiere Goles u otro mercado si confianza es similar (diferencia <= 6pp).`,
    "9. VALOR: No publiques si tu conf (ej 65%) esta por debajo de la probabilidad implicita en los momios (ej 75% = cuota 1.33) — pick sin valor. Busca mercados donde tu conf supere los momios.",
    "Responde SOLO JSON valido:",
    '{"mercado":"1X2|Goles|BTTS|Handicap|Corners","pick":"pick normal exacto","confianza":65,"riesgo":"BAJO|MEDIO|ALTO","razonamiento":"2-3 oraciones","tipo":"segura|moderada|arriesgada","safe_pick":"pick DIFERENTE al normal","safe_mercado":"mercado del safe","safe_confianza":73,"safe_riesgo":"BAJO","safe_razonamiento":"por que es mas facil de acertar"}',
    "VALIDACION FINAL antes de responder: (1) safe_pick != pick? (2) safe_confianza > confianza? (3) safe no es BTTS ni Handicap exotico? (4) Si deporte=MMA y mercado=Corners → cambia a ML. (5) Si futbol y safe es X2 DC (visitante+empate) → cambia a ML directo del visitante o goles. Si alguna falla, corrige antes de responder.",
    "Si GPT puso conf >= 70 en BTTS o Handicap sin datos estadisticos, baja esa confianza 15pp.",
    // ── Cap de confidence por descalibración semanal (2026-06-01) ────
    // Banda 75-79% conf: 0W-2L. Banda 80+%: 0W-1L (Fluminense U3.5).
    // Banda 60-64% conf: 17W-5L (77%). El modelo está sobreestimando.
    // Regla dura: solo confidence ≥ 75 si hay 3+ evidencias numéricas
    // específicas citadas en analysis (ej. forma 4-1, H2H 8-2, ERA 2.4).
    // Sin esas 3+ evidencias, confidence MAX = 72.
    "CALIBRACIÓN OBLIGATORIA (semana 2026-05-25 a 2026-06-01): confidence ≥ 75 solo si analysis cita al menos 3 evidencias numéricas independientes (forma, H2H, stat de mercado, lesión, etc.). Sin esas 3 evidencias, confidence MAX = 72. Confidence ≥ 80 está PROHIBIDA salvo evidencia abrumadora (>=5 datos numéricos y mercado de bajo riesgo). En la última semana, 100% de los picks 75+% fallaron — sé conservador.",
    // ── Cap DURO 75+ (rev 2026-06-02, post-fallo Barracas TOP 1) ────────
    "CALIBRACIÓN REFORZADA (martes 2-jun): el TOP 1 Barracas Over 1.5 al 75% PERDIÓ con razonamiento genérico ('es poco frecuente que termine 0-0', sin números). Tu razonamiento DEBE contener al menos 3 números concretos (X.Y, X-Y, X%, formato ERA/OPS/pace/promedio) para justificar confianza ≥ 75. Frases genéricas como 'suelen anotar', 'es difícil que falle', 'estadísticamente probable' NO valen. Si GPT te pasa un pick con conf >= 75 pero su nota no tiene 3 números, BAJA la confianza a 72 en tu output. SIN EXCEPCIONES.",
    // ── Cup sudamericano Over 1.5 (rev 2026-06-02) ────────────────────
    "REGLA CUP SUDAMERICANA: en Copa Argentina / Copa Libertadores / Copa Sudamericana, Over 1.5 goles tiene 25% WR (1-3) últimos 7 días. Cap confidence MAX = 62 en este mercado-liga combo salvo que el razonamiento cite goals_for_avg de AMBOS equipos de team_stats con suma >= 2.8 (entonces MAX = 70). Sin esa cita: descarta Over 1.5 en cup sudamericana, prefiere ML o handicap.",
    // ── Amistosos TIER B (rev 2026-06-02) ─────────────────────────────
    "REGLA AMISTOSOS TIER B: si la liga es 'Int. Friendly Games' y NINGUNO de los equipos es selección top-25 FIFA (lista mental: Spain/France/England/Belgium/Netherlands/Portugal/Italy/Germany/Croatia/Switzerland/Denmark/Austria/Sweden/Czechia/Norway/Poland/Serbia/Argentina/Brazil/Uruguay/Colombia/Mexico/USA/Chile/Peru/Ecuador/Morocco/Senegal/Egypt/Tunisia/Nigeria/Cameroon/Cape Verde/Japan/South Korea/Iran/Australia/Saudi Arabia), cap confidence MAX = 63. Caso 2-jun: Haiti-NZ, Wales-Ghana, Bulgaria-Montenegro 0W-3L recientes.",
    "tipo refleja el equilibrio del portafolio. NO prometas ganancias.",
  ].join(" ");

  // Build performance context — try to surface the GPT-top market WR if relevant
  const topMarketKey = (() => {
    const opts = [
      { key: "ml", conf: gptMarkets.ml?.conf || 0 },
      { key: "over_under", conf: gptMarkets.goles?.conf || 0 },
      { key: "btts", conf: gptMarkets.btts?.conf || 0 },
      { key: "handicap", conf: gptMarkets.handicap?.conf || 0 },
      { key: "corners", conf: gptMarkets.corners?.conf || 0 },
    ];
    return opts.sort((a, b) => b.conf - a.conf)[0]?.key || "";
  })();
  const perfCtxDecide = buildPerformanceContext(historyPicks, { league: event.league, market: topMarketKey });
  const perfBlockDecide = perfCtxDecide ? `\n${perfCtxDecide.promptText}\n` : "";
  const streakInsuranceDecide = shouldApplyStreakInsurance(historyPicks);
  const insuranceBlockDecide = streakInsuranceDecide.active ? streakInsuranceDecide.instruction : "";

  // team_stats se extrae primero y se sirve íntegro (regla 4c-5c lo exige).
  // El resto del stats se trunca como antes pero ya sin team_stats duplicado.
  const teamStatsBlock = stats?.team_stats
    ? `team_stats (BD, source=${stats.team_stats.source || "?"}): ${JSON.stringify(stats.team_stats)}`
    : "team_stats: NO DISPONIBLE — aplica regla 5c (conf MAX 65)";
  const userPromptParts = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Contexto: ${safeStr(gptMarkets.resumen || "")}`,
    ``,
    teamStatsBlock,
    `Stats restantes: ${stats && Object.keys(stats).length ? JSON.stringify({ ...stats, team_stats: undefined }).slice(0, 3200) : "limitados"}`,
    ``,
    `Analisis GPT-4o por mercado:`,
    marketsText,
    ``,
    `Picks publicados hoy: ${publishedText}`,
  ];
  if (perfBlockDecide) {
    userPromptParts.push("");
    userPromptParts.push(perfBlockDecide.trim());
  }
  if (insuranceBlockDecide) {
    userPromptParts.push("");
    userPromptParts.push(insuranceBlockDecide);
  }
  userPromptParts.push("");
  userPromptParts.push(`Si en Stats o en las notas hay odds (cuotas) para algun mercado, evalua el Expected Value (tu prob = conf/100 vs prob implicita = 1/odds) y prefiere mercados con valor positivo.`);
  userPromptParts.push(`Haz una segunda validacion independiente usando los Stats y compara contra GPT antes de decidir.`);
  userPromptParts.push(`Elige el mejor mercado para publicar. Sin relleno.`);
  userPromptParts.push(`Mantén EXACTAMENTE el JSON descrito en el sistema; no agregues campos.`);
  const userPrompt = userPromptParts.join("\n");

  try {
    const { content, model } = await callClaudeOnce({ apiKey, systemPrompt, userPrompt, maxTokens: 1200 });
    const parsed = extractJsonObject(content);
    if (!parsed) {
      console.error("[claudeDecideMarket] JSON parse failed. Raw response length:", content?.length, "| preview:", content?.slice(0, 200));
      throw new Error("claude_invalid_json");
    }
    // ── Hard-cap calibración 2026-06-01 ──────────────────────────────
    // Aunque el prompt ya pide MAX=72 sin 3 evidencias, validamos en
    // código contando "evidencias numéricas" como una heurística: si
    // el razonamiento NO menciona al menos 3 números (forma 4-1, ERA
    // 2.4, H2H, %, etc.), forzamos confianza ≤ 72.
    const rawConf = Math.max(0, Math.min(100, Number(parsed.confianza || 60)));
    const razon = safeStr(parsed.razonamiento) + " " + safeStr(parsed.pick);
    const numericMentions = (razon.match(/\d+(?:[.,]\d+)?/g) || []).length;
    const confianza = rawConf >= 75 && numericMentions < 3 ? 72 : rawConf;
    // Confidence ≥ 80 está prohibida salvo 5+ evidencias numéricas
    const confianzaFinal = confianza >= 80 && numericMentions < 5 ? 75 : confianza;

    return {
      mercado: safeStr(parsed.mercado) || "1X2",
      pick: safeStr(parsed.pick),
      confianza: confianzaFinal,
      riesgo: normalizeRiskLevel(parsed.riesgo || "MEDIO"),
      razonamiento: safeStr(parsed.razonamiento) || "Claude selecciono el mercado con mayor fundamento.",
      tipo: safeStr(parsed.tipo) || "moderada",
      safe_pick: safeStr(parsed.safe_pick) || "",
      safe_mercado: safeStr(parsed.safe_mercado) || "",
      safe_confianza: Math.max(0, Math.min(100, Number(parsed.safe_confianza || 75))),
      safe_riesgo: "BAJO",
      safe_razonamiento: safeStr(parsed.safe_razonamiento) || "",
      model,
    };
  } catch (err) {
    console.error("[claudeDecideMarket] Claude failed:", err?.message || String(err));
    return mkFallbackDecide();
  }
}

// ── Claude: generate Reto Escalera from scouted events ───────────────────
async function generateRetoEscalera({ events = [], inversion = 500, meta = 5000, gptMarketsMap = {} } = {}) {
  const apiKey = safeStr(process.env.ANTHROPIC_API_KEY);

  // Build odds target — how many legs of what odds do we need
  const ratio = meta / inversion;
  // prefer 3-4 legs; choose based on ratio
  const suggestedLegs = ratio <= 6 ? 3 : 4;
  const targetOddsPerLeg = Math.pow(ratio, 1 / suggestedLegs);

  const mkFallback = () => ({
    legs: events.slice(0, suggestedLegs).map((ev, i) => ({
      legIndex: i,
      eventId: ev.id,
      match: `${ev.homeTeam || ev.home_team} vs ${ev.awayTeam || ev.away_team}`,
      league: ev.league,
      sport: ev.sport,
      eventDate: ev.eventDate,
      market: "1X2",
      pick: ev.homeTeam || ev.home_team || "Local",
      odds: parseFloat(targetOddsPerLeg.toFixed(2)),
      confidence: 60,
      analysis: "Selección automática por defecto.",
      result: null,
    })),
    combinedOdds: parseFloat(Math.pow(targetOddsPerLeg, suggestedLegs).toFixed(2)),
    projectedWin: parseFloat((inversion * Math.pow(targetOddsPerLeg, suggestedLegs)).toFixed(2)),
    analysis: `Reto de ${suggestedLegs} legs generado automáticamente. Inversión: $${inversion} · Meta: $${meta}.`,
    legsNeeded: suggestedLegs,
    feasible: true,
    alert: "",
  });

  if (!apiKey || !events.length) return mkFallback();

  // Build per-event context with real stats and odds
  const eventsContext = events.map((ev) => {
    const home = safeStr(ev.homeTeam || ev.home_team);
    const away = safeStr(ev.awayTeam || ev.away_team);
    const sportCfg = getSportMarketConfig(safeStr(ev.sport), home, away);
    const gptM = gptMarketsMap[ev.id] || null;

    // ISO date passed directly — no toLocaleString to avoid ICU bugs
    const dateStr = ev.eventDate ? ev.eventDate.slice(0, 16).replace("T", " ") + " UTC" : "—";

    const gptSummary = gptM
      ? [
          `ML: ${gptM.ml?.pick || "—"} (${gptM.ml?.conf || "—"}%)`,
          `Totales: ${gptM.goles?.pick || "—"} (${gptM.goles?.conf || "—"}%)`,
          `BTTS/Equiv: ${gptM.btts?.pick || "—"} (${gptM.btts?.conf || "—"}%)`,
          `Handicap: ${gptM.handicap?.pick || "—"} (${gptM.handicap?.conf || "—"}%)`,
          `Corners/Equiv: ${gptM.corners?.pick || "—"} (${gptM.corners?.conf || "—"}%)`,
          `Resumen: ${gptM.resumen || "sin resumen"}`,
        ].join(" | ")
      : "SIN análisis GPT — selecciona el mercado más seguro según deporte";

    // Real stats from DB (form, H2H, injuries, etc.)
    const stats = ev.statsJson && typeof ev.statsJson === "object" ? ev.statsJson : null;
    const statsLines = [];
    if (stats) {
      if (stats.homeForm) statsLines.push(`Forma ${home}: ${Array.isArray(stats.homeForm) ? stats.homeForm.join("-") : stats.homeForm}`);
      if (stats.awayForm) statsLines.push(`Forma ${away}: ${Array.isArray(stats.awayForm) ? stats.awayForm.join("-") : stats.awayForm}`);
      if (stats.h2h) statsLines.push(`H2H: ${typeof stats.h2h === "object" ? JSON.stringify(stats.h2h) : stats.h2h}`);
      if (stats.homeGoalsAvg) statsLines.push(`Goles/pts promedio ${home}: ${stats.homeGoalsAvg}`);
      if (stats.awayGoalsAvg) statsLines.push(`Goles/pts promedio ${away}: ${stats.awayGoalsAvg}`);
      if (stats.homePointsAvg) statsLines.push(`Puntos promedio ${home}: ${stats.homePointsAvg}`);
      if (stats.awayPointsAvg) statsLines.push(`Puntos promedio ${away}: ${stats.awayPointsAvg}`);
      if (stats.injuries) statsLines.push(`Bajas: ${JSON.stringify(stats.injuries)}`);
      if (stats.seriesNote || stats.seriesRecord) statsLines.push(`Serie: ${stats.seriesNote || stats.seriesRecord}`);
      // Include any other top-level keys
      Object.entries(stats).forEach(([k, v]) => {
        if (!["homeForm","awayForm","h2h","homeGoalsAvg","awayGoalsAvg","homePointsAvg","awayPointsAvg","injuries","seriesNote","seriesRecord","venue","leagueRound"].includes(k)) {
          statsLines.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
        }
      });
    }
    const statsStr = statsLines.length ? statsLines.join(" | ") : "—";

    // Real odds from bookmakers / oddsSnapshot
    const rawJson = ev.rawJson && typeof ev.rawJson === "object" ? ev.rawJson : null;
    const oddsLines = [];
    if (rawJson?.bookmakers && Array.isArray(rawJson.bookmakers)) {
      rawJson.bookmakers.slice(0, 2).forEach((bm) => {
        const bmName = bm.title || bm.key || "Casa";
        (bm.markets || []).slice(0, 3).forEach((mkt) => {
          const outcomes = (mkt.outcomes || []).map((o) => `${o.name} @${o.price}`).join(", ");
          oddsLines.push(`${bmName}/${mkt.key}: ${outcomes}`);
        });
      });
    }
    if (rawJson?.oddsSnapshot && typeof rawJson.oddsSnapshot === "object") {
      Object.entries(rawJson.oddsSnapshot).forEach(([k, v]) => oddsLines.push(`${k}: ${JSON.stringify(v)}`));
    }
    const oddsStr = oddsLines.length ? oddsLines.join(" | ") : "—";

    return [
      `[${ev.id}] ${sportCfg.label} | ${ev.league} | ${home} vs ${away} | ${dateStr}`,
      `Mercados disponibles (${sportCfg.label}): ${sportCfg.markets}`,
      `Stats DB: ${statsStr}`,
      `Momios casas: ${oddsStr}`,
      `Análisis GPT: ${gptSummary}`,
    ].join("\n");
  }).join("\n\n");

  const systemPrompt = [
    "Eres un analista senior de apuestas deportivas especializado en parlays/escaleras para una plataforma premium.",
    "Tu objetivo: generar el RETO ESCALERA óptimo con los eventos disponibles.",
    "REGLAS DE SELECCIÓN (críticas — afectan win rate del parlay):",
    "1. Usa los stats y momios reales si están disponibles (marcados con '—' cuando no los hay). Si hay momios de casas, úsalos en 'odds'; si no, estima un valor realista para ese mercado.",
    "2. Para cada leg elige el mercado MÁS PREDECIBLE del deporte: fútbol→handicap asiático o totales; basketball→spread o totales; baseball→run line o totales; hockey→puck line o totales.",
    "3. PROHIBIDO usar 1X2 / Moneyline VISITANTE como leg de escalera — es históricamente el mercado más volátil y mata parlays. Si el favorito es visitante, usa handicap del favorito en lugar de ML.",
    "4. PREFIERE en este orden de estabilidad: (a) Under en totales de favorito local, (b) Handicap asiático -0.5/-1 del favorito local, (c) BTTS Sí en partidos con ambos ofensivos, (d) ML del favorito local con cuota ≤1.65, (e) Over totales solo cuando hay evidencia clara de ambos ofensivos.",
    "5. CADA LEG debe tener confidence ≥ 65. Si no encuentras 3 legs con confidence ≥ 65, devuelve feasible:false con alert explicando qué falta.",
    "6. IIHF Hockey: NO uses spread protector (+1.5) del Tier B. Si Tier A (Canadá, USA, Suecia, Finlandia, Chequia, Rusia, Suiza) juega contra Tier B, prefiere ML o Over.",
    "7. NBA Playoffs: PREFIERE Under totales sobre Over — la defensa también sube en playoffs. Si la serie está 3-3 (Game 7), evita ese partido para el reto (alta varianza).",
    "8. El campo 'analysis' debe ser CORTO: máximo 2 oraciones directas con el argumento principal (tendencia, racha, ventaja clara). OBLIGATORIO citar un stat numérico específico (ej. '8/10 victorias casa', 'ERA 2.4', 'pace 102'). NO menciones qué datos faltan.",
    "9. El campo 'odds' debe ser el momio decimal real si está disponible; si no, estimado realista (handicap asiático ≈1.85-1.95, run line ≈1.80-1.90, totales ≈1.88).",
    "10. El campo 'eventDate' en el JSON debe ser el ISO UTC exacto del evento tal como se proporcionó en el contexto.",
    `Inversión: $${inversion} MXN · Meta: $${meta} MXN · Ratio objetivo: ${ratio.toFixed(2)}x.`,
    `Sugiere entre 3 y 4 legs. Con ${suggestedLegs} legs necesitarías odds de ~${targetOddsPerLeg.toFixed(2)} por leg.`,
    "Si los eventos no alcanzan para la meta, pon feasible:false y explica en alert.",
    "Responde SOLO JSON sin texto adicional:",
    '{"legs":[{"legIndex":0,"eventId":N,"match":"X vs Y","league":"Liga","sport":"sport","eventDate":"ISO-UTC-exacto","market":"nombre mercado","pick":"pick exacto","odds":1.85,"confidence":70,"analysis":"1-2 oraciones directas: argumento principal del pick"}],"combinedOdds":X.XX,"projectedWin":XXXX,"analysis":"1 oración: por qué este parlay es sólido","legsNeeded":N,"feasible":true,"alert":""}',
  ].join(" ");

  const userPrompt = `Genera el Reto Escalera óptimo. Para cada leg: elige el mercado más predecible del deporte, da un análisis corto y directo (máximo 2 oraciones con el argumento central), y estima un momio decimal realista.\n\n${eventsContext}\n\nInversión: $${inversion} · Meta: $${meta} · Elige los mejores ${suggestedLegs} legs.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: safeStr(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
      }),
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) throw new Error(`anthropic_${response.status}`);
    const data = rawText ? JSON.parse(rawText) : {};
    const content = safeStr(data?.content?.[0]?.text);
    const parsed = extractJsonObject(content);
    if (!parsed || !Array.isArray(parsed.legs)) return mkFallback();

    // Post-filter de seguridad: descartar legs que violen reglas de estabilidad
    // (1X2 visitante / confidence < 65). El modelo debería respetar las reglas,
    // pero validamos en código para evitar parlays débiles.
    const unstableLegs = parsed.legs.filter((l) => !isStablePickForParlay(l));
    if (unstableLegs.length > 0) {
      const reasons = unstableLegs.map((l) => `${l.match || "leg"} (${l.market}/${l.pick}, conf ${l.confidence})`).join("; ");
      parsed.alert = (parsed.alert ? parsed.alert + " · " : "") + `Legs descartados por baja estabilidad: ${reasons}.`;
      parsed.legs = parsed.legs.filter((l) => isStablePickForParlay(l));
      if (parsed.legs.length < 2) {
        parsed.feasible = false;
        parsed.alert = (parsed.alert + " Insuficientes legs estables para armar el reto.").trim();
      } else {
        // Recalcular combined odds tras filtrar
        parsed.combinedOdds = parseFloat(parsed.legs.reduce((acc, l) => acc * Number(l.odds || 1), 1).toFixed(2));
        parsed.projectedWin = parseFloat((inversion * parsed.combinedOdds).toFixed(2));
      }
    }

    // Ensure leg results are null
    parsed.legs = parsed.legs.map((l, i) => ({ ...l, legIndex: i, result: null }));
    parsed.projectedWin = parsed.projectedWin || parseFloat((inversion * (parsed.combinedOdds || 1)).toFixed(2));
    return parsed;
  } catch {
    return mkFallback();
  }
}

// ── GPT: scout/rank day events — which ones are best to analyze ───────────
async function scoutDayEventsGPT(events = []) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o";

  const mkFallback = () => ({
    recommended: events.slice(0, 3).map((ev, i) => ({
      eventId: ev.id,
      priority: i === 0 ? "high" : "medium",
      reason: "Liga de alto nivel seleccionada por defecto.",
    })),
    summary: "Selección automática — sin clave OpenAI.",
  });
  if (!apiKey || !events.length) return mkFallback();

  const list = events
    .map((ev) => {
      const sport = safeStr(ev.sport || "football").toUpperCase();
      const time = ev.eventDate ? new Date(ev.eventDate).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "—";
      return `[${ev.id}] ${sport} | ${safeStr(ev.league)} | ${safeStr(ev.homeTeam || ev.home_team)} vs ${safeStr(ev.awayTeam || ev.away_team)} | ${time}`;
    })
    .join("\n");

  const systemPrompt = [
    "Eres un analista senior de apuestas deportivas. Recibes una lista de eventos del día.",
    "Identifica cuáles ofrecen las mejores oportunidades basándote en: importancia y prestigio de la liga, predictibilidad del resultado, valor de mercado esperado y variedad deportiva.",
    "Prioriza: Champions, NBA, Premier, LaLiga, NFL, MLB sobre ligas menores.",
    "Selecciona entre 1 y 5 eventos máximo. Solo incluye los que realmente valen la pena analizar.",
    "Responde SOLO JSON válido sin texto adicional:",
    '{"recommended":[{"eventId":N,"priority":"high|medium","reason":"1 oración corta"}],"summary":"1 oración del panorama del día"}',
  ].join(" ");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Eventos del día:\n${list}\n\nIdentifica los mejores para apostar hoy.` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const rawText = await response.text().catch(() => "");
    if (!response.ok) throw new Error(`openai_${response.status}`);
    const data = rawText ? JSON.parse(rawText) : {};
    const content = safeStr(data?.choices?.[0]?.message?.content);
    const parsed = content ? JSON.parse(content) : null;
    if (parsed?.recommended) return parsed;
    return mkFallback();
  } catch {
    return mkFallback();
  }
}

module.exports = {
  generateAiPlan,
  buildFallbackPlan,
  buildPerformanceContext,
  calculateExpectedValue,
  shouldApplyStreakInsurance,
  selectTopPicksOfDay,
  generateSportsPick,
  generateMultiplePicksGPT,
  selectBestPickWithClaude,
  runDualAnalysis,
  analyzeMarketsGPT,
  claudeDecideMarket,
  scoutDayEventsGPT,
  generateRetoEscalera,
  // Exposed for testing and for ad-hoc scripts (no behavioral change)
  isStablePickForParlay,
  buildSportContextAdendum,
  getIIHFMatchupTier,
  IIHF_TIER_A_TEAMS,
  IIHF_TIER_B_PLUS_TEAMS,
  // CONMEBOL / Brasileirão tiers (rev 2026-06-01)
  getConmebolMatchupTier,
  isConmebolEvent,
  isBrasileiraoEvent,
  LIBERTADORES_TIER_A_TEAMS,
  LIBERTADORES_TIER_B_TEAMS,
  SUDAMERICANA_TIER_A_TEAMS,
  LIBERTADORES_HIGH_ALTITUDE_HOMES,
  BRASILEIRAO_TOP_TEAMS,
  getEventHourCDMX,
  // Auto-classifier de fail_reason_tags (rev 2026-06-01)
  autoClassifyFailTags,
};

// ════════════════════════════════════════════════════════════════
// Auto-classifier de fail_reason_tags (rev 2026-06-01)
// ════════════════════════════════════════════════════════════════
// Cuando un pick se marca como "lost" en /api/picks/:id/result, este helper
// genera automáticamente un set de tags de categoría para alimentar el
// análisis semanal y los adendums futuros del prompt.
//
// Razones:
// - Antes de esto, fail_reason_tags estaba vacío en 100% de los fallos (0/25
//   en la semana del 25-may al 01-jun).
// - Sin tags, el análisis semanal solo podía cruzar por liga/mercado a mano.
// - Con tags automáticos, podemos detectar patrones tipo "mlb_unders_nocturno"
//   o "conf_75plus" sin intervención manual.
function autoClassifyFailTags({ pick, market, confidence, riskLevel, league, sport, eventDate } = {}) {
  const tags = [];
  const conf = Number(confidence) || 0;
  const lg = String(league || "").toLowerCase();
  const mk = String(market || "").toLowerCase();
  const pk = String(pick || "").toLowerCase();
  const sp = String(sport || "").toLowerCase();
  const rk = String(riskLevel || "").toUpperCase();

  // ── Calibración de confianza (banda crítica detectada en análisis 06-01)
  if (conf >= 80) tags.push("conf_80plus");
  else if (conf >= 75) tags.push("conf_75_79");
  else if (conf >= 70) tags.push("conf_70_74");
  else if (conf >= 65) tags.push("conf_65_69");
  else if (conf >= 60) tags.push("conf_60_64");
  else tags.push("conf_low");

  // ── Por liga
  if (lg.includes("libertadores")) tags.push("conmebol_libertadores");
  if (lg.includes("sudamericana")) tags.push("conmebol_sudamericana");
  if (lg.includes("brasileir")) tags.push("brasileirao");
  if (lg.includes("iihf")) tags.push("iihf");
  if (lg.includes("nba")) tags.push("nba");
  if (lg.includes("nhl")) tags.push("nhl");
  if (lg.includes("mlb")) tags.push("mlb");
  if (lg.includes("liga mexicana") || lg.startsWith("lmb")) tags.push("lmb");
  if (lg.includes("friendly")) tags.push("friendly_international");
  if (lg.includes("mls")) tags.push("mls");
  if (lg.includes("dimayor")) tags.push("liga_dimayor");
  if (lg.includes("repechaje") || lg.includes("relegation")) tags.push("repechaje");
  if (lg.includes("liga mx") || lg === "liga mx") tags.push("liga_mx");
  if (lg.includes("champions league")) tags.push("uefa_champions");
  if (lg.includes("copa argentina")) tags.push("copa_argentina");
  if (lg.includes("ligue 1")) tags.push("ligue_1");
  if (lg.includes("eliteserien")) tags.push("eliteserien");
  if (lg.includes("eredivisie")) tags.push("eredivisie");
  if (lg.includes("serie a")) tags.push("serie_a");
  if (lg.includes("laliga") || lg === "la liga" || lg === "la_liga") tags.push("laliga");
  if (lg.includes("premier league")) tags.push("premier_league");
  if (lg.includes("bundesliga")) tags.push("bundesliga");

  // ── Por mercado
  if (mk.includes("1x2") || mk === "ml") {
    tags.push("market_1x2");
    if (pk.includes("visit") || pk.match(/\b(visitor|visitante|away)\b/i)) tags.push("ml_visitante");
    else if (pk.match(/\b(local|home)\b/i)) tags.push("ml_local");
  }
  if (mk.includes("dc") || mk.includes("doble oportunidad") || /\b(1x|x2)\b/i.test(pk) || pk.includes("local o empate") || pk.includes("visitante o empate")) {
    tags.push("market_dc");
    if (pk.includes("1x") || pk.includes("local o empate")) tags.push("dc_1x");
    if (pk.includes("x2") || pk.includes("visitante o empate")) tags.push("dc_x2");
  }
  if (mk.includes("gol") || mk.includes("total") || pk.includes("over") || pk.includes("under")) {
    tags.push("market_goles");
    if (pk.includes("over")) tags.push("market_over");
    if (pk.includes("under")) tags.push("market_under");
    // Detectar línea alta NBA (más de 220 pts) — caso del cap 67
    const nbaOverMatch = pk.match(/over\s+(\d+(?:\.\d+)?)\s*(?:pts|puntos)?/i);
    if (sp === "basketball" && nbaOverMatch) {
      const total = Number(nbaOverMatch[1]);
      if (total >= 220) tags.push("nba_over_220plus");
    }
    // IIHF Over 5.5+ caso especial (la "bomba" del 82%)
    if (lg.includes("iihf") && pk.includes("over") && /5\.5|6\.5|7\.5/.test(pk)) tags.push("iihf_over_55plus");
  }
  if (mk.includes("handicap") || mk.includes("run line") || mk.includes("puck line") || mk.includes("spread")) {
    tags.push("market_handicap");
    if (pk.includes("visit") || /[+]\d+\.5/.test(pk)) tags.push("handicap_visitante");
    if (pk.includes("local") || /[-]\d+\.5/.test(pk)) tags.push("handicap_local");
    // MLB Run Line +1.5 visitante (caso Reds-Braves dom 31)
    if (sp === "baseball" && pk.includes("visit") && pk.includes("+1.5")) tags.push("mlb_rl_visitante_plus15");
  }
  if (mk.includes("btts") || pk.includes("ambos anotan") || pk.includes("btts")) tags.push("market_btts");
  if (mk.includes("corners")) tags.push("market_corners");

  // ── Hora del kickoff CDMX (patrones detectados)
  if (eventDate) {
    try {
      const dt = new Date(eventDate);
      if (!isNaN(dt.getTime())) {
        const hourCDMX = (dt.getUTCHours() + 24 - 6) % 24; // CDMX = UTC-6
        if (sp === "baseball" && pk.includes("under") && hourCDMX >= 19) {
          tags.push("mlb_unders_nocturno"); // ≥19:00 CDMX caso Giants/Dodgers Unders mar 26
        }
        if (sp === "basketball" && pk.includes("over") && hourCDMX >= 19) {
          tags.push("nba_overs_nocturno");
        }
        if (hourCDMX >= 22 || hourCDMX < 6) tags.push("late_night_cdmx");
        if (hourCDMX >= 6 && hourCDMX < 12) tags.push("morning_cdmx");
        if (hourCDMX >= 12 && hourCDMX < 18) tags.push("afternoon_cdmx");
        if (hourCDMX >= 18 && hourCDMX < 22) tags.push("evening_cdmx");
      }
    } catch (_) {}
  }

  // ── Por nivel de riesgo
  if (rk) tags.push(`risk_${rk.toLowerCase()}`);

  // ── Combinaciones críticas detectadas en análisis semanal
  if (conf >= 70 && rk === "BAJO") tags.push("top_candidate");
  if (lg.includes("brasileir") && mk.includes("1x2")) tags.push("brasileirao_1x2"); // patrón dom 31 (3/4 fallaron)
  if (lg.includes("libertadores") && mk.includes("1x2") && (pk.includes("visit") || /\b(visitor|visitante|away)\b/i.test(pk))) {
    tags.push("libertadores_ml_visitante");
  }
  if (lg.includes("libertadores") && (mk.includes("gol") || mk.includes("total"))) {
    if (pk.includes("over")) tags.push("libertadores_over");
    if (pk.includes("under")) tags.push("libertadores_under"); // caso Fluminense U3.5 al 82% (bomba mié 27)
  }
  // Caso especial: pick de alta confianza en Libertadores que falla
  // (patrón mié 27: Fluminense 82%, Caracas 76%, Ind. del Valle 72%, Corinthians 70%)
  if (lg.includes("libertadores") && conf >= 70) tags.push("libertadores_high_conf");
  if (lg.includes("friendly") && conf < 70) tags.push("friendly_low_conf");

  // ── Patrones nuevos rev 2026-06-02 (post-fallo martes 2-jun) ──────────
  // MLB Overs línea 7.5+ (no solo nocturno): 1W-2L últimos 7 días
  if (sp.includes("baseball") && lg.includes("mlb") && pk.includes("over")) {
    const mlbOverMatch = pk.match(/over\s+(\d+(?:\.\d+)?)/i);
    if (mlbOverMatch && Number(mlbOverMatch[1]) >= 7.5) tags.push("mlb_overs_7_5_plus");
  }
  // Cup match sudamericano Over 1.5 (Copa Argentina / Libertadores cup): 1W-3L últimos 7
  if ((lg.includes("copa argentina") || lg.includes("libertadores") || lg.includes("sudamericana"))
      && pk.includes("over") && /1\.5/.test(pk)) {
    tags.push("cup_sudamerica_over_15");
  }
  // Amistoso TIER B (ninguno top-25 FIFA): 0W-3L últimos 14
  if (lg.includes("friendly")) {
    const FRIENDLY_TIER_A_TAGS = new Set([
      "spain","españa","france","francia","england","inglaterra","belgium","bélgica","belgica",
      "netherlands","holanda","portugal","italy","italia","germany","alemania","croatia","croacia",
      "switzerland","suiza","denmark","dinamarca","austria","sweden","suecia","czechia",
      "czech republic","norway","noruega","poland","polonia","ukraine","ucrania","serbia",
      "argentina","brazil","brasil","uruguay","colombia","mexico","méxico","usa","united states",
      "chile","peru","perú","ecuador","canada","canadá","morocco","marruecos","senegal","egypt",
      "egipto","tunisia","túnez","tunez","algeria","argelia","nigeria","cameroon","ivory coast",
      "cape verde","cabo verde","japan","japón","japon","south korea","corea del sur","iran",
      "irán","australia","saudi arabia","arabia saudita","qatar",
    ]);
    // No tenemos home_team/away_team aquí, pero podemos detectar por pick si menciona equipos
    // — heurística: si la liga es friendly y el conf < 70, es candidato TIER B
    if (conf >= 60 && conf < 70) tags.push("friendly_possibly_tier_b");
  }

  // De-duplicar y retornar
  return Array.from(new Set(tags));
}
