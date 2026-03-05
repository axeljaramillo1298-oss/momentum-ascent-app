const safeStr = (value) => String(value || "").trim();

const normalizePhone = (raw) => {
  const text = safeStr(raw);
  if (!text) return "";
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits;
};

async function sendWhatsAppText({ to, body }) {
  const enabled = String(process.env.WHATSAPP_ENABLED || "").toLowerCase() === "true";
  const provider = safeStr(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  const token = safeStr(process.env.WHATSAPP_TOKEN);
  const phoneNumberId = safeStr(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const recipient = normalizePhone(to);
  const textBody = safeStr(body);

  if (!enabled) return { ok: false, skipped: true, reason: "disabled" };
  if (!recipient) return { ok: false, skipped: true, reason: "missing_recipient" };
  if (!textBody) return { ok: false, skipped: true, reason: "missing_body" };
  if (provider !== "meta") return { ok: false, skipped: true, reason: "unsupported_provider" };
  if (!token || !phoneNumberId) return { ok: false, skipped: true, reason: "missing_credentials" };

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "text",
      text: { body: textBody },
    }),
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

module.exports = {
  sendWhatsAppText,
};

