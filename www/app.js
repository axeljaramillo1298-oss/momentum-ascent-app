const THEME_KEY = "discipline_theme";
const BRAND_NAME = "Momentum Ascent";
const ONBOARDING_DONE_STORAGE_KEY = "discipline_onboarding_done";

const applyBranding = () => {
  document.querySelectorAll(".logo").forEach((el) => {
    el.textContent = "MOMENTUM ASCENT";
  });
  document.querySelectorAll(".footer > div:first-child").forEach((el) => {
    const current = String(el.textContent || "").trim();
    if (!current) {
      el.textContent = BRAND_NAME;
      return;
    }
    const normalized = current
      .replace(/Disciplina WhatsApp Coach/gi, BRAND_NAME)
      .replace(/Momentum Ascent\s*[â€¢•]\s*/gi, `${BRAND_NAME} • `)
      .trim();
    if (/^Momentum Ascent$/i.test(normalized)) {
      el.textContent = BRAND_NAME;
      return;
    }
    el.textContent = normalized || BRAND_NAME;
  });
  if (document.title && /Disciplina/i.test(document.title)) {
    document.title = document.title.replace(/Disciplina[^|]*/i, BRAND_NAME);
  }
};

const applyAppIcon = () => {
  const iconHref = "assets/app-icon.png";
  const ensureLink = (rel) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      document.head.appendChild(link);
    }
    link.setAttribute("href", iconHref);
  };
  ensureLink("icon");
  ensureLink("shortcut icon");
  ensureLink("apple-touch-icon");
};

const showBrandSplash = () => {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const isLoginPage = page === "registro.html" && (!window.location.hash || window.location.hash === "#login");
  const isAppOpen = page === "" || page === "index.html";
  if (!(isAppOpen || isLoginPage)) {
    return;
  }
  const splash = document.createElement("div");
  splash.className = "brand-splash";
  splash.innerHTML = `
    <div class="brand-splash-inner">
      <p class="brand-splash-kicker">Welcome to</p>
      <h1 class="brand-splash-title">Momentum Ascent</h1>
      <p class="brand-splash-sub">Build momentum. Rise daily.</p>
    </div>
  `;
  document.body.appendChild(splash);
  requestAnimationFrame(() => splash.classList.add("show"));
  setTimeout(() => splash.classList.add("hide"), 4200);
  setTimeout(() => splash.remove(), 5200);
};

applyBranding();
applyAppIcon();
showBrandSplash();

const applyTheme = (theme) => {
  const normalized = theme === "female" ? "female" : "male";
  document.body.classList.remove("theme-male", "theme-female");
  document.body.classList.add(`theme-${normalized}`);
  // Swap theme-specific images
  document.querySelectorAll("[data-female-src]").forEach((img) => {
    const maleSrc = img.dataset.maleSrc || img.getAttribute("src");
    if (!img.dataset.maleSrc) img.dataset.maleSrc = maleSrc;
    img.src = normalized === "female" ? img.dataset.femaleSrc : img.dataset.maleSrc;
  });
  document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: normalized } }));
};

const removeThemeGate = () => {
  document.body.classList.remove("theme-gated");
  const gate = document.getElementById("gender-gate");
  if (gate) {
    gate.remove();
  }
};

const buildThemeGate = () => {
  const gate = document.createElement("div");
  gate.id = "gender-gate";
  gate.className = "gender-gate";
  gate.innerHTML = `
    <div class="gender-card">
      <p class="gender-label">Personaliza tu experiencia</p>
      <h2>¿Eres hombre o mujer?</h2>
      <p>Selecciona una vista para adaptar color, estilo y ambiente visual.</p>
      <div class="gender-actions">
        <button class="primary" type="button" data-gender="male">Hombre</button>
        <button class="ghost" type="button" data-gender="female">Mujer</button>
      </div>
    </div>
  `;

  gate.querySelectorAll("[data-gender]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = btn.dataset.gender;
      localStorage.setItem(THEME_KEY, selected);
      applyTheme(selected);
      removeThemeGate();
    });
  });

  document.body.appendChild(gate);
};

const openThemeSelector = () => {
  document.body.classList.add("theme-gated");
  if (!document.getElementById("gender-gate")) {
    buildThemeGate();
  }
};

const ensureThemePicker = () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "male" || savedTheme === "female") {
    applyTheme(savedTheme);
  } else {
    applyTheme("male");
    openThemeSelector();
  }
};

ensureThemePicker();

const renderHomeV2ThemeContent = () => {
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page !== "index.html" && page !== "") {
    return;
  }
  const title = document.getElementById("home-v2-title");
  if (!title) {
    return;
  }
  const female = document.body.classList.contains("theme-female");
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  if (female) {
    title.innerHTML = "DISCIPLINA CON<br />ESTILO.";
    setText("home-v2-sub", "Tu coach inteligente te guia todos los dias. Rutina, nutricion y check-ins.");
    setText("home-v2-cta-main", "Empezar guia");
    setText("home-v2-cta-alt", "Ver demo");
    setText("home-v2-dash-title", "Momentum Dashboard");
    setText("home-v2-item-1", "💗 Racha: 10 dias");
    setText("home-v2-item-2", "✔ Check-in enviado");
    setText("home-v2-item-3", "✓ Nutricion OK");
    setText("home-v2-item-4", "✓ Rutina 30 min");
    setText("home-v2-device-btn", "Enviar progreso");
    return;
  }
  title.innerHTML = "NO TE MOTIVAMOS.<br />TE PRESIONAMOS<br />PARA QUE CUMPLAS.";
  setText("home-v2-sub", "Sistema de disciplina diaria con check-ins, nutricion y seguimiento.");
  setText("home-v2-cta-main", "Empezar onboarding");
  setText("home-v2-cta-alt", "Ver demo");
  setText("home-v2-dash-title", "Momentum Dashboard");
  setText("home-v2-item-1", "🔥 Racha: 14 dias");
  setText("home-v2-item-2", "⏰ Check-in pendiente");
  setText("home-v2-item-3", "🥗 Nutricion OK");
  setText("home-v2-item-4", "✅ Entrenamiento 30m");
  setText("home-v2-device-btn", "Enviar check-in");
};

document.addEventListener("theme:changed", renderHomeV2ThemeContent);
renderHomeV2ThemeContent();

const closeAllMobileMenus = () => {
  document.querySelectorAll(".nav.mobile-open").forEach((nav) => {
    nav.classList.remove("mobile-open");
    const toggle = nav.querySelector(".menu-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  document.body.classList.remove("menu-open");
};

const initMobileMenu = () => {
  const navs = document.querySelectorAll(".nav");
  if (!navs.length) {
    return;
  }

  navs.forEach((nav) => {
    const actions = nav.querySelector(".nav-actions");
    if (!actions) {
      return;
    }

    let toggle = nav.querySelector(".menu-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "menu-toggle";
      toggle.setAttribute("aria-label", "Abrir menu");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
      nav.appendChild(toggle);
    }

    if (!actions.querySelector("[data-action='theme'], #nav-theme-btn, .nav-theme-toggle")) {
      const themeButton = document.createElement("button");
      themeButton.type = "button";
      themeButton.className = "ghost menu-theme-btn";
      themeButton.dataset.action = "theme";
      themeButton.textContent = "Cambiar vista";
      actions.appendChild(themeButton);
    }

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = nav.classList.contains("mobile-open");
      closeAllMobileMenus();
      if (!wasOpen) {
        nav.classList.add("mobile-open");
        toggle.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-open");
      }
    });

    actions.addEventListener("click", (event) => {
      const target = event.target.closest("a, button");
      if (!target) {
        return;
      }

      if (target.dataset.action === "theme") {
        event.preventDefault();
        closeAllMobileMenus();
        openThemeSelector();
        return;
      }

      if (window.matchMedia("(max-width: 980px)").matches) {
        closeAllMobileMenus();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav")) {
      closeAllMobileMenus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      closeAllMobileMenus();
    }
  });
};

initMobileMenu();

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action='theme']");
  if (!trigger) {
    return;
  }
  event.preventDefault();
  openThemeSelector();
});

const ROLE_KEY = "discipline_role_mode";
const ADMIN_ROUTINES_KEY = "discipline_admin_routines_v1";
const ADMIN_NUTRITION_KEY = "discipline_admin_nutrition_v1";
const USERS_KEY = "discipline_users_v1";
const CURRENT_USER_KEY = "discipline_current_user_v1";
const USER_ASSIGNMENTS_KEY = "discipline_user_assignments_v1";
const API_BASE_KEY = "discipline_api_base_v1";
const API_LAST_OK_KEY = "discipline_api_last_ok_v1";
const API_TIMEOUT_MS = 9000;
const PLAN_SELECTION_KEY = "discipline_plan_selection_v1";
const SUPPORT_ALERTS_KEY = "discipline_support_alerts_v1";
const REG_DRAFT_KEY = "discipline_reg_draft";
const REG_PROFILE_KEY = "discipline_profile";
const PLAN_HISTORY_KEY = "discipline_plan_history_v1";
const SUBSCRIPTION_CACHE_KEY = "discipline_subscription_cache_v1";
const QA_DEMO_KEY = "discipline_qa_demo_v1";
const GOD_TOKEN_KEY = "discipline_god_token_v1";
const GOD_EXPIRES_KEY = "discipline_god_expires_v1";
const BILLING_TARGET_CACHE_KEY = "discipline_billing_target_v1";

const escHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PLAN_CATALOG = {
  free: {
    id: "free",
    label: "Free",
    price: "$0 / mes",
    includes: ["Check-in diario", "Rutina base", "Tracking esencial"],
  },
  ai_coach: {
    id: "ai_coach",
    label: "Coach IA",
    price: "$19 / mes",
    includes: ["Rutinas IA adaptativas", "Ajuste semanal", "Soporte inteligente"],
  },
  coach_humano: {
    id: "coach_humano",
    label: "Coach + Humano",
    price: "$59 / mes",
    includes: ["IA + revision humana", "Asignaciones personalizadas", "Alerta directa al coach"],
  },
  retos: {
    id: "retos",
    label: "Retos",
    price: "$29 / 30 dias",
    includes: ["Ranking semanal", "Retos diarios", "Sistema de squad"],
  },
};

function mapLegacyPlanToId(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "free";
  if (raw.includes("coach + humano") || raw.includes("coach humano") || raw.includes("premium")) return "coach_humano";
  if (raw.includes("coach ia") || raw.includes("ia coach") || raw.includes("solo ia")) return "ai_coach";
  if (raw.includes("reto")) return "retos";
  if (raw.includes("basico") || raw.includes("basic") || raw.includes("free") || raw.includes("gratis")) return "free";
  return "free";
}

function normalizePlanSelection(selection) {
  const id = mapLegacyPlanToId(selection?.id || selection?.plan || selection?.label || selection);
  const planMeta = PLAN_CATALOG[id] || PLAN_CATALOG.free;
  const extrasRaw = selection?.extras && typeof selection.extras === "object" ? selection.extras : {};
  const extras = {
    diet_basic: Boolean(extrasRaw.diet_basic),
    diet_plus: Boolean(extrasRaw.diet_plus),
  };
  return {
    id: planMeta.id,
    label: planMeta.label,
    price: planMeta.price,
    includes: [...planMeta.includes],
    extras,
    updatedAt: new Date().toISOString(),
  };
}

function getRegDraft() {
  const raw = localStorage.getItem(REG_DRAFT_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRegDraft(next) {
  localStorage.setItem(REG_DRAFT_KEY, JSON.stringify(next || {}));
}

function getPlanSelection() {
  const stored = localStorage.getItem(PLAN_SELECTION_KEY);
  if (stored) {
    try {
      return normalizePlanSelection(JSON.parse(stored));
    } catch {
      localStorage.removeItem(PLAN_SELECTION_KEY);
    }
  }
  const currentId = localStorage.getItem(CURRENT_USER_KEY);
  if (currentId) {
    const user = readJsonArray(USERS_KEY).find((u) => u.id === currentId);
    if (user?.plan || user?.planId) {
      return normalizePlanSelection({
        id: user.planId || user.plan,
        extras: user.planExtras || {},
      });
    }
  }
  const draft = getRegDraft();
  return normalizePlanSelection({
    id: draft.plan || "free",
    extras: {
      diet_basic: draft.extra_diet_basic === true || draft.extra_diet_basic === "on",
      diet_plus: draft.extra_diet_plus === true || draft.extra_diet_plus === "on",
    },
  });
}

function readSubscriptionCache() {
  const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSubscriptionCache(next) {
  localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(next || {}));
}

function getCurrentSubscription() {
  const current = getCurrentUser();
  if (!current?.id) return null;
  const cache = readSubscriptionCache();
  const entry = cache[current.id];
  if (!entry) return null;
  if (entry._cachedAt && Date.now() - entry._cachedAt > SUBSCRIPTION_CACHE_TTL_MS) {
    delete cache[current.id];
    writeSubscriptionCache(cache);
    return null;
  }
  return entry;
}

const SUBSCRIPTION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

function setCurrentSubscription(sub) {
  const current = getCurrentUser();
  if (!current?.id || !sub) return;
  const cache = readSubscriptionCache();
  cache[current.id] = { ...sub, _cachedAt: Date.now() };
  writeSubscriptionCache(cache);
}

function isSubscriptionActive(sub) {
  if (!sub || String(sub.status || "").toLowerCase() !== "active") {
    return false;
  }
  const endAt = String(sub.endAt || "");
  if (!endAt) return false;
  return new Date(endAt).getTime() > Date.now();
}

function getEffectivePlanSelection() {
  const sub = getCurrentSubscription();
  if (isSubscriptionActive(sub)) {
    return normalizePlanSelection({
      id: sub.planId || "free",
      label: sub.planLabel || "Free",
      extras: sub.extras || {},
    });
  }
  return normalizePlanSelection("free");
}

function persistPlanSelection(input) {
  const normalized = normalizePlanSelection(input);
  localStorage.setItem(PLAN_SELECTION_KEY, JSON.stringify(normalized));
  const draft = getRegDraft();
  draft.plan = normalized.label;
  draft.extra_diet_basic = normalized.extras.diet_basic ? "on" : "";
  draft.extra_diet_plus = normalized.extras.diet_plus ? "on" : "";
  saveRegDraft(draft);

  const current = getCurrentUser();
  if (current?.id) {
    const users = readJsonArray(USERS_KEY);
    const next = users.map((u) =>
      u.id === current.id
        ? {
            ...u,
            plan: normalized.label,
            planId: normalized.id,
            planExtras: normalized.extras,
            updatedAt: new Date().toISOString(),
          }
        : u
    );
    saveJsonArray(USERS_KEY, next);
  }
  const history = readJsonArray(PLAN_HISTORY_KEY);
  history.push({
    at: new Date().toISOString(),
    planId: normalized.id,
    planLabel: normalized.label,
    extras: normalized.extras,
  });
  saveJsonArray(PLAN_HISTORY_KEY, history.slice(-40));
  return normalized;
}

function getPlanCapabilities(selection = getEffectivePlanSelection()) {
  const plan = normalizePlanSelection(selection);
  const extras = plan.extras || {};
  const paid = plan.id !== "free";
  const challengeCore = plan.id === "retos" || plan.id === "coach_humano";
  const humanSupport = plan.id === "coach_humano";
  const aiAdaptive = plan.id === "ai_coach" || plan.id === "coach_humano";
  const personalRoutine = plan.id === "ai_coach" || plan.id === "coach_humano";
  const dietAccess = humanSupport || extras.diet_basic || extras.diet_plus;
  const dietPersonalized = humanSupport || extras.diet_plus;
  return {
    plan,
    paid,
    aiAdaptive,
    humanSupport,
    challengeCore,
    personalRoutine,
    dietAccess,
    dietPersonalized,
    canRequestCoachAlert: humanSupport,
    downloadCard: paid,
  };
}

const resolveApiBase = () => {
  const forced = (localStorage.getItem(API_BASE_KEY) || "").trim();
  if (forced) {
    return forced.replace(/\/+$/, "");
  }
  if (window.location.protocol === "file:") {
    return "https://api.momentumascent.com";
  }
  const host = (window.location.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8787";
  }
  if (host.endsWith("momentumascent.com")) {
    return "https://api.momentumascent.com";
  }
  return `${window.location.protocol}//${window.location.host}`;
};

const apiUrl = (path) => `${resolveApiBase()}${path}`;

const apiRequest = async (path, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const activeUserEmail = String(localStorage.getItem(CURRENT_USER_KEY) || "").trim().toLowerCase();
    const godToken = String(localStorage.getItem(GOD_TOKEN_KEY) || "").trim();
    const response = await fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(activeUserEmail ? { "x-user-email": activeUserEmail } : {}),
        ...(godToken ? { "x-god-token": godToken } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    // Para errores de cliente (4xx) intentar devolver el body JSON
    // para que el caller pueda leer remote.error y mostrar mensaje
    if (!response.ok) {
      try {
        const errBody = await response.json();
        return errBody; // { ok: false, error: "invalid_password" } etc.
      } catch {
        throw new Error(`api_${response.status}`);
      }
    }
    const payload = await response.json();
    localStorage.setItem(API_LAST_OK_KEY, new Date().toISOString());
    return payload;
  } finally {
    clearTimeout(timer);
  }
};

const apiGet = (path) => apiRequest(path);
const apiPost = (path, body) => apiRequest(path, { method: "POST", body });

const initHomeGodEntry = () => {
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page !== "index.html" && page !== "") {
    return;
  }
  if (document.getElementById("home-god-fab")) {
    return;
  }

  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "home-god-fab";
  fab.className = "home-god-fab";
  fab.setAttribute("aria-label", "Acceso especial");
  fab.innerHTML = `<span></span>`;

  const modal = document.createElement("div");
  modal.id = "home-god-modal";
  modal.className = "home-god-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="home-god-modal-card" role="dialog" aria-modal="true" aria-labelledby="home-god-title">
      <button class="home-god-close" type="button" aria-label="Cerrar">×</button>
      <p class="home-god-kicker">Acceso Especial</p>
      <h3 id="home-god-title">Modo Dios</h3>
      <p class="home-god-sub">Ingresa tus credenciales para abrir el panel de control total.</p>
      <div class="home-god-form">
        <label>User
          <input id="home-god-user" type="text" autocomplete="username" placeholder="usuario" />
        </label>
        <label>Password
          <input id="home-god-pass" type="password" autocomplete="current-password" placeholder="password" />
        </label>
        <button id="home-god-enter" class="primary" type="button">Entrar</button>
        <p id="home-god-feedback" class="reg-feedback" aria-live="polite"></p>
      </div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".home-god-close");
  const enterBtn = document.getElementById("home-god-enter");
  const userInput = document.getElementById("home-god-user");
  const passInput = document.getElementById("home-god-pass");
  const feedback = document.getElementById("home-god-feedback");

  const open = () => {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
    setTimeout(() => userInput?.focus(), 80);
  };

  const close = () => {
    modal.classList.remove("show");
    setTimeout(() => {
      if (!modal.classList.contains("show")) {
        modal.hidden = true;
      }
    }, 180);
  };

  const setFeedback = (text, type = "") => {
    if (!feedback) return;
    feedback.className = `reg-feedback ${type}`.trim();
    feedback.textContent = text;
  };

  fab.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      close();
    }
  });

  const submit = async () => {
    const username = userInput?.value?.trim();
    const password = passInput?.value?.trim();
    if (!username || !password) {
      setFeedback("Completa user y password.", "error");
      return;
    }
    enterBtn.disabled = true;
    try {
      const remote = await apiPost("/god/login", { username, password });
      const token = String(remote?.token || "");
      if (!token) {
        throw new Error("token_missing");
      }
      localStorage.setItem(GOD_TOKEN_KEY, token);
      localStorage.setItem(GOD_EXPIRES_KEY, String(remote?.expiresAt || ""));
      setFeedback("Acceso concedido. Abriendo panel...", "success");
      setTimeout(() => {
        window.location.href = "admin.html#god-panel";
      }, 350);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("god_mode_disabled")) {
        setFeedback("Modo Dios no esta habilitado en API.", "error");
      } else if (message.includes("invalid_credentials")) {
        setFeedback("Credenciales invalidas.", "error");
      } else {
        setFeedback(`Error: ${message || "no se pudo iniciar"}`, "error");
      }
    } finally {
      enterBtn.disabled = false;
    }
  };

  enterBtn?.addEventListener("click", submit);
  [userInput, passInput].forEach((el) => {
    el?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
  });
};

const defaultBillingTarget = {
  bankName: "BBVA",
  accountHolder: "Momentum Ascent",
  clabe: "012345678901234567",
  accountNumber: "",
  whatsapp: "+52 000 000 0000",
  note: "Referencia: tu correo de registro",
};

const getBillingTarget = async () => {
  const cachedRaw = localStorage.getItem(BILLING_TARGET_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached && typeof cached === "object") {
        return { ...defaultBillingTarget, ...cached };
      }
    } catch {
      localStorage.removeItem(BILLING_TARGET_CACHE_KEY);
    }
  }
  try {
    const remote = await apiGet("/billing-target");
    const billing = remote?.billing && typeof remote.billing === "object" ? remote.billing : defaultBillingTarget;
    localStorage.setItem(BILLING_TARGET_CACHE_KEY, JSON.stringify(billing));
    return { ...defaultBillingTarget, ...billing };
  } catch {
    return defaultBillingTarget;
  }
};

const syncCurrentSubscriptionFromApi = async () => {
  const current = getCurrentUser();
  if (!current?.id) {
    return null;
  }
  try {
    const remote = await apiGet(`/subscriptions/${encodeURIComponent(current.id)}`);
    const sub = remote?.subscription || null;
    if (sub) {
      setCurrentSubscription(sub);
    }
    return sub;
  } catch {
    return getCurrentSubscription();
  }
};

const hasActiveGodSession = () => {
  const token = String(localStorage.getItem(GOD_TOKEN_KEY) || "").trim();
  if (!token) {
    return false;
  }
  const expiresRaw = String(localStorage.getItem(GOD_EXPIRES_KEY) || "").trim();
  const expiresAt = Date.parse(expiresRaw);
  if (!expiresRaw || !Number.isFinite(expiresAt)) {
    return true;
  }
  if (Date.now() > expiresAt) {
    localStorage.removeItem(GOD_TOKEN_KEY);
    localStorage.removeItem(GOD_EXPIRES_KEY);
    return false;
  }
  return true;
};

const getRoleMode = () => {
  if (hasActiveGodSession()) {
    return "admin";
  }
  const current = getCurrentUser();
  return current?.role === "admin" ? "admin" : "user";
};

const applyRoleMode = (role) => {
  const normalized = role === "admin" ? "admin" : "user";
  document.body.dataset.role = normalized;

  document.querySelectorAll("[data-role-label]").forEach((el) => {
    el.textContent = normalized;
  });

  document.querySelectorAll("[data-role-only]").forEach((el) => {
    const targetRole = el.dataset.roleOnly;
    const defaultDisplay = el.tagName === "A" ? "inline-flex" : "block";
    el.style.display = targetRole === normalized ? defaultDisplay : "none";
  });

  document.querySelectorAll("[data-role-hide]").forEach((el) => {
    const hiddenForRole = el.dataset.roleHide;
    el.style.display = hiddenForRole === normalized ? "none" : "";
  });
};

const lockAdminIfNeeded = () => {
  const path = window.location.pathname;
  const isAdminPage = path.endsWith("/admin.html") || path.endsWith("admin.html");
  const isGodPage = path.endsWith("/god-panel.html") || path.endsWith("god-panel.html");
  if (isGodPage) {
    // god-panel.html requiere ser admin — el login de Modo Dios está dentro de esa página
    if (getRoleMode() !== "admin") {
      window.location.replace("app-inicio.html");
    }
    return;
  }
  if (!isAdminPage || getRoleMode() === "admin") {
    return;
  }
  window.location.replace("app-inicio.html");
};

// Muestra el link de Modo Dios a todos los admins; el panel interno se bloquea sin sesión activa
const syncGodLinkVisibility = () => {
  const link = document.getElementById("admin-god-link");
  if (!link) return;
  // Visible para cualquier admin — pueden entrar a loguear modo dios ahí
  link.classList.toggle("hidden-field", getRoleMode() !== "admin");
};

const hasCompletedOnboarding = () => {
  const done = String(localStorage.getItem(ONBOARDING_DONE_STORAGE_KEY) || "").toLowerCase();
  if (done === "1" || done === "true") {
    return true;
  }
  const current = getCurrentUser();
  if (!current || current.role === "admin") {
    return false;
  }
  const hasStructuredUserData = Boolean(
    String(current.objetivo || "").trim() ||
    String(current.horario || "").trim()
  );
  const rawProfile = localStorage.getItem(REG_PROFILE_KEY);
  let hasProfile = false;
  if (rawProfile) {
    try {
      const profile = JSON.parse(rawProfile);
      hasProfile = Boolean(
        profile &&
        (
          String(profile.objetivo || "").trim() ||
          String(profile.horario || "").trim() ||
          String(profile.nombre || "").trim()
        )
      );
    } catch {
      hasProfile = false;
    }
  }
  return hasStructuredUserData || hasProfile;
};

const getUserEntryTarget = () => {
  if (getRoleMode() === "admin") {
    return "admin.html";
  }
  return hasCompletedOnboarding() ? "user-hoy.html" : "onboarding-1.html";
};

const initRoleMode = () => {
  applyRoleMode(getRoleMode());
  lockAdminIfNeeded();
  syncGodLinkVisibility();
};

const initAppEntryScreen = () => {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (page !== "app-inicio.html") {
    return;
  }
  const current = getCurrentUser();
  if (!current) {
    window.location.replace("registro.html#login");
    return;
  }
  const target = getUserEntryTarget();
  const copy = document.getElementById("app-entry-copy");
  const countdownEl = document.getElementById("app-entry-countdown");
  const link = document.getElementById("app-entry-link");
  if (copy) {
    copy.textContent = `${current.name || "Usuario"}, estamos preparando tu home.`;
  }
  if (link) {
    link.href = target;
  }
  let remaining = 3;
  if (countdownEl) {
    countdownEl.textContent = String(remaining).padStart(2, "0");
  }
  const timer = setInterval(() => {
    remaining -= 1;
    if (countdownEl) {
      countdownEl.textContent = String(Math.max(remaining, 0)).padStart(2, "0");
    }
    if (remaining <= 0) {
      clearInterval(timer);
      window.location.replace(target);
    }
  }, 1000);
};

const readJsonArray = (key) => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(key);
    return [];
  }
};

const saveJsonArray = (key, arr) => {
  localStorage.setItem(key, JSON.stringify(arr));
};

const readJsonObject = (key) => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(key);
    return {};
  }
};

const saveJsonObject = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const normalizeWhatsapp = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `+${digits}`;
};

const normalizeSportName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const getRegisteredSportCatalog = () => {
  const select = document.getElementById("deporte");
  if (!select) {
    return [];
  }
  return Array.from(select.options)
    .map((opt) => String(opt.value || opt.textContent || "").trim())
    .filter((name) => name && name !== "Otro" && name !== "Selecciona");
};

const getOnboardingSportCatalog = () =>
  Array.from(document.querySelectorAll('[data-onb-key="deporte"] [data-onb-value]'))
    .map((btn) => String(btn.dataset.onbValue || "").trim())
    .filter((name) => name && name !== "Otro");

