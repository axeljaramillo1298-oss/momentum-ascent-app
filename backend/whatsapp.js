const safeStr = (value) => String(value || "").trim();

const normalizePhone = (raw) => {
  const text = safeStr(raw);
  if (!text) return "";
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits;
};

const getWhatsAppConfig = () => {
  const enabled = String(process.env.WHATSAPP_ENABLED || "").toLowerCase() === "true";
  const provider = safeStr(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  const token = safeStr(process.env.WHATSAPP_TOKEN);
  const phoneNumberId = safeStr(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const verifyToken = safeStr(process.env.WHATSAPP_VERIFY_TOKEN);
  const onboardingTemplateName = safeStr(process.env.WHATSAPP_ONBOARDING_TEMPLATE_NAME);
  const onboardingTemplateLang = safeStr(process.env.WHATSAPP_ONBOARDING_TEMPLATE_LANG || "es_MX");
  return {
    enabled,
    provider,
    token,
    phoneNumberId,
    verifyToken,
    onboardingTemplateName,
    onboardingTemplateLang,
  };
};

const getWhatsAppConfigStatus = () => {
  const cfg = getWhatsAppConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    hasToken: Boolean(cfg.token),
    hasPhoneNumberId: Boolean(cfg.phoneNumberId),
    hasVerifyToken: Boolean(cfg.verifyToken),
    hasOnboardingTemplateName: Boolean(cfg.onboardingTemplateName),
    onboardingTemplateLang: cfg.onboardingTemplateLang || "",
    readyForCloudApiText: Boolean(cfg.enabled && cfg.provider === "meta" && cfg.token && cfg.phoneNumberId),
    readyForOnboardingTemplate: Boolean(
      cfg.enabled && cfg.provider === "meta" && cfg.token && cfg.phoneNumberId && cfg.onboardingTemplateName
    ),
  };
};

const sendMetaMessage = async (body) => {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) return { ok: false, skipped: true, reason: "disabled" };
  if (cfg.provider !== "meta") return { ok: false, skipped: true, reason: "unsupported_provider" };
  if (!cfg.token || !cfg.phoneNumberId) return { ok: false, skipped: true, reason: "missing_credentials" };

  const url = `https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      reason: "provider_error",
      status: response.status,
      error: data?.error?.message || "whatsapp_send_failed",
    };
  }
  return {
    ok: true,
    skipped: false,
    provider: "meta",
    id: data?.messages?.[0]?.id || "",
  };
}

async function sendWhatsAppText({ to, body }) {
  const recipient = normalizePhone(to);
  const textBody = safeStr(body);
  if (!recipient) return { ok: false, skipped: true, reason: "missing_recipient" };
  if (!textBody) return { ok: false, skipped: true, reason: "missing_body" };
  return sendMetaMessage({
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { body: textBody },
  });
}

async function sendWhatsAppTemplate({ to, name, languageCode = "es_MX", components = [] }) {
  const recipient = normalizePhone(to);
  const templateName = safeStr(name);
  const lang = safeStr(languageCode || "es_MX");
  const safeComponents = Array.isArray(components) ? components.filter((item) => item && typeof item === "object") : [];
  if (!recipient) return { ok: false, skipped: true, reason: "missing_recipient" };
  if (!templateName) return { ok: false, skipped: true, reason: "missing_template_name" };
  return sendMetaMessage({
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      ...(safeComponents.length ? { components: safeComponents } : {}),
    },
  });
}

module.exports = {
  getWhatsAppConfig,
  getWhatsAppConfigStatus,
  normalizePhone,
  sendWhatsAppText,
  sendWhatsAppTemplate,
};
