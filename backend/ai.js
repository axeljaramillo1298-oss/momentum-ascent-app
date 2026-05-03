const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = Math.max(5_000, Number(process.env.OPENAI_TIMEOUT_MS || 25_000));
const OPENAI_MAX_OUTPUT_TOKENS = Math.max(250, Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 900));
const OPENAI_MAX_PROMPT_CHARS = Math.max(300, Number(process.env.OPENAI_MAX_PROMPT_CHARS || 700));
const OPENAI_MAX_CONTEXT_CHARS = Math.max(800, Number(process.env.OPENAI_MAX_CONTEXT_CHARS || 3500));
const OPENAI_MAX_USERS_PER_CALL = Math.max(1, Number(process.env.OPENAI_MAX_USERS_PER_CALL || 3));
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
      : "Modo respaldo coach + IA, listo para editar antes de asignar.";

  return {
    provider: "fallback",
    sport: basePlan.sportLabel,
    routineText: [basePlan.routineText, `Destino: ${names}.`, providerNote].filter(Boolean).join("\n"),
    dietText: [basePlan.dietText, context ? `Contexto aplicado: ${safeStr(context).slice(0, 220)}.` : ""].filter(Boolean).join("\n"),
    messageText: basePlan.messageText || `Momentum check: ${names}, ya tienes plan asignado. Ejecuta hoy y reporta check-in.`,
  };
};

const normalizeRiskLevel = (value) => {
  const normalized = safeStr(value).toUpperCase();
  if (normalized === "BAJO" || normalized === "MEDIO" || normalized === "ALTO") return normalized;
  return "MEDIO";
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

  const coachStyle = mode === "ai_only" ? "coach IA directo" : "coach IA con validacion de admin";
  const userSummary = users
    .map((u, idx) => `${idx + 1}. ${safeStr(u.name) || "User"} | ${safeStr(u.email)} | plan:${safeStr(u.plan) || "n/a"}`)
    .join("\n");

  const systemPrompt = [
    "Eres un coach fitness y nutricion para una app.",
    "Debes responder SOLO JSON valido con esta estructura:",
    '{"routineText":"...","dietText":"...","messageText":"..."}',
    "Texto en espanol, concreto, orientado a ejecucion diaria.",
    "No uses markdown.",
  ].join(" ");

  const userPrompt = [
    `Modo: ${coachStyle}.`,
    `Usuarios:\n${userSummary || "Sin usuarios especificos"}`,
    `Objetivo del admin: ${prompt || "Plan general de recomposicion corporal"}`,
    `Contexto extra: ${context || "Sin contexto"}`,
    "Genera rutina y dieta aplicables desde hoy.",
    "messageText debe ser corto para WhatsApp y tono firme.",
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

async function generateSportsPick({ event = {}, stats = {}, historicalContext = [] } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const fallbackModels = String(process.env.OPENAI_MODEL_FALLBACKS || "")
    .split(",")
    .map((v) => safeStr(v))
    .filter(Boolean);

  if (!apiKey) {
    return buildFallbackSportsPick({ event, stats, historicalContext });
  }

  const systemPrompt = [
    "Eres un analista de picks deportivos para un MVP informativo.",
    "Debes responder SOLO JSON valido con esta estructura exacta:",
    '{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO | MEDIO | ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."}',
    "No prometas ganancias.",
    "No uses palabras como seguro, garantizado o apuesta garantizada.",
    "Si hay pocos datos, reduce confidence y dilo claramente.",
    "analysis debe ser breve, claro y entendible en espanol.",
  ].join(" ");

  const userPrompt = [
    `Evento: ${safeStr(event.league)} | ${safeStr(event.home_team || event.homeTeam)} vs ${safeStr(event.away_team || event.awayTeam)}.`,
    `Deporte: ${safeStr(event.sport)}.`,
    `Fecha: ${safeStr(event.event_date || event.eventDate)}.`,
    `Estado: ${safeStr(event.status)}.`,
    `Stats JSON: ${JSON.stringify(stats || {}).slice(0, OPENAI_MAX_CONTEXT_CHARS)}`,
    `Contexto historico: ${JSON.stringify(historicalContext || []).slice(0, OPENAI_MAX_CONTEXT_CHARS)}`,
    "Elige un mercado razonable segun los datos disponibles.",
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

module.exports = {
  generateAiPlan,
  buildFallbackPlan,
  generateSportsPick,
};