const isDuplicateSportName = (candidate, catalog) => {
  const normalizedCandidate = normalizeSportName(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  const normalizedSet = new Set(catalog.map((item) => normalizeSportName(item)));
  return normalizedSet.has(normalizedCandidate);
};

const ensureUser = (payload) => {
  const users = readJsonArray(USERS_KEY);
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) {
    return null;
  }
  const id = email;
  const existing = users.find((u) => u.id === id);
  const normalizedPlan = normalizePlanSelection({
    id: payload.plan || existing?.planId || existing?.plan || getPlanSelection().id,
    extras: payload.planExtras || existing?.planExtras || getPlanSelection().extras,
  });
  const next = {
    id,
    name: String(payload.name || existing?.name || "").trim() || "User",
    email,
    whatsapp: normalizeWhatsapp(payload.whatsapp || existing?.whatsapp || ""),
    role: String(payload.role || existing?.role || "user").trim() || "user",
    plan: normalizedPlan.label,
    planId: normalizedPlan.id,
    planExtras: normalizedPlan.extras,
    horario: String(payload.horario || existing?.horario || "").trim(),
    objetivo: String(payload.objetivo || existing?.objetivo || "").trim(),
    perfil: String(payload.perfil || existing?.perfil || "").trim(),
    edad: String(payload.edad || existing?.edad || "").trim(),
    peso: String(payload.peso || existing?.peso || "").trim(),
    estatura: String(payload.estatura || existing?.estatura || "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const filtered = users.filter((u) => u.id !== id);
  filtered.push(next);
  saveJsonArray(USERS_KEY, filtered);
  localStorage.setItem(CURRENT_USER_KEY, id);
  return next;
};

const getCurrentUser = () => {
  const id = localStorage.getItem(CURRENT_USER_KEY);
  if (!id) {
    return null;
  }
  return readJsonArray(USERS_KEY).find((u) => u.id === id) || null;
};

const hideGuestOnlyLinksIfLogged = () => {
  const current = getCurrentUser();
  const isLogged = Boolean(current);
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  anchors.forEach((a) => {
    const href = String(a.getAttribute("href") || "").toLowerCase();
    const guestLink = href.includes("registro.html") || href.includes("demo.html");
    if (guestLink && isLogged) {
      a.style.display = "none";
    }
  });
};

const guardAuthScreensForLoggedUser = () => {
  const current = getCurrentUser();
  if (!current) {
    return;
  }
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (page === "registro.html") {
    window.location.href = getRoleMode() === "admin" ? "admin.html" : "app-inicio.html";
  }
};

const enforceOnboardingBeforeHome = () => {
  const current = getCurrentUser();
  if (!current || current.role === "admin") {
    return;
  }
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const appPages = new Set(["user-hoy.html", "user-rutinas.html", "user-progreso.html", "user-dieta.html", "user-checkin.html"]);
  if (appPages.has(page) && !hasCompletedOnboarding()) {
    window.location.replace("app-inicio.html");
  }
};

const syncUserWithBackend = async (payload) => {
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!email) {
    return null;
  }
  const response = await apiPost("/auth/login", {
    name: payload.name || "User",
    email,
    whatsapp: normalizeWhatsapp(payload.whatsapp || ""),
    plan: payload.plan || "Free",
    goal: payload.goal || payload.objetivo || "",
    checkinSchedule: payload.checkinSchedule || payload.horario || "",
    edad: payload.edad || "",
    peso: payload.peso || "",
    estatura: payload.estatura || "",
  });
  return response;
};

const hydrateUserCacheFromApi = (apiUser) => {
  if (!apiUser || !apiUser.email) {
    return null;
  }
  const localUser = ensureUser({
    name: apiUser.name || "User",
    email: apiUser.email,
    whatsapp: apiUser.whatsapp || "",
    role: apiUser.role || "user",
    plan: apiUser.plan || "Free",
    horario: apiUser.checkin_schedule || "",
    objetivo: apiUser.goal || "",
    perfil: "",
    edad: apiUser.edad || "",
    peso: apiUser.peso || "",
    estatura: apiUser.estatura || "",
  });
  const hasCompletedProfile = Boolean(
    localUser &&
    localUser.role !== "admin" &&
    (
      String(localUser.objetivo || "").trim() ||
      String(localUser.horario || "").trim()
    )
  );
  if (hasCompletedProfile) {
    localStorage.setItem(ONBOARDING_DONE_STORAGE_KEY, "1");
  }
  return localUser;
};

const renderUserRoutineFeed = async () => {
  const container = document.getElementById("user-routine-feed");
  if (!container) {
    return;
  }
  const currentUser = getCurrentUser();
  let routines = readJsonArray(ADMIN_ROUTINES_KEY);
  let nutrition = readJsonArray(ADMIN_NUTRITION_KEY);
  if (currentUser?.id) {
    try {
      const remote = await apiGet(`/feed/${encodeURIComponent(currentUser.id)}`);
      routines = Array.isArray(remote?.routines) ? remote.routines : routines;
      nutrition = Array.isArray(remote?.plans) ? remote.plans : nutrition;
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
  }
  if (!routines.length && !nutrition.length) {
    container.innerHTML = `
      <article class="entry-card">
        <h3>Sin contenido del staff</h3>
        <p>Cuando el admin publique rutinas o planes, apareceran aqui.</p>
      </article>
    `;
    return;
  }

  const routineCards = routines.slice(-2).reverse().map((r) => `
    <article class="entry-card">
      <h3>${escHtml(r.title)}</h3>
      <p>${escHtml(r.target)} • ${escHtml(r.duration)}</p>
      <span class="reg-hint">Publicado por staff</span>
    </article>
  `);
  const nutritionCards = nutrition.slice(-1).reverse().map((n) => `
    <article class="entry-card">
      <h3>${escHtml(n.title)}</h3>
      <p>${escHtml(n.focus)}</p>
      <span class="reg-hint">${escHtml(n.note)}</span>
    </article>
  `);
  container.innerHTML = [...routineCards, ...nutritionCards].join("");
};

const renderUserRoutinesPage = async () => {
  const container = document.getElementById("user-routines-page-feed");
  if (!container) {
    return;
  }
  const caps = getPlanCapabilities();
  let routines = readJsonArray(ADMIN_ROUTINES_KEY);
  const assignments = readJsonObject(USER_ASSIGNMENTS_KEY);
  const currentUser = getCurrentUser();
  let personal = currentUser ? assignments[currentUser.id] : null;
  if (currentUser?.id) {
    try {
      const remote = await apiGet(`/feed/${encodeURIComponent(currentUser.id)}`);
      routines = Array.isArray(remote?.routines) ? remote.routines : routines;
      personal = remote?.assignment || personal;
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
  }
  const visibleRoutines = caps.plan.id === "free" ? routines.slice(0, 1) : routines;

  if (!visibleRoutines.length) {
    container.innerHTML = `
      <article class="entry-card">
        <h3>Sin rutinas publicadas</h3>
        <p>Tu entrenador cargara rutinas desde el panel admin.</p>
      </article>
    `;
  } else {
    container.innerHTML = visibleRoutines
      .slice()
      .reverse()
      .map(
        (r) => `
        <article class="entry-card">
          <h3>${escHtml(r.title)}</h3>
          <p>${escHtml(r.target)}</p>
          <span class="reg-hint">${escHtml(r.duration)}</span>
        </article>
      `
      )
      .join("");
  }

  if (personal?.routine && caps.personalRoutine) {
    container.insertAdjacentHTML(
      "afterbegin",
      `
      <article class="entry-card">
        <h3>Tu rutina personalizada</h3>
        <p>${personal.routine}</p>
        <span class="reg-hint">Asignada por tu coach • ${new Date(personal.updatedAt).toLocaleDateString("es-MX")}</span>
      </article>
    `
    );
  } else if (personal?.routine && !caps.personalRoutine) {
    container.insertAdjacentHTML(
      "afterbegin",
      `
      <article class="entry-card">
        <h3>Rutina personalizada bloqueada</h3>
        <p>Tu plan actual no incluye personalizacion por coach. Cambia a Coach IA o Coach + Humano.</p>
      </article>
    `
    );
  }
};

const renderUserProgressPage = async () => {
  const streakEl = document.getElementById("user-progress-streak");
  if (!streakEl) {
    return;
  }
  const levelEl = document.getElementById("user-progress-level");
  const bestStreakEl = document.getElementById("user-progress-best-streak");
  const xpEl = document.getElementById("user-progress-xp");
  const ascentEl = document.getElementById("user-progress-ascent-index");
  const complianceEl = document.getElementById("user-progress-compliance");
  const responseEl = document.getElementById("user-progress-response");
  const weeklyEl = document.getElementById("user-progress-weekly");
  const activeFailedEl = document.getElementById("user-progress-active-failed");
  const monthlyEl = document.getElementById("user-progress-monthly");
  const scoreEl = document.getElementById("user-progress-discipline-score");
  const criticalEl = document.getElementById("user-progress-critical");
  const hourEl = document.getElementById("user-progress-hour");
  const bars = document.getElementById("user-progress-bars");
  const goalPanel = document.getElementById("goal-personalized-panel");
  const premiumPanel = document.getElementById("premium-status-panel");

  const stateRaw = localStorage.getItem("discipline_state_v2");
  let state = null;
  try {
    state = stateRaw ? JSON.parse(stateRaw) : {};
  } catch {
    state = {};
  }
  const currentUser = getCurrentUser();
  if (currentUser?.id) {
    try {
      const remote = await apiGet(`/metrics/${encodeURIComponent(currentUser.id)}`);
      if (remote?.metrics) {
        const m = remote.metrics;
        state = {
          ...state,
          streak: Number(m.streak || 0),
          longestStreak: Number(m.bestStreak || 0),
          xp: Number(m.xp || 0),
          totalDays: Number(m.totalDays || 0),
          completedDays: Number(m.completedDays || 0),
          failures: Number(m.failures || 0),
        };
      }
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
  }

  const streak = state?.streak || 0;
  const longestStreak = state?.longestStreak || 0;
  const xp = state?.xp || 0;
  const totalDays = state?.totalDays || 0;
  const completed = state?.completedDays || 0;
  const fails = Math.max(0, totalDays - completed);
  const compliance = getCompliancePct(state);
  const disciplineScore = getDisciplineScore(state);
  const ascentIndex = getAscentIndex(state);
  const avgResponse = state?.responseCount ? Math.round((state.responseSecondsTotal || 0) / state.responseCount) : 0;
  const mm = String(Math.floor(avgResponse / 60)).padStart(2, "0");
  const ss = String(avgResponse % 60).padStart(2, "0");

  const criticalMap = state?.criticalDays || {};
  const strongMap = state?.strongHours || {};
  const topCritical = Object.entries(criticalMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const topHour = Object.entries(strongMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const level = resolveLevel(xp).label;
  const monthDays = Object.keys(state?.history || {}).filter((k) => k.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const monthYes = monthDays.filter((k) => state.history[k]?.status === "yes").length;
  const monthPct = monthDays.length ? Math.round((monthYes / monthDays.length) * 100) : 0;

  streakEl.textContent = `${streak} dias`;
  if (bestStreakEl) bestStreakEl.textContent = `${longestStreak} dias`;
  if (levelEl) levelEl.textContent = level;
  if (xpEl) xpEl.textContent = `${xp} XP`;
  if (ascentEl) ascentEl.textContent = `${ascentIndex}`;
  if (complianceEl) complianceEl.textContent = `${compliance}%`;
  if (responseEl) responseEl.textContent = state?.responseCount ? `${mm}:${ss}` : "-";
  if (weeklyEl) weeklyEl.textContent = `${compliance}%`;
  if (activeFailedEl) activeFailedEl.textContent = `${completed} / ${fails}`;
  if (monthlyEl) monthlyEl.textContent = `${monthPct}%`;
  if (scoreEl) scoreEl.textContent = `${disciplineScore}%`;
  if (criticalEl) criticalEl.textContent = topCritical ? dayNames[Number(topCritical[0])] : "-";
  if (hourEl) hourEl.textContent = topHour ? `${String(topHour[0]).padStart(2, "0")}:00` : "-";

  if (bars) {
    const pct = Math.max(6, compliance);
    bars.innerHTML = `
      <div class="progress-row"><span>Cumplimiento</span><div class="progress-track"><i style="width:${pct}%"></i></div></div>
      <div class="progress-row"><span>Racha</span><div class="progress-track"><i style="width:${Math.min(100, streak * 4)}%"></i></div></div>
      <div class="progress-row"><span>Disciplina</span><div class="progress-track"><i style="width:${disciplineScore}%"></i></div></div>
      <div class="progress-row"><span>Mes</span><div class="progress-track"><i style="width:${Math.max(4, monthPct)}%"></i></div></div>
    `;
  }

  if (goalPanel) {
    const goal = getUserGoal();
    const goalPlan =
      goal === "Bajar peso"
        ? "Deficit moderado + cardio inteligente 3x."
        : goal === "Ambos" || goal === "Rendimiento total"
          ? "Fuerza + cardio alternado con control de calorias."
        : goal === "Constancia"
          ? "Bloques de 20-30 min para adherencia diaria."
          : "Plan base de disciplina progresiva.";
    goalPanel.innerHTML = `<div class="admin-item"><strong>Meta: ${goal}</strong><p>${goalPlan}</p></div>`;
  }

  if (premiumPanel) {
    const caps = getPlanCapabilities();
    premiumPanel.innerHTML = `
      <div class="admin-item">
        <strong>Plan activo: ${caps.plan.label}</strong>
        <p>${caps.plan.price}</p>
        <p>${caps.aiAdaptive ? "IA adaptativa habilitada." : "IA adaptativa bloqueada en este plan."}</p>
      </div>
    `;
  }
};

const renderUserDietPage = async () => {
  const planList = document.getElementById("user-diet-plan");
  if (!planList) {
    return;
  }
  const caps = getPlanCapabilities();
  const quickWater = document.getElementById("diet-quick-water");
  const quickKcal = document.getElementById("diet-quick-300");
  const quickDone = document.getElementById("diet-quick-done");
  const quickTraining = document.getElementById("diet-quick-training");
  if (!caps.dietAccess) {
    planList.innerHTML = `
      <div class="admin-item">
        <strong>Dieta bloqueada en ${caps.plan.label}</strong>
        <p>Activa extra Dieta Basica o Dieta Pro en Planes para desbloquear este modulo.</p>
      </div>
    `;
    [quickWater, quickKcal, quickDone, quickTraining].forEach((btn) => {
      if (!btn) return;
      btn.disabled = true;
      btn.title = "Bloqueado por plan";
    });
    return;
  }
  [quickWater, quickKcal, quickDone, quickTraining].forEach((btn) => {
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute("title");
  });

  let plans = readJsonArray(ADMIN_NUTRITION_KEY);
  const assignments = readJsonObject(USER_ASSIGNMENTS_KEY);
  const currentUser = getCurrentUser();
  let personal = currentUser ? assignments[currentUser.id] : null;
  if (currentUser?.id) {
    try {
      const remote = await apiGet(`/feed/${encodeURIComponent(currentUser.id)}`);
      plans = Array.isArray(remote?.plans) ? remote.plans : plans;
      personal = remote?.assignment || personal;
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
  }
  planList.innerHTML = plans.length
    ? plans
        .slice()
        .reverse()
        .slice(0, 2)
        .map((p) => `<div class="admin-item"><strong>${escHtml(p.title)}</strong><p>${escHtml(p.focus)}</p><p>${escHtml(p.note)}</p></div>`)
        .join("")
    : `<div class="admin-item"><p>Sin plan cargado por nutricionista.</p></div>`;

  if (personal?.diet && caps.dietPersonalized) {
    planList.insertAdjacentHTML(
      "afterbegin",
      `<div class="admin-item"><strong>Tu dieta personalizada</strong><p>${escHtml(personal.diet)}</p><p>${escHtml(personal.message || "")}</p></div>`
    );
  } else if (personal?.diet && !caps.dietPersonalized) {
    planList.insertAdjacentHTML(
      "afterbegin",
      `<div class="admin-item"><strong>Dieta personalizada bloqueada</strong><p>Tienes Dieta Basica activa. Sube a Dieta Pro para recibir un plan personalizado.</p></div>`
    );
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(`discipline_nutrition_${dateKey}`);
  let state = { water: 0, calories: 0, dietDone: false, trainingDone: false };
  try {
    state = raw ? { ...state, ...JSON.parse(raw) } : state;
  } catch {
    state = { water: 0, calories: 0, dietDone: false, trainingDone: false };
  }

  const water = Number(state.water || 0);
  const calories = Number(state.calories || 0);
  const score = Math.min(100, Math.round((Math.min(8, water) / 8) * 30) + (calories > 0 ? 20 : 0) + (state.dietDone ? 25 : 0) + (state.trainingDone ? 25 : 0));

  const waterEl = document.getElementById("user-diet-water");
  const calEl = document.getElementById("user-diet-calories");
  const statusEl = document.getElementById("user-diet-status");
  const scoreEl = document.getElementById("user-diet-score");
  if (waterEl) waterEl.textContent = `${water}/8 vasos`;
  if (calEl) calEl.textContent = `${calories} kcal`;
  if (statusEl) {
    statusEl.textContent = state.dietDone ? (state.trainingDone ? "Dieta + entreno" : "Cumplida") : "Pendiente";
  }
  if (scoreEl) scoreEl.textContent = `${score}/100`;
  renderTodayNutritionSnapshot();

  const save = () => {
    localStorage.setItem(`discipline_nutrition_${dateKey}`, JSON.stringify(state));
    renderUserDietPage();
  };

  if (quickWater && !quickWater.dataset.bound) {
    quickWater.dataset.bound = "1";
    quickWater.addEventListener("click", () => {
      state.water = Math.min(8, Number(state.water || 0) + 1);
      save();
    });
  }
  if (quickKcal && !quickKcal.dataset.bound) {
    quickKcal.dataset.bound = "1";
    quickKcal.addEventListener("click", () => {
      state.calories = Number(state.calories || 0) + 300;
      save();
    });
  }
  if (quickDone && !quickDone.dataset.bound) {
    quickDone.dataset.bound = "1";
    quickDone.addEventListener("click", () => {
      state.dietDone = !state.dietDone;
      save();
    });
  }
  if (quickTraining && !quickTraining.dataset.bound) {
    quickTraining.dataset.bound = "1";
    quickTraining.addEventListener("click", () => {
      state.trainingDone = !state.trainingDone;
      save();
    });
  }
};

const readTodayNutritionState = () => {
  const dateKey = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(`discipline_nutrition_${dateKey}`);
  const fallback = { water: 0, calories: 0, dietDone: false, trainingDone: false };
  if (!raw) {
    return fallback;
  }
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
};

const getTodayNutritionScore = (state) =>
  Math.min(100, Math.round((Math.min(8, Number(state.water || 0)) / 8) * 30) + (Number(state.calories || 0) > 0 ? 20 : 0) + (state.dietDone ? 25 : 0) + (state.trainingDone ? 25 : 0));

const renderTodayNutritionSnapshot = () => {
  const waterEl = document.getElementById("today-nutri-water");
  const caloriesEl = document.getElementById("today-nutri-calories");
  const dietEl = document.getElementById("today-nutri-diet");
  const scoreEl = document.getElementById("today-nutri-score");
  const hintEl = document.getElementById("today-nutri-hint");
  if (!waterEl && !caloriesEl && !dietEl && !scoreEl && !hintEl) {
    return;
  }
  const caps = getPlanCapabilities();
  if (!caps.dietAccess) {
    if (waterEl) waterEl.textContent = "Bloqueado";
    if (caloriesEl) caloriesEl.textContent = "Bloqueado";
    if (dietEl) dietEl.textContent = "Bloqueado";
    if (scoreEl) scoreEl.textContent = "0/100";
    if (hintEl) hintEl.textContent = "Activa extra de dieta para desbloquear el modulo.";
    return;
  }
  const state = readTodayNutritionState();
  const water = Number(state.water || 0);
  const calories = Number(state.calories || 0);
  const score = getTodayNutritionScore(state);
  if (waterEl) waterEl.textContent = `${water}/8 vasos`;
  if (caloriesEl) caloriesEl.textContent = `${calories} kcal`;
  if (dietEl) dietEl.textContent = state.dietDone ? (state.trainingDone ? "Dieta + entreno" : "Cumplida") : "Pendiente";
  if (scoreEl) scoreEl.textContent = `${score}/100`;
  if (hintEl) hintEl.textContent = score >= 80 ? "Excelente adherencia nutricional." : "Sube hidratacion y registra calorias para mejorar tu score.";
};

const CHECKIN_PHOTOS_KEY = "discipline_checkin_photos_v1";

const getCheckinPhotosForUser = (userId) => {
  const normalized = String(userId || "").trim().toLowerCase();
  if (!normalized) return [];
  return readJsonArray(CHECKIN_PHOTOS_KEY).filter((item) => String(item?.userId || "").trim().toLowerCase() === normalized);
};

const renderUserCheckinList = () => {
  const list = document.getElementById("user-checkin-list");
  if (!list) {
    return;
  }
  const current = getCurrentUser();
  const items = current?.id
    ? readJsonArray(CHECKIN_PHOTOS_KEY).filter((item) => {
        const owner = String(item?.userId || "").trim().toLowerCase();
        return !owner || owner === String(current.id || "").trim().toLowerCase();
      })
    : readJsonArray(CHECKIN_PHOTOS_KEY);
  list.innerHTML = items.length
    ? items
        .slice()
        .reverse()
        .map(
          (item) => `
      <div class="admin-item">
        <strong>${escHtml(item.note)}</strong>
        <p>${new Date(item.createdAt).toLocaleString("es-MX")}</p>
        <img src="${escHtml(item.image)}" class="photo-thumb" alt="checkin" />
      </div>
    `
        )
        .join("")
    : `<div class="admin-item"><p>Sin fotos aun.</p></div>`;
};

const initUserCheckinPage = () => {
  const form = document.getElementById("user-checkin-form");
  const fileInput = document.getElementById("user-checkin-file");
  const noteInput = document.getElementById("user-checkin-note");
  const preview = document.getElementById("user-checkin-preview");
  const feedback = document.getElementById("user-checkin-feedback");
  if (!form || !fileInput || !noteInput || !preview) {
    return;
  }

  const setFeedback = (text, type = "") => {
    if (!feedback) {
      return;
    }
    feedback.className = `reg-feedback ${type}`.trim();
    feedback.textContent = text;
  };

  let selectedImageData = "";

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });

  const compressImage = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1080;
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      selectedImageData = "";
      preview.removeAttribute("src");
      setFeedback("");
      return;
    }
    const maxSizeMb = 8;
    if (file.size > maxSizeMb * 1024 * 1024) {
      fileInput.value = "";
      selectedImageData = "";
      preview.removeAttribute("src");
      setFeedback(`Archivo muy pesado. Maximo ${maxSizeMb}MB.`, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      selectedImageData = String(reader.result || "");
      preview.src = selectedImageData;
      preview.style.display = "block";
      setFeedback("Foto lista para subir.", "success");
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!noteInput.value.trim()) {
      setFeedback("Falta foto o nota del check-in.", "error");
      return;
    }
    try {
      if (!selectedImageData) {
        const file = fileInput.files?.[0];
        if (file) {
          selectedImageData = await readFileAsDataUrl(file);
          preview.src = selectedImageData;
          preview.style.display = "block";
        }
      }
    } catch {
      selectedImageData = "";
    }
    if (!selectedImageData) {
      setFeedback("No se pudo leer la foto. Seleccionala de nuevo.", "error");
      return;
    }
    const image = await compressImage(selectedImageData);
    const items = readJsonArray(CHECKIN_PHOTOS_KEY);
    items.push({
      userId: getCurrentUser()?.id || "",
      note: noteInput.value.trim(),
      image,
      createdAt: new Date().toISOString(),
    });
    saveJsonArray(CHECKIN_PHOTOS_KEY, items.slice(-15)); // max 15 fotos para no llenar localStorage
    form.reset();
    selectedImageData = "";
    preview.removeAttribute("src");
    preview.style.display = "none";
    renderUserCheckinList();
    setFeedback("Check-in guardado.", "success");
    showToast("📸 Check-in guardado correctamente.", "success");
  });

  renderUserCheckinList();
};

const renderAdminKpis = () => {
  const streakEl = document.getElementById("admin-kpi-streak");
  const complianceEl = document.getElementById("admin-kpi-compliance");
  const responseEl = document.getElementById("admin-kpi-response");
  const failsEl = document.getElementById("admin-kpi-fails");
  if (!streakEl || !complianceEl || !responseEl || !failsEl) {
    return;
  }

  const stateRaw = localStorage.getItem("discipline_state_v2");
  let state = null;
  try {
    state = stateRaw ? JSON.parse(stateRaw) : null;
  } catch {
    state = null;
  }

  const streak = state?.streak || 0;
  const totalDays = state?.totalDays || 0;
  const completed = state?.completedDays || 0;
  const fails = state?.failures || 0;
  const responseCount = state?.responseCount || 0;
  const responseTotal = state?.responseSecondsTotal || 0;
  const compliance = totalDays ? Math.round((completed / totalDays) * 100) : 0;
  const avgResponse = responseCount ? Math.round(responseTotal / responseCount) : 0;
  const mm = String(Math.floor(avgResponse / 60)).padStart(2, "0");
  const ss = String(avgResponse % 60).padStart(2, "0");

  streakEl.textContent = `${streak} dias`;
  complianceEl.textContent = `${compliance}%`;
  responseEl.textContent = responseCount ? `${mm}:${ss}` : "-";
  failsEl.textContent = String(fails);
};

const renderAdminLists = async () => {
  const routineList = document.getElementById("admin-routine-list");
  const nutritionList = document.getElementById("admin-nutrition-list");
  if (!routineList && !nutritionList) {
    return;
  }

  let routines = readJsonArray(ADMIN_ROUTINES_KEY);
  let plans = readJsonArray(ADMIN_NUTRITION_KEY);
  const resolveFeedUserId = async () => {
    const current = getCurrentUser();
    if (current?.id) {
      return current.id;
    }
    try {
      const remoteUsers = await apiGet("/users?search=");
      const firstId = Array.isArray(remoteUsers?.users) ? String(remoteUsers.users[0]?.id || "").trim() : "";
      return firstId || "";
    } catch {
      return "";
    }
  };

  try {
    const feedUserId = await resolveFeedUserId();
    if (feedUserId) {
      const remote = await apiGet(`/feed/${encodeURIComponent(feedUserId)}`);
      routines = Array.isArray(remote?.routines) ? remote.routines : routines;
      plans = Array.isArray(remote?.plans) ? remote.plans : plans;
    }
  } catch (err) {
    console.warn("[api] fallback local:", err?.message || err);
  }

  if (routineList) {
    routineList.innerHTML = routines.length
      ? routines
          .slice()
          .reverse()
          .map((r) => `<div class="admin-item"><strong>${escHtml(r.title)}</strong><p>${escHtml(r.target)} • ${escHtml(r.duration)}</p></div>`)
          .join("")
      : `<div class="admin-item"><p>Sin rutinas publicadas.</p></div>`;
  }

  if (nutritionList) {
    nutritionList.innerHTML = plans.length
      ? plans
          .slice()
          .reverse()
          .map((n) => `<div class="admin-item"><strong>${escHtml(n.title)}</strong><p>${escHtml(n.focus)}</p><p>${escHtml(n.note)}</p></div>`)
          .join("")
      : `<div class="admin-item"><p>Sin planes publicados.</p></div>`;
  }
};

const readOnboardingAnswers = (value) => {
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const buildRoutineContextSummary = (user) => {
  const answers = readOnboardingAnswers(user?.onboardingAnswers);
  const goal = String(answers.objetivo || user?.objetivo || user?.goal || "").trim();
  const level = String(answers.nivel || "").trim();
  const place = String(answers.lugar || "").trim();
  const time = String(answers.tiempo || "").trim();
  const sportRaw = String(answers.deporte || "").trim();
  const sport = sportRaw === "Otro" ? String(answers.deporte_otro || "Otro").trim() : sportRaw;
  const tone = String(answers.tono || "").trim();
  const equipment = String(answers.equipo_casa || "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== "ninguno");
  const parts = [];
  if (goal) parts.push(`Meta: ${goal}`);
  if (level) parts.push(`Nivel: ${level}`);
  if (sport) parts.push(`Deporte: ${sport}`);
  if (place) parts.push(`Lugar: ${place}`);
  if (time) parts.push(`Tiempo: ${time}`);
  if (tone) parts.push(`Tono: ${tone}`);
  if (equipment.length) parts.push(`Equipo: ${equipment.slice(0, 2).join(", ")}`);
  return parts.join(" • ");
};

const renderAdminInsights = async () => {
  const semaforoEl = document.getElementById("admin-semaphore-list");
  const pendingEl = document.getElementById("admin-pending-list");
  const summaryEl = document.getElementById("admin-summary-chips");
  if (!semaforoEl && !pendingEl && !summaryEl) {
    return;
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  let payload = null;
  try {
    payload = await apiGet(`/admin/dashboard?dateKey=${encodeURIComponent(dateKey)}`);
  } catch {
    const users = readJsonArray(USERS_KEY).filter((u) => String(u.id || "").toLowerCase() !== "admin@fitnesapk.local");
    payload = {
      summary: {
        totalUsers: users.length,
        pendingToday: users.length,
        green: 0,
        yellow: 0,
        red: users.length,
      },
      users: users.map((u) => ({
        id: u.id,
        name: u.name || "User",
        email: u.email || u.id,
        checkinSchedule: u.horario || "",
        onboardingAnswers: {},
        compliance: 0,
        status: "red",
        streak: 0,
        lastCheckinDate: null,
      })),
      pending: users.map((u) => ({
        id: u.id,
        name: u.name || "User",
        email: u.email || u.id,
        checkinSchedule: u.horario || "",
      })),
    };
  }

  const summary = payload?.summary || {};
  const users = Array.isArray(payload?.users) ? payload.users : [];
  const pending = Array.isArray(payload?.pending) ? payload.pending : [];

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="admin-chip">Users: ${Number(summary.totalUsers || 0)}</span>
      <span class="admin-chip pending">Pendientes: ${Number(summary.pendingToday || 0)}</span>
      <span class="admin-chip green">Verde: ${Number(summary.green || 0)}</span>
      <span class="admin-chip yellow">Amarillo: ${Number(summary.yellow || 0)}</span>
      <span class="admin-chip red">Rojo: ${Number(summary.red || 0)}</span>
    `;
  }

  if (semaforoEl) {
    semaforoEl.innerHTML = users.length
      ? users
          .slice(0, 20)
          .map((u) => {
            const status = u.status || "red";
            const compliance = Number(u.compliance || 0);
            const schedule = u.checkinSchedule ? ` • ${u.checkinSchedule}` : "";
            const summary = buildRoutineContextSummary(u);
            return `
              <article class="admin-status-item ${escHtml(status)}">
                <div>
                  <strong>${escHtml(u.name || "User")}</strong>
                  <p>${escHtml(u.email || "")}${escHtml(schedule)}</p>
                  ${summary ? `<p class="admin-onboarding-hint">${escHtml(summary)}</p>` : ""}
                </div>
                <span class="admin-status-pill ${escHtml(status)}">${escHtml(status.toUpperCase())} ${Number(compliance)}%</span>
              </article>
            `;
          })
          .join("")
      : `<div class="admin-item"><p>Sin datos de usuarios aun.</p></div>`;
  }

  if (pendingEl) {
    pendingEl.innerHTML = pending.length
      ? pending
          .slice(0, 20)
          .map((u) => {
            const schedule = u.checkinSchedule ? `Horario: ${u.checkinSchedule}` : "Horario sin definir";
            const summary = buildRoutineContextSummary(u);
            return `<div class="admin-item"><strong>${escHtml(u.name || "User")}</strong><p>${escHtml(u.email || "")}</p><p>${escHtml(schedule)}</p>${summary ? `<p class="admin-onboarding-hint">${escHtml(summary)}</p>` : ""}</div>`;
          })
          .join("")
      : `<div class="admin-item"><p>Excelente: no hay pendientes hoy.</p></div>`;
  }
};

const initAdminPanel = () => {
  const routineForm = document.getElementById("admin-routine-form");
  const nutritionForm = document.getElementById("admin-nutrition-form");
  const routineFeedback = document.getElementById("admin-routine-feedback");
  const nutritionFeedback = document.getElementById("admin-nutrition-feedback");

  if (routineForm) {
    routineForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = document.getElementById("routine-title")?.value.trim();
      const target = document.getElementById("routine-target")?.value.trim();
      const duration = document.getElementById("routine-duration")?.value;
      if (!title || !target || !duration) {
        if (routineFeedback) {
          routineFeedback.className = "reg-feedback error";
          routineFeedback.textContent = "Faltan campos obligatorios para publicar rutina.";
        }
        return;
      }
      try {
        await apiPost("/admin/routines", { title, target, duration, createdBy: "admin" });
      } catch {
        const routines = readJsonArray(ADMIN_ROUTINES_KEY);
        routines.push({ title, target, duration, createdAt: new Date().toISOString() });
        saveJsonArray(ADMIN_ROUTINES_KEY, routines);
      }
      routineForm.reset();
      renderAdminLists();
      renderAdminInsights();
      renderUserRoutineFeed();
      showToast("💪 Rutina guardada correctamente.", "success");
      if (routineFeedback) {
        routineFeedback.className = "reg-feedback success";
        routineFeedback.textContent = "Rutina guardada correctamente.";
      }
    });
  }

  if (nutritionForm) {
    nutritionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = document.getElementById("nutrition-title")?.value.trim();
      const focus = document.getElementById("nutrition-focus")?.value;
      const note = document.getElementById("nutrition-note")?.value.trim();
      if (!title || !focus || !note) {
        if (nutritionFeedback) {
          nutritionFeedback.className = "reg-feedback error";
          nutritionFeedback.textContent = "Faltan campos obligatorios para publicar plan.";
        }
        return;
      }
      try {
        await apiPost("/admin/nutrition", { title, focus, note, createdBy: "admin" });
      } catch {
        const plans = readJsonArray(ADMIN_NUTRITION_KEY);
        plans.push({ title, focus, note, createdAt: new Date().toISOString() });
        saveJsonArray(ADMIN_NUTRITION_KEY, plans);
      }
      nutritionForm.reset();
      renderAdminLists();
      renderAdminInsights();
      renderUserRoutineFeed();
      showToast("🥗 Plan de nutricion guardado.", "success");
      if (nutritionFeedback) {
        nutritionFeedback.className = "reg-feedback success";
        nutritionFeedback.textContent = "Plan nutricional guardado.";
      }
    });
  }

  const userSearch = document.getElementById("admin-user-search");
  const userResults = document.getElementById("admin-user-results");
  const modeSelect = document.getElementById("admin-operating-mode");
  const aiPrompt = document.getElementById("admin-ai-prompt");
  const aiContext = document.getElementById("admin-ai-context");
  const aiFile = document.getElementById("admin-ai-file");
  const aiOutput = document.getElementById("admin-ai-output");
  const finalRoutine = document.getElementById("admin-final-routine");
  const finalDiet = document.getElementById("admin-final-diet");
  const finalMessage = document.getElementById("admin-final-message");
  const profileCard = document.getElementById("admin-user-profile-card");
  const profilePhotos = document.getElementById("admin-user-photos");
  const aiGenerate = document.getElementById("admin-ai-generate");
  const assignBtn = document.getElementById("admin-assign-plan");
  const assignFeedback = document.getElementById("admin-assign-feedback");
  const toolsFeedback = document.getElementById("admin-tools-feedback");
  const duplicateBtn = document.getElementById("admin-duplicate-plan");
  const exportUserBtn = document.getElementById("admin-export-user-csv");
  const exportWeekBtn = document.getElementById("admin-export-week-csv");
  const timelineUser = document.getElementById("admin-timeline-user");
  const timelineRefresh = document.getElementById("admin-timeline-refresh");
  const timelineList = document.getElementById("admin-timeline-list");
  let selectedUsers = new Set();
  let primarySelectedUserId = "";
  let latestCoachUsers = [];
  let fileText = "";

  const setToolsFeedback = (text, type = "") => {
    if (!toolsFeedback) {
      return;
    }
    toolsFeedback.className = `reg-feedback ${type}`.trim();
    toolsFeedback.textContent = text;
  };

  const renderTimelineUserOptions = (users) => {
    if (!timelineUser) {
      return;
    }
    const safeUsers = Array.isArray(users) ? users : [];
    const current = timelineUser.value || "";
    timelineUser.innerHTML = `<option value="">Todos los usuarios</option>${safeUsers
      .map((u) => `<option value="${escHtml(u.id)}">${escHtml(u.name)} • ${escHtml(u.email)}</option>`)
      .join("")}`;
    if (current && safeUsers.some((u) => u.id === current)) {
      timelineUser.value = current;
    }
  };

  const buildProfileContextText = (user, metrics, subscription) => {
    const answers = readOnboardingAnswers(user?.onboardingAnswers);
    const lines = [
      `Usuario: ${user?.name || "User"} <${user?.email || user?.id || ""}>`,
      `Plan: ${subscription?.planLabel || user?.plan || "Free"} (${subscription?.status || user?.subscriptionStatus || "inactive"})`,
      `Meta: ${answers.objetivo || user?.goal || user?.objetivo || "-"}`,
      `Horario: ${user?.horario || user?.checkinSchedule || answers.horario || "-"}`,
      `Perfil: ${answers.perfil || user?.perfil || "-"}`,
      `Nivel: ${answers.nivel || "-"}`,
      `Deporte: ${answers.deporte_otro || answers.deporte || "-"}`,
      `Lugar: ${answers.lugar || "-"}`,
      `Tiempo disponible: ${answers.tiempo || "-"}`,
      `WhatsApp: ${user?.whatsapp || "-"}`,
      `Racha: ${metrics?.streak ?? "-"}`,
      `Cumplimiento: ${metrics?.totalDays ? Math.round((Number(metrics.completedDays || 0) * 100) / Math.max(1, Number(metrics.totalDays || 0))) : 0}%`,
    ];
    return lines.join("\n");
  };

  const renderAdminUserProfile = async () => {
    if (!profileCard && !profilePhotos) {
      return;
    }
    const selectedId = primarySelectedUserId || timelineUser?.value || Array.from(selectedUsers)[0] || "";
    if (!selectedId) {
      if (profileCard) profileCard.innerHTML = `<div class="admin-item"><p>Selecciona un usuario para ver su ficha operativa.</p></div>`;
      if (profilePhotos) profilePhotos.innerHTML = `<div class="admin-item"><p>Aqui apareceran las fotos del usuario cuando suba check-ins.</p></div>`;
      return;
    }

    const baseUser = latestCoachUsers.find((u) => u.id === selectedId) || readJsonArray(USERS_KEY).find((u) => u.id === selectedId) || null;
    if (!baseUser) {
      if (profileCard) profileCard.innerHTML = `<div class="admin-item"><p>No se encontro informacion local del usuario seleccionado.</p></div>`;
      if (profilePhotos) profilePhotos.innerHTML = `<div class="admin-item"><p>Sin fotos de check-in para este usuario.</p></div>`;
      return;
    }

    let metrics = null;
    let subscription = null;
    try {
      const [metricsRemote, subscriptionRemote] = await Promise.all([
        apiGet(`/metrics/${encodeURIComponent(selectedId)}`).catch(() => null),
        apiGet(`/subscriptions/${encodeURIComponent(selectedId)}`).catch(() => null),
      ]);
      metrics = metricsRemote?.metrics || null;
      subscription = subscriptionRemote?.subscription || null;
    } catch {
      metrics = null;
      subscription = null;
    }

    const answers = readOnboardingAnswers(baseUser.onboardingAnswers);
    const planLabel = subscription?.planLabel || baseUser.plan || "Free";
    const planStatus = String(subscription?.status || baseUser.subscriptionStatus || "inactive");
    const compliance = metrics?.totalDays
      ? Math.round((Number(metrics.completedDays || 0) * 100) / Math.max(1, Number(metrics.totalDays || 0)))
      : 0;
    const whatsappLink = baseUser.whatsapp ? `https://wa.me/${String(baseUser.whatsapp).replace(/[^\d]/g, "")}` : "";
    const profileContext = buildProfileContextText(baseUser, metrics, subscription);

    if (profileCard) {
      profileCard.innerHTML = `
        <div class="admin-item">
          <strong>${escHtml(baseUser.name || "User")}</strong>
          <p>${escHtml(baseUser.email || baseUser.id || "")}</p>
          <p>Plan: ${escHtml(planLabel)} • Estado: ${escHtml(planStatus)}</p>
          <p>WhatsApp: ${escHtml(baseUser.whatsapp || "Sin numero")}</p>
          <p>Meta: ${escHtml(answers.objetivo || baseUser.goal || baseUser.objetivo || "Sin definir")}</p>
          <p>Horario: ${escHtml(baseUser.horario || baseUser.checkinSchedule || answers.horario || "Sin definir")}</p>
          <p>Perfil: ${escHtml(answers.perfil || baseUser.perfil || "Sin definir")}</p>
          <p>Racha: ${escHtml(String(metrics?.streak ?? "-"))} • Cumplimiento: ${escHtml(String(compliance))}% • Fallos: ${escHtml(String(metrics?.failures ?? "-"))}</p>
          <div class="role-actions">
            ${whatsappLink ? `<a class="ghost" href="${escHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ""}
            <button class="ghost" type="button" id="admin-profile-copy-context">Copiar contexto a IA</button>
            <button class="ghost" type="button" id="admin-profile-focus-timeline">Ver timeline</button>
          </div>
        </div>
      `;
      const copyBtn = document.getElementById("admin-profile-copy-context");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          if (aiContext) {
            aiContext.value = profileContext;
            setToolsFeedback("Contexto del usuario cargado en IA.", "success");
          }
        });
      }
      const timelineBtn = document.getElementById("admin-profile-focus-timeline");
      if (timelineBtn) {
        timelineBtn.addEventListener("click", () => {
          if (timelineUser) timelineUser.value = selectedId;
          renderAdminTimeline();
          setToolsFeedback(`Timeline filtrado para ${selectedId}.`, "success");
        });
      }
    }

    const photos = getCheckinPhotosForUser(selectedId).slice().reverse().slice(0, 6);
    if (profilePhotos) {
      profilePhotos.innerHTML = photos.length
        ? photos.map((item) => `
            <div class="admin-item">
              <strong>${escHtml(item.note || "Check-in")}</strong>
              <p>${new Date(item.createdAt || Date.now()).toLocaleString("es-MX")}</p>
              <img src="${escHtml(item.image || "")}" class="photo-thumb" alt="checkin" />
            </div>
          `).join("")
        : `<div class="admin-item"><p>Sin fotos de check-in de este usuario todavia.</p></div>`;
    }
  };

  const renderAdminTimeline = async () => {
    if (!timelineList) {
      return;
    }
    const userId = timelineUser?.value ? encodeURIComponent(timelineUser.value) : "";
    const path = userId ? `/admin/timeline?userId=${userId}&limit=30` : "/admin/timeline?limit=30";
    try {
      const remote = await apiGet(path);
      const items = Array.isArray(remote?.items) ? remote.items : [];
      if (!items.length) {
        timelineList.innerHTML = `<div class="admin-item"><p>Sin actividad reciente.</p></div>`;
        return;
      }
      timelineList.innerHTML = items
        .map((it) => {
          if (it.type === "checkin") {
            return `<div class="admin-item"><strong>${escHtml(it.userName || "User")} • check-in ${escHtml(String(it.status || "").toUpperCase())}</strong><p>${escHtml(it.userEmail || "")}</p><p>${escHtml(it.dateKey || "")} • ${Math.round(Number(it.responseSeconds || 0))}s</p></div>`;
          }
          if (it.type === "support_alert") {
            return `<div class="admin-item"><strong>${escHtml(it.userName || "User")} • alerta a coach</strong><p>${escHtml(it.userEmail || "")}</p><p>${escHtml(it.message || "Solicita carga de rutina/dieta")} • ${new Date(it.at).toLocaleString("es-MX")}</p></div>`;
          }
          return `<div class="admin-item"><strong>${escHtml(it.userName || "User")} • asignacion</strong><p>${escHtml(it.userEmail || "")}</p><p>Modo: ${escHtml(it.mode || "admin_ai")} • ${new Date(it.at).toLocaleString("es-MX")}</p></div>`;
        })
        .join("");
    } catch {
      const localAlerts = readJsonArray(SUPPORT_ALERTS_KEY);
      if (!localAlerts.length) {
        timelineList.innerHTML = `<div class="admin-item"><p>No se pudo cargar timeline desde API.</p></div>`;
        return;
      }
      timelineList.innerHTML = localAlerts
        .slice()
        .reverse()
        .slice(0, 30)
        .map(
          (it) =>
            `<div class="admin-item"><strong>${it.userId || "User"} • alerta local</strong><p>${it.message || "Solicita carga de plan"}</p><p>${new Date(it.createdAt || Date.now()).toLocaleString("es-MX")}</p></div>`
        )
        .join("");
    }
  };

  const renderUserResults = async (query = "") => {
    if (!userResults) {
      return;
    }
    let users = readJsonArray(USERS_KEY);
    try {
      const remote = await apiGet(`/users?search=${encodeURIComponent(query.trim())}`);
      if (Array.isArray(remote?.users)) {
        users = remote.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          whatsapp: u.whatsapp || "",
          role: u.role || "user",
          plan: u.plan || "Free",
          subscriptionStatus: u.subscriptionStatus || "inactive",
          horario: u.checkinSchedule || "",
          objetivo: u.goal || "",
          perfil: "",
          goal: u.goal || "",
          onboardingAnswers: u.onboardingAnswers || {},
        }));
        saveJsonArray(USERS_KEY, users);
      }
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
    latestCoachUsers = users;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
      : users;

    if (!filtered.length) {
      userResults.innerHTML = `<div class="admin-item"><p>Sin usuarios habilitados para coach. Modo Dios debe activar plan, extras o pago primero.</p></div>`;
      return;
    }

    userResults.innerHTML = filtered
      .map((u) => {
        const summary = buildRoutineContextSummary(u);
        const plan = String(u.plan || "Free");
        const subscriptionStatus = String(u.subscriptionStatus || "inactive").toLowerCase();
        const accessLabel =
          subscriptionStatus === "active"
            ? "Activo"
            : subscriptionStatus === "pending"
              ? "Pendiente"
              : "Sin acceso";
        return `
        <label class="admin-user-item">
          <span>
            <strong>${escHtml(u.name)}</strong><br />
            <small>${escHtml(u.email)}</small>
            <small class="admin-user-meta">Plan: ${escHtml(plan)} • Estado: ${escHtml(accessLabel)}</small>
            ${summary ? `<small class="admin-user-meta">${escHtml(summary)}</small>` : ""}
          </span>
          <input type="checkbox" data-admin-user="${escHtml(u.id)}" ${selectedUsers.has(u.id) ? "checked" : ""} />
        </label>
      `;
      })
      .join("");

    renderTimelineUserOptions(users);
    renderAdminUserProfile();

    userResults.querySelectorAll("[data-admin-user]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.adminUser;
        if (cb.checked) {
          selectedUsers.add(id);
          primarySelectedUserId = id;
        } else {
          selectedUsers.delete(id);
          if (primarySelectedUserId === id) {
            primarySelectedUserId = Array.from(selectedUsers)[0] || "";
          }
        }
        renderAdminTimeline();
        renderAdminUserProfile();
      });
    });
  };

  if (userSearch) {
    userSearch.addEventListener("input", () => {
      renderUserResults(userSearch.value);
    });
  }
  renderUserResults();

  if (timelineUser) {
    timelineUser.addEventListener("change", () => {
      primarySelectedUserId = timelineUser.value || primarySelectedUserId;
      renderAdminTimeline();
      renderAdminUserProfile();
    });
  }
  if (timelineRefresh) {
    timelineRefresh.addEventListener("click", () => {
      renderAdminTimeline();
    });
  }

  if (aiFile) {
    aiFile.addEventListener("change", () => {
      const file = aiFile.files?.[0];
      if (!file) {
        fileText = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        fileText = String(reader.result || "").slice(0, 4000);
      };
      reader.readAsText(file);
    });
  }

  const buildAiPlan = () => {
    const users = readJsonArray(USERS_KEY).filter((u) => selectedUsers.has(u.id));
    const names = users.map((u) => u.name).join(", ") || "usuarios seleccionados";
    const prompt = aiPrompt?.value?.trim() || "";
    const context = aiContext?.value?.trim() || "";
    const mode = modeSelect?.value || "admin_ai";

    const routineBase = mode === "ai_only" ? "IA generara bloque full-body 4 dias + cardio 2 dias." : "IA sugiere y el coach ajusta bloque fuerza + adherencia.";
    const dietBase = mode === "ai_only" ? "IA recomienda deficit moderado, proteina alta, agua 8 vasos." : "Plan mixto: el coach valida macros, timing y seguimiento.";

    const routineText = `${routineBase} Destino: ${names}. Prompt: ${prompt || "general"}.`;
    const dietText = `${dietBase} Contexto: ${(context || fileText || "sin contexto extra").slice(0, 180)}.`;
    const messageText = `Plan asignado para ${names}. Ejecuta hoy y responde check-in en 10 min.`;

    return { routineText, dietText, messageText, mode };
  };

  const buildAiPlanRemote = async () => {
    const users = readJsonArray(USERS_KEY).filter((u) => selectedUsers.has(u.id));
    const prompt = aiPrompt?.value?.trim() || "";
    const context = aiContext?.value?.trim() || "";
    const mode = modeSelect?.value || "admin_ai";
    const remote = await apiPost("/admin/ai-plan", {
      userIds: users.map((u) => u.id),
      prompt,
      context,
      fileText,
      mode,
    });
    return {
      plan: remote?.plan || null,
      aiMeta: remote?.aiMeta || null,
    };
  };

  if (aiGenerate) {
    aiGenerate.addEventListener("click", async () => {
      let plan = buildAiPlan();
      let aiMeta = null;
      if (aiOutput) aiOutput.innerHTML = `<strong>Generando...</strong><p>Consultando IA...</p>`;
      try {
        const remoteResult = await buildAiPlanRemote();
        const remotePlan = remoteResult?.plan || null;
        aiMeta = remoteResult?.aiMeta || null;
        if (remotePlan?.routineText || remotePlan?.dietText) {
          plan = {
            routineText: remotePlan.routineText || plan.routineText,
            dietText: remotePlan.dietText || plan.dietText,
            messageText: remotePlan.messageText || plan.messageText,
          };
        }
      } catch {
        // fallback local
      }
      if (aiOutput) {
        const provider = String(aiMeta?.provider || plan?.provider || "local");
        const model = String(aiMeta?.model || "").trim();
        const reason = String(aiMeta?.reason || "").trim();
        const providerLine =
          provider === "openai"
            ? `<p class="today-note">Proveedor: OpenAI${model ? ` • Modelo: ${model}` : ""}</p>`
            : `<p class="today-note">Proveedor: Fallback${reason ? ` • Motivo: ${reason}` : ""}</p>`;
        aiOutput.innerHTML = `<strong>Respuesta IA</strong>${providerLine}<p>${plan.routineText}</p><p>${plan.dietText}</p>`;
      }
      if (finalRoutine) finalRoutine.value = plan.routineText;
      if (finalDiet) finalDiet.value = plan.dietText;
      if (finalMessage) finalMessage.value = plan.messageText;
    });
  }

  if (assignBtn) {
    assignBtn.addEventListener("click", async () => {
      if (!selectedUsers.size) {
        if (assignFeedback) assignFeedback.textContent = "Selecciona al menos un user.";
        return;
      }
      const mode = modeSelect?.value || "admin_ai";
      const routine = finalRoutine?.value?.trim();
      const diet = finalDiet?.value?.trim();
      const message = finalMessage?.value?.trim();
      if (!routine && !diet) {
        if (assignFeedback) assignFeedback.textContent = "Escribe rutina o dieta antes de asignar.";
        return;
      }
      const assignments = readJsonObject(USER_ASSIGNMENTS_KEY);
      const now = new Date().toISOString();
      selectedUsers.forEach((userId) => {
        assignments[userId] = {
          routine: routine || assignments[userId]?.routine || "",
          diet: diet || assignments[userId]?.diet || "",
          message: message || "",
          mode,
          updatedAt: now,
        };
      });
      saveJsonObject(USER_ASSIGNMENTS_KEY, assignments);
      try {
        const remote = await apiPost("/admin/assignments", {
          userIds: Array.from(selectedUsers),
          mode,
          routine: routine || "",
          diet: diet || "",
          message: message || "",
          sendWhatsapp: true,
          createdBy: "admin",
        });
        const sent = Array.isArray(remote?.whatsapp) ? remote.whatsapp.filter((w) => w.ok).length : 0;
        if (assignFeedback) {
          assignFeedback.textContent = `Plan asignado correctamente. WhatsApp enviados: ${sent}.`;
        }
      } catch {
        if (assignFeedback) {
          assignFeedback.textContent = "Plan asignado localmente. No se pudo confirmar envio de WhatsApp.";
        }
      }
      renderUserRoutineFeed();
      renderUserRoutinesPage();
      renderUserDietPage();
      renderAdminInsights();
      renderAdminTimeline();
    });
  }

  if (duplicateBtn) {
    duplicateBtn.addEventListener("click", async () => {
      const picks = Array.from(selectedUsers);
      if (picks.length < 2) {
        setToolsFeedback("Selecciona al menos 2 users para duplicar plan.", "error");
        return;
      }
      const sourceId = timelineUser?.value || picks[0];
      const targetIds = picks.filter((id) => id !== sourceId);
      if (!targetIds.length) {
        setToolsFeedback("Selecciona usuarios destino ademas del origen.", "error");
        return;
      }
      let assignment = null;
      try {
        const remote = await apiGet(`/feed/${encodeURIComponent(sourceId)}`);
        assignment = remote?.assignment || null;
      } catch {
        const localAssignments = readJsonObject(USER_ASSIGNMENTS_KEY);
        assignment = localAssignments[sourceId] || null;
      }
      if (!assignment || (!assignment.routine && !assignment.diet)) {
        setToolsFeedback("El user origen no tiene plan asignado para duplicar.", "error");
        return;
      }

      const payload = {
        userIds: targetIds,
        mode: assignment.mode || modeSelect?.value || "admin_ai",
        routine: assignment.routine || "",
        diet: assignment.diet || "",
        message: assignment.message || finalMessage?.value?.trim() || "",
        createdBy: "admin",
      };

      const localAssignments = readJsonObject(USER_ASSIGNMENTS_KEY);
      const now = new Date().toISOString();
      targetIds.forEach((id) => {
        localAssignments[id] = {
          routine: payload.routine,
          diet: payload.diet,
          message: payload.message,
          mode: payload.mode,
          updatedAt: now,
        };
      });
      saveJsonObject(USER_ASSIGNMENTS_KEY, localAssignments);

      try {
        await apiPost("/admin/assignments", payload);
      } catch {
        // fallback local
      }
      if (finalRoutine) finalRoutine.value = payload.routine;
      if (finalDiet) finalDiet.value = payload.diet;
      setToolsFeedback(`Plan duplicado de ${sourceId} a ${targetIds.length} user(s).`, "success");
      renderAdminInsights();
      renderAdminTimeline();
      renderUserRoutineFeed();
      renderUserRoutinesPage();
      renderUserDietPage();
    });
  }

  if (exportUserBtn) {
    exportUserBtn.addEventListener("click", () => {
      const userId = timelineUser?.value || Array.from(selectedUsers)[0] || "";
      if (!userId) {
        setToolsFeedback("Selecciona un user para exportar su CSV.", "error");
        return;
      }
      const url = apiUrl(`/admin/report.csv?scope=user&userId=${encodeURIComponent(userId)}`);
      window.open(url, "_blank", "noopener,noreferrer");
      setToolsFeedback("Exportando CSV de user...", "success");
    });
  }

  if (exportWeekBtn) {
    exportWeekBtn.addEventListener("click", () => {
      const url = apiUrl("/admin/report.csv?scope=week");
      window.open(url, "_blank", "noopener,noreferrer");
      setToolsFeedback("Exportando CSV semanal...", "success");
    });
  }

  renderAdminKpis();
  renderAdminLists();
  renderAdminInsights();
  renderAdminTimeline();
};

function initPlanSelectionPage() {
  const planButtons = Array.from(document.querySelectorAll("[data-plan-select]"));
  const summary = document.getElementById("plan-selection-summary");
  const feedback = document.getElementById("plan-payment-feedback");
  const confirmBtn = document.getElementById("plan-confirm-button");
  const dietBasic = document.getElementById("extra-diet-basic");
  const dietPlus = document.getElementById("extra-diet-plus");

  if (!planButtons.length && !summary && !confirmBtn) {
    return;
  }

  const setFeedback = (text, type = "") => {
    if (!feedback) return;
    feedback.className = `reg-feedback ${type}`.trim();
    feedback.textContent = text;
  };

  const readExtras = () => ({
    diet_basic: Boolean(dietBasic?.checked),
    diet_plus: Boolean(dietPlus?.checked),
  });

  const renderSummary = () => {
    if (!summary) return;
    const selected = getPlanSelection();
    const extras = readExtras();
    const extraLines = [];
    if (extras.diet_basic) extraLines.push("Dieta Basica (+$12/mes)");
    if (extras.diet_plus) extraLines.push("Dieta Pro (+$24/mes)");
    const billingRaw = localStorage.getItem(BILLING_TARGET_CACHE_KEY);
    let billing = defaultBillingTarget;
    if (billingRaw) {
      try {
        billing = { ...defaultBillingTarget, ...JSON.parse(billingRaw) };
      } catch {
        billing = defaultBillingTarget;
      }
    }
    summary.innerHTML = `
      <strong>Plan seleccionado: ${selected.label}</strong>
      <p>${selected.price}</p>
      <p>Extras: ${extraLines.length ? extraLines.join(" • ") : "Ninguno"}</p>
      <p class="reg-hint">Pago por transferencia. Envia comprobante a: ${billing.whatsapp || defaultBillingTarget.whatsapp}</p>
    `;
  };

  const setSelection = (planId) => {
    const selection = persistPlanSelection({ id: planId, extras: readExtras() });
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }
    renderSummary();
    applyPlanNavVisibility();
    setFeedback(`Plan ${selection.label} listo. Completa la transferencia demo para activar.`, "success");
  };

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelection(btn.dataset.planSelect || "free");
    });
  });

  [dietBasic, dietPlus].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      const current = getPlanSelection();
      persistPlanSelection({ id: current.id, extras: readExtras() });
      renderSummary();
      applyPlanNavVisibility();
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const current = getCurrentUser();
      if (!current?.id || !current?.email) {
        setFeedback("Primero inicia sesion para solicitar un plan.", "error");
        setTimeout(() => {
          window.location.href = "registro.html#login";
        }, 600);
        return;
      }
      const selection = persistPlanSelection({ id: getPlanSelection().id, extras: readExtras() });
      const billing = await getBillingTarget();
      const pendingSub = {
        userId: current?.id || "",
        planId: selection.id,
        planLabel: selection.label,
        extras: selection.extras || {},
        status: "pending",
        startAt: null,
        endAt: null,
        updatedAt: new Date().toISOString(),
      };
      if (current?.id) {
        setCurrentSubscription(pendingSub);
      }
      if (current?.email) {
        try {
          await syncUserWithBackend({
            name: current.name || "User",
            email: current.email,
            whatsapp: current.whatsapp || "",
            role: current.role || "user",
            plan: selection.label,
          });
          const paymentRemote = await apiPost("/payments/request", {
            userId: current.id,
            planId: selection.id,
            planLabel: selection.label,
            extras: selection.extras || {},
            method: "transfer",
            proofTarget: billing.whatsapp || defaultBillingTarget.whatsapp,
          });
          await syncCurrentSubscriptionFromApi();
          if (paymentRemote?.payment?.existing) {
            setFeedback("Ya tenias una solicitud pendiente para este plan. Reutilizamos esa misma solicitud.", "success");
          } else {
            setFeedback("Solicitud enviada. Queda pendiente hasta validacion en Modo Dios.", "success");
          }
        } catch {
          // fallback local
          setFeedback("Solicitud guardada localmente. Verifica la conexion antes de reenviar.", "success");
        }
      }
      setTimeout(() => {
        window.location.href = "user-hoy.html";
      }, 800);
    });
  }

  const current = getPlanSelection();
  if (dietBasic) dietBasic.checked = Boolean(current.extras?.diet_basic);
  if (dietPlus) dietPlus.checked = Boolean(current.extras?.diet_plus);
  renderSummary();
  getBillingTarget().then(() => renderSummary());
}

function initAdminPaymentsPanel() {
  const list = document.getElementById("admin-payments-list");
  const refreshBtn = document.getElementById("admin-payments-refresh");
  if (!list) {
    return;
  }

  const render = async () => {
    let items = [];
    try {
      const remote = await apiGet("/payments/pending");
      items = Array.isArray(remote?.items) ? remote.items : [];
    } catch {
      items = [];
    }
    list.innerHTML = items.length
      ? items
          .map(
            (it) => `
      <div class="admin-item">
        <strong>${it.userName || "User"} • ${it.planLabel || "Plan"}</strong>
        <p>${it.userEmail || it.userId || ""}</p>
        <p>${new Date(it.createdAt).toLocaleString("es-MX")} • ${it.method || "transfer"}</p>
        <div class="role-actions">
          <button class="ghost" type="button" data-payment-review="approve" data-payment-id="${it.id}">Aprobar</button>
          <button class="ghost" type="button" data-payment-review="reject" data-payment-id="${it.id}">Rechazar</button>
        </div>
      </div>
    `
          )
          .join("")
      : `<div class="admin-item"><p>Sin pagos pendientes.</p></div>`;
  };

  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", render);
  }

  if (!list.dataset.bound) {
    list.dataset.bound = "1";
    list.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-payment-review]");
      if (!btn) return;
      const id = Number(btn.dataset.paymentId || 0);
      const action = btn.dataset.paymentReview || "";
      if (!id || !action) return;
      btn.disabled = true;
      try {
        await apiPost(`/payments/${id}/review`, {
          action,
          reviewedBy: "god",
          note: action === "approve" ? "Pago validado en dashboard." : "Comprobante invalido en demo.",
        });
      } catch {
        // no-op
      } finally {
        render();
      }
    });
  }

  render();
}

function initQaChecklist() {
  const host = document.getElementById("qa-checklist-demo");
  const progress = document.getElementById("qa-checklist-progress");
  if (!host) {
    return;
  }
  const checks = [
    { id: "login_user", label: "Login user funciona" },
    { id: "login_admin", label: "Login admin funciona" },
    { id: "plan_request", label: "Solicitud de pago desde planes" },
    { id: "payment_review", label: "Modo Dios aprueba/rechaza pago" },
    { id: "subscription_gate", label: "Dashboard cambia por suscripcion" },
    { id: "coach_alert", label: "Alerta a coach humano visible en timeline" },
    { id: "diet_gate", label: "Dieta se bloquea/desbloquea por plan" },
    { id: "routine_assign", label: "Asignacion rutina/dieta a user" },
    { id: "theme_h", label: "Vista hombre sin errores visuales" },
    { id: "theme_m", label: "Vista mujer sin errores visuales" },
  ];
  const state = readJsonObject(QA_DEMO_KEY);
  host.innerHTML = checks
    .map(
      (c) => `
      <label class="agree-row">
        <input type="checkbox" data-qa-item="${c.id}" ${state[c.id] ? "checked" : ""} />
        <span>${c.label}</span>
      </label>
    `
    )
    .join("");

  const renderProgress = () => {
    const values = checks.map((c) => Boolean(state[c.id]));
    const done = values.filter(Boolean).length;
    const pct = Math.round((done / checks.length) * 100);
    if (progress) {
      progress.textContent = `${done}/${checks.length} (${pct}%)`;
    }
  };
  renderProgress();

  host.querySelectorAll("[data-qa-item]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.qaItem;
      state[key] = cb.checked;
      saveJsonObject(QA_DEMO_KEY, state);
      renderProgress();
    });
  });
}

function initGodModePanel() {
  const loginBtn = document.getElementById("god-login-btn");
  const logoutBtn = document.getElementById("god-logout-btn");
  const authFeedback = document.getElementById("god-auth-feedback");
  const userInput = document.getElementById("god-user");
  const passInput = document.getElementById("god-pass");
  const saveBillingBtn = document.getElementById("god-save-billing-btn");
  const billingFeedback = document.getElementById("god-billing-feedback");
  const setRoleBtn = document.getElementById("god-set-role-btn");
  const grantPlanBtn = document.getElementById("god-grant-plan-btn");
  const userFeedback = document.getElementById("god-user-feedback");
  const targetUser = document.getElementById("god-target-user");
  const targetRole = document.getElementById("god-target-role");
  const planId = document.getElementById("god-plan-id");
  const planLabel = document.getElementById("god-plan-label");
  const planDays = document.getElementById("god-plan-days");
  const bankName = document.getElementById("god-bank-name");
  const bankHolder = document.getElementById("god-bank-holder");
  const bankClabe = document.getElementById("god-bank-clabe");
  const bankAccount = document.getElementById("god-bank-account");
  const bankWhatsapp = document.getElementById("god-bank-whatsapp");
  const bankNote = document.getElementById("god-bank-note");
  const statusPill = document.getElementById("god-status-pill");
  const usersSearch = document.getElementById("god-users-search");
  const usersRefresh = document.getElementById("god-users-refresh");
  const usersList = document.getElementById("god-users-list");
  const usersCount = document.getElementById("god-users-count");
  const usersAdmin = document.getElementById("god-users-admin");
  const usersPaid = document.getElementById("god-users-paid");
  const usersPending = document.getElementById("god-users-pending");

  if (!loginBtn && !logoutBtn && !saveBillingBtn && !setRoleBtn && !grantPlanBtn) {
    return;
  }

  const setFeedback = (el, text, type = "") => {
    if (!el) return;
    el.className = `reg-feedback ${type}`.trim();
    el.textContent = text;
  };

  const planLabelById = (id) => {
    const normalized = String(id || "").toLowerCase();
    if (normalized === "coach_humano") return "Coach + Humano";
    if (normalized === "ai_coach") return "Coach IA";
    if (normalized === "retos") return "Retos";
    return "Free";
  };

  const hasGod = () => {
    const token = String(localStorage.getItem(GOD_TOKEN_KEY) || "").trim();
    const expiresAt = Date.parse(String(localStorage.getItem(GOD_EXPIRES_KEY) || ""));
    if (!token) return false;
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
      localStorage.removeItem(GOD_TOKEN_KEY);
      localStorage.removeItem(GOD_EXPIRES_KEY);
      return false;
    }
    return true;
  };

  const paintStatus = () => {
    if (!statusPill) return;
    if (hasGod()) {
      statusPill.className = "admin-chip green";
      statusPill.textContent = "Modo Dios activo";
      return;
    }
    statusPill.className = "admin-chip pending";
    statusPill.textContent = "Bloqueado";
  };

  const renderUsers = (users, pendingCount = null) => {
    if (!usersList) return;
    const safe = Array.isArray(users) ? users : [];
    const admins = safe.filter((u) => String(u.role || "").toLowerCase() === "admin").length;
    const paid = safe.filter((u) => String(u.plan || "Free").toLowerCase() !== "free").length;
    if (usersCount) usersCount.textContent = String(safe.length);
    if (usersAdmin) usersAdmin.textContent = String(admins);
    if (usersPaid) usersPaid.textContent = String(paid);
    if (usersPending) usersPending.textContent = pendingCount == null ? "-" : String(pendingCount);

    if (!safe.length) {
      usersList.innerHTML = `<div class="admin-item"><p>Sin users para mostrar.</p></div>`;
      return;
    }
    usersList.innerHTML = safe
      .map((u) => {
        const email = String(u.email || u.id || "").toLowerCase();
        const role = String(u.role || "user").toLowerCase();
        const plan = String(u.plan || "Free");
        const roleClass = role === "admin" ? "green" : "yellow";
        const planClass = plan.toLowerCase() === "free" ? "pending" : "green";
        return `
          <article class="god-user-row">
            <div>
              <strong>${escHtml(u.name || "User")}</strong>
              <p>${escHtml(email)}</p>
            </div>
            <div class="god-user-chips">
              <span class="admin-chip ${roleClass}">${escHtml(role.toUpperCase())}</span>
              <span class="admin-chip ${planClass}">${escHtml(plan)}</span>
            </div>
            <div class="god-user-actions">
              <button class="ghost" type="button" data-god-action="fill" data-god-user="${escHtml(email)}" data-god-role="${escHtml(role)}" data-god-plan="${escHtml(plan)}">Cargar</button>
              <button class="ghost" type="button" data-god-action="role-admin" data-god-user="${escHtml(email)}">Admin</button>
              <button class="ghost" type="button" data-god-action="role-user" data-god-user="${escHtml(email)}">User</button>
              <button class="primary" type="button" data-god-action="grant-coach" data-god-user="${escHtml(email)}">Coach+Humano</button>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const loadGodUsers = async (query = "") => {
    if (!usersList) return;
    if (!hasGod()) {
      renderUsers([]);
      usersList.innerHTML = `<div class="admin-item"><p>Activa Modo Dios para ver y gestionar usuarios.</p></div>`;
      return;
    }
    try {
      const remote = await apiGet(`/users?search=${encodeURIComponent(query.trim())}`);
      const users = Array.isArray(remote?.users) ? remote.users : [];
      let pending = null;
      try {
        const p = await apiGet("/payments/pending");
        pending = Array.isArray(p?.items) ? p.items.length : 0;
      } catch {
        pending = null;
      }
      renderUsers(users, pending);
    } catch {
      usersList.innerHTML = `<div class="admin-item"><p>No se pudo cargar users desde API.</p></div>`;
    }
  };

  const refreshBilling = async () => {
    if (!hasGod()) return;
    try {
      const remote = await apiGet("/god/settings/billing-target");
      const billing = remote?.billing || {};
      if (bankName) bankName.value = billing.bankName || "";
      if (bankHolder) bankHolder.value = billing.accountHolder || "";
      if (bankClabe) bankClabe.value = billing.clabe || "";
      if (bankAccount) bankAccount.value = billing.accountNumber || "";
      if (bankWhatsapp) bankWhatsapp.value = billing.whatsapp || "";
      if (bankNote) bankNote.value = billing.note || "";
    } catch {
      // no-op
    }
  };

  if (loginBtn && !loginBtn.dataset.bound) {
    loginBtn.dataset.bound = "1";
    loginBtn.addEventListener("click", async () => {
      const username = userInput?.value?.trim();
      const password = passInput?.value?.trim();
      if (!username || !password) {
        setFeedback(authFeedback, "Ingresa user y password.", "error");
        return;
      }
      try {
        const remote = await apiPost("/god/login", { username, password });
        const token = String(remote?.token || "");
        if (!token) {
          throw new Error("god_token_missing");
        }
        localStorage.setItem(GOD_TOKEN_KEY, token);
        localStorage.setItem(GOD_EXPIRES_KEY, String(remote?.expiresAt || ""));
        setFeedback(authFeedback, "Modo Dios activo.", "success");
        paintStatus();
        syncGodLinkVisibility();
        await refreshBilling();
        await loadGodUsers(usersSearch?.value || "");
      } catch (error) {
        const message = String(error?.message || "");
        if (message.includes("god_mode_disabled")) {
          setFeedback(authFeedback, "Modo Dios deshabilitado en API.", "error");
        } else if (message.includes("invalid_credentials")) {
          setFeedback(authFeedback, "Credenciales invalidas para Modo Dios.", "error");
        } else {
          setFeedback(authFeedback, `Error Modo Dios: ${message || "desconocido"}`, "error");
        }
      }
    });
  }

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = "1";
    logoutBtn.addEventListener("click", async () => {
      try {
        await apiPost("/god/logout", {});
      } catch {
        // ignore
      }
      localStorage.removeItem(GOD_TOKEN_KEY);
      localStorage.removeItem(GOD_EXPIRES_KEY);
      setFeedback(authFeedback, "Modo Dios cerrado.", "success");
      paintStatus();
      syncGodLinkVisibility();
      loadGodUsers("");
    });
  }

  if (saveBillingBtn && !saveBillingBtn.dataset.bound) {
    saveBillingBtn.dataset.bound = "1";
    saveBillingBtn.addEventListener("click", async () => {
      if (!hasGod()) {
        setFeedback(billingFeedback, "Activa Modo Dios primero.", "error");
        return;
      }
      try {
        const remote = await apiPost("/god/settings/billing-target", {
          bankName: bankName?.value?.trim() || "",
          accountHolder: bankHolder?.value?.trim() || "",
          clabe: bankClabe?.value?.trim() || "",
          accountNumber: bankAccount?.value?.trim() || "",
          whatsapp: bankWhatsapp?.value?.trim() || "",
          note: bankNote?.value?.trim() || "",
        });
        if (remote?.billing) {
          localStorage.setItem(BILLING_TARGET_CACHE_KEY, JSON.stringify(remote.billing));
        }
        setFeedback(billingFeedback, "Cuenta bancaria actualizada.", "success");
      } catch {
        setFeedback(billingFeedback, "No se pudo actualizar cuenta bancaria.", "error");
      }
    });
  }

  if (setRoleBtn && !setRoleBtn.dataset.bound) {
    setRoleBtn.dataset.bound = "1";
    setRoleBtn.addEventListener("click", async () => {
      if (!hasGod()) {
        setFeedback(userFeedback, "Activa Modo Dios primero.", "error");
        return;
      }
      const userId = targetUser?.value?.trim().toLowerCase();
      const role = targetRole?.value || "user";
      if (!userId) {
        setFeedback(userFeedback, "Ingresa email del usuario.", "error");
        return;
      }
      try {
        await apiPost("/god/users/role", { userId, role });
        setFeedback(userFeedback, `Rol actualizado a ${role}.`, "success");
        await loadGodUsers(usersSearch?.value || "");
      } catch {
        setFeedback(userFeedback, "No se pudo actualizar rol.", "error");
      }
    });
  }

  if (grantPlanBtn && !grantPlanBtn.dataset.bound) {
    grantPlanBtn.dataset.bound = "1";
    grantPlanBtn.addEventListener("click", async () => {
      if (!hasGod()) {
        setFeedback(userFeedback, "Activa Modo Dios primero.", "error");
        return;
      }
      const userId = targetUser?.value?.trim().toLowerCase();
      if (!userId) {
        setFeedback(userFeedback, "Ingresa email del usuario.", "error");
        return;
      }
      const payload = {
        userId,
        planId: planId?.value || "free",
        planLabel: planLabel?.value?.trim() || planLabelById(planId?.value),
        durationDays: Number(planDays?.value || 30),
        status: "active",
      };
      try {
        await apiPost("/god/users/grant-plan", payload);
        setFeedback(userFeedback, `Plan ${payload.planLabel} otorgado a ${userId}.`, "success");
        await loadGodUsers(usersSearch?.value || "");
      } catch {
        setFeedback(userFeedback, "No se pudo otorgar plan.", "error");
      }
    });
  }

  if (usersSearch && !usersSearch.dataset.bound) {
    usersSearch.dataset.bound = "1";
    usersSearch.addEventListener("input", () => {
      loadGodUsers(usersSearch.value || "");
    });
  }

  if (usersRefresh && !usersRefresh.dataset.bound) {
    usersRefresh.dataset.bound = "1";
    usersRefresh.addEventListener("click", () => {
      loadGodUsers(usersSearch?.value || "");
    });
  }

  if (usersList && !usersList.dataset.bound) {
    usersList.dataset.bound = "1";
    usersList.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-god-action]");
      if (!btn || !hasGod()) return;
      const action = btn.dataset.godAction || "";
      const userId = String(btn.dataset.godUser || "").trim().toLowerCase();
      if (!userId) return;
      if (action === "fill") {
        if (targetUser) targetUser.value = userId;
        if (targetRole) targetRole.value = btn.dataset.godRole === "admin" ? "admin" : "user";
        return;
      }
      if (action === "role-admin" || action === "role-user") {
        const role = action === "role-admin" ? "admin" : "user";
        try {
          await apiPost("/god/users/role", { userId, role });
          setFeedback(userFeedback, `Rol ${role} aplicado a ${userId}.`, "success");
          await loadGodUsers(usersSearch?.value || "");
        } catch {
          setFeedback(userFeedback, "No se pudo actualizar rol.", "error");
        }
        return;
      }
      if (action === "grant-coach") {
        try {
          await apiPost("/god/users/grant-plan", {
            userId,
            planId: "coach_humano",
            planLabel: "Coach + Humano",
            durationDays: 30,
            status: "active",
          });
          setFeedback(userFeedback, `Plan Coach + Humano otorgado a ${userId}.`, "success");
          await loadGodUsers(usersSearch?.value || "");
        } catch {
          setFeedback(userFeedback, "No se pudo otorgar plan.", "error");
        }
      }
    });
  }

  paintStatus();
  refreshBilling();
  loadGodUsers();
}

function applyPlanNavVisibility() {
  const caps = getPlanCapabilities();
  document.querySelectorAll('a[href="user-dieta.html"]').forEach((link) => {
    if (caps.dietAccess) {
      link.style.opacity = "";
      link.style.pointerEvents = "";
      link.removeAttribute("title");
      return;
    }
    link.style.opacity = "0.55";
    link.style.pointerEvents = "none";
    link.title = "Activa extra de dieta en Planes para abrir este modulo";
  });
}

const USER_SESSION_KEYS = [
  CURRENT_USER_KEY,
  GOD_TOKEN_KEY,
  GOD_EXPIRES_KEY,
  SUBSCRIPTION_CACHE_KEY,
  BILLING_TARGET_CACHE_KEY,
  PLAN_SELECTION_KEY,
  REG_DRAFT_KEY,
  REG_PROFILE_KEY,
  ONBOARDING_DONE_STORAGE_KEY,
  "discipline_onbp_dynamic_v1",
];

const logoutCurrentUser = async () => {
  const godToken = String(localStorage.getItem(GOD_TOKEN_KEY) || "").trim();
  if (godToken) {
    try {
      await apiPost("/god/logout", {});
    } catch {
      // ignorar si falla
    }
  }
  USER_SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
  window.location.replace("registro.html#login");
};

const initUserLogoutButton = () => {
  const userPages = new Set(["user-hoy.html", "user-rutinas.html", "user-progreso.html", "user-dieta.html", "user-checkin.html"]);
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (!userPages.has(page)) return;
  const navActions = document.querySelector(".user-panel-nav .nav-actions");
  if (!navActions || navActions.querySelector("[data-action='logout']")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost logout-btn";
  btn.setAttribute("data-action", "logout");
  btn.textContent = "Salir";
  btn.addEventListener("click", () => {
    if (confirm("¿Cerrar sesión?")) {
      showToast("Sesion cerrada. Hasta pronto.", "info", 1500);
      setTimeout(logoutCurrentUser, 600);
    }
  });
  navActions.appendChild(btn);
};

const initPublicNavSessionButton = () => {
  const navActions = document.querySelector(".nav .nav-actions");
  if (!navActions) return;

  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const blockedPages = new Set([
    "registro.html",
    "app-inicio.html",
    "admin.html",
    "god-panel.html",
    "user-hoy.html",
    "user-rutinas.html",
    "user-progreso.html",
    "user-dieta.html",
    "user-checkin.html",
    "onboarding.html",
    "onboarding-1.html",
    "onboarding-2.html",
    "onboarding-3.html",
    "onboarding-4.html",
    "onboarding-4-apuesta.html",
    "onboarding-5.html",
    "onboarding-6.html",
    "onboarding-7.html",
    "onboarding-8.html",
    "onboarding-8-modos.html",
    "onboarding-9.html",
    "onboarding-resumen.html",
  ]);
  if (blockedPages.has(page)) return;

  const loginLink = navActions.querySelector(".nav-login-btn");
  const guestAuthLink = Array.from(navActions.querySelectorAll("a[href]")).find((a) => {
    const href = String(a.getAttribute("href") || "").toLowerCase();
    return href.includes("registro.html#login") || href === "registro.html" || href.includes("registro/login");
  });
  const current = getCurrentUser();
  const isLogged = Boolean(current);

  let logoutBtn = navActions.querySelector("[data-public-nav-logout]");
  if (!isLogged) {
    if (loginLink) loginLink.style.display = "";
    if (guestAuthLink) guestAuthLink.style.display = "";
    if (logoutBtn) logoutBtn.remove();
    return;
  }

  if (loginLink) {
    loginLink.style.display = "none";
  }
  if (guestAuthLink) {
    guestAuthLink.style.display = "none";
  }
  if (logoutBtn) {
    return;
  }

  logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "nav-login-btn";
  logoutBtn.setAttribute("data-public-nav-logout", "1");
  logoutBtn.textContent = "Cerrar sesion";
  logoutBtn.addEventListener("click", () => {
    if (confirm("¿Cerrar sesión?")) {
      logoutCurrentUser();
    }
  });
  navActions.appendChild(logoutBtn);
};

/* ── TOAST NOTIFICATION SYSTEM ── */
const _toastQueue = [];
let _toastActive = false;

function showToast(message, type = "info", duration = 2800) {
  _toastQueue.push({ message, type, duration });
  if (!_toastActive) _processToastQueue();
}

function _processToastQueue() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { message, type, duration } = _toastQueue.shift();
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ️"}</span><span class="toast-msg">${String(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--show"));
  setTimeout(() => {
    toast.classList.add("toast--hide");
    setTimeout(() => { toast.remove(); _processToastQueue(); }, 380);
  }, duration);
}

/* ── USER GREETING ── */
function renderUserGreeting() {
  const el = document.getElementById("user-greeting");
  if (!el) return;
  const user = getCurrentUser();
  if (!user?.name) return;
  const firstName = String(user.name).split(" ")[0];
  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  el.textContent = `${saludo}, ${firstName}.`;
}

/* ── RING TIMER ── */
const RING_TOTAL_SECONDS = 10 * 60;
function updateRingTimer(remainingSeconds) {
  const ring = document.getElementById("today-ring-fill");
  if (!ring) return;
  const pct = Math.max(0, Math.min(1, remainingSeconds / RING_TOTAL_SECONDS));
  const circumference = 2 * Math.PI * 42; // r=42
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - pct)}`;
  // Color: green -> orange -> red
  const hue = Math.round(pct * 120); // 120=green, 0=red
  ring.style.stroke = `hsl(${hue}, 85%, 52%)`;
}

/* ── ADMIN AUTO-REFRESH ── */
function initAdminAutoRefresh() {
  const isAdminPage = (window.location.pathname.split("/").pop() || "").toLowerCase() === "admin.html";
  if (!isAdminPage) return;
  const REFRESH_INTERVAL = 30 * 1000;
  setInterval(() => {
    if (typeof renderAdminKpis === "function") renderAdminKpis();
    if (typeof renderAdminInsights === "function") renderAdminInsights();
  }, REFRESH_INTERVAL);
}

/* ── ADMIN TAB NAV ── */
function initAdminTabNav() {
  const nav = document.getElementById("admin-tab-nav");
  if (!nav) return;
  const tabs = nav.querySelectorAll(".admin-tab[data-tab]");
  if (!tabs.length) return;

  const scrollToSection = (sectionId) => {
    const el = document.getElementById(`admin-section-${sectionId}`);
    if (!el) return;
    const offset = nav.getBoundingClientRect().height + 12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      scrollToSection(tab.dataset.tab);
    });
  });

  // Highlight tab on scroll via IntersectionObserver
  const sections = Array.from(document.querySelectorAll(".admin-panel-section[data-admin-section], #admin-section-modo-dios[data-admin-section]"));
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const sectionId = entry.target.dataset.adminSection;
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === sectionId));
      });
    },
    { rootMargin: "-55% 0px -40% 0px" }
  );

  sections.forEach((s) => observer.observe(s));
}

/* ── MODO DIOS: pulse status when active ── */
function initGodStatusPulse() {
  const pill = document.getElementById("god-status-pill");
  if (!pill) return;
  const token = String(localStorage.getItem(GOD_TOKEN_KEY) || "").trim();
  const exp = Date.parse(String(localStorage.getItem(GOD_EXPIRES_KEY) || ""));
  const active = token && (!Number.isFinite(exp) || Date.now() <= exp);
  if (active) {
    pill.className = "admin-chip green god-status-badge";
    pill.textContent = "Modo Dios activo";
  }
}

initRoleMode();
initAppEntryScreen();
hideGuestOnlyLinksIfLogged();
guardAuthScreensForLoggedUser();
enforceOnboardingBeforeHome();
initUserLogoutButton();
initPublicNavSessionButton();
initAdminPanel();
initAdminPaymentsPanel();
initQaChecklist();
initGodModePanel();
initAdminTabNav();
initGodStatusPulse();
initAdminAutoRefresh();
renderUserGreeting();
initHomeGodEntry();
initPlanSelectionPage();
applyPlanNavVisibility();
renderUserRoutineFeed();
renderUserRoutinesPage();
renderUserProgressPage();
renderUserDietPage();
renderUserPlanPanel();
renderUserNotifications();
initUserCheckinPage();

const bootApiSession = async () => {
  try {
    await apiGet("/health");
  } catch {
    return;
  }
  const current = getCurrentUser();
  if (!current?.email) {
    return;
  }
  try {
    const remote = await syncUserWithBackend({
      name: current.name || "User",
      email: current.email,
      whatsapp: current.whatsapp || "",
      role: current.role || "user",
      plan: current.plan || getPlanSelection().label,
      horario: current.horario || "",
      objetivo: current.objetivo || "",
    });
    hydrateUserCacheFromApi(remote?.user);
    await syncCurrentSubscriptionFromApi();
    renderUserPlanPanel();
    renderUserRoutinesPage();
    renderUserDietPage();
    renderUserProgressPage();
    renderWeeklyAiAdjustment();
    applyPlanNavVisibility();
    renderUserNotifications();
  } catch (err) {
    console.warn("[api] fallback local:", err?.message || err);
  }
};

bootApiSession();

const ONBOARDING_KEY = "discipline_onboarding_v1";
const ONBOARDING_DONE_KEY = ONBOARDING_DONE_STORAGE_KEY;

const onbShell = document.getElementById("onb-shell");
const onbSteps = Array.from(document.querySelectorAll(".onb-step"));
const onbDots = document.getElementById("onb-dots");
const onbBack = document.getElementById("onb-back");

if (onbShell && onbSteps.length) {
  const onbState = {
    step: 0,
    answers: {},
  };

  const saved = localStorage.getItem(ONBOARDING_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      onbState.step = Number(parsed.step || 0);
      onbState.answers = parsed.answers || {};
    } catch {
      localStorage.removeItem(ONBOARDING_KEY);
    }
  }

  const persistOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(onbState));
  };

  const ensureStepBounds = () => {
    if (onbState.step < 0) {
      onbState.step = 0;
    }
    if (onbState.step > onbSteps.length - 1) {
      onbState.step = onbSteps.length - 1;
    }
  };

  const hasSelectionForStep = (stepEl) => {
    const key = stepEl.dataset.key;
    if (!key) {
      return true;
    }
    const value = onbState.answers[key];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  };

  const updateNextAvailability = (stepEl) => {
    const nextBtn = stepEl.querySelector(".onb-next");
    if (!nextBtn) {
      return;
    }
    const required = stepEl.dataset.requiresChoice === "true";
    nextBtn.disabled = required ? !hasSelectionForStep(stepEl) : false;
  };

  const renderDots = () => {
    if (!onbDots) {
      return;
    }
    onbDots.innerHTML = onbSteps
      .map((_, idx) => `<span class="onb-dot ${idx === onbState.step ? "active" : ""}"></span>`)
      .join("");
  };

  const renderOnboarding = () => {
    ensureStepBounds();
    onbSteps.forEach((stepEl, idx) => {
      const active = idx === onbState.step;
      stepEl.classList.toggle("active", active);
      updateNextAvailability(stepEl);
    });
    renderDots();
    if (onbBack) {
      onbBack.style.visibility = onbState.step === 0 ? "hidden" : "visible";
    }
  };

  const nextStep = () => {
    if (onbState.step < onbSteps.length - 1) {
      onbState.step += 1;
      persistOnboarding();
      renderOnboarding();
      return;
    }
    localStorage.setItem(ONBOARDING_DONE_KEY, "true");
  };

  const prevStep = () => {
    if (onbState.step > 0) {
      onbState.step -= 1;
      persistOnboarding();
      renderOnboarding();
    }
  };

  onbSteps.forEach((stepEl) => {
    const key = stepEl.dataset.key;
    const isMulti = stepEl.dataset.multi === "true";
    const options = stepEl.querySelectorAll(".onb-option");

    if (key && onbState.answers[key]) {
      const initial = onbState.answers[key];
      options.forEach((btn) => {
        if (isMulti && Array.isArray(initial)) {
          btn.classList.toggle("active", initial.includes(btn.dataset.value));
        } else {
          btn.classList.toggle("active", initial === btn.dataset.value);
        }
      });
    }

    options.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.value;
        if (!key || !value) {
          return;
        }

        if (isMulti) {
          const current = Array.isArray(onbState.answers[key]) ? [...onbState.answers[key]] : [];
          const exists = current.includes(value);
          onbState.answers[key] = exists ? current.filter((v) => v !== value) : [...current, value];
          btn.classList.toggle("active", !exists);
        } else {
          onbState.answers[key] = value;
          options.forEach((o) => o.classList.remove("active"));
          btn.classList.add("active");
        }

        persistOnboarding();
        updateNextAvailability(stepEl);
      });
    });

    const nextBtn = stepEl.querySelector(".onb-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", nextStep);
    }
  });

  if (onbBack) {
    onbBack.addEventListener("click", prevStep);
  }

  const onbFinish = document.getElementById("onb-finish");
  if (onbFinish) {
    onbFinish.addEventListener("click", () => {
      localStorage.setItem(ONBOARDING_DONE_KEY, "true");
      persistOnboarding();
    });
  }

  renderOnboarding();
}

const tones = {
  estricto: [
    "Responde en 10 min. Cumpliste?",
    "Si fallas, manana pagas con 8 min extra.",
  ],
  neutral: [
    "Check-in del dia. Cumpliste?",
    "Si fallas hoy, manana sumas un bloque extra.",
  ],
  rudo: [
    "No me ignores. Cumpliste o fallaste?",
    "Sin respuesta = fallo. Manana pagas.",
  ],
};

const toneButtons = document.querySelectorAll("[data-tone]");
const toneChat = document.getElementById("tone-chat");

const renderTone = (tone) => {
  if (!toneChat || !tones[tone]) {
    return;
  }
  const [first, second] = tones[tone];
  toneChat.innerHTML = `
    <div class="bubble coach">${first}</div>
    <div class="bubble user">No</div>
    <div class="bubble coach warning">${second}</div>
  `;
};

toneButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toneButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTone(btn.dataset.tone);
  });
});

renderTone("estricto");

const simChat = document.getElementById("sim-chat");
const simName = document.getElementById("sim-name");
const simReset = document.getElementById("sim-reset");
const simToneButtons = document.querySelectorAll("[data-sim-tone]");
const simAnswerButtons = document.querySelectorAll("[data-sim-answer]");

let simTone = "estricto";

const simScripts = {
  estricto: {
    si: "Bien. Mantienes la racha.",
    no: "Manana sumas 8 min extra. No negocies.",
    ignore: "Sin respuesta = incumplimiento. Se activa castigo.",
  },
  neutral: {
    si: "Bien. Racha intacta.",
    no: "Manana agregas un bloque extra.",
    ignore: "Sin respuesta se marca incumplimiento.",
  },
  rudo: {
    si: "Cumpliste. Sigue.",
    no: "Manana pagas. Sin excusas.",
    ignore: "Te marque fallo. Punto.",
  },
};

const addBubble = (text, who = "coach") => {
  if (!simChat) {
    return;
  }
  const bubble = document.createElement("div");
  bubble.className = `bubble ${who}`;
  bubble.textContent = text;
  simChat.appendChild(bubble);
  simChat.scrollTop = simChat.scrollHeight;
};

const resetSim = () => {
  if (!simChat) {
    return;
  }
  simChat.innerHTML = `
    <div class="bubble coach">Hora de check-in. Responde en 10 min.</div>
    <div class="bubble coach">Entrenaste hoy?</div>
  `;
};

simToneButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    simToneButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    simTone = btn.dataset.simTone;
  });
});

simAnswerButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = (simName?.value || "").trim() || "Usuario";
    const answer = btn.dataset.simAnswer;
    const label = answer === "si" ? "Si" : answer === "no" ? "No" : "No respondi";
    addBubble(label, "user");
    addBubble(`${name}, ${simScripts[simTone][answer]}`, "coach");
  });
});

if (simReset) {
  simReset.addEventListener("click", resetSim);
}
resetSim();

const faqItems = document.querySelectorAll("[data-faq]");
faqItems.forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.toggle("active");
  });
});

const sections = document.querySelectorAll(".section");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in");
        const children = entry.target.querySelectorAll(
          ".card, .panel, .workout, .price-card, .quote, .step, .flow-card, .roadmap-card"
        );
        children.forEach((el, idx) => {
          el.style.setProperty("--i", idx);
        });
      }
    });
  },
  { threshold: 0.12 }
);

sections.forEach((section) => observer.observe(section));

const demoChat = document.getElementById("demo-chat");
const demoSteps = document.getElementById("demo-steps");
const demoButtons = document.getElementById("demo-buttons");
const demoNext = document.getElementById("demo-next");
const demoBack = document.getElementById("demo-back");
const demoReset = document.getElementById("demo-reset");
const demoCountdown = document.getElementById("demo-countdown");
let demoCompleted = false;

const demoFlow = [
  { label: "Objetivo fisico", question: "Cual es tu objetivo principal?", options: ["Bajar peso", "Constancia", "Rendimiento total"] },
  { label: "Tiempo diario", question: "Cuanto tiempo real tienes por dia?", options: ["20 min", "30 min", "40 min"] },
  { label: "Lugar de entrenamiento", question: "Donde entrenas normalmente?", options: ["Casa", "Gym", "Mixto"] },
  { label: "Deporte base", question: "Que deporte practicas con mas frecuencia?", options: ["Running", "Ciclismo", "Natacion", "CrossFit", "MMA", "Yoga"] },
  { label: "Tono del coach", question: "Como quieres que te hable el coach?", options: ["Estricto", "Neutral", "Rudo"] },
  { label: "Perfil mental", question: "Que perfil te describe mejor?", options: ["Guerrera", "Guerrero", "Constante", "Estrategica", "Imparable"] },
  { label: "Principal bloqueo", question: "Que te frena mas para cumplir?", options: ["Ansiedad", "Estres", "Falta de tiempo", "Falta de energia", "Procrastinacion"] },
  { label: "Modo especial (presion)", question: "Como quieres que se aplique la exigencia?", options: ["Contrato", "Apuesta", "Competencia"] },
  { label: "Voz del sistema", question: "Con que tipo de voz prefieres los mensajes?", options: ["Masculina", "Femenina", "Robotica"] },
  { label: "Plan inicial (alcance)", question: "Que plan quieres activar al inicio?", options: ["Free", "Coach IA", "Coach + Humano", "Retos"] },
];

let demoIndex = 0;
let demoTimer = null;
let demoSeconds = 600;

const renderDemoSteps = () => {
  if (!demoSteps) {
    return;
  }
  demoSteps.innerHTML = demoFlow
    .map((step, idx) => {
      const cls = idx === demoIndex ? "demo-step-active" : "";
      return `<span class="${cls}">${idx + 1}. ${step.label}</span>`;
    })
    .join("");
};

const completeDemo = () => {
  if (!demoChat || !demoButtons) {
    return;
  }
  demoCompleted = true;
  if (demoTimer) {
    clearInterval(demoTimer);
  }
  if (demoCountdown) {
    demoCountdown.textContent = "00:00";
  }
  demoButtons.innerHTML = "";
  const done = document.createElement("div");
  done.className = "bubble coach";
  done.textContent = "Listo. Registro completado. Te enviamos tu primer check-in.";
  demoChat.appendChild(done);
  const cta = document.createElement("div");
  cta.className = "bubble coach";
  cta.textContent = "Ahora toca activar tu coach real.";
  demoChat.appendChild(cta);
  const link = document.createElement("a");
  link.className = "ghost full";
  link.href = "registro.html";
  link.textContent = "Ir al registro";
  demoButtons.appendChild(link);
  demoChat.scrollTop = demoChat.scrollHeight;
};

const renderDemoButtons = () => {
  if (!demoButtons || !demoChat) {
    return;
  }
  demoButtons.innerHTML = "";
  demoFlow[demoIndex].options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      if (demoCompleted) {
        return;
      }
      const bubble = document.createElement("div");
      bubble.className = "bubble user";
      bubble.textContent = opt;
      demoChat.appendChild(bubble);
      const reply = document.createElement("div");
      reply.className = "bubble coach";
      reply.textContent = "Anotado. Siguiente.";
      demoChat.appendChild(reply);
      demoChat.scrollTop = demoChat.scrollHeight;
      if (demoIndex < demoFlow.length - 1) {
        demoIndex += 1;
        renderDemoQuestion();
      } else {
        completeDemo();
      }
    });
    demoButtons.appendChild(btn);
  });
};

const tickCountdown = () => {
  demoSeconds -= 1;
  if (demoSeconds <= 0) {
    if (demoCountdown) {
      demoCountdown.textContent = "00:00";
    }
    if (demoChat) {
      const warn = document.createElement("div");
      warn.className = "bubble coach warning";
      warn.textContent = "Tiempo agotado. El silencio tambien es una respuesta.";
      demoChat.appendChild(warn);
      demoChat.scrollTop = demoChat.scrollHeight;
    }
    resetCountdown();
    return;
  }
  const mm = String(Math.floor(demoSeconds / 60)).padStart(2, "0");
  const ss = String(demoSeconds % 60).padStart(2, "0");
  if (demoCountdown) {
    demoCountdown.textContent = `${mm}:${ss}`;
  }
};

const resetCountdown = () => {
  if (demoCompleted) {
    if (demoTimer) {
      clearInterval(demoTimer);
    }
    return;
  }
  demoSeconds = 600;
  if (demoCountdown) {
    demoCountdown.textContent = "10:00";
  }
  if (demoTimer) {
    clearInterval(demoTimer);
  }
  demoTimer = setInterval(tickCountdown, 1000);
};

const renderDemoQuestion = () => {
  if (!demoChat) {
    return;
  }
  const q = document.createElement("div");
  q.className = "bubble coach";
  q.textContent = demoFlow[demoIndex].question;
  demoChat.appendChild(q);
  demoChat.scrollTop = demoChat.scrollHeight;
  renderDemoSteps();
  renderDemoButtons();
  resetCountdown();
};

const resetDemo = () => {
  if (!demoChat) {
    return;
  }
  demoChat.innerHTML = `
    <div class="bubble coach">Bienvenido. Este sistema no te motiva, te observa.</div>
  `;
  demoIndex = 0;
  demoCompleted = false;
  renderDemoQuestion();
};

if (demoNext) {
  demoNext.addEventListener("click", () => {
    if (demoCompleted) {
      return;
    }
    if (demoIndex < demoFlow.length - 1) {
      demoIndex += 1;
      renderDemoQuestion();
      return;
    }
    completeDemo();
  });
}

if (demoBack) {
  demoBack.addEventListener("click", () => {
    if (demoCompleted) {
      return;
    }
    if (demoIndex > 0) {
      demoIndex -= 1;
      renderDemoQuestion();
    }
  });
}

if (demoReset) {
  demoReset.addEventListener("click", resetDemo);
}
resetDemo();

const regForm = document.getElementById("registration-form");
const regSteps = document.querySelectorAll(".reg-step");
const regNext = document.getElementById("reg-next");
const regBack = document.getElementById("reg-back");
const regSubmit = document.getElementById("reg-submit");
const regStepLabel = document.getElementById("reg-step-label");
const regProgressFill = document.getElementById("reg-progress-fill");
const regDots = document.getElementById("reg-dots");
const regFeedback = document.getElementById("reg-feedback");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginWhatsapp = document.getElementById("login-whatsapp");
const loginFeedback = document.getElementById("login-feedback");
const regSummary = document.getElementById("reg-summary");
const regSportSelect = document.getElementById("deporte");
const regSportOtherField = document.getElementById("deporte-otro-field");
const regSportOtherInput = document.getElementById("deporte-otro");
const regHomeSelect = document.getElementById("entreno-casa");
const regEquipField = document.getElementById("equipo-field");
const regEquipSelect = document.getElementById("equipo-casa");

const lockRegistrationIfGuidedDone = () => {
  if (!regForm || !regSummary) {
    return;
  }
  const done = localStorage.getItem(ONBOARDING_DONE_KEY);
  const current = getCurrentUser();
  regForm.style.display = "none";
  const regProgress = document.querySelector(".reg-progress");
  if (regProgress) {
    regProgress.style.display = "none";
  }
  if (done === "1" || done === "true") {
    regSummary.innerHTML = `
      <h3>Registro ya completado en la guia</h3>
      <p>Tu cuenta ya esta activada${current ? ` como <strong>${current.name}</strong>` : ""}. No necesitas repetir el formulario.</p>
      <div class="role-actions">
        <a class="primary" href="app-inicio.html">Entrar a la app</a>
        <a class="ghost" href="registro.html#login">Ir a login</a>
      </div>
    `;
    return;
  }
  regSummary.innerHTML = `
    <h3>Registro centralizado en la guia</h3>
    <p>Para evitar duplicados, el alta completa se hace solo en pantallas guiadas.</p>
    <div class="role-actions">
      <a class="primary" href="onboarding-1.html">Ir a la guia</a>
      <a class="ghost" href="registro.html#login">Ya tengo cuenta</a>
    </div>
  `;
};

lockRegistrationIfGuidedDone();

let regIndex = 0;

const syncSportOtherVisibility = () => {
  if (regSportSelect && regSportOtherField && regSportOtherInput) {
    const isOther = regSportSelect.value === "Otro";
    regSportOtherField.classList.toggle("visible", isOther);
    regSportOtherInput.required = isOther;
    if (!isOther) {
      regSportOtherInput.value = "";
    }
  }

  if (regHomeSelect && regEquipField && regEquipSelect) {
    const showEquip = regHomeSelect.value === "Si" || regHomeSelect.value === "Mixto";
    regEquipField.classList.toggle("visible", showEquip);
    regEquipSelect.required = showEquip;
    if (!showEquip) {
      regEquipSelect.value = "";
    }
  }
};

const saveRegistrationDraft = () => {
  if (!regForm) {
    return;
  }
  const data = new FormData(regForm);
  const draft = {};
  for (const [key, value] of data.entries()) {
    draft[key] = value;
  }
  localStorage.setItem(REG_DRAFT_KEY, JSON.stringify(draft));
};

const loadRegistrationDraft = () => {
  if (!regForm) {
    return;
  }
  const raw = localStorage.getItem(REG_DRAFT_KEY);
  if (!raw) {
    return;
  }
  try {
    const draft = JSON.parse(raw);
    Object.entries(draft).forEach(([key, value]) => {
      const field = regForm.elements.namedItem(key);
      if (!field) {
        return;
      }
      if (field.type === "checkbox") {
        field.checked = value === "on" || value === true;
      } else {
        field.value = value;
      }
    });
  } catch (err) {
    localStorage.removeItem(REG_DRAFT_KEY);
  }
};

const clearRegFeedback = () => {
  if (regFeedback) {
    regFeedback.textContent = "";
    regFeedback.className = "reg-feedback";
  }
};

const renderRegState = () => {
  if (!regSteps.length) {
    return;
  }
  regSteps.forEach((step, idx) => {
    step.classList.toggle("active", idx === regIndex);
  });

  const total = regSteps.length;
  if (regStepLabel) {
    regStepLabel.textContent = `Paso ${regIndex + 1} de ${total}`;
  }
  if (regProgressFill) {
    regProgressFill.style.width = `${((regIndex + 1) / total) * 100}%`;
  }
  if (regDots) {
    regDots.innerHTML = Array.from({ length: total }, (_, idx) => {
      const cls = idx === regIndex ? "reg-dot active" : "reg-dot";
      return `<span class="${cls}"></span>`;
    }).join("");
  }

  if (regBack) {
    regBack.style.visibility = regIndex === 0 ? "hidden" : "visible";
  }
  if (regNext) {
    regNext.style.display = regIndex === total - 1 ? "none" : "inline-flex";
  }
  if (regSubmit) {
    regSubmit.style.display = regIndex === total - 1 ? "inline-flex" : "none";
  }

  syncSportOtherVisibility();
  clearRegFeedback();
};

const validateCurrentStep = () => {
  if (!regSteps.length) {
    return true;
  }
  const currentStep = regSteps[regIndex];
  const requiredFields = currentStep.querySelectorAll("input[required], select[required], textarea[required]");
  for (const field of requiredFields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      if (regFeedback) {
        regFeedback.className = "reg-feedback error";
        regFeedback.textContent = "Completa los campos obligatorios para avanzar.";
      }
      return false;
    }
  }
  if (regSportSelect?.value === "Otro") {
    const sportOther = String(regSportOtherInput?.value || "").trim();
    if (!sportOther) {
      if (regFeedback) {
        regFeedback.className = "reg-feedback error";
        regFeedback.textContent = "Especifica tu deporte en la opcion Otro.";
      }
      regSportOtherInput?.focus();
      return false;
    }
    if (isDuplicateSportName(sportOther, getRegisteredSportCatalog())) {
      if (regFeedback) {
        regFeedback.className = "reg-feedback error";
        regFeedback.textContent = "Ese deporte ya existe en la lista. Seleccionalo directamente.";
      }
      regSportOtherInput?.focus();
      return false;
    }
  }
  return true;
};

if (regNext) {
  regNext.addEventListener("click", () => {
    if (!validateCurrentStep()) {
      return;
    }
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    if (regIndex < regSteps.length - 1) {
      regIndex += 1;
      renderRegState();
      const firstField = regSteps[regIndex]?.querySelector("input, select, textarea");
      if (firstField && typeof firstField.focus === "function") {
        firstField.focus({ preventScroll: true });
      }
    }
  });
}

if (regBack) {
  regBack.addEventListener("click", () => {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    if (regIndex > 0) {
      regIndex -= 1;
      renderRegState();
      const firstField = regSteps[regIndex]?.querySelector("input, select, textarea");
      if (firstField && typeof firstField.focus === "function") {
        firstField.focus({ preventScroll: true });
      }
    }
  });
}

if (regSportSelect) {
  regSportSelect.addEventListener("change", () => {
    syncSportOtherVisibility();
    saveRegistrationDraft();
  });
}

if (regForm) {
  regForm.addEventListener("input", saveRegistrationDraft);

  regForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateCurrentStep()) {
      return;
    }

    const data = new FormData(regForm);
    const entries = [];
    for (const [key, value] of data.entries()) {
      if (value !== "") {
        entries.push([key, value]);
      }
    }

    const labels = {
      nombre: "Nombre",
      email: "Email",
      whatsapp: "WhatsApp",
      horario: "Horario check-in",
      objetivo: "Objetivo",
      tiempo: "Tiempo diario",
      lugar: "Lugar",
      tono: "Tono",
      nivel: "Nivel",
      lesiones: "Lesiones",
      deporte: "Deporte",
      deporte_otro: "Deporte (otro)",
      trigger: "Trigger",
      entreno_casa: "Entreno en casa",
      equipo_casa: "Equipo en casa",
      alimentacion: "Alimentacion",
      perfil: "Perfil",
      modulo: "Modulo",
      voz: "Voz",
      modo_especial: "Modo especial",
      apuesta: "Apuesta",
      plan: "Plan",
      foto_checkin: "Check-in foto",
      compromiso: "Compromiso",
      aviso: "Aviso medico",
    };

    if (regSummary) {
      regSummary.innerHTML = `
        <h3>Registro activado</h3>
        <p>Resumen del onboarding:</p>
        <ul>
          ${entries
            .map(([key, value]) => `<li><strong>${labels[key] || key}:</strong> ${value === "on" ? "Aceptado" : value}</li>`)
            .join("")}
        </ul>
        <p class="reg-result">Primer check-in programado. Tienes 10 minutos para responder cada dia.</p>
        <a class="primary" href="user-hoy.html">Ir a Pantalla Hoy</a>
      `;
    }

    const onboardingProfile = {
      nombre: data.get("nombre") || "",
      objetivo: data.get("objetivo") || "",
      perfil: data.get("perfil") || "",
      tono: data.get("tono") || "",
      horario: data.get("horario") || "",
      modoEspecial: data.get("modo_especial") || "",
      activatedAt: new Date().toISOString(),
    };
    localStorage.setItem(REG_PROFILE_KEY, JSON.stringify(onboardingProfile));
    ensureUser({
      name: data.get("nombre"),
      email: data.get("email"),
      whatsapp: normalizeWhatsapp(data.get("whatsapp")),
      plan: data.get("plan") || "Free",
      horario: data.get("horario"),
      objetivo: data.get("objetivo"),
      perfil: data.get("perfil"),
    });
    persistPlanSelection({
      id: data.get("plan") || "Free",
      extras: {
        diet_basic: false,
        diet_plus: false,
      },
    });

    try {
      const remote = await syncUserWithBackend({
        name: data.get("nombre") || "User",
        email: data.get("email"),
        whatsapp: normalizeWhatsapp(data.get("whatsapp")),
        role: "user",
        plan: data.get("plan") || "Free",
        goal: data.get("objetivo") || "",
        checkinSchedule: data.get("horario") || "",
      });
      hydrateUserCacheFromApi(remote?.user);
      await apiPost("/coach/onboarding/start", {
        email: String(data.get("email") || "").trim().toLowerCase(),
      }).catch(() => null);
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }

    regForm.reset();
    localStorage.removeItem(REG_DRAFT_KEY);
    regIndex = 0;
    renderRegState();

    if (regFeedback) {
      regFeedback.className = "reg-feedback success";
      regFeedback.textContent = "Flujo completo. Tu registro esta funcional y listo para operacion.";
    }
  });

  loadRegistrationDraft();
  renderRegState();
}

// Show password field when email matches a known admin domain pattern
const loginPasswordField = document.getElementById("login-password-field");
const loginPassword = document.getElementById("login-password");
const ADMIN_HINT_DOMAINS = ["ascent.com", "momentumascent.com"];
if (loginEmail && loginPasswordField) {
  loginEmail.addEventListener("blur", () => {
    const email = String(loginEmail.value || "").trim().toLowerCase();
    const domain = email.split("@")[1] || "";
    const isAdminHint = ADMIN_HINT_DOMAINS.some((d) => domain === d);
    loginPasswordField.classList.toggle("hidden-field", !isAdminHint);
    if (loginPassword) loginPassword.required = isAdminHint;
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginEmail?.value?.trim().toLowerCase();
    if (!email) {
      if (loginFeedback) loginFeedback.textContent = "Ingresa tu correo para entrar.";
      return;
    }
    // Mostrar password si corresponde a dominio admin (por si hicieron submit sin salir del campo)
    if (loginPasswordField) {
      const domain = email.split("@")[1] || "";
      const isAdminHint = ADMIN_HINT_DOMAINS.some((d) => domain === d);
      loginPasswordField.classList.toggle("hidden-field", !isAdminHint);
      if (loginPassword) loginPassword.required = isAdminHint;
    }
    const password = loginPassword?.value?.trim() || "";
    if (loginFeedback) loginFeedback.textContent = "Verificando...";
    try {
      const remote = await apiPost("/auth/login", {
        name: email.split("@")[0] || "User",
        email,
        whatsapp: normalizeWhatsapp(loginWhatsapp?.value || ""),
        plan: getPlanSelection().label,
        intent: "login",
        password,
      });
      if (!remote?.ok) {
        if (remote?.error === "invalid_password" || remote?.error === "admin_password_not_configured") {
          if (loginPasswordField) loginPasswordField.classList.remove("hidden-field");
          if (loginPassword) loginPassword.required = true;
        }
        if (loginFeedback) {
          loginFeedback.textContent = remote?.error === "invalid_password"
            ? "Contraseña incorrecta."
            : remote?.error === "admin_password_not_configured"
            ? "Este admin no tiene credenciales configuradas en el servidor."
            : remote?.error === "user_not_found"
            ? "Ese correo no existe. Regístrate primero."
            : remote?.error === "rate_limited"
            ? "Demasiados intentos. Espera unos minutos."
            : "No fue posible iniciar sesión. Verifica tus datos.";
        }
        return;
      }
      // Guardar usuario en local solo después de validación exitosa
      hydrateUserCacheFromApi(remote?.user);
      const resolvedRole = remote?.user?.role === "admin" ? "admin" : "user";
      applyRoleMode(resolvedRole);
      await syncCurrentSubscriptionFromApi();
      renderUserPlanPanel();
      renderUserRoutinesPage();
      renderUserDietPage();
      renderUserProgressPage();
      renderWeeklyAiAdjustment();
      applyPlanNavVisibility();
      renderUserNotifications();
      window.location.href = resolvedRole === "admin" ? "admin.html" : "app-inicio.html";
    } catch (err) {
      console.warn("[login] error de red:", err?.message || err);
      if (loginFeedback) loginFeedback.textContent = "No se pudo conectar al servidor. Verifica tu conexión.";
    }
  });
}

document.querySelectorAll('input[type="tel"]').forEach((input) => {
  input.setAttribute("maxlength", "16");
  input.addEventListener("input", () => {
    const digits = String(input.value || "").replace(/[^\d]/g, "").slice(0, 15);
    input.value = digits ? `+${digits}` : "";
  });
});

const progress = document.querySelector(".scroll-progress");
if (progress) {
  window.addEventListener("scroll", () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
    progress.style.width = `${pct}%`;
  });
}

// ---- 3D TILT mejorado con perspectiva, profundidad y retorno suave ----
const tiltElements = document.querySelectorAll("[data-tilt]");
tiltElements.forEach((el) => {
  el.addEventListener("mouseenter", () => {
    el.style.transition = "transform 0.12s ease";
  });
  el.addEventListener("mousemove", (e) => {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const rx = -y * 14;
    const ry = x * 14;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.transition = "transform 0.5s cubic-bezier(0.03,0.98,0.52,0.99)";
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
  });
});

// ---- SPOTLIGHT en cards (sigue el mouse) ----
const initCardSpotlight = () => {
  document.querySelectorAll(".card, .panel, .price-card, .entry-card").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
    });
  });
};
initCardSpotlight();

// ---- RIPPLE en botones ----
const initRipple = () => {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".primary, .ghost");
    if (!btn || getComputedStyle(btn).position === "static") return;
    btn.style.position = "relative";
    btn.style.overflow = "hidden";
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple-wave";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
};
initRipple();

// ---- ORBS animados en background (todas las páginas) ----
const initOrbs = () => {
  if (document.querySelector(".orb")) return;
  [1, 2, 3].forEach((n) => {
    const orb = document.createElement("div");
    orb.className = `orb orb-${n}`;
    document.body.insertBefore(orb, document.body.firstChild);
  });
};
initOrbs();

const floatCards = document.querySelectorAll("[data-float]");
const floatObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      } else {
        entry.target.classList.remove("visible");
      }
    });
  },
  { threshold: 0.2 }
);

floatCards.forEach((card) => floatObserver.observe(card));






const coachPresets = {
  frio: "No te felicito. Solo reviso si cumpliste.",
  estratega: "Ajusto tu plan segun tus puntos de fallo.",
  empuje: "Si hoy aflojas, mañana pagas doble disciplina.",
};

const coachPresetButtons = document.querySelectorAll(".coach-preset");
const coachPreview = document.getElementById("coach-preview");
coachPresetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    coachPresetButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (coachPreview) {
      coachPreview.textContent = coachPresets[btn.dataset.coach] || coachPresets.frio;
    }
  });
});

const carousels = document.querySelectorAll("[data-carousel]");
carousels.forEach((carousel) => {
  const track = carousel.querySelector("[data-carousel-track]");
  const prev = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  if (!track || !prev || !next) {
    return;
  }
  const scrollAmount = 320;
  prev.addEventListener("click", () => {
    track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  });
  next.addEventListener("click", () => {
    track.scrollBy({ left: scrollAmount, behavior: "smooth" });
  });
});

const DISCIPLINE_STATE_KEY = "discipline_state_v2";
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const todayDate = new Date();
const todayKey = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).toISOString().slice(0, 10);

const todayDateLabel = document.getElementById("today-date");
const todayQuestion = document.getElementById("today-question");
const todayCountdown = document.getElementById("today-countdown");
const todayStatus = document.getElementById("today-status");
const todayPressure = document.getElementById("today-pressure");
const todayYes = document.getElementById("today-yes");
const todayNo = document.getElementById("today-no");
const todayResetWindow = document.getElementById("today-reset-window");
const todayStreak = document.getElementById("today-streak");
const todayLevel = document.getElementById("today-level");
const todayCompliance = document.getElementById("today-compliance");
const todayResponse = document.getElementById("today-response");
const todayPenalty = document.getElementById("today-penalty");
const todayUnstoppable = document.getElementById("today-unstoppable");
const todayBestStreak = document.getElementById("today-best-streak");
const todayXp = document.getElementById("today-xp");
const todayAscentIndex = document.getElementById("today-ascent-index");
const coachModeSelect = document.getElementById("coach-mode");
const smartReminders = document.getElementById("smart-reminders");
const mindsetPhrase = document.getElementById("mindset-phrase");
const mindsetAudio = document.getElementById("mindset-audio");
const mindsetChallenge = document.getElementById("mindset-challenge");
const mindsetStatus = document.getElementById("mindset-status");
const weeklyAnonRanking = document.getElementById("weekly-anon-ranking");
const modeContract = document.getElementById("mode-contract");
const weeklyRate = document.getElementById("weekly-rate");
const weeklyCritical = document.getElementById("weekly-critical");
const weeklyHour = document.getElementById("weekly-hour");
const reengageMessage = document.getElementById("reengage-message");
const mirrorMessage = document.getElementById("mirror-message");

let todayTimer = null;

const createDefaultDisciplineState = () => ({
  streak: 0,
  longestStreak: 0,
  totalDays: 0,
  completedDays: 0,
  failures: 0,
  failStreak: 0,
  responseCount: 0,
  responseSecondsTotal: 0,
  xp: 0,
  coachMode: "normal",
  pendingExtraMinutes: 0,
  level: "Level 1 - Initiate",
  modeContract: false,
  history: {},
  criticalDays: {},
  strongHours: {},
  daily: null,
});

const parseSavedState = () => {
  const raw = localStorage.getItem(DISCIPLINE_STATE_KEY);
  if (!raw) {
    return createDefaultDisciplineState();
  }
  try {
    return { ...createDefaultDisciplineState(), ...JSON.parse(raw) };
  } catch {
    localStorage.removeItem(DISCIPLINE_STATE_KEY);
    return createDefaultDisciplineState();
  }
};

const disciplineState = parseSavedState();

const saveDisciplineState = () => {
  localStorage.setItem(DISCIPLINE_STATE_KEY, JSON.stringify(disciplineState));
};

const resolveLevel = (xp) => {
  const levelNumber = Math.max(1, Math.min(50, Math.floor((Number(xp || 0)) / 120) + 1));
  let tier = "Initiate";
  if (levelNumber >= 50) tier = "Elite";
  else if (levelNumber >= 20) tier = "Ascendant";
  else if (levelNumber >= 10) tier = "Relentless";
  else if (levelNumber >= 5) tier = "Consistent";
  return { levelNumber, label: `Level ${levelNumber} - ${tier}` };
};

const getCompliancePct = (state) => {
  const totalDays = Number(state?.totalDays || 0);
  const completed = Number(state?.completedDays || 0);
  return totalDays ? Math.round((completed / totalDays) * 100) : 0;
};

const getDisciplineScore = (state) => {
  const compliance = getCompliancePct(state);
  const streak = Number(state?.streak || 0);
  const avgResponse = state?.responseCount ? Math.round((state.responseSecondsTotal || 0) / state.responseCount) : 600;
  const responseFactor = Math.max(0, Math.min(100, 100 - Math.round(avgResponse / 6)));
  return Math.max(0, Math.min(100, Math.round(compliance * 0.55 + Math.min(25, streak) + responseFactor * 0.2)));
};

const getAscentIndex = (state) => {
  const score = getDisciplineScore(state);
  const streak = Number(state?.streak || 0);
  const xp = Number(state?.xp || 0);
  return Math.round(score * 6 + streak * 8 + xp * 0.4);
};

function getUserGoal() {
  const raw = localStorage.getItem(REG_PROFILE_KEY);
  try {
    return raw ? JSON.parse(raw).objetivo || "Constancia" : "Constancia";
  } catch {
    return "Constancia";
  }
}

function isPremiumPlan() {
  return getPlanCapabilities().downloadCard;
}

function enforceCoachModeAvailability() {
  if (!coachModeSelect) return;
  const caps = getPlanCapabilities();
  const adaptiveOpt = coachModeSelect.querySelector('option[value="adaptive"]');
  if (adaptiveOpt) {
    adaptiveOpt.disabled = !caps.aiAdaptive;
    adaptiveOpt.textContent = caps.aiAdaptive ? "AI Adaptive" : "AI Adaptive (plan requerido)";
  }
  if (!caps.aiAdaptive && coachModeSelect.value === "adaptive") {
    coachModeSelect.value = "disciplina";
    disciplineState.coachMode = "disciplina";
    saveDisciplineState();
  }
}

function applyTodayPlanVisibility(caps) {
  const blocks = [
    { id: "today-card-missions", show: true },
    { id: "today-card-mindset", show: caps.aiAdaptive || caps.humanSupport },
    { id: "today-card-squad", show: caps.challengeCore },
    { id: "today-card-ranking", show: caps.challengeCore },
  ];
  blocks.forEach((item) => {
    const el = document.getElementById(item.id);
    if (el) {
      el.style.display = item.show ? "block" : "none";
    }
  });
}

function buildPlanStatusHtml(caps) {
  const requested = getPlanSelection();
  const draft = getRegDraft();
  const subscription = getCurrentSubscription();
  const subscriptionStatus = String(subscription?.status || "inactive").toLowerCase();
  const expired = subscriptionStatus === "active" && !isSubscriptionActive(subscription);
  const planRequestedPaid = requested.id !== "free";
  const rawExtras = String(draft.extras_plan || "");
  const requestedExtras = rawExtras
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "Ninguno");
  const hasExtra = (name) => requestedExtras.includes(name);
  const statusLabel =
    expired
      ? "Vencida"
      : subscriptionStatus === "active"
        ? `Activa hasta ${subscription?.endAt ? new Date(subscription.endAt).toLocaleDateString("es-MX") : "-"}`
        : subscriptionStatus === "pending"
          ? "Pendiente de validacion de pago"
          : subscriptionStatus === "inactive"
            ? "Inactiva"
            : subscriptionStatus;
  const activeNow = isSubscriptionActive(subscription);

  const accessRows = [
    {
      title: "IA adaptativa",
      detail: "Ajustes automaticos semanales de rutina segun tu cumplimiento.",
      status: caps.aiAdaptive ? "Activo" : "Bloqueado",
      cls: caps.aiAdaptive ? "green" : "red",
    },
    {
      title: "Coach humano 1:1",
      detail: "Revision directa y ajustes personalizados por staff.",
      status: caps.humanSupport ? "Activo" : "Bloqueado",
      cls: caps.humanSupport ? "green" : "red",
    },
    {
      title: "Dieta y nutricion",
      detail: caps.dietPersonalized ? "Dieta personalizada activa." : caps.dietAccess ? "Dieta base activa." : "Modulo de dieta bloqueado.",
      status: caps.dietPersonalized ? "Pro" : caps.dietAccess ? "Basico" : "Bloqueado",
      cls: caps.dietAccess ? "green" : "red",
    },
    {
      title: "Retos + ranking",
      detail: "Misiones competitivas, tabla y seguimiento por resultados.",
      status: caps.challengeCore ? "Activo" : "Bloqueado",
      cls: caps.challengeCore ? "green" : "red",
    },
    {
      title: "Contrato",
      detail: "Reglas de cumplimiento estricto y penalizacion por fallos.",
      status: "Disponible",
      cls: "yellow",
    },
    {
      title: "Competencia",
      detail: hasExtra("Competencia")
        ? activeNow
          ? "Activo"
          : "Solicitado, pendiente de validacion"
        : "No solicitado",
      status: hasExtra("Competencia") ? (activeNow ? "Activo" : "Pendiente") : "Opcional",
      cls: hasExtra("Competencia") ? (activeNow ? "green" : "pending") : "yellow",
    },
    {
      title: "Apuesta",
      detail: hasExtra("Apuesta")
        ? activeNow
          ? "Activo segun condiciones y validacion"
          : "Solicitado, pendiente de validacion"
        : "No solicitado",
      status: hasExtra("Apuesta") ? (activeNow ? "Activo" : "Pendiente") : "Opcional",
      cls: hasExtra("Apuesta") ? (activeNow ? "green" : "pending") : "yellow",
    },
    {
      title: "Seguimiento",
      detail: hasExtra("Seguimiento personalizado")
        ? activeNow
          ? "Activo"
          : "Solicitado, pendiente de validacion"
        : "No solicitado",
      status: hasExtra("Seguimiento personalizado") ? (activeNow ? "Activo" : "Pendiente") : "Opcional",
      cls: hasExtra("Seguimiento personalizado") ? (activeNow ? "green" : "pending") : "yellow",
    },
  ];

  const planCompare = [
    {
      title: "Free",
      price: "$0 / mes",
      notes: "Check-in diario, rutina base y seguimiento esencial.",
      active: caps.plan.id === "free",
    },
    {
      title: "Coach IA",
      price: "$19 / mes",
      notes: "IA adaptativa + rutina inteligente + mejor progresion.",
      active: caps.plan.id === "ai_coach",
    },
    {
      title: "Coach + Humano (Maximo)",
      price: "$59 / mes",
      notes: "Todo desbloqueado: IA + coach humano + ajustes premium y prioridad.",
      active: caps.plan.id === "coach_humano",
    },
  ];

  const currentExtras = [];
  if (caps.plan.extras?.diet_basic) currentExtras.push("Dieta Basica");
  if (caps.plan.extras?.diet_plus) currentExtras.push("Dieta Pro");

  const requestHint =
    !planRequestedPaid
      ? "Plan gratuito activo."
      : activeNow
        ? "Pago validado. Accesos premium activos segun tu plan."
        : "Pago pendiente de validacion. Los modulos premium se activaran al confirmar transferencia.";
  const onboardingSummary = [
    { label: "Objetivo", value: draft.objetivo || "-" },
    { label: "Modulo", value: draft.modulo || "-" },
    { label: "Modo especial", value: draft.modo_especial || "Ninguno" },
    { label: "Horario", value: draft.horario || "-" },
    { label: "Check-in foto", value: draft.foto_checkin || "-" },
  ];
  const salesCopy =
    caps.plan.id === "coach_humano"
      ? {
          title: "Plan Maximo activo",
          desc: "Ya tienes IA + coach humano + prioridad de seguimiento. Enfocate en ejecutar.",
          cta: "Gestionar plan",
        }
      : {
          title: "Desbloquea resultados mas rapidos",
          desc: "Activa Coach + Humano para revision 1:1, ajustes premium y mejor adherencia diaria.",
          cta: "Subir a plan maximo",
        };

  const enabledCount = accessRows.filter((r) => r.cls === "green").length;
  const pendingCount = accessRows.filter((r) => r.cls === "pending").length;
  const blockedCount = accessRows.filter((r) => r.cls === "red").length;
  const planLevel = caps.plan.id === "coach_humano" ? "MAXIMO" : caps.plan.id === "ai_coach" ? "PRO" : "BASE";

  return {
    header: `
      <div class="today-plan-head">
        <div>
          <h3>Tu plan: ${caps.plan.label}</h3>
          <p class="today-note">${caps.plan.price} • Suscripcion: ${statusLabel}</p>
          <p class="reg-hint">Plan solicitado: ${requested.label} (${requested.price})</p>
        </div>
        <div class="today-plan-kpis">
          <span class="admin-chip ${activeNow ? "green" : "pending"}">Pago ${activeNow ? "validado" : "pendiente"}</span>
          <span class="admin-chip ${caps.plan.id === "coach_humano" ? "green" : "yellow"}">Nivel ${planLevel}</span>
          <span class="admin-chip ${blockedCount > 0 ? "red" : "green"}">${enabledCount} activos</span>
        </div>
      </div>
      <p class="reg-hint">${requestHint}</p>
      <div class="today-onboarding-grid">
        ${onboardingSummary.map((s) => `<div class="today-onboarding-item"><span>${s.label}</span><strong>${s.value}</strong></div>`).join("")}
      </div>
      <div class="today-access-summary">
        <span class="admin-chip green">Activos: ${enabledCount}</span>
        <span class="admin-chip pending">Pendientes: ${pendingCount}</span>
        <span class="admin-chip red">Bloqueados: ${blockedCount}</span>
      </div>
      <div class="today-feature-grid">
        ${accessRows
          .map(
            (item) => `
              <article class="admin-status-item today-feature-item">
                <div>
                  <strong>${item.title}</strong>
                  <p>${item.detail}</p>
                </div>
                <span class="admin-status-pill ${item.cls}">${item.status}</span>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="today-extra-line">
        <p class="reg-hint">Extras solicitados: ${requestedExtras.length ? requestedExtras.join(", ") : "Ninguno"}</p>
        <p class="reg-hint">Extras activos: ${currentExtras.length ? currentExtras.join(", ") : "Ninguno"}</p>
      </div>
      <div class="today-plan-compare">
        ${planCompare
          .map(
            (plan) => `
            <article class="today-plan-tier ${plan.active ? "active" : ""}">
              <strong>${plan.title}</strong>
              <p class="today-note">${plan.price}</p>
              <p>${plan.notes}</p>
            </article>
          `
          )
          .join("")}
      </div>
      <article class="today-sales-banner ${caps.plan.id === "coach_humano" ? "max" : ""}">
        <div>
          <strong>${salesCopy.title}</strong>
          <p>${salesCopy.desc}</p>
        </div>
        <div class="today-sales-points">
          <span>IA adaptativa</span>
          <span>Coach humano</span>
          <span>Seguimiento premium</span>
        </div>
        <a class="${caps.plan.id === "coach_humano" ? "ghost" : "primary"}" href="planes.html">${salesCopy.cta}</a>
      </article>
      <div class="role-actions">
        <a class="ghost" href="planes.html">Cambiar plan (upgrade/downgrade)</a>
      </div>
    `,
    statusLabel,
  };
}

function renderSecondaryPlanPanels() {
  const caps = getPlanCapabilities();
  const html = buildPlanStatusHtml(caps).header;
  ["user-plan-routines-panel", "user-plan-diet-panel", "user-plan-progress-panel"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
  });
}

function renderUserPlanPanel() {
  const host = document.getElementById("user-plan-panel");
  if (!host) {
    renderSecondaryPlanPanels();
    return;
  }
  const caps = getPlanCapabilities();
  const planStatus = buildPlanStatusHtml(caps);
  applyTodayPlanVisibility(caps);
  const planHistory = readJsonArray(PLAN_HISTORY_KEY).slice(-4).reverse();
  host.innerHTML = `
    ${planStatus.header}
    <details class="today-history">
      <summary>Historial de cambios de plan</summary>
      <div class="admin-list">
        ${
          planHistory.length
            ? planHistory
                .slice(0, 5)
                .map(
                  (h) =>
                    `<div class="admin-item"><strong>${h.planLabel || h.planId}</strong><p>${new Date(h.at).toLocaleString("es-MX")}</p></div>`
                )
                .join("")
            : `<div class="admin-item"><p>Sin historial de cambios de plan.</p></div>`
        }
      </div>
    </details>
    ${
      caps.canRequestCoachAlert
        ? `<div class="role-actions">
      <button class="primary" type="button" id="user-request-human-plan">Solicitar rutina al coach humano</button>
    </div>
    <p class="reg-feedback" id="user-request-human-feedback"></p>`
        : `<p class="reg-hint">Para alertar a un coach humano, cambia al plan Coach + Humano.</p>`
    }
  `;
  renderSecondaryPlanPanels();

  const requestBtn = document.getElementById("user-request-human-plan");
  const requestFeedback = document.getElementById("user-request-human-feedback");
  if (requestBtn && !requestBtn.dataset.bound) {
    requestBtn.dataset.bound = "1";
    requestBtn.addEventListener("click", async () => {
      const current = getCurrentUser();
      if (!current?.id) {
        if (requestFeedback) {
          requestFeedback.className = "reg-feedback error";
          requestFeedback.textContent = "Inicia sesion para enviar la alerta.";
        }
        return;
      }
      const payload = {
        userId: current.id,
        message: "Solicito carga de rutina y dieta para iniciar plan.",
        planId: caps.plan.id,
      };
      const local = readJsonArray(SUPPORT_ALERTS_KEY);
      local.push({ ...payload, createdAt: new Date().toISOString() });
      saveJsonArray(SUPPORT_ALERTS_KEY, local);
      try {
        await apiPost("/support-alert", payload);
      } catch {
        // fallback local
      }
      if (requestFeedback) {
        requestFeedback.className = "reg-feedback success";
        requestFeedback.textContent = "Alerta enviada al staff. Te cargaran rutina en breve.";
      }
      renderUserNotifications();
    });
  }
}

async function renderUserNotifications() {
  const host = document.getElementById("user-notifications");
  if (!host) {
    return;
  }
  const current = getCurrentUser();
  if (!current?.id) {
    host.innerHTML = `<div class="admin-item"><p>Inicia sesion para ver notificaciones.</p></div>`;
    return;
  }

  const items = [];
  const subscription = getCurrentSubscription();
  if (subscription?.status === "pending") {
    items.push({ at: subscription.updatedAt || new Date().toISOString(), text: "Pago pendiente de validacion en Modo Dios." });
  }
  if (subscription?.status === "active") {
    items.push({
      at: subscription.updatedAt || new Date().toISOString(),
      text: `Suscripcion activa (${subscription.planLabel || "Plan"}) hasta ${
        subscription.endAt ? new Date(subscription.endAt).toLocaleDateString("es-MX") : "-"
      }.`,
    });
  }

  const localAlerts = readJsonArray(SUPPORT_ALERTS_KEY)
    .filter((a) => String(a.userId || "").toLowerCase() === current.id)
    .slice(-5)
    .map((a) => ({ at: a.createdAt || new Date().toISOString(), text: "Alerta enviada al coach humano." }));
  items.push(...localAlerts);

  let assignment = null;
  try {
    const remote = await apiGet(`/feed/${encodeURIComponent(current.id)}`);
    assignment = remote?.assignment || null;
  } catch {
    const localAssignments = readJsonObject(USER_ASSIGNMENTS_KEY);
    assignment = localAssignments[current.id] || null;
  }
  if (assignment?.updatedAt) {
    items.push({ at: assignment.updatedAt, text: "Nueva rutina/dieta cargada por el staff." });
  }

  let payments = [];
  try {
    const remote = await apiGet(`/payments/${encodeURIComponent(current.id)}`);
    payments = Array.isArray(remote?.payments) ? remote.payments : [];
  } catch {
    payments = [];
  }
  if (payments[0]?.status === "rejected") {
    items.push({ at: payments[0].updatedAt || new Date().toISOString(), text: "Pago rechazado. Revisa comprobante y vuelve a enviar." });
  }

  const sorted = items
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 8);
  host.innerHTML = sorted.length
    ? sorted.map((it) => `<div class="admin-item"><strong>${new Date(it.at).toLocaleString("es-MX")}</strong><p>${escHtml(it.text)}</p></div>`).join("")
    : `<div class="admin-item"><p>Sin notificaciones nuevas.</p></div>`;
}

