const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const safeStr = (value) => String(value || "").trim();

const buildFallbackPlan = ({ users = [], prompt = "", context = "", mode = "admin_ai" }) => {
  const names = users.map((u) => safeStr(u.name) || safeStr(u.email) || "User").join(", ") || "usuario";
  const routineBase =
    mode === "ai_only"
      ? "Bloque de entrenamiento: full-body 4 dias, cardio 2 dias, 1 dia recuperacion activa."
      : "Bloque de entrenamiento mixto: fuerza + adherencia, con ajuste semanal de carga.";
  const dietBase =
    mode === "ai_only"
      ? "Nutricion base: proteina alta, deficit moderado y 8 vasos de agua."
      : "Nutricion validada por admin: enfoque en proteina, fibra y distribucion por horarios.";

  return {
    provider: "fallback",
    routineText: `${routineBase} Usuario(s): ${names}. Objetivo: ${prompt || "mejorar composicion corporal"}.`,
    dietText: `${dietBase} Contexto aplicado: ${(context || "sin contexto adicional").slice(0, 220)}.`,
    messageText: `Momentum check: ${names}, ya tienes plan asignado. Ejecuta hoy y reporta check-in.`,
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

async function generateAiPlan(payload = {}) {
  const apiKey = safeStr(process.env.OPENAI_API_KEY);
  const model = safeStr(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const prompt = safeStr(payload.prompt);
  const context = safeStr(payload.context || payload.fileText);
  const mode = safeStr(payload.mode) || "admin_ai";
  const users = Array.isArray(payload.users) ? payload.users : [];

  if (!apiKey) {
    return buildFallbackPlan({ users, prompt, context, mode });
  }

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

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`openai_${response.status}:${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = safeStr(data?.choices?.[0]?.message?.content);
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("openai_invalid_json");
  }

  return {
    provider: "openai",
    routineText: safeStr(parsed.routineText),
    dietText: safeStr(parsed.dietText),
    messageText: safeStr(parsed.messageText),
  };
}

module.exports = {
  generateAiPlan,
  buildFallbackPlan,
};

