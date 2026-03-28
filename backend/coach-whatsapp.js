const { sendWhatsAppText } = require("./whatsapp");

const QUESTIONS = [
  { key: "goal", text: "1/4 Objetivo principal? (bajar grasa, ganar musculo, recomposicion)." },
  { key: "schedule", text: "2/4 Cuantos dias y minutos por dia puedes entrenar? Ej: 4 dias, 45 min." },
  { key: "experience", text: "3/4 Nivel actual? (principiante, intermedio, avanzado)." },
  { key: "limitations", text: "4/4 Lesiones o limitaciones? Si no tienes, responde: ninguna." },
];

const safeStr = (value) => String(value || "").trim();
const normalizePhone = (raw) => safeStr(raw).replace(/[^\d]/g, "");

const normalizeSendResult = (result) => {
  if (!result || typeof result !== "object") {
    return { ok: false, skipped: true, reason: "unknown_whatsapp_result" };
  }
  if (result.ok || result.skipped) {
    return result;
  }
  if (result.reason === "provider_error") {
    return {
      ok: false,
      skipped: true,
      reason: "whatsapp_unavailable",
    };
  }
  return {
    ok: false,
    skipped: true,
    reason: result.reason || "whatsapp_unavailable",
  };
};

const buildWelcome = (name) => {
  const clean = safeStr(name) || "Atleta";
  return `Hola ${clean}. Soy tu coach de Momentum Ascent. Aqui no hay excusas, hay ejecucion diaria.`;
};

async function startCoachOnboardingForUser(user, db) {
  if (!user || !db) return { ok: false, reason: "missing_input" };
  const userId = safeStr(user.id || user.email).toLowerCase();
  const phone = normalizePhone(user.whatsapp);
  if (!userId || !phone) return { ok: false, reason: "missing_user_or_phone" };

  const existing = await db.getCoachFlowByUser(userId);
  if (existing && existing.status === "completed") {
    return { ok: true, skipped: true, reason: "already_completed" };
  }

  await db.upsertCoachFlow({
    userId,
    phone,
    step: 0,
    status: "active",
    answers: existing?.answers || {},
  });

  const sent = [];
  sent.push(normalizeSendResult(await sendWhatsAppText({ to: phone, body: buildWelcome(user.name) })));
  sent.push(
    normalizeSendResult(
      await sendWhatsAppText({
      to: phone,
      body: `${QUESTIONS[0].text}\nResponde directo por este chat. Tienes 10 minutos para arrancar fuerte.`,
      })
    )
  );
  const providerIssues = sent.some((item) => item && item.skipped && item.reason === "whatsapp_unavailable");
  return providerIssues
    ? { ok: true, skipped: true, reason: "whatsapp_unavailable", sent }
    : { ok: true, sent };
}

async function handleIncomingCoachMessage(message, db) {
  const from = normalizePhone(message?.from);
  const text = safeStr(message?.text?.body);
  if (!from || !text || !db) return { ok: false, skipped: true, reason: "missing_payload" };

  const flow = await db.getCoachFlowByPhone(from);
  if (!flow || flow.status !== "active") {
    return { ok: true, skipped: true, reason: "no_active_flow" };
  }

  const currentStep = Math.max(0, Number(flow.step || 0));
  if (currentStep >= QUESTIONS.length) {
    return { ok: true, skipped: true, reason: "already_finished" };
  }

  const question = QUESTIONS[currentStep];
  const answers = { ...(flow.answers || {}) };
  answers[question.key] = text;
  const nextStep = currentStep + 1;
  const completed = nextStep >= QUESTIONS.length;

  await db.upsertCoachFlow({
    userId: flow.userId,
    phone: from,
    step: nextStep,
    status: completed ? "completed" : "active",
    answers,
  });

  if (completed) {
    const summary = [
      `Objetivo: ${answers.goal || "-"}`,
      `Disponibilidad: ${answers.schedule || "-"}`,
      `Nivel: ${answers.experience || "-"}`,
      `Limitaciones: ${answers.limitations || "-"}`,
    ].join("\n");
    await sendWhatsAppText({
      to: from,
      body: `Formulario completo. Perfecto. Tu plan se ajustara con esto:\n${summary}\nHoy inicias. Sin pausa.`,
    });
    return { ok: true, completed: true, userId: flow.userId, answers };
  }

  await sendWhatsAppText({
    to: from,
    body: `${QUESTIONS[nextStep].text}\nResponde claro y breve.`,
  });
  return { ok: true, completed: false, step: nextStep, userId: flow.userId, answers };
}

module.exports = {
  QUESTIONS,
  normalizePhone,
  startCoachOnboardingForUser,
  handleIncomingCoachMessage,
};