const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return "-";
  }
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

const ensureTodaySession = () => {
  if (!todayQuestion) {
    return;
  }
  const now = Date.now();
  if (!disciplineState.daily || disciplineState.daily.date !== todayKey) {
    disciplineState.daily = {
      date: todayKey,
      startedAt: now,
      deadlineAt: now + 10 * 60 * 1000,
      status: "pending",
      responseSeconds: null,
    };
    saveDisciplineState();
  }
};

const getMostFrequentDay = () => {
  const entries = Object.entries(disciplineState.criticalDays || {});
  if (!entries.length) {
    return "-";
  }
  const [dayIndex] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return DAY_NAMES[Number(dayIndex)] || "-";
};

const getMostFrequentHour = () => {
  const entries = Object.entries(disciplineState.strongHours || {});
  if (!entries.length) {
    return "-";
  }
  const [hour] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return `${String(hour).padStart(2, "0")}:00`;
};

const getWeekDates = () => {
  const dates = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10));
  }
  return dates;
};

const updateWeeklyStats = () => {
  if (!weeklyRate || !weeklyCritical || !weeklyHour) {
    return;
  }
  const days = getWeekDates();
  const completed = days.filter((key) => disciplineState.history[key]?.status === "yes").length;
  const rate = Math.round((completed / days.length) * 100);
  weeklyRate.textContent = `${rate}%`;
  weeklyCritical.textContent = getMostFrequentDay();
  weeklyHour.textContent = getMostFrequentHour();
};

