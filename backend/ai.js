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

// ── GPT: analyze 5 key betting markets — short and direct ──────────────
async function analyzeMarketsGPT({ event = {}, stats = {} } = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o";
  const home = safeStr(event.home_team || event.homeTeam || "Local");
  const away = safeStr(event.away_team || event.awayTeam || "Visita");
  const league = safeStr(event.league || "Liga");
  const sport = safeStr(event.sport || "futbol");
  const date = safeStr(event.event_date || event.eventDate || "");

  const mkFallback = () => ({
    ml: { pick: home, conf: 55, nota: "Favorito local por localia." },
    goles: { pick: "Over 2.5", conf: 52, nota: "Promedio de goles del torneo." },
    btts: { pick: "Si", conf: 50, nota: "Ambos equipos tienen capacidad ofensiva." },
    handicap: { pick: `${home} -0.5`, line: "-0.5", conf: 48, nota: "Leve ventaja local." },
    corners: { pick: "Over 9.5", conf: 45, nota: "Ritmo de juego abierto esperado." },
    resumen: `${home} vs ${away} — analisis con datos limitados.`,
    provider: "fallback",
  });

  if (!apiKey) return mkFallback();

  const systemPrompt = [
    "Eres un analista deportivo senior enfocado en picks informativos para una plataforma premium de apuestas deportivas con IA.",
    "Para el evento dado, analiza EXACTAMENTE 5 mercados clave de forma corta, directa y basada en datos.",
    "Responde SOLO JSON valido con esta estructura exacta:",
    '{"ml":{"pick":"Local|Empate|Visitante","conf":65,"nota":"max 1 oracion"},"goles":{"pick":"Over 2.5|Under 2.5","conf":60,"nota":"max 1 oracion"},"btts":{"pick":"Si|No","conf":55,"nota":"max 1 oracion"},"handicap":{"pick":"descripcion del handicap","line":"0.5|1|etc","conf":58,"nota":"max 1 oracion"},"corners":{"pick":"Over 9.5|Under 9.5","conf":52,"nota":"max 1 oracion"},"resumen":"1 oracion de contexto del partido"}',
    "Reglas obligatorias:",
    "1. No prometas ganancias.",
    "2. No uses palabras como seguro, garantizado, apuesta segura o free money.",
    "3. La confianza debe ser un entero de 0 a 100.",
    "4. Cada nota debe ser corta, directa y basada en datos.",
    "5. Si faltan datos relevantes, reduce la confianza y dilo de forma breve.",
    "6. No inventes lesiones, odds, bajas ni resultados.",
    "7. Usa primero los datos entregados en Stats.",
    "8. Si hay datos de lesiones, bajas, forma reciente, head-to-head, rendimiento local/visita u odds, debes considerarlos obligatoriamente.",
    "9. Evalua patrones en los ultimos 5 partidos de cada equipo si esa informacion esta disponible.",
    "10. Si odds y estadistica se contradicen, reflejalo con menor confianza.",
    "11. Da prioridad a coherencia estadistica sobre narrativas.",
    "12. El resumen final debe mencionar de forma compacta que factores pesaron mas.",
    "Criterios de analisis por orden:",
    "1. Forma ultimos 5 partidos.",
    "2. Lesiones o bajas relevantes.",
    "3. Rendimiento local/visita.",
    "4. Historial H2H si existe.",
    "5. Odds disponibles y movimientos si existen.",
    "6. Produccion ofensiva/defensiva o tendencia de totales/corners si existe.",
  ].join(" ");

  const userPrompt = [
    `Evento: ${league} | ${home} vs ${away}`,
    `Deporte: ${sport}`,
    `Fecha: ${date}`,
    stats && Object.keys(stats).length ? `Stats: ${JSON.stringify(stats).slice(0, 3200)}` : "Stats: limitados",
    "Instruccion:",
    "Analiza los 5 mercados usando SOLO la informacion disponible.",
    "Si hay forma reciente, lesiones, bajas, odds snapshot, rendimiento local/visita o H2H, incorporalos explicitamente en la logica de cada mercado.",
    "Si no hay datos suficientes para algun mercado, baja confianza.",
  ].join("\n");

  try {
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

  const mkFallbackDecide = () => {
    const opts = [
      { key: "1X2", d: gptMarkets.ml },
      { key: "Goles", d: gptMarkets.goles },
      { key: "BTTS", d: gptMarkets.btts },
      { key: "Handicap", d: gptMarkets.handicap },
      { key: "Corners", d: gptMarkets.corners },
    ];
    const best = opts.reduce((a, b) => ((b.d?.conf || 0) > (a.d?.conf || 0) ? b : a), opts[0]);
    return { mercado: best.key, pick: best.d?.pick || "—", confianza: best.d?.conf || 50, riesgo: "MEDIO", razonamiento: "Seleccion por maxima confianza (Claude no disponible).", tipo: "moderada", model: "fallback" };
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
    "Luego elige el mercado que mas conviene publicar, considerando fundamento estadistico y balance del portafolio del dia.",
    "Responde SOLO JSON valido con esta estructura:",
    '{"mercado":"1X2|Goles|BTTS|Handicap|Corners","pick":"el pick exacto","confianza":72,"riesgo":"BAJO|MEDIO|ALTO","razonamiento":"2-3 oraciones en espanol explicando la decision","tipo":"segura|moderada|arriesgada"}',
    "Debes validar si GPT exagero confianza o ignoro riesgos; si encuentras contradicciones entre stats y GPT, corrige a la baja.",
    "Si falta informacion util, reduce confianza y dilo.",
    "tipo refleja el equilibrio del portafolio: si ya hay picks seguros propone algo con mas valor y viceversa.",
    "NO prometas ganancias.",
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
    const { content, model } = await callClaudeOnce({ apiKey, systemPrompt, userPrompt, maxTokens: 600 });
    const parsed = extractJsonObject(content);
    if (!parsed) throw new Error("claude_invalid_json");
    return {
      mercado: safeStr(parsed.mercado) || "1X2",
      pick: safeStr(parsed.pick),
      confianza: Math.max(0, Math.min(100, Number(parsed.confianza || 60))),
      riesgo: normalizeRiskLevel(parsed.riesgo || "MEDIO"),
      razonamiento: safeStr(parsed.razonamiento) || "Claude selecciono el mercado con mayor fundamento.",
      tipo: safeStr(parsed.tipo) || "moderada",
      model,
    };
  } catch {
    return mkFallbackDecide();
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
};
