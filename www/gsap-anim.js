/* gsap-anim.js — Momentum Ascent GSAP animations
   Loaded dynamically from app.js. Detects current page and runs
   the appropriate animation set. Loads GSAP + ScrollTrigger from CDN. */

(function () {
  const PAGE = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

  function loadScript(src, onload) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = onload;
    document.head.appendChild(s);
  }

  // ── utils ─────────────────────────────────────────────────────────
  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ── page router ───────────────────────────────────────────────────
  function route(gsap, ScrollTrigger) {
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    if (PAGE === "user-rutinas.html") return initRutinas(gsap, ScrollTrigger);
    if (PAGE === "user-hoy.html")     return initHoy(gsap);
    if (PAGE === "user-progreso.html")return initProgreso(gsap, ScrollTrigger);
    if (PAGE === "index.html" || PAGE === "" || PAGE === "registro.html") return initHome(gsap, ScrollTrigger);
    if (PAGE === "planes.html")       return initPlanes(gsap, ScrollTrigger);
    if (PAGE.startsWith("onboarding")) return initOnboarding(gsap);
  }

  // ── RUTINAS ───────────────────────────────────────────────────────
  function initRutinas(gsap, ScrollTrigger) {
    // Hero text
    gsap.from(".user-panel-hero .eyebrow", { y: -20, opacity: 0, duration: 0.5, ease: "power2.out" });
    gsap.from(".user-panel-hero h1",       { y: -16, opacity: 0, duration: 0.6, delay: 0.1, ease: "power2.out" });
    gsap.from(".user-panel-hero .subhead", { y: -12, opacity: 0, duration: 0.5, delay: 0.2, ease: "power2.out" });

    // Level bar card entrance
    gsap.from("#user-level-bar", { y: 30, opacity: 0, duration: 0.5, delay: 0.3, ease: "back.out(1.7)" });

    // Animate level bar fill — wait for app.js to set the width, then tween from 0
    var fillEl = document.querySelector(".level-progress-fill");
    if (fillEl) {
      var targetWidth = fillEl.style.width || "0%";
      fillEl.style.width = "0%";
      gsap.to(fillEl, { width: targetWidth, duration: 1, delay: 0.6, ease: "power3.out" });
    }

    // Section titles
    gsap.from(".section-title", {
      y: 28, opacity: 0, duration: 0.5, stagger: 0.14, delay: 0.35, ease: "power2.out"
    });

    // Admin grid cards
    gsap.from(".admin-grid .card", {
      y: 40, opacity: 0, duration: 0.55, stagger: 0.1, delay: 0.4, ease: "back.out(1.4)"
    });

    // Routine feed — animate cards as they are inserted by app.js (async)
    var feedEl = document.getElementById("user-routines-page-feed");
    if (feedEl) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType === 1 && node.classList && node.classList.contains("entry-card")) {
              gsap.from(node, { y: 36, opacity: 0, duration: 0.45, ease: "back.out(1.6)" });
            }
          });
        });
      });
      observer.observe(feedEl, { childList: true });
      // Animate any cards already present
      var existing = feedEl.querySelectorAll(".entry-card");
      if (existing.length) {
        gsap.from(existing, { y: 36, opacity: 0, duration: 0.45, stagger: 0.1, delay: 0.5, ease: "back.out(1.6)" });
      }
    }

    // Routine templates section
    var templatesEl = document.getElementById("routine-templates");
    if (templatesEl) {
      var tObs = new MutationObserver(function () {
        var cards = templatesEl.querySelectorAll(".entry-card");
        if (cards.length) {
          gsap.from(cards, { y: 30, opacity: 0, duration: 0.4, stagger: 0.1, ease: "back.out(1.4)" });
          tObs.disconnect();
        }
      });
      tObs.observe(templatesEl, { childList: true });
    }

    // Activity mode chips
    gsap.from(".chip-grid .chip-btn", { scale: 0.8, opacity: 0, duration: 0.3, stagger: 0.05, delay: 0.55, ease: "back.out(2)" });

    // Bottom nav
    gsap.from(".bottom-nav-item", { y: 30, opacity: 0, duration: 0.45, stagger: 0.07, delay: 0.6, ease: "back.out(2)" });
  }

  // ── HOY ───────────────────────────────────────────────────────────
  function initHoy(gsap) {
    gsap.from(".user-panel-hero .eyebrow, .user-panel-hero h1, .user-panel-hero .subhead", {
      y: -14, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out"
    });
    gsap.from("#user-level-bar", { y: 28, opacity: 0, duration: 0.5, delay: 0.25, ease: "back.out(1.7)" });

    var fillEl = document.querySelector(".level-progress-fill");
    if (fillEl) {
      var tw = fillEl.style.width || "0%";
      fillEl.style.width = "0%";
      gsap.to(fillEl, { width: tw, duration: 1, delay: 0.5, ease: "power3.out" });
    }

    gsap.from(".section .card, .section .entry-card", {
      y: 36, opacity: 0, duration: 0.5, stagger: 0.1, delay: 0.3, ease: "back.out(1.4)"
    });

    // XP counter
    var xpEl = document.getElementById("today-xp");
    if (xpEl) {
      var xpTarget = parseInt(xpEl.textContent, 10) || 0;
      xpEl.textContent = "0";
      gsap.to({ v: 0 }, {
        v: xpTarget, duration: 1.2, delay: 0.6, ease: "power2.out",
        onUpdate: function () { xpEl.textContent = Math.round(this.targets()[0].v); }
      });
    }

    // Streak counter
    var streakEl = document.getElementById("today-streak");
    if (streakEl) {
      var stTarget = parseInt(streakEl.textContent, 10) || 0;
      streakEl.textContent = "0";
      gsap.to({ v: 0 }, {
        v: stTarget, duration: 1.0, delay: 0.7, ease: "power2.out",
        onUpdate: function () { streakEl.textContent = Math.round(this.targets()[0].v); }
      });
    }

    gsap.from(".bottom-nav-item", { y: 30, opacity: 0, duration: 0.45, stagger: 0.07, delay: 0.6, ease: "back.out(2)" });
  }

  // ── PROGRESO ──────────────────────────────────────────────────────
  function initProgreso(gsap, ScrollTrigger) {
    gsap.from(".user-panel-hero h1, .user-panel-hero .eyebrow, .user-panel-hero .subhead", {
      y: -14, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out"
    });

    var cards = document.querySelectorAll(".section .card, .stat-card, .entry-card");
    if (cards.length && ScrollTrigger) {
      cards.forEach(function (card) {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 88%", once: true },
          y: 40, opacity: 0, duration: 0.5, ease: "back.out(1.4)"
        });
      });
    } else if (cards.length) {
      gsap.from(cards, { y: 36, opacity: 0, duration: 0.5, stagger: 0.1, delay: 0.2, ease: "back.out(1.4)" });
    }

    gsap.from(".bottom-nav-item", { y: 30, opacity: 0, duration: 0.45, stagger: 0.07, delay: 0.5, ease: "back.out(2)" });
  }

  // ── HOME / LANDING ────────────────────────────────────────────────
  function initHome(gsap, ScrollTrigger) {
    // Hero headline
    gsap.from(".hero-title, .hero-sub, .hero-cta", {
      y: 30, opacity: 0, duration: 0.6, stagger: 0.15, delay: 0.2, ease: "power3.out"
    });

    if (!ScrollTrigger) return;

    // "COMO FUNCIONA" steps
    document.querySelectorAll(".home-v2-step").forEach(function (el) {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
        y: 50, opacity: 0, duration: 0.55, ease: "back.out(1.4)"
      });
    });

    // Stat numbers on landing
    document.querySelectorAll(".stat-number, .hero-stat-num").forEach(function (el) {
      var target = parseFloat(el.textContent) || 0;
      if (!target) return;
      el.textContent = "0";
      gsap.to({ v: 0 }, {
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
        v: target, duration: 1.4, ease: "power2.out",
        onUpdate: function () {
          var val = this.targets()[0].v;
          el.textContent = Number.isInteger(target) ? Math.round(val) : val.toFixed(1);
        }
      });
    });

    // Generic section cards
    document.querySelectorAll(".home-card, .feature-card, .pricing-card, .price-card").forEach(function (el) {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        y: 40, opacity: 0, duration: 0.5, ease: "back.out(1.4)"
      });
    });
  }

  // ── PLANES ────────────────────────────────────────────────────────
  function initPlanes(gsap, ScrollTrigger) {
    gsap.from(".page-hero h1, .page-hero p", {
      y: -20, opacity: 0, duration: 0.5, stagger: 0.12, ease: "power2.out"
    });

    if (!ScrollTrigger) return;

    document.querySelectorAll(".price-card, .plan-card").forEach(function (el) {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        y: 50, opacity: 0, duration: 0.55, ease: "back.out(1.5)"
      });
    });

    document.querySelectorAll(".comparison-row, .transfer-demo-card").forEach(function (el) {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        x: -30, opacity: 0, duration: 0.45, ease: "power2.out"
      });
    });
  }

  // ── ONBOARDING ────────────────────────────────────────────────────
  function initOnboarding(gsap) {
    // Hero
    gsap.from(".onb-hero", { opacity: 0, duration: 0.7, ease: "power2.out" });
    gsap.from(".onb-title, .onb-sub, .onb-eyebrow", {
      y: 24, opacity: 0, duration: 0.5, stagger: 0.1, delay: 0.2, ease: "power2.out"
    });

    // Option cards stagger bounce
    var options = document.querySelectorAll(".onb-option");
    if (options.length) {
      gsap.from(options, {
        scale: 0.82, opacity: 0, duration: 0.4, stagger: 0.06, delay: 0.35, ease: "back.out(1.8)"
      });
    }

    // CTA
    gsap.from(".onb-cta", { y: 24, opacity: 0, duration: 0.45, delay: 0.55, ease: "back.out(1.6)" });

    // Form inputs on step 9
    var inputs = document.querySelectorAll(".onb-input");
    if (inputs.length) {
      gsap.from(inputs, { y: 16, opacity: 0, duration: 0.4, stagger: 0.08, delay: 0.3, ease: "power2.out" });
    }
  }

  // ── BOOT ─────────────────────────────────────────────────────────
  // Always load GSAP core. Load ScrollTrigger only for pages that need it.
  var needsST = ["index.html", "", "planes.html", "user-progreso.html"].indexOf(PAGE) >= 0;

  onReady(function () {
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js", function () {
      var gsap = window.gsap;
      if (!gsap) return;

      if (needsST) {
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js", function () {
          route(gsap, window.ScrollTrigger);
        });
      } else {
        route(gsap, null);
      }
    });
  });
})();