const applyReengageMessages = () => {
  if (!reengageMessage || !mirrorMessage) {
    return;
  }
  const rawProfile = localStorage.getItem(REG_PROFILE_KEY);
  let objective = "";
  try {
    objective = rawProfile ? JSON.parse(rawProfile).objetivo || "" : "";
  } catch {
    objective = "";
  }

  if (disciplineState.failStreak >= 3) {
    reengageMessage.textContent = "Modo espejo activo: 3 fallos seguidos. Reinicia hoy sin negociar.";
    mirrorMessage.textContent = objective ? `Querias: ${objective}. Recuerdalo.` : "Querias cambiar. Recuerdalo.";
    return;
  }

  if (disciplineState.failStreak >= 2) {
    reengageMessage.textContent = "Riesgo alto: llevas 2 fallos seguidos. Ajusta horario y responde al primer aviso.";
    mirrorMessage.textContent = "";
    return;
  }

  reengageMessage.textContent = "Constancia estable. Mantente en ejecucion diaria.";
  mirrorMessage.textContent = "";
};

const renderTodayState = () => {
  if (!todayQuestion) {
    return;
  }
  if (todayDateLabel) {
    todayDateLabel.textContent = `Hoy: ${todayDate.toLocaleDateString("es-MX")}`;
  }

  const levelInfo = resolveLevel(disciplineState.xp || 0);
  disciplineState.level = levelInfo.label;
  if (todayStreak) {
    todayStreak.textContent = `${disciplineState.streak} dias`;
  }
  if (todayBestStreak) {
    todayBestStreak.textContent = `${disciplineState.longestStreak || 0} dias`;
  }
  if (todayLevel) {
    todayLevel.textContent = levelInfo.label;
  }
  if (todayXp) {
    todayXp.textContent = `${disciplineState.xp || 0} XP`;
  }
  if (todayAscentIndex) {
    todayAscentIndex.textContent = `${getAscentIndex(disciplineState)}`;
  }
  if (todayCompliance) {
    const compliance = getCompliancePct(disciplineState);
    todayCompliance.textContent = `${compliance}%`;
  }
  if (todayResponse) {
    const avg = disciplineState.responseCount > 0 ? Math.round(disciplineState.responseSecondsTotal / disciplineState.responseCount) : null;
    todayResponse.textContent = avg === null ? "-" : formatSeconds(avg);
  }
  if (todayPenalty) {
    todayPenalty.textContent = `+${disciplineState.pendingExtraMinutes} min`;
  }
  if (todayUnstoppable) {
    todayUnstoppable.textContent =
      disciplineState.streak >= 30
        ? "Modo imparable activo. Mantienes +30 dias."
        : `Modo imparable bloqueado. Te faltan ${Math.max(0, 30 - disciplineState.streak)} dias.`;
  }
  if (modeContract) {
    modeContract.checked = Boolean(disciplineState.modeContract);
  }
  if (coachModeSelect) {
    coachModeSelect.value = disciplineState.coachMode || "normal";
  }
  enforceCoachModeAvailability();

  const failuresToday = (todayDate.getDate() % 4) + 2;
  if (todayPressure) {
    todayPressure.textContent = `${failuresToday} personas fallaron hoy. ¿Seras la siguiente?`;
  }

  const statusMap = {
    pending: "Estado: Pendiente",
    yes: "✅ Cumplido",
    no: "❌ Fallo declarado",
    timeout: "⏰ Fallo por silencio",
  };
  const currentStatus = disciplineState.daily?.status || "pending";
  if (todayStatus) {
    todayStatus.textContent = statusMap[currentStatus] || "Estado: Pendiente";
    todayStatus.dataset.status = currentStatus;
  }

  if (smartReminders) {
    const reminderText = [];
    if (disciplineState.daily?.status === "timeout" || disciplineState.daily?.status === "no") {
      reminderText.push("Fallaste ayer. El momentum no espera.");
      reminderText.push("Cada dia que no actuas te aleja del resultado.");
    } else if (disciplineState.streak >= 7) {
      reminderText.push(`${disciplineState.streak} dias seguidos. No rompas la cadena.`);
      reminderText.push("Construye momentum. Eleva tu nivel diario.");
    } else {
      reminderText.push("El momentum no espera a nadie.");
      reminderText.push("Construye constancia. Sube dia a dia.");
    }
    smartReminders.innerHTML = reminderText.map((t) => `<div class="admin-item"><p>${t}</p></div>`).join("");
  }
  renderUserGreeting();

  if (mindsetPhrase) {
    const phrases = [
      "La disciplina gana cuando la motivacion falla.",
      "No negocies con la excusa de hoy.",
      "La constancia de hoy paga la version de manana.",
      "Tu identidad se construye en dias normales.",
    ];
    mindsetPhrase.textContent = phrases[new Date().getDate() % phrases.length];
    apiGet("/mindset/daily")
      .then((remote) => {
        if (remote?.phrase && mindsetPhrase) {
          mindsetPhrase.textContent = remote.phrase;
        }
      })
      .catch(() => {
        // fallback local
      });
  }

  if (weeklyAnonRanking) {
    const base = [823, 804, 790, 772, 760, 748, 735, 721, 709];
    const your = getAscentIndex(disciplineState);
    const list = [...base, your].sort((a, b) => b - a).slice(0, 10);
    weeklyAnonRanking.innerHTML = list
      .map((v, i) => `<div class="admin-item"><strong>#${i + 1}</strong><p>User ${String(i + 1).padStart(2, "0")} • Ascent Index ${v}</p></div>`)
      .join("");
    apiGet("/ranking/weekly")
      .then((remote) => {
        const ranking = Array.isArray(remote?.ranking) ? remote.ranking : [];
        if (!ranking.length || !weeklyAnonRanking) {
          return;
        }
        weeklyAnonRanking.innerHTML = ranking
          .map((row) => `<div class="admin-item"><strong>#${row.rank}</strong><p>${row.user} • Ascent Index ${row.ascentIndex}</p></div>`)
          .join("");
      })
      .catch(() => {
        // fallback local
      });
  }

  renderUserPlanPanel();
  renderUserNotifications();
  renderTodayNutritionSnapshot();
  updateWeeklyStats();
  applyReengageMessages();
};

