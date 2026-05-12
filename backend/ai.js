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

async function analyzeMarketsGPT({ event = {}, stats = {} } = {}) {
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
    "10. Handicap asiatico: Solo asigna conf >= 65 si hay una ventaja clara de forma (al menos 4-1 en ultimos 5 partidos) o diferencia significativa de nivel. Sin ese dato, pon conf <= 58.",
    "11. Totales en beisbol: La conf del mercado goles debe reflejar ERA del pitcher abridor. Si no tienes ERA en Stats, pon conf <= 55 en goles y explica que falta el pitcher.",
    "12. Totales en basketball: Incluye pace (ritmo de juego) de ambos equipos si esta en Stats. Sin pace, conf del total no debe superar 60.",
    "13. Antes de asignar cualquier conf >= 70: lista mentalmente 2 factores en contra del pick. Si existen 2 o mas factores en contra, reduce conf entre 8 y 12 puntos.",
    `Criterios prioritarios para ${sportCfg.label}:`,
    ...sportCfg.criteria,
  ].join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sportCfg.label}`,
    `Fecha: ${date}`,
    stats && Object.keys(stats).length ? `Stats: ${JSON.stringify(stats).slice(0, 3200)}` : "Stats: limitados",
    `Analiza los 5 mercados de ${sportCfg.label} usando SOLO la informacion disponible.`,
    "Si no hay datos suficientes para un mercado, baja confianza y explica brevemente.",
  ].join("\n");

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
async function claudeDecideMarket({ event = {}, gptMarkets = {}, publishedToday = [], stats = {} } = {}) {
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
      ? "1. ML cuando la ventaja es moderada y los momios dan valor (cuota estimada >= 1.45). Si el favorito es tan claro que su ML tiene cuota < 1.40, prefiere Over/Under o Spread — mejor valor."
      : "1. ML o DC solo si la ventaja es MODERADA y los momios son razonables (cuota ML >= 1.40, DC >= 1.20). Si el favorito es tan aplastante que ML o DC tendrian cuotas castigadas, prefiere Goles Over/Under o Handicap asiatico.",
    "2. BTTS: PROHIBIDO salvo que GPT mencione EXPLICITAMENTE que ambos equipos anotaron en 7+ de sus ultimos 8 partidos. Sin ese dato exacto, descarta BTTS — win rate historico 0% cuando se publica sin datos solidos.",
    "3. Handicap/Spread: solo si se cumplen TODOS estos criterios: H2H >= 8/10 a favor del equipo, forma actual 4-1 o mejor en ultimos 5, y confianza del mercado >= 70%. Sin todos estos datos verificados, descarta Handicap — win rate historico 33% en este sistema.",
    "4. Totales beisbol: elige Over/Under si la nota de GPT menciona ERA o pitch de cualquier lanzador. Sin ninguna mencion de ERA, elige ML.",
    "5. Totales basketball: elige Over/Under si la nota menciona pace o ritmo. Sin pace, prefiere ML.",
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
    "tipo refleja el equilibrio del portafolio. NO prometas ganancias.",
  ].join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Contexto: ${safeStr(gptMarkets.resumen || "")}`,
    ``,
    `Stats disponibles: ${stats && Object.keys(stats).length ? JSON.stringify(stats).slice(0, 3200) : "limitados"}`,
    ``,
    `Analisis GPT-4o por mercado:`,
    marketsText,
    ``,
    `Picks publicados hoy: ${publishedText}`,
    ``,
    `Haz una segunda validacion independiente usando los Stats y compara contra GPT antes de decidir.`,
    `Elige el mejor mercado para publicar. Sin relleno.`,
  ].join("\n");

  try {
    const { content, model } = await callClaudeOnce({ apiKey, systemPrompt, userPrompt, maxTokens: 1200 });
    const parsed = extractJsonObject(content);
    if (!parsed) {
      console.error("[claudeDecideMarket] JSON parse failed. Raw response length:", content?.length, "| preview:", content?.slice(0, 200));
      throw new Error("claude_invalid_json");
    }
    return {
      mercado: safeStr(parsed.mercado) || "1X2",
      pick: safeStr(parsed.pick),
      confianza: Math.max(0, Math.min(100, Number(parsed.confianza || 60))),
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
    "REGLAS DE SELECCIÓN:",
    "1. Usa los stats y momios reales si están disponibles (marcados con '—' cuando no los hay). Si hay momios de casas, úsalos en 'odds'; si no, estima un valor realista para ese mercado.",
    "2. Para cada leg elige el mercado MÁS PREDECIBLE del deporte: fútbol→handicap asiático o totales; basketball→spread o totales; baseball→run line o totales; hockey→puck line o totales.",
    "3. El campo 'analysis' debe ser CORTO: máximo 2 oraciones directas con el argumento principal (tendencia histórica, posición en tabla, racha, contexto del juego). NO menciones qué datos faltan ni de dónde vienen las estimaciones.",
    "4. El campo 'odds' debe ser el momio decimal real si está disponible; si no, estimado realista (handicap asiático ≈1.85-1.95, run line ≈1.80-1.90, totales ≈1.88).",
    "5. El campo 'eventDate' en el JSON debe ser el ISO UTC exacto del evento tal como se proporcionó en el contexto.",
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
  generateSportsPick,
  generateMultiplePicksGPT,
  selectBestPickWithClaude,
  runDualAnalysis,
  analyzeMarketsGPT,
  claudeDecideMarket,
  scoutDayEventsGPT,
  generateRetoEscalera,
};
