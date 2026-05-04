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
async function generateMultiplePicksGPT({ event = {}, stats = {}, historicalContext = [] } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o";
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "deporte");
  const date = safeStr(event.event_date || event.eventDate || "");

  if (!apiKey) return buildFallbackMultiplePicks({ event, stats });

  const systemPrompt = [
    "Eres un analista deportivo experto para un servicio informativo de picks deportivos.",
    "Para el evento indicado, genera EXACTAMENTE 3 picks en mercados DISTINTOS.",
    "Responde SOLO JSON valido con esta estructura exacta:",
    '{"picks":[{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."},{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."},{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"...","disclaimer":"Contenido informativo. No garantiza ganancias."}]}',
    "Reglas:",
    "- Los 3 picks DEBEN ser en mercados diferentes (ej: 1X2, Over/Under, Ambos marcan, Handicap, BTTS, Double Chance)",
    "- analysis: 3-4 oraciones en espanol con razonamiento estadistico claro, usando los datos disponibles",
    "- confidence: entero 0-100 segun solidez de datos. Si faltan datos, baja confidence y explicalo",
    "- NO prometas ganancias. NO uses 'seguro', 'garantizado', 'apuesta segura'",
    "- market debe ser el nombre tecnico del mercado en ingles o espanol (ej: 1X2, over_under, both_teams_score, handicap)",
  ].join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sport}`,
    `Fecha: ${date}`,
    `Estado: ${safeStr(event.status || "scheduled")}`,
    `\nEstadisticas disponibles:\n${JSON.stringify(stats || {}).slice(0, 4000)}`,
    `\nContexto historico (ultimos picks del sistema):\n${JSON.stringify(historicalContext || []).slice(0, 1500)}`,
    `\nGenera exactamente 3 picks en mercados completamente diferentes. Cada pick necesita analisis completo con razonamiento coherente con los datos disponibles.`,
  ].join("\n");

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
async function selectBestPickWithClaude({ event = {}, candidates = [] } = {}) {
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

  const systemPrompt = [
    "Eres un analista deportivo senior. Tu rol es JUEZ: evalua picks generados por GPT-4o y elige el MEJOR.",
    "Criterios de evaluacion:",
    "1. Solidez del razonamiento estadistico con los datos disponibles",
    "2. Coherencia entre confianza numerica, nivel de riesgo y analisis escrito",
    "3. Valor real del mercado sugerido para el tipo de evento",
    "4. Precision y claridad del analisis en espanol",
    "Responde SOLO JSON valido con esta estructura:",
    '{"selected_index":0,"reasoning":"Explicacion breve y directa de por que este pick es superior (2-4 oraciones en espanol)","confidence_adjustment":0,"final_pick":{"pick":"...","market":"...","confidence":0,"risk_level":"BAJO|MEDIO|ALTO","analysis":"Analisis refinado o mejorado del pick seleccionado","disclaimer":"Contenido informativo. No garantiza ganancias."}}',
    "selected_index: 0, 1 o 2 (indice base-0 del candidato elegido)",
    "confidence_adjustment: entero entre -10 y +10 que ajusta la confianza del pick elegido",
    "final_pick: version refinada del pick seleccionado, puedes mejorar el analisis manteniendo el mercado y pick base",
    "NO prometas ganancias. NO uses 'seguro', 'garantizado'.",
  ].join(" ");

  const candidatesText = candidates
    .map((c, i) => [`--- Candidato ${i + 1} ---`, `Mercado: ${c.market}`, `Pick: ${c.pick}`, `Confianza GPT: ${c.confidence}%`, `Riesgo GPT: ${c.risk_level}`, `Analisis: ${c.analysis}`].join("\n"))
    .join("\n\n");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sport}`,
    `Fecha: ${date}`,
    ``,
    `Picks candidatos generados por GPT-4o:`,
    candidatesText,
    ``,
    `Evalua los ${candidates.length} candidatos y elige el mejor con razonamiento claro.`,
  ].join("\n");

  try {
    const { content, model } = await callClaudeOnce({ apiKey, systemPrompt, userPrompt, maxTokens: 1200 });
    const parsed = extractJsonObject(content);
    if (!parsed) throw new Error("claude_invalid_json");

    const selectedIndex = Math.max(0, Math.min(candidates.length - 1, Number(parsed.selected_index ?? 0)));
    const selectedCandidate = candidates[selectedIndex] || candidates[0];
    const rawFinal = parsed.final_pick || {};

    return {
      selectedIndex,
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
async function runDualAnalysis({ event = {}, stats = {}, historicalContext = [] } = {}) {
  const candidates = await generateMultiplePicksGPT({ event, stats, historicalContext });
  const claudeResult = await selectBestPickWithClaude({ event, candidates });
  return { candidates, claudeResult };
}

module.exports = {
  generateAiPlan,
  buildFallbackPlan,
  generateSportsPick,
  generateMultiplePicksGPT,
  selectBestPickWithClaude,
  runDualAnalysis,
};