const closeTodayTimer = () => {
  if (todayTimer) {
    clearInterval(todayTimer);
    todayTimer = null;
  }
};

const registerHistory = (status, responseSeconds) => {
  disciplineState.history[todayKey] = {
    status,
    responseSeconds,
    at: new Date().toISOString(),
  };
};

const resolveTodayOutcome = async (status) => {
  if (!disciplineState.daily || disciplineState.daily.status !== "pending") {
    return;
  }
  const now = Date.now();
  const responseSeconds = Math.max(0, Math.round((now - disciplineState.daily.startedAt) / 1000));
  disciplineState.daily.status = status;
  disciplineState.daily.responseSeconds = responseSeconds;

  disciplineState.totalDays += 1;
  disciplineState.responseCount += 1;
  disciplineState.responseSecondsTotal += responseSeconds;

  if (status === "yes") {
    disciplineState.completedDays += 1;
    disciplineState.streak += 1;
    disciplineState.failStreak = 0;
    disciplineState.xp = Number(disciplineState.xp || 0) + 120 + Math.min(20, disciplineState.streak);
    const hour = new Date().getHours();
    disciplineState.strongHours[hour] = (disciplineState.strongHours[hour] || 0) + 1;
  } else {
    disciplineState.failures += 1;
    disciplineState.failStreak += 1;
    disciplineState.streak = 0;
    disciplineState.xp = Math.max(0, Number(disciplineState.xp || 0) - 35);
    disciplineState.pendingExtraMinutes += disciplineState.coachMode === "castigo" ? 12 : 8;
    const day = new Date().getDay();
    disciplineState.criticalDays[day] = (disciplineState.criticalDays[day] || 0) + 1;
    if (disciplineState.modeContract && disciplineState.failStreak >= 3) {
      disciplineState.streak = 0;
    }
  }

  disciplineState.longestStreak = Math.max(disciplineState.longestStreak, disciplineState.streak);
  registerHistory(status, responseSeconds);
  const current = getCurrentUser();
  if (current?.id) {
    try {
      const remote = await apiPost("/checkins", {
        userId: current.id,
        status,
        responseSeconds,
        penaltyMinutes: Number(disciplineState.pendingExtraMinutes || 0),
        dateKey: todayKey,
      });
      if (remote?.metrics) {
        const m = remote.metrics;
        disciplineState.streak = Number(m.streak || disciplineState.streak || 0);
        disciplineState.longestStreak = Number(m.bestStreak || disciplineState.longestStreak || 0);
        disciplineState.totalDays = Number(m.totalDays || disciplineState.totalDays || 0);
        disciplineState.completedDays = Number(m.completedDays || disciplineState.completedDays || 0);
        disciplineState.failures = Number(m.failures || disciplineState.failures || 0);
        disciplineState.xp = Number(m.xp || disciplineState.xp || 0);
      }
    } catch (err) {
      console.warn("[api] fallback local:", err?.message || err);
    }
  }
  saveDisciplineState();
  closeTodayTimer();
  renderTodayState();
  renderUserProgressPage();
  // Toast feedback
  if (status === "yes") {
    showToast(`🔥 ¡Cumpliste! +${120 + Math.min(20, disciplineState.streak)} XP. Racha: ${disciplineState.streak} dias.`, "success");
  } else if (status === "no") {
    showToast("Fallo registrado. Mañana es otra oportunidad.", "warning");
  } else if (status === "timeout") {
    showToast("Tiempo agotado. El silencio cuenta como fallo.", "error");
  }
  // Reset ring
  updateRingTimer(0);
};

const tickTodayCountdown = () => {
  if (!todayCountdown || !disciplineState.daily) {
    return;
  }
  if (disciplineState.daily.status !== "pending") {
    todayCountdown.textContent = "00:00";
    closeTodayTimer();
    return;
  }

  const diffSeconds = Math.max(0, Math.floor((disciplineState.daily.deadlineAt - Date.now()) / 1000));
  todayCountdown.textContent = formatSeconds(diffSeconds);
  updateRingTimer(diffSeconds);
  if (diffSeconds <= 0) {
    resolveTodayOutcome("timeout");
  }
};

const startTodayTimer = () => {
  if (!todayCountdown || !disciplineState.daily || disciplineState.daily.status !== "pending") {
    return;
  }
  closeTodayTimer();
  tickTodayCountdown();
  todayTimer = setInterval(tickTodayCountdown, 1000);
};

if (todayQuestion) {
  ensureTodaySession();

  if (todayYes) {
    todayYes.addEventListener("click", () => resolveTodayOutcome("yes"));
  }
  if (todayNo) {
    todayNo.addEventListener("click", () => resolveTodayOutcome("no"));
  }
  if (todayResetWindow) {
    todayResetWindow.addEventListener("click", () => {
      disciplineState.daily = {
        date: todayKey,
        startedAt: Date.now(),
        deadlineAt: Date.now() + 10 * 60 * 1000,
        status: "pending",
        responseSeconds: null,
      };
      saveDisciplineState();
      renderTodayState();
      startTodayTimer();
    });
  }
  if (modeContract) {
    modeContract.addEventListener("change", () => {
      disciplineState.modeContract = modeContract.checked;
      saveDisciplineState();
      renderTodayState();
    });
  }
  if (coachModeSelect) {
    coachModeSelect.addEventListener("change", () => {
      disciplineState.coachMode = coachModeSelect.value || "normal";
      saveDisciplineState();
      renderTodayState();
    });
  }
  if (mindsetAudio && !mindsetAudio.dataset.bound) {
    mindsetAudio.dataset.bound = "1";
    mindsetAudio.addEventListener("click", () => {
      const text = mindsetPhrase?.textContent || "Build momentum. Rise daily.";
      if ("speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "es-MX";
        speechSynthesis.cancel();
        speechSynthesis.speak(utter);
      }
      if (mindsetStatus) mindsetStatus.textContent = "Audio reproducido.";
    });
  }
  if (mindsetChallenge && !mindsetChallenge.dataset.bound) {
    mindsetChallenge.dataset.bound = "1";
    mindsetChallenge.addEventListener("click", () => {
      const dateKey = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`discipline_mindset_${dateKey}`, "done");
      if (mindsetStatus) mindsetStatus.textContent = "Mini reto mental completado.";
    });
  }

  if ((disciplineState.coachMode || "normal") === "adaptive" && disciplineState.failStreak >= 2) {
    disciplineState.coachMode = "disciplina";
    if (reengageMessage) reengageMessage.textContent = "Momentum is slipping.";
    saveDisciplineState();
  }

  renderTodayState();
  startTodayTimer();
}

const nutritionDate = document.getElementById("nutrition-date");
const waterValue = document.getElementById("water-value");
const waterPlus = document.getElementById("water-plus");
const waterReset = document.getElementById("water-reset");
const caloriesValue = document.getElementById("calories-value");
const caloriesButtons = document.querySelectorAll("[data-calories]");
const caloriesReset = document.getElementById("calories-reset");
const dietToggle = document.getElementById("diet-toggle");
const trainingToggle = document.getElementById("training-toggle");
const dietStatus = document.getElementById("diet-status");
const trainingStatus = document.getElementById("training-status");
const coachScore = document.getElementById("coach-score");
const coachScoreSummary = document.getElementById("coach-score-summary");

const today = new Date();
const dateKey = today.toISOString().slice(0, 10);
const NUTRITION_KEY = `discipline_nutrition_${dateKey}`;

const nutritionState = {
  water: 0,
  calories: 0,
  dietDone: false,
  trainingDone: false,
};

const saveNutritionState = () => {
  if (!waterValue && !caloriesValue && !dietToggle && !trainingToggle) {
    return;
  }
  localStorage.setItem(NUTRITION_KEY, JSON.stringify(nutritionState));
};

const loadNutritionState = () => {
  if (!waterValue && !caloriesValue && !dietToggle && !trainingToggle) {
    return;
  }
  const raw = localStorage.getItem(NUTRITION_KEY);
  if (!raw) {
    return;
  }
  try {
    const data = JSON.parse(raw);
    nutritionState.water = Number(data.water || 0);
    nutritionState.calories = Number(data.calories || 0);
    nutritionState.dietDone = Boolean(data.dietDone);
    nutritionState.trainingDone = Boolean(data.trainingDone);
  } catch {
    localStorage.removeItem(NUTRITION_KEY);
  }
};

const updateCoachScore = () => {
  const waterPoints = Math.round(Math.min(1, nutritionState.water / 8) * 30);
  const caloriesPoints = nutritionState.calories > 0 && nutritionState.calories <= 2600 ? 20 : nutritionState.calories > 0 ? 10 : 0;
  const dietPoints = nutritionState.dietDone ? 25 : 0;
  const trainingPoints = nutritionState.trainingDone ? 25 : 0;
  const total = Math.min(100, waterPoints + caloriesPoints + dietPoints + trainingPoints);

  if (coachScore) {
    coachScore.textContent = String(total);
  }
  if (coachScoreSummary) {
    if (total >= 85) {
      coachScoreSummary.textContent = "Nivel elite hoy. Mantuviste disciplina completa.";
    } else if (total >= 60) {
      coachScoreSummary.textContent = "Buen progreso. Te falta cerrar algunos puntos del dia.";
    } else {
      coachScoreSummary.textContent = "Score bajo. Activa agua, dieta y entrenamiento para subirlo.";
    }
  }
};

const renderNutritionState = () => {
  if (nutritionDate) {
    nutritionDate.textContent = `Registro del dia: ${today.toLocaleDateString("es-MX")}`;
  }
  if (waterValue) {
    waterValue.textContent = String(nutritionState.water);
  }
  if (caloriesValue) {
    caloriesValue.textContent = String(nutritionState.calories);
  }
  if (dietStatus) {
    dietStatus.textContent = nutritionState.dietDone ? "Cumplida" : "Pendiente";
  }
  if (trainingStatus) {
    trainingStatus.textContent = nutritionState.trainingDone ? "Cumplido" : "Pendiente";
  }
  if (dietToggle) {
    dietToggle.textContent = nutritionState.dietDone ? "Quitar dieta cumplida" : "Marcar dieta cumplida";
  }
  if (trainingToggle) {
    trainingToggle.textContent = nutritionState.trainingDone ? "Quitar entrenamiento cumplido" : "Marcar entrenamiento cumplido";
  }
  updateCoachScore();
};

loadNutritionState();
renderNutritionState();

if (waterPlus && waterValue) {
  waterPlus.addEventListener("click", () => {
    nutritionState.water = Math.min(8, nutritionState.water + 1);
    saveNutritionState();
    renderNutritionState();
  });
}
if (waterReset && waterValue) {
  waterReset.addEventListener("click", () => {
    nutritionState.water = 0;
    saveNutritionState();
    renderNutritionState();
  });
}

caloriesButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    nutritionState.calories += Number(btn.dataset.calories || 0);
    saveNutritionState();
    renderNutritionState();
  });
});
if (caloriesReset && caloriesValue) {
  caloriesReset.addEventListener("click", () => {
    nutritionState.calories = 0;
    saveNutritionState();
    renderNutritionState();
  });
}

if (dietToggle) {
  dietToggle.addEventListener("click", () => {
    nutritionState.dietDone = !nutritionState.dietDone;
    saveNutritionState();
    renderNutritionState();
  });
}

if (trainingToggle) {
  trainingToggle.addEventListener("click", () => {
    nutritionState.trainingDone = !nutritionState.trainingDone;
    saveNutritionState();
    renderNutritionState();
  });
}

const QA_DEBUG_KEY = "discipline_debug_mode_v1";
const APP_FILES = new Set(["user-hoy.html", "user-rutinas.html", "user-progreso.html", "user-dieta.html", "user-checkin.html"]);
const getPageFile = () => (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
const isAppPage = () => APP_FILES.has(getPageFile());

const getNextCheckinLabel = () => {
  const user = getCurrentUser();
  if (user?.horario) {
    return user.horario;
  }
  const raw = localStorage.getItem(REG_PROFILE_KEY);
  if (!raw) {
    return "21:00";
  }
  try {
    const profile = JSON.parse(raw);
    return profile.horario || "21:00";
  } catch {
    return "21:00";
  }
};

const renderNextCheckin = () => {
  const el = document.getElementById("user-next-checkin");
  if (!el) {
    return;
  }
  el.textContent = `Proximo check-in: ${getNextCheckinLabel()}`;
};

const seedTestUsers = () => {
  const base = readJsonArray(USERS_KEY);
  const now = new Date().toISOString();
  const seeded = [...base];
  for (let i = 1; i <= 10; i += 1) {
    const id = `test${i}@demo.local`;
    if (seeded.some((u) => u.id === id)) {
      continue;
    }
    seeded.push({
      id,
      name: `Usuario ${i}`,
      email: id,
      whatsapp: `+5200000000${String(i).padStart(2, "0")}`,
      horario: i % 2 === 0 ? "19:00 - 21:00" : "06:00 - 08:00",
      objetivo: i % 3 === 0 ? "Bajar peso" : "Constancia",
      perfil: i % 2 === 0 ? "Constante" : "Guerrero",
      createdAt: now,
      updatedAt: now,
    });
  }
  saveJsonArray(USERS_KEY, seeded);
  if (!localStorage.getItem(CURRENT_USER_KEY)) {
    localStorage.setItem(CURRENT_USER_KEY, "test1@demo.local");
  }
};

const clearDemoData = () => {
  const keys = [
    ROLE_KEY,
    ADMIN_ROUTINES_KEY,
    ADMIN_NUTRITION_KEY,
    USERS_KEY,
    CURRENT_USER_KEY,
    USER_ASSIGNMENTS_KEY,
    CHECKIN_PHOTOS_KEY,
    DISCIPLINE_STATE_KEY,
    ONBOARDING_KEY,
    ONBOARDING_DONE_KEY,
    REG_DRAFT_KEY,
    REG_PROFILE_KEY,
    QA_DEBUG_KEY,
  ];
  keys.forEach((key) => localStorage.removeItem(key));
  Object.keys(localStorage)
    .filter((k) => k.startsWith("discipline_nutrition_"))
    .forEach((k) => localStorage.removeItem(k));
};

const renderDebugPanel = () => {
  const panel = document.getElementById("qa-debug-panel");
  if (!panel) {
    return;
  }
  const enabled = localStorage.getItem(QA_DEBUG_KEY) === "1";
  panel.hidden = !enabled;
  if (!enabled) {
    panel.innerHTML = "";
    return;
  }
  const users = readJsonArray(USERS_KEY);
  const routines = readJsonArray(ADMIN_ROUTINES_KEY);
  const plans = readJsonArray(ADMIN_NUTRITION_KEY);
  const assignments = readJsonObject(USER_ASSIGNMENTS_KEY);
  const current = getCurrentUser();
  panel.innerHTML = `
    <div class="admin-item"><strong>Usuario activo</strong><p>${current ? `${current.name} (${current.email})` : "Ninguno"}</p></div>
    <div class="admin-item"><strong>Users</strong><p>${users.length}</p></div>
    <div class="admin-item"><strong>Rutinas</strong><p>${routines.length}</p></div>
    <div class="admin-item"><strong>Planes</strong><p>${plans.length}</p></div>
    <div class="admin-item"><strong>Asignaciones</strong><p>${Object.keys(assignments).length}</p></div>
  `;
};

const initQaTools = () => {
  const seedBtn = document.getElementById("qa-seed-users");
  const resetBtn = document.getElementById("qa-reset-data");
  const debugBtn = document.getElementById("qa-toggle-debug");
  const feedback = document.getElementById("qa-feedback");
  if (!seedBtn && !resetBtn && !debugBtn) {
    return;
  }

  const setFeedback = (text, type = "success") => {
    if (!feedback) {
      return;
    }
    feedback.className = `reg-feedback ${type}`.trim();
    feedback.textContent = text;
  };

  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      seedTestUsers();
      const users = readJsonArray(USERS_KEY);
      await Promise.all(
        users.slice(0, 10).map((u) =>
          syncUserWithBackend({
            name: u.name,
            email: u.email,
            whatsapp: u.whatsapp || "",
            role: "user",
            horario: u.horario || "",
            objetivo: u.objetivo || "",
          }).catch(() => null)
        )
      );
      setFeedback("10 usuarios demo listos.");
      renderSessionBar();
      renderDebugPanel();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearDemoData();
      setFeedback("Datos demo reiniciados.", "error");
      window.location.href = "registro.html";
    });
  }

  if (debugBtn) {
    debugBtn.addEventListener("click", () => {
      const active = localStorage.getItem(QA_DEBUG_KEY) === "1";
      localStorage.setItem(QA_DEBUG_KEY, active ? "0" : "1");
      setFeedback(`Debug ${active ? "desactivado" : "activado"}.`);
      renderDebugPanel();
    });
  }

  renderDebugPanel();
};

const renderSessionBar = () => {
  document.querySelectorAll(".session-bar").forEach((el) => el.remove());
  return;
  const nav = document.querySelector(".nav");
  if (!nav || document.querySelector(".session-bar")) {
    return;
  }
  const box = document.createElement("div");
  box.className = "session-bar";
  box.innerHTML = `
    <span class="session-user" id="session-user-label">Sin sesion</span>
    <select id="session-user-select" class="session-select"></select>
    <button class="ghost session-btn" type="button" id="session-refresh">Refrescar</button>
    <button class="ghost session-btn" type="button" id="session-logout">Cerrar sesion</button>
  `;
  nav.insertAdjacentElement("afterend", box);

  const select = document.getElementById("session-user-select");
  const label = document.getElementById("session-user-label");
  const refresh = document.getElementById("session-refresh");
  const logout = document.getElementById("session-logout");

  const paint = () => {
    const users = readJsonArray(USERS_KEY);
    const current = getCurrentUser();
    if (!select || !label) {
      return;
    }
    if (!users.length) {
      select.innerHTML = `<option value="">Sin users</option>`;
      label.textContent = "Sin sesion";
      return;
    }
    select.innerHTML = users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((u) => `<option value="${u.id}" ${current?.id === u.id ? "selected" : ""}>${u.name} • ${u.email}</option>`)
      .join("");
    label.textContent = current ? `Activo: ${current.name}` : "Sin sesion";
  };

  if (select) {
    select.addEventListener("change", () => {
      if (!select.value) {
        return;
      }
      localStorage.setItem(CURRENT_USER_KEY, select.value);
      paint();
      renderUserRoutinesPage();
      renderUserRoutineFeed();
      renderUserProgressPage();
      renderUserDietPage();
      renderTodayState();
      renderNextCheckin();
      renderDebugPanel();
      renderAdminInsights();
    });
  }

  if (refresh) {
    refresh.addEventListener("click", () => {
      paint();
      renderUserRoutineFeed();
      renderUserRoutinesPage();
      renderUserProgressPage();
      renderUserDietPage();
      renderTodayState();
      renderNextCheckin();
      renderAdminInsights();
    });
  }

  if (logout) {
    logout.addEventListener("click", () => {
      localStorage.removeItem(CURRENT_USER_KEY);
      paint();
      if (window.location.pathname.endsWith("admin.html")) {
        return;
      }
      window.location.href = "registro.html#login";
    });
  }

  paint();
};

const renderBottomTabs = () => {
  // Skip if the new .bottom-nav is already in the HTML (Design v3)
  if (!isAppPage() || document.querySelector(".bottom-tabs") || document.querySelector(".bottom-nav")) {
    return;
  }
  const file = getPageFile();
  const tabs = document.createElement("nav");
  tabs.className = "bottom-tabs";
  tabs.innerHTML = `
    <a href="user-hoy.html" class="${file === "user-hoy.html" ? "active" : ""}">Hoy</a>
    <a href="user-rutinas.html" class="${file === "user-rutinas.html" ? "active" : ""}">Rutinas</a>
    <a href="user-progreso.html" class="${file === "user-progreso.html" ? "active" : ""}">Progreso</a>
    <a href="user-dieta.html" class="${file === "user-dieta.html" ? "active" : ""}">Dieta</a>
    <a href="user-checkin.html" class="${file === "user-checkin.html" ? "active" : ""}">Check-in</a>
  `;
  document.body.appendChild(tabs);
  document.body.classList.add("with-bottom-tabs");
};

const renderMobileBack = () => {
  if (!isAppPage() || getPageFile() === "user-hoy.html" || document.querySelector(".mobile-back-btn")) {
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mobile-back-btn";
  btn.textContent = "←";
  btn.setAttribute("aria-label", "Volver");
  btn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "user-hoy.html";
  });
  document.body.appendChild(btn);
};

renderSessionBar();
renderBottomTabs();
renderMobileBack();
renderNextCheckin();
initQaTools();

const ONBP_DYNAMIC_KEY = "discipline_onbp_dynamic_v1";

const readOnbpState = () => {
  const raw = localStorage.getItem(ONBP_DYNAMIC_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(ONBP_DYNAMIC_KEY);
    return {};
  }
};

const saveOnbpState = (state) => {
  localStorage.setItem(ONBP_DYNAMIC_KEY, JSON.stringify(state));
};

const initDynamicOnboarding = () => {
  const page = getPageFile();
  if (!["onboarding-2.html", "onboarding-3.html", "onboarding-4.html", "onboarding-4-apuesta.html", "onboarding-5.html", "onboarding-6.html", "onboarding-7.html", "onboarding-8.html", "onboarding-8-modos.html", "onboarding-9.html"].includes(page)) {
    return;
  }
  const ONBP_SESSION_KEY = "discipline_onbp_session_started";
  const ONBP_TOUCHED_PREFIX = "discipline_onbp_touched_";
  const onboardingPages = ["onboarding-2.html", "onboarding-3.html", "onboarding-4.html", "onboarding-4-apuesta.html", "onboarding-5.html", "onboarding-6.html", "onboarding-7.html", "onboarding-8.html", "onboarding-8-modos.html", "onboarding-9.html"];
  if ((page === "onboarding-2.html") && !sessionStorage.getItem(ONBP_SESSION_KEY)) {
    localStorage.removeItem(ONBP_DYNAMIC_KEY);
    onboardingPages.forEach((p) => sessionStorage.removeItem(`${ONBP_TOUCHED_PREFIX}${p}`));
    sessionStorage.setItem(ONBP_SESSION_KEY, "1");
  }
  const state = readOnbpState();
  if (page === "onboarding-4-apuesta.html") {
    state.modo_especial = "Apuesta";
    if (!String(state.apuesta || "").trim()) {
      state.apuesta = "500";
    }
    saveOnbpState(state);
  }
  const touchedStorageKey = `${ONBP_TOUCHED_PREFIX}${page}`;
  const touched = new Set();
  try {
    const rawTouched = JSON.parse(sessionStorage.getItem(touchedStorageKey) || "[]");
    if (Array.isArray(rawTouched)) {
      rawTouched.forEach((key) => {
        if (typeof key === "string" && key) {
          touched.add(key);
        }
      });
    }
  } catch {
    // ignore parse errors
  }
  const saveTouched = () => {
    sessionStorage.setItem(touchedStorageKey, JSON.stringify(Array.from(touched)));
  };

  const groups = Array.from(document.querySelectorAll("[data-onb-key]"));
  const optionsByKey = new Map();
  groups.forEach((group) => {
    const key = group.dataset.onbKey;
    if (!key) {
      return;
    }
    const type = group.dataset.onbType || "single";
    const options = Array.from(group.querySelectorAll("[data-onb-value]"));
    optionsByKey.set(key, { group, type, options });
  });

  const paintGroup = (key) => {
    const conf = optionsByKey.get(key);
    if (!conf) {
      return;
    }
    const value = state[key];
    conf.options.forEach((opt) => {
      const optVal = opt.dataset.onbValue;
      const selected = Array.isArray(value) ? value.includes(optVal) : value === optVal;
      opt.classList.toggle("selected", selected);
      opt.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  };

  optionsByKey.forEach((conf, key) => {
    conf.options.forEach((opt) => {
      opt.addEventListener("click", () => {
        const val = opt.dataset.onbValue;
        if (conf.type === "multi") {
          const current = Array.isArray(state[key]) ? [...state[key]] : [];
          if (key === "equipo_casa" || key === "extras_plan") {
            const noneValue = "Ninguno";
            if (val === noneValue) {
              state[key] = [noneValue];
            } else {
              const withoutNone = current.filter((item) => item !== noneValue);
              const idx = withoutNone.indexOf(val);
              if (idx >= 0) {
                withoutNone.splice(idx, 1);
              } else {
                withoutNone.push(val);
              }
              state[key] = withoutNone;
            }
          } else {
            const idx = current.indexOf(val);
            if (idx >= 0) {
              current.splice(idx, 1);
            } else {
              current.push(val);
            }
            state[key] = current;
          }
        } else {
          state[key] = val;
        }
        touched.add(key);
        saveTouched();
        saveOnbpState(state);
        paintGroup(key);
        syncOnbpConditionalFields();
        if (typeof opt.blur === "function") {
          opt.blur();
        }
      });
    });
    paintGroup(key);
  });

  const inputs = Array.from(document.querySelectorAll("[data-onb-input]"));
  inputs.forEach((input) => {
    const key = input.dataset.onbInput;
    if (!key) {
      return;
    }
    if (typeof state[key] === "string") {
      input.value = state[key];
    }
    input.addEventListener("input", () => {
      state[key] = input.value.trim();
      saveOnbpState(state);
      syncOnbpConditionalFields();
    });
  });

  const syncOnbpConditionalFields = () => {
    const sportWrap = document.getElementById("onbp-deporte-otro-wrap");
    if (sportWrap) {
      const visible = state.deporte === "Otro";
      sportWrap.classList.toggle("visible", visible);
      sportWrap.classList.toggle("hidden-field", !visible);
    }
    const betWrap = document.getElementById("onbp-apuesta-wrap");
    if (betWrap) {
      const visible = state.modo_especial === "Apuesta";
      betWrap.classList.toggle("visible", visible);
      betWrap.classList.toggle("hidden-field", !visible);
    }
  };

  const checks = Array.from(document.querySelectorAll("[data-onb-check]"));
  checks.forEach((check) => {
    const key = check.dataset.onbCheck;
    if (!key) {
      return;
    }
    check.checked = state[key] === true || state[key] === "on";
    check.addEventListener("change", () => {
      state[key] = Boolean(check.checked);
      saveOnbpState(state);
    });
  });

  const validateCurrentPage = () => {
    for (const [key, conf] of optionsByKey.entries()) {
      if (conf.group.dataset.onbRequired !== "true") {
        continue;
      }
      const value = state[key];
      const valid = Array.isArray(value) ? value.length > 0 : Boolean(value);
      const interacted = touched.has(key);
      if (!valid || !interacted) {
        return false;
      }
    }
    for (const input of inputs) {
      if (!input.required) {
        continue;
      }
      if (!String(input.value || "").trim()) {
        input.reportValidity();
        return false;
      }
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
    }
    if (state.deporte === "Otro" && !String(state.deporte_otro || "").trim()) {
      return false;
    }
    if (state.deporte === "Otro" && isDuplicateSportName(state.deporte_otro, getOnboardingSportCatalog())) {
      const sportInput = document.getElementById("onbp-deporte-otro");
      if (sportInput) {
        sportInput.setCustomValidity("Ese deporte ya existe en la lista. Seleccionalo directamente.");
        sportInput.reportValidity();
        sportInput.setCustomValidity("");
      }
      return false;
    }
    if (state.modo_especial === "Apuesta" && !String(state.apuesta || "").trim()) {
      return false;
    }
    for (const check of checks) {
      if (check.required && !check.checked) {
        return false;
      }
    }
    return true;
  };

  const feedback =
    document.getElementById("onbp-feedback-2") ||
    document.getElementById("onbp-feedback-3") ||
    document.getElementById("onbp-feedback-4") ||
    document.getElementById("onbp-feedback-bet") ||
    document.getElementById("onbp-feedback-5") ||
    document.getElementById("onbp-feedback-6") ||
    document.getElementById("onbp-feedback-7") ||
    document.getElementById("onbp-feedback-8") ||
    document.getElementById("onbp-feedback-8m") ||
    document.getElementById("onbp-feedback-9");
  const showFeedback = (text) => {
    if (!feedback) {
      return;
    }
    feedback.className = text ? "reg-feedback error" : "reg-feedback";
    feedback.textContent = text;
  };

  document.querySelectorAll("[data-onb-next]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (validateCurrentPage()) {
        showFeedback("");
        return;
      }
      event.preventDefault();
      showFeedback("Completa las preguntas para continuar.");
    });
  });

  const finish = document.getElementById("onbp-finish");
  if (finish) {
    finish.addEventListener("click", async () => {
      if (!validateCurrentPage()) {
        showFeedback("Faltan datos para activar tu cuenta.");
        return;
      }
      const email = String(state.email || "").toLowerCase();
      if (!email) {
        showFeedback("Ingresa un correo valido.");
        return;
      }

      const created = ensureUser({
        name: state.nombre || "User",
        email,
        whatsapp: state.whatsapp || "",
        plan: state.plan || "Free",
        horario: state.horario || "",
        objetivo: state.objetivo || "",
        perfil: state.perfil || "",
        edad: state.edad || "",
        peso: state.peso || "",
        estatura: state.estatura || "",
      });
      try {
        const remote = await syncUserWithBackend({
          name: created?.name || state.nombre || "User",
          email,
          whatsapp: state.whatsapp || "",
          role: "user",
          plan: state.plan || "Free",
          goal: state.objetivo || "",
          checkinSchedule: state.horario || "",
          edad: state.edad || "",
          peso: state.peso || "",
          estatura: state.estatura || "",
        });
        hydrateUserCacheFromApi(remote?.user);
      } catch {
        // fallback local
      }

      localStorage.setItem(
        REG_PROFILE_KEY,
        JSON.stringify({
          nombre: state.nombre || "",
          objetivo: state.objetivo || "",
          perfil: state.perfil || "",
          edad: state.edad || "",
          peso: state.peso || "",
          estatura: state.estatura || "",
          horario: state.horario || "",
          activatedAt: new Date().toISOString(),
        })
      );

      const selectedExtras = Array.isArray(state.extras_plan)
        ? state.extras_plan.filter((item) => item && item !== "Ninguno")
        : [];

      const draft = {
        nombre: state.nombre || "",
        email,
        whatsapp: state.whatsapp || "",
        edad: state.edad || "",
        peso: state.peso || "",
        estatura: state.estatura || "",
        horario: state.horario || "",
        objetivo: state.objetivo || "",
        tiempo: state.tiempo || "",
        lugar: state.lugar || "",
        tono: state.tono || "",
        nivel: state.nivel || "",
        lesiones: state.lesiones || "",
        deporte: state.deporte || "",
        deporte_otro: state.deporte_otro || "",
        trigger: Array.isArray(state.trigger) ? state.trigger.join(" | ") : state.trigger || "",
        entreno_casa: state.entreno_casa || "",
        equipo_casa: Array.isArray(state.equipo_casa) ? state.equipo_casa.join(" | ") : state.equipo_casa || "",
        alimentacion: state.alimentacion || "",
        perfil: state.perfil || "",
        modulo: state.modulo || "",
        voz: state.voz || "",
        modo_especial: state.modo_especial || "",
        apuesta: state.apuesta || "",
        plan: state.plan || "",
        extras_plan: selectedExtras.join(" | "),
        foto_checkin: state.foto_checkin || "",
        compromiso: state.compromiso ? "on" : "",
        aviso: state.aviso ? "on" : "",
      };
      localStorage.setItem(REG_DRAFT_KEY, JSON.stringify(draft));
      try {
        await apiPost("/onboarding/profile", {
          email,
          answers: draft,
        });
      } catch {
        // fallback local
      }
      persistPlanSelection({
        id: state.plan || "Free",
        extras: {
          diet_basic: selectedExtras.includes("Seguimiento personalizado"),
          diet_plus: selectedExtras.includes("Dieta Pro"),
        },
      });
      localStorage.setItem(ONBOARDING_DONE_KEY, "1");
      localStorage.removeItem(ONBP_DYNAMIC_KEY);
      sessionStorage.removeItem(ONBP_SESSION_KEY);
      onboardingPages.forEach((p) => sessionStorage.removeItem(`${ONBP_TOUCHED_PREFIX}${p}`));
      window.location.href = "onboarding-resumen.html";
    });
  }

  syncOnbpConditionalFields();
};

initDynamicOnboarding();

const initOnboardingSummary = async () => {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (page !== "onboarding-resumen.html") {
    return;
  }

  const draft = getRegDraft();
  if (!draft.email && !getCurrentUser()) {
    window.location.replace("onboarding-1.html");
    return;
  }
  const selectedPlan = normalizePlanSelection({
    id: draft.plan || getPlanSelection().id || "free",
    extras: getPlanSelection().extras,
  });

  const extras = String(draft.extras_plan || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const planEl = document.getElementById("onb-summary-plan");
  const extrasEl = document.getElementById("onb-summary-extras");
  const costEl = document.getElementById("onb-summary-cost");
  const statusEl = document.getElementById("onb-summary-status");
  const paymentBox = document.getElementById("onb-summary-payment");
  const payBank = document.getElementById("onb-pay-bank");
  const payClabe = document.getElementById("onb-pay-clabe");
  const payHolder = document.getElementById("onb-pay-holder");
  const payAccount = document.getElementById("onb-pay-account");
  const payWhatsapp = document.getElementById("onb-pay-whatsapp");
  const payNote = document.getElementById("onb-pay-note");

  if (planEl) planEl.textContent = selectedPlan.label || "Free";
  if (extrasEl) extrasEl.textContent = extras.length ? extras.join(", ") : "Ninguno";

  const isFree = selectedPlan.id === "free";
  if (costEl) {
    costEl.textContent = isFree ? "Gratis" : selectedPlan.price || "Costo pendiente";
  }
  if (statusEl) {
    statusEl.textContent = isFree ? "Activo sin pago" : "Pendiente de validacion de pago";
  }
  if (paymentBox) {
    paymentBox.style.display = isFree ? "none" : "";
  }
  if (!isFree) {
    const billing = await getBillingTarget();
    if (payBank) payBank.textContent = billing.bankName || "-";
    if (payClabe) payClabe.textContent = billing.clabe || "-";
    if (payHolder) payHolder.textContent = billing.accountHolder || "-";
    if (payAccount) payAccount.textContent = billing.accountNumber || "-";
    if (payWhatsapp) payWhatsapp.textContent = billing.whatsapp || "-";
    if (payNote) payNote.textContent = billing.note || "Si ya hiciste la transferencia, sera validada y tu acceso se actualizara pronto.";
  }
};

initOnboardingSummary();

const initPlanesBillingCard = async () => {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (page !== "planes.html") return;
  const billing = await getBillingTarget();
  const bankEl   = document.getElementById("planes-pay-bank");
  const clabeEl  = document.getElementById("planes-pay-clabe");
  const holderEl = document.getElementById("planes-pay-holder");
  const waEl     = document.getElementById("planes-pay-whatsapp");
  if (bankEl)   bankEl.textContent   = billing.bankName || "-";
  if (clabeEl)  clabeEl.textContent  = billing.clabe || "-";
  if (holderEl) holderEl.textContent = billing.accountHolder || "-";
  if (waEl)     waEl.textContent     = billing.whatsapp || "-";
};
initPlanesBillingCard();

const SQUAD_KEY = "discipline_squad_v1";
const MISSIONS_KEY = "discipline_missions_v1";
const ACTIVITY_MODE_KEY = "discipline_activity_mode_v1";
const TEMPLATE_PICK_KEY = "discipline_template_pick_v1";

const ensureSquad = () => {
  const raw = readJsonArray(SQUAD_KEY);
  if (raw.length >= 5) {
    return raw;
  }
  const names = ["Axel", "Valeria", "Diego", "Renata", "Leo"];
  const users = readJsonArray(USERS_KEY);
  const current = getCurrentUser();
  const currentName = current?.name || users[0]?.name || "Tu";
  const squad = names.map((n, i) => ({
    id: `sq_${i + 1}`,
    name: i === 0 ? currentName : n,
    points: 60 - i * 8,
    streak: 9 - i,
    fails: i === 4 ? 2 : i % 2,
  }));
  saveJsonArray(SQUAD_KEY, squad);
  return squad;
};

const computeUserDisciplineScore = () => {
  const raw = localStorage.getItem(DISCIPLINE_STATE_KEY);
  let state = {};
  try {
    state = raw ? JSON.parse(raw) : {};
  } catch {
    state = {};
  }
  const streak = Number(state.streak || 0);
  const total = Number(state.totalDays || 0);
  const completed = Number(state.completedDays || 0);
  const compliance = total ? Math.round((completed / total) * 100) : 0;
  return Math.min(100, Math.round(compliance * 0.7 + Math.min(30, streak)));
};

const renderSquadRanking = () => {
  const rankingEl = document.getElementById("squad-ranking");
  const feedEl = document.getElementById("squad-feed");
  if (!rankingEl && !feedEl) {
    return;
  }
  const todayNum = Number(new Date().toISOString().slice(-2));
  const squad = ensureSquad().map((m, idx) => {
    if (idx === 0) {
      return { ...m, points: computeUserDisciplineScore(), streak: Math.max(0, m.streak), fails: m.fails };
    }
    const swing = ((todayNum + idx) % 5) - 2;
    return { ...m, points: Math.max(30, Math.min(98, m.points + swing)) };
  });
  squad.sort((a, b) => b.points - a.points);
  saveJsonArray(SQUAD_KEY, squad);

  const rankingHtml = squad
    .map(
      (m, i) => `
      <div class="admin-item">
        <strong>#${i + 1} ${m.name}</strong>
        <p>Score ${m.points}/100 • Racha ${m.streak} • Fallos ${m.fails}</p>
      </div>
    `
    )
    .join("");
  if (rankingEl) {
    rankingEl.innerHTML = rankingHtml;
  }
  if (feedEl) {
    const notices = [
      `${squad[0].name} lidera el reto semanal.`,
      `${squad[squad.length - 1].name} fallo hoy. El grupo ya fue notificado.`,
      `Meta del squad: 85% de cumplimiento en 14 dias.`,
    ];
    feedEl.innerHTML = notices.map((n) => `<div class="admin-item"><p>${n}</p></div>`).join("");
  }
};

const renderDailyMissions = () => {
  const host = document.getElementById("daily-missions");
  if (!host) {
    return;
  }
  const dateKey = new Date().toISOString().slice(0, 10);
  const state = readJsonObject(MISSIONS_KEY);
  const daily = state[dateKey] || {
    walk: false,
    hydrate: false,
    no_scroll: false,
  };
  const missions = [
    { key: "walk", label: "Silent walk 15 min" },
    { key: "hydrate", label: "Tomar 2L de agua" },
    { key: "no_scroll", label: "Sin scroll 30 min antes de dormir" },
  ];

  host.innerHTML = missions
    .map(
      (m) => `
      <button class="mission-item ${daily[m.key] ? "done" : ""}" type="button" data-mission="${m.key}">
        <span>${m.label}</span>
        <strong>${daily[m.key] ? "Hecho" : "Pendiente"}</strong>
      </button>
    `
    )
    .join("");

  host.querySelectorAll("[data-mission]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.mission;
      daily[key] = !daily[key];
      state[dateKey] = daily;
      saveJsonObject(MISSIONS_KEY, state);
      renderDailyMissions();
    });
  });
};

const renderActivityModes = () => {
  const host = document.getElementById("activity-modes");
  if (!host) {
    return;
  }
  const current = localStorage.getItem(ACTIVITY_MODE_KEY) || "Gym";
  const list = ["Gym", "Running", "Bici", "Baile", "Movilidad", "Yoga", "Casa"];
  host.innerHTML = list
    .map((it) => `<button class="chip-btn ${current === it ? "active" : ""}" type="button" data-activity="${it}">${it}</button>`)
    .join("");
  host.querySelectorAll("[data-activity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem(ACTIVITY_MODE_KEY, btn.dataset.activity || "Gym");
      renderActivityModes();
    });
  });
};

const renderWeeklyAiAdjustment = () => {
  const host = document.getElementById("weekly-ai-adjustment");
  if (!host) {
    return;
  }
  const caps = getPlanCapabilities();
  if (!caps.aiAdaptive) {
    host.innerHTML = `<div class="admin-item"><strong>AI Adaptive bloqueado</strong><p>Disponible en planes Coach IA y Coach + Humano.</p></div>`;
    return;
  }
  const raw = localStorage.getItem(DISCIPLINE_STATE_KEY);
  let state = {};
  try {
    state = raw ? JSON.parse(raw) : {};
  } catch {
    state = {};
  }
  const compliance = state.totalDays ? Math.round(((state.completedDays || 0) / state.totalDays) * 100) : 0;
  const fails = Number(state.failures || 0);
  const activity = localStorage.getItem(ACTIVITY_MODE_KEY) || "Gym";
  let plan = "Se mantiene carga actual.";
  let why = "Cumplimiento estable.";
  if (compliance < 55 || fails >= 3) {
    plan = "Reducir volumen 15% y priorizar bloques de 20 min.";
    why = "Baja adherencia en la semana.";
  } else if (compliance > 80) {
    plan = "Subir intensidad 10% + 1 bloque extra de movilidad.";
    why = "Alta consistencia detectada.";
  }
  host.innerHTML = `
    <div class="admin-item">
      <strong>Ajuste semanal IA + coach</strong>
      <p>Actividad foco: ${activity}</p>
      <p>Nuevo plan: ${plan}</p>
      <p>Por que: ${why}</p>
    </div>
  `;
};

const renderRoutineTemplates = () => {
  const host = document.getElementById("routine-templates");
  if (!host) {
    return;
  }
  const currentPick = localStorage.getItem(TEMPLATE_PICK_KEY) || "";
  const templates = [
    { id: "casa20", title: "Pack Casa 20", desc: "Sin equipo, alta adherencia.", clip: "HOME 20" },
    { id: "gluteo30", title: "Pack Gluteo 30", desc: "Foco tren inferior.", clip: "GLUTE 30" },
    { id: "full40", title: "Pack Full Body 40", desc: "Fuerza + cardio final.", clip: "FULL 40" },
  ];
  host.innerHTML = templates
    .map(
      (t) => `
      <article class="entry-card">
        <div class="media-thumb">${t.clip}</div>
        <h3>${t.title}</h3>
        <p>${t.desc}</p>
        <button class="ghost ${currentPick === t.id ? "active" : ""}" type="button" data-template="${t.id}">
          ${currentPick === t.id ? "Seleccionado" : "Anadir a mi plan"}
        </button>
      </article>
    `
    )
    .join("");
  host.querySelectorAll("[data-template]").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem(TEMPLATE_PICK_KEY, btn.dataset.template || "");
      renderRoutineTemplates();
    });
  });
};

const drawShareCard = () => {
  const canvas = document.getElementById("share-card-canvas");
  const download = document.getElementById("share-card-download");
  if (!canvas || !download) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const raw = localStorage.getItem(DISCIPLINE_STATE_KEY);
  let state = {};
  try {
    state = raw ? JSON.parse(raw) : {};
  } catch {
    state = {};
  }
  const streak = Number(state.streak || 0);
  const total = Number(state.totalDays || 0);
  const completed = Number(state.completedDays || 0);
  const compliance = total ? Math.round((completed / total) * 100) : 0;
  const name = getCurrentUser()?.name || "Usuario";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0f1525");
  grad.addColorStop(1, "#1f2a45");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ff3b30";
  ctx.fillRect(32, 32, 140, 10);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "700 34px Space Grotesk";
  ctx.fillText("RACHA REAL", 32, 86);
  ctx.font = "800 120px Bebas Neue";
  ctx.fillText(String(streak), 32, 230);
  ctx.font = "700 34px Space Grotesk";
  ctx.fillText("dias", 210, 230);

  ctx.font = "600 28px Space Grotesk";
  ctx.fillStyle = "#cfd6e8";
  ctx.fillText(`@${name}`, 32, 300);
  ctx.fillText(`Cumplimiento: ${compliance}%`, 32, 350);
  ctx.fillText("Hoy no se negocia.", 32, 400);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(32, 440, Math.max(20, Math.round((canvas.width - 64) * (compliance / 100))), 16);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 26px Space Grotesk";
  ctx.fillText("Disciplina > motivacion", 32, 900);

  download.href = canvas.toDataURL("image/png");
};

const initShareCardActions = () => {
  const btn = document.getElementById("share-card-refresh");
  const download = document.getElementById("share-card-download");
  if (download && !getPlanCapabilities().downloadCard) {
    download.removeAttribute("href");
    download.removeAttribute("download");
    download.textContent = "Disponible en planes pagados";
    download.classList.add("ghost");
    download.classList.remove("primary");
    download.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", drawShareCard);
  }
  drawShareCard();
};

renderSquadRanking();
renderDailyMissions();
renderActivityModes();
renderWeeklyAiAdjustment();
renderRoutineTemplates();
initShareCardActions();

/* ================================================================
   GAMIFICATION v2 — LEVEL SYSTEM, TRIPLE CHECK-IN, BET MODE
   ================================================================ */

// ── LEVEL 1-5 SYSTEM (Spanish names) ─────────────────────────────
const LEVEL_THRESHOLDS = [
  { level: 1, name: "Principiante", emoji: "🌱", minXP: 0,    maxXP: 120  },
  { level: 2, name: "Constante",    emoji: "⚡", minXP: 120,   maxXP: 360  },
  { level: 3, name: "Dedicado",     emoji: "🔥", minXP: 360,   maxXP: 720  },
  { level: 4, name: "Implacable",   emoji: "💀", minXP: 720,   maxXP: 1440 },
  { level: 5, name: "Imparable",    emoji: "👑", minXP: 1440,  maxXP: Infinity },
];

const getLevel5Info = (xp) => {
  const n = Number(xp || 0);
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    const curr = LEVEL_THRESHOLDS[i];
    if (n >= curr.minXP) {
      const next = LEVEL_THRESHOLDS[i + 1] || null;
      const rangeSize = next ? next.minXP - curr.minXP : 1;
      const progress = next ? Math.min(100, Math.round(((n - curr.minXP) / rangeSize) * 100)) : 100;
      return {
        level: curr.level,
        name: curr.name,
        emoji: curr.emoji,
        progress,
        xpToNext: next ? next.minXP - n : 0,
        nextName: next ? next.name : null,
      };
    }
  }
  return { level: 1, name: "Principiante", emoji: "🌱", progress: 0, xpToNext: 120, nextName: "Constante" };
};

const renderLevelBar = (containerId) => {
  const host = document.getElementById(containerId);
  if (!host) return;
  const xp = Number(disciplineState?.xp || 0);
  const info = getLevel5Info(xp);
  host.innerHTML = `
    <div class="level-bar-head">
      <span class="level-badge">${info.emoji} ${info.name}</span>
      <span class="level-next">${info.nextName ? `→ ${info.nextName}` : "🏆 Nivel máx."}</span>
    </div>
    <div class="level-progress-track">
      <div class="level-progress-fill" style="width:${info.progress}%"></div>
    </div>
    <p class="level-xp-hint">${xp} XP${info.xpToNext > 0 ? ` · ${info.xpToNext} para siguiente nivel` : " · ¡Nivel máximo!"}</p>
  `;
};

const renderProgressLevelSteps = () => {
  const host = document.getElementById("progress-level-steps");
  if (!host) return;
  const xp = Number(disciplineState?.xp || 0);
  const info = getLevel5Info(xp);
  host.innerHTML = LEVEL_THRESHOLDS.map((lvl) => {
    const cls = lvl.level < info.level ? "done" : lvl.level === info.level ? "current" : "";
    return `
      <div class="level-step ${cls}">
        <div class="level-step-dot">${cls === "done" ? "✓" : lvl.emoji}</div>
        <span class="level-step-name">${lvl.name}</span>
      </div>`;
  }).join("");
};

// ── TRIPLE CHECK-IN SYSTEM ─────────────────────────────────────────
const TRIPLE_CHECKIN_KEY = "fitnes_triple_checkin_v1";

const getTripleCheckinState = () => {
  const raw = localStorage.getItem(TRIPLE_CHECKIN_KEY);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const data = raw ? JSON.parse(raw) : {};
    if (data.date !== today) return { date: today, trained: false, diet: false, steps: false };
    return data;
  } catch {
    return { date: today, trained: false, diet: false, steps: false };
  }
};

const saveTripleCheckin = (state) => localStorage.setItem(TRIPLE_CHECKIN_KEY, JSON.stringify(state));

const isTripleComplete = () => {
  const s = getTripleCheckinState();
  return s.trained && s.diet && s.steps;
};

const renderTripleCheckin = () => {
  const hosts = document.querySelectorAll(".triple-checkin-container");
  if (!hosts.length) return;
  const state = getTripleCheckinState();
  const items = [
    { key: "trained", icon: "🏋️", label: "Entrené hoy",      sub: "Entrenamiento completado" },
    { key: "diet",    icon: "🥗",  label: "Dieta cumplida",    sub: "Plan de alimentación seguido" },
    { key: "steps",   icon: "👟",  label: "Pasos completados", sub: "Meta diaria alcanzada" },
  ];
  const done = [state.trained, state.diet, state.steps].filter(Boolean).length;
  const allDone = done === 3;
  const html = `
    <div class="triple-checkin-list">
      ${items.map((item) => `
        <div class="triple-check-item ${state[item.key] ? "checked" : ""}" data-triple="${item.key}" role="button" tabindex="0" aria-pressed="${state[item.key]}">
          <span class="triple-check-icon">${item.icon}</span>
          <div class="triple-check-text">
            <strong>${item.label}</strong>
            <span>${item.sub}</span>
          </div>
          <div class="triple-check-box">${state[item.key] ? "✓" : ""}</div>
        </div>`).join("")}
    </div>
    <div class="triple-checkin-progress">
      <div class="triple-checkin-track">
        <div class="triple-checkin-fill" style="width:${Math.round((done / 3) * 100)}%"></div>
      </div>
      <span class="triple-checkin-count">${done}/3${allDone ? " 🔥" : ""}</span>
    </div>
    ${allDone ? '<p style="font-size:12px;color:#27c93f;font-weight:700;margin-top:8px;text-align:center;">✅ ¡Check-in completo! Racha mantenida.</p>' : ""}
  `;
  hosts.forEach((host) => {
    host.innerHTML = html;
    host.querySelectorAll("[data-triple]").forEach((btn) => {
      const doToggle = () => {
        const s = getTripleCheckinState();
        const wasAll = s.trained && s.diet && s.steps;
        s[btn.dataset.triple] = !s[btn.dataset.triple];
        saveTripleCheckin(s);
        renderTripleCheckin();
        const isAll = s.trained && s.diet && s.steps;
        if (isAll && !wasAll) {
          showToast("¡Check-in completo! +50 XP 🔥", "success");
          disciplineState.xp = (disciplineState.xp || 0) + 50;
          saveDisciplineState();
          renderTodayState();
          updateProgressPage();
        }
      };
      btn.addEventListener("click", doToggle);
      btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doToggle(); } });
    });
  });
};

// ── BET MODE SYSTEM ────────────────────────────────────────────────
const BET_STATE_KEY = "fitnes_bet_state_v1";

const getDefaultBetState = () => ({
  active: false, goal: "", amountMXN: 500,
  durationDays: 30, startDate: null, status: "inactive",
});

const getBetState = () => {
  const raw = localStorage.getItem(BET_STATE_KEY);
  if (!raw) return getDefaultBetState();
  try { return { ...getDefaultBetState(), ...JSON.parse(raw) }; }
  catch { return getDefaultBetState(); }
};

const saveBetState = (s) => localStorage.setItem(BET_STATE_KEY, JSON.stringify(s));

const renderBetStatus = () => {
  document.querySelectorAll(".bet-status-card").forEach((host) => {
    const bet = getBetState();

    if (bet.status === "won") {
      host.className = "bet-status-card bet-card won";
      host.innerHTML = `
        <div class="bet-card-label">APUESTA GANADA 🏆</div>
        <div class="bet-result-msg win">¡Lo lograste! Completaste ${bet.durationDays} dias. $${bet.amountMXN} MXN devueltos (simulado).</div>
        <div style="margin-top:12px;text-align:center;">
          <button class="ghost bet-reset-btn" type="button">Nueva apuesta</button>
        </div>`;
    } else if (bet.status === "lost") {
      host.className = "bet-status-card bet-card lost";
      host.innerHTML = `
        <div class="bet-card-label">APUESTA PERDIDA 💀</div>
        <div class="bet-result-msg loss">Fallaste. Perdiste $${bet.amountMXN} MXN (simulado). La disciplina no perdona.</div>
        <div style="margin-top:12px;text-align:center;">
          <button class="ghost bet-reset-btn" type="button">Intentar de nuevo</button>
        </div>`;
    } else if (bet.status === "active") {
      const start = new Date(bet.startDate);
      const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
      const remaining = Math.max(0, bet.durationDays - elapsed);
      const progress = Math.min(100, Math.round((elapsed / bet.durationDays) * 100));
      if (elapsed >= bet.durationDays) {
        const compliance = getCompliancePct(disciplineState);
        saveBetState({ ...bet, status: compliance >= 80 ? "won" : "lost" });
        renderBetStatus();
        return;
      }
      host.className = "bet-status-card bet-card active";
      host.innerHTML = `
        <div class="bet-card-label">APUESTA ACTIVA</div>
        <p style="font-size:13px;font-weight:600;margin:0 0 10px;color:rgba(200,215,255,0.9);">${escHtml(bet.goal)}</p>
        <div class="bet-stat-row">
          <div class="bet-stat-item"><div class="bet-stat-num">${remaining}</div><div class="bet-stat-lbl">Dias rest.</div></div>
          <div class="bet-stat-item"><div class="bet-stat-num">$${bet.amountMXN}</div><div class="bet-stat-lbl">En riesgo</div></div>
          <div class="bet-stat-item"><div class="bet-stat-num">${progress}%</div><div class="bet-stat-lbl">Progreso</div></div>
        </div>
        <div class="bet-progress-track"><div class="bet-progress-fill" style="width:${progress}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <span style="font-size:11px;color:var(--muted);">Inicio: ${start.toLocaleDateString("es-MX")}</span>
          <span style="font-size:11px;color:var(--accent-2);font-weight:700;">Dia ${elapsed + 1} de ${bet.durationDays}</span>
        </div>`;
    } else {
      // Inactive — show setup form
      host.className = "bet-status-card bet-card inactive";
      host.innerHTML = `
        <div class="bet-card-label">MODO APUESTA</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px;">Pon dinero en juego. Completa tu meta o pierde.</p>
        <form class="bet-setup-form">
          <label>Meta<input type="text" class="bet-goal-input" placeholder="Ej. 30 dias seguidos de entrenamiento" /></label>
          <div class="bet-setup-row">
            <label>Monto MXN<input type="number" class="bet-amount-input" value="500" min="50" max="10000" /></label>
            <label>Duración<select class="bet-duration-input">
              <option value="7">7 dias</option><option value="14">14 dias</option>
              <option value="21">21 dias</option><option value="30" selected>30 dias</option>
              <option value="60">60 dias</option><option value="90">90 dias</option>
            </select></label>
          </div>
          <button class="primary" type="submit">Activar apuesta 🔥</button>
        </form>`;
    }

    // Bind reset buttons
    host.querySelectorAll(".bet-reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => { saveBetState(getDefaultBetState()); renderBetStatus(); });
    });

    // Bind setup form
    const form = host.querySelector(".bet-setup-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const goal = form.querySelector(".bet-goal-input")?.value?.trim();
        if (!goal) return;
        saveBetState({
          active: true, goal,
          amountMXN: Number(form.querySelector(".bet-amount-input")?.value || 500),
          durationDays: Number(form.querySelector(".bet-duration-input")?.value || 30),
          startDate: new Date().toISOString().slice(0, 10),
          status: "active",
        });
        renderBetStatus();
        showToast("¡Apuesta activada! No falles. 🔥", "success");
      });
    }
  });
};

// ── GAMING RANKING ──────────────────────────────────────────────────
const renderGamingRanking = (containerId) => {
  const host = document.getElementById(containerId);
  if (!host) return;
  const userScore = computeUserDisciplineScore();
  const userName = getCurrentUser()?.name || "Tú";
  const baseList = [
    { name: "Marco A.",   score: 94, streak: 21 },
    { name: "Valeria R.", score: 91, streak: 18 },
    { name: "Diego P.",   score: 88, streak: 15 },
    { name: "Renata M.",  score: 85, streak: 12 },
    { name: "Leo G.",     score: 82, streak: 9  },
    { name: "Sofia T.",   score: 79, streak: 7  },
    { name: "Carlos V.",  score: 74, streak: 5  },
  ];
  const me = { name: userName, score: userScore, streak: disciplineState?.streak || 0, isMe: true };
  const list = [...baseList, me].sort((a, b) => b.score - a.score).slice(0, 5);
  const posClass = ["gold", "silver", "bronze", "", ""];
  const posLabel = ["🥇", "🥈", "🥉", "#4", "#5"];
  host.className = "gaming-ranking-list";
  host.innerHTML = list.map((row, i) => `
    <div class="gaming-rank-item ${row.isMe ? "me" : ""}">
      <div class="gaming-rank-pos ${posClass[i] || ""}">${posLabel[i]}</div>
      <div class="gaming-rank-info">
        <div class="gaming-rank-name">${escHtml(row.name)}${row.isMe ? " (Tú)" : ""}</div>
        <div class="gaming-rank-detail">Score ${row.score}/100 · ${row.streak} dias racha</div>
      </div>
      <span class="gaming-rank-badge ${row.streak >= 14 ? "fire" : row.score >= 90 ? "elite" : ""}">${row.streak >= 14 ? "🔥" : row.score >= 90 ? "⭐" : row.streak + "d"}</span>
    </div>`).join("");
};

// ── NUTRITION MACRO BARS ──────────────────────────────────────────
const renderMacroBars = () => {
  const host = document.getElementById("macro-bars-container");
  if (!host) return;
  const raw = localStorage.getItem("fitnes_nutrition_v1");
  let n = { water: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
  try { if (raw) n = { ...n, ...JSON.parse(raw)[new Date().toISOString().slice(0, 10)] || {} }; } catch {}
  const macros = [
    { key: "water",    label: "Agua",     cls: "water",   val: n.water || 0,    max: 8,    unit: "vaso" },
    { key: "protein",  label: "Proteína", cls: "protein", val: n.protein || 0,  max: 150,  unit: "g" },
    { key: "carbs",    label: "Carbos",   cls: "carbs",   val: n.carbs || 0,    max: 250,  unit: "g" },
    { key: "fat",      label: "Grasa",    cls: "fat",     val: n.fat || 0,      max: 80,   unit: "g" },
  ];
  host.innerHTML = `<div class="macro-bars">${macros.map((m) => `
    <div class="macro-bar-row">
      <span class="macro-bar-label">${m.label}</span>
      <div class="macro-bar-track">
        <div class="macro-bar-fill ${m.cls}" style="width:${Math.min(100, Math.round((m.val / m.max) * 100))}%"></div>
      </div>
      <span class="macro-bar-val">${m.val}${m.unit}</span>
    </div>`).join("")}</div>`;
};

// ── PROFILE PAGE ─────────────────────────────────────────────────
const renderProfileHeader = () => {
  const host = document.getElementById("profile-header-card");
  if (!host) return;
  const user = getCurrentUser();
  const caps = getPlanCapabilities();
  const xp = disciplineState?.xp || 0;
  const info = getLevel5Info(xp);
  const compliance = getCompliancePct(disciplineState);
  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  host.innerHTML = `
    <div class="profile-avatar">${escHtml(initials)}</div>
    <div class="profile-name">${escHtml(user?.name || "Usuario")}</div>
    <span class="profile-plan-chip">${escHtml(caps.plan.label)}</span>
    <div class="profile-stats-grid">
      <div class="profile-stat-box">
        <span class="profile-stat-val">${disciplineState?.streak || 0}</span>
        <span class="profile-stat-lbl">Racha 🔥</span>
      </div>
      <div class="profile-stat-box">
        <span class="profile-stat-val">${compliance}%</span>
        <span class="profile-stat-lbl">Cumpl.</span>
      </div>
      <div class="profile-stat-box">
        <span class="profile-stat-val">${xp}</span>
        <span class="profile-stat-lbl">XP ⭐</span>
      </div>
    </div>
    <div style="margin-top:14px;">
      <div class="level-bar-head" style="margin-bottom:6px;">
        <span class="level-badge">${info.emoji} ${info.name}</span>
        <span class="level-next">${info.nextName ? "→ " + info.nextName : "🏆 Máx."}</span>
      </div>
      <div class="level-progress-track">
        <div class="level-progress-fill" style="width:${info.progress}%"></div>
      </div>
    </div>`;
};

// ── PROGRESS PAGE RENDER ──────────────────────────────────────────
const updateProgressPage = () => {
  renderProgressLevelSteps();
  renderLevelBar("progress-level-bar");
  renderGamingRanking("progress-gaming-ranking");
};

// ── GAMING DASHBOARD (app-inicio.html) ────────────────────────────
const initGamingDashboard = () => {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (page !== "app-inicio.html") return;

  const streak = disciplineState?.streak || 0;
  const xp = disciplineState?.xp || 0;
  const totalDays = disciplineState?.totalDays || 0;
  const completedDays = disciplineState?.completedDays || 0;
  const compliance = totalDays ? Math.round((completedDays / totalDays) * 100) : 0;

  // Greeting
  const user = getCurrentUser();
  const greetEl = document.getElementById("dash-greeting");
  if (greetEl) greetEl.textContent = user?.name ? `Hola, ${user.name.split(" ")[0]}` : "Bienvenido de vuelta";

  // Streak card
  const streakNumEl = document.getElementById("dash-streak-num");
  const streakSubEl = document.getElementById("dash-streak-sub");
  const streakCard  = document.getElementById("dash-streak-card");
  const fireEmoji   = document.getElementById("dash-fire-emoji");
  if (streakNumEl) streakNumEl.textContent = streak;
  if (streakSubEl) {
    if (streak === 0) streakSubEl.textContent = "Primer dia. Empieza ahora.";
    else if (streak < 7) streakSubEl.textContent = `${7 - streak} dias para racha semanal`;
    else if (streak < 30) streakSubEl.textContent = `${30 - streak} dias para modo imparable`;
    else streakSubEl.textContent = "🏆 Modo imparable activo";
  }
  if (streakCard && streak === 0) streakCard.classList.add("broken");
  if (fireEmoji) {
    if (streak >= 30) { fireEmoji.textContent = "👑"; }
    else if (streak >= 14) { fireEmoji.textContent = "🔥"; }
    else if (streak >= 7)  { fireEmoji.textContent = "⚡"; }
    else if (streak > 0)   { fireEmoji.textContent = "🔥"; }
    else { fireEmoji.textContent = "💀"; fireEmoji.style.filter = "grayscale(1)"; }
  }

  // Quick stats
  const xpEl     = document.getElementById("dash-xp");
  const rankEl   = document.getElementById("dash-rank-pos");
  const compEl   = document.getElementById("dash-compliance");
  if (xpEl) xpEl.textContent = xp;
  if (compEl) compEl.textContent = `${compliance}%`;
  if (rankEl) {
    const score = computeUserDisciplineScore();
    rankEl.textContent = score >= 90 ? "#1" : score >= 80 ? "#2" : score >= 70 ? "#3" : score >= 60 ? "#4" : "#5+";
  }

  // Level bar, triple check-in, bet, ranking
  renderLevelBar("dash-level-bar");
  renderTripleCheckin();
  renderBetStatus();
  renderGamingRanking("dash-ranking-list");

  // Update CTA button if triple done
  const cta = document.getElementById("app-entry-link");
  if (cta && isTripleComplete()) {
    cta.classList.add("done");
    const mainSpan = cta.querySelector("span:first-child");
    if (mainSpan) mainSpan.textContent = "✅ CHECK-IN COMPLETADO";
  }
};

// ── BOOT ALL NEW FEATURES ─────────────────────────────────────────
// ── NAV THEME TOGGLE BUTTON ───────────────────────────────────────
(() => {
  const btn   = document.getElementById("nav-theme-btn");
  const icon  = document.getElementById("nav-theme-icon");
  const label = document.getElementById("nav-theme-label");
  if (!btn) return;
  const syncBtn = () => {
    const isFemale = document.body.classList.contains("theme-female");
    if (icon)  icon.textContent  = isFemale ? "♀" : "♂";
    if (label) label.textContent = isFemale ? "Mujer" : "Hombre";
  };
  syncBtn();
  btn.addEventListener("click", () => {
    const next = document.body.classList.contains("theme-female") ? "male" : "female";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    syncBtn();
  });
})();

initGamingDashboard();
renderTripleCheckin();
renderBetStatus();
renderProgressLevelSteps();
renderLevelBar("progress-level-bar");
renderLevelBar("user-level-bar");
renderGamingRanking("progress-gaming-ranking");
renderGamingRanking("hoy-gaming-ranking");
renderMacroBars();
renderProfileHeader();
