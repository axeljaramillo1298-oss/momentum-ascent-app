/* rutinas-pulse.js — Momentum Pulse Gauge
   Canvas gauge + particle field for user-rutinas.html
   Reads level/XP/streak data from app.js DOM output. */

(function () {
  var canvas = document.getElementById("mp-canvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var W, H, cx, cy, R;
  var prog = 0, progTarget = 0;
  var rotAngle = 0, pulseT = 0;
  var particles = [];
  var levelInfo = { name: "", emoji: "⚡", xp: 0, streak: 0, compliance: 0 };
  var dataLoaded = false;
  var raf;

  // ── read data set by app.js ──────────────────────────────────────
  function readData() {
    // Level name + progress from the existing level bar DOM
    var fill   = document.querySelector("#user-level-bar .level-progress-fill");
    var badge  = document.querySelector("#user-level-bar .level-badge");
    var xpEl   = document.querySelector("#user-level-bar .level-bar-xp");
    var nextEl = document.querySelector("#user-level-bar .level-bar-next");

    var pct = fill ? (parseFloat(fill.style.width) || 0) : 0;

    // Badge text is like "⚡ CONSTANTE"
    var badgeTxt = badge ? badge.textContent.trim() : "";
    var emoji = "⚡", name = "MOMENTUM";
    if (badgeTxt && badgeTxt !== "Nivel en carga...") {
      var parts = badgeTxt.split(" ");
      emoji = parts[0] || "⚡";
      name  = parts.slice(1).join(" ") || "MOMENTUM";
    }

    // XP from discipline state
    var raw = localStorage.getItem("ma_discipline_state");
    var state = {};
    try { state = raw ? JSON.parse(raw) : {}; } catch(e) {}
    var xp         = Number(state.xp || 0);
    var streak     = Number(state.streak || 0);
    var total      = Number(state.totalDays || 0);
    var completed  = Number(state.completedDays || 0);
    var compliance = total ? Math.round((completed / total) * 100) : 0;

    return { pct: pct, emoji: emoji, name: name, xp: xp, streak: streak, compliance: compliance };
  }

  // ── particles ────────────────────────────────────────────────────
  function spawnParticles() {
    particles = [];
    var count = Math.min(70, Math.floor(W / 14));
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.4 + 0.4,
        a: Math.random() * 0.35 + 0.08
      });
    }
  }

  function resize() {
    var wrap = canvas.parentElement;
    W  = canvas.width  = wrap.clientWidth;
    H  = canvas.height = Math.round(Math.min(360, W * 0.68));
    canvas.style.height = H + "px";
    cx = W / 2;
    cy = H / 2 - H * 0.04;
    R  = Math.min(cx, cy) * 0.54;
    spawnParticles();
  }

  // ── draw loop ────────────────────────────────────────────────────
  function draw() {
    raf = requestAnimationFrame(draw);
    rotAngle += 0.0035;
    pulseT   += 0.038;
    prog     += (progTarget - prog) * 0.045;

    ctx.clearRect(0, 0, W, H);

    // radial bg
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.72);
    bg.addColorStop(0,   "rgba(38, 8, 8, 1)");
    bg.addColorStop(0.6, "rgba(16, 6, 18, 1)");
    bg.addColorStop(1,   "rgba(6, 6, 14, 1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // subtle grid
    ctx.strokeStyle = "rgba(255,60,40,0.04)";
    ctx.lineWidth = 1;
    var gStep = 44;
    for (var gx = 0; gx < W; gx += gStep) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += gStep) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // particles + connections
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,90,50," + p.a + ")";
      ctx.fill();

      for (var j = i + 1; j < particles.length; j++) {
        var q = particles[j];
        var dx = p.x - q.x, dy = p.y - q.y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 72) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(255,70,40," + (0.10 * (1 - dist / 72)) + ")";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // deep glow behind ring
    var glow = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.2);
    glow.addColorStop(0,   "rgba(255,50,30,0.10)");
    glow.addColorStop(0.5, "rgba(200,40,20,0.05)");
    glow.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // outer rotating tick ring
    var ticks = 48;
    for (var t = 0; t < ticks; t++) {
      var ang = (t / ticks) * Math.PI * 2 + rotAngle;
      var isMaj = t % 6 === 0;
      var r1 = R + 26, r2 = R + 26 + (isMaj ? 10 : 5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.strokeStyle = isMaj ? "rgba(255,80,40,0.65)" : "rgba(255,80,40,0.18)";
      ctx.lineWidth   = isMaj ? 1.8 : 0.8;
      ctx.stroke();
    }

    // second thin rotating ring (opposite direction)
    ctx.beginPath();
    ctx.arc(cx, cy, R + 18, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,60,40,0.08)";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // arc track
    var startA = Math.PI * 0.72;
    var endA   = Math.PI * 2.28;
    ctx.beginPath();
    ctx.arc(cx, cy, R, startA, endA);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth   = 16;
    ctx.lineCap     = "round";
    ctx.stroke();

    // arc fill
    if (prog > 0.5) {
      var fillEnd = startA + (endA - startA) * Math.min(1, prog / 100);
      var arcGrad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
      arcGrad.addColorStop(0,   "#ff3b30");
      arcGrad.addColorStop(0.55, "#ff6b35");
      arcGrad.addColorStop(1,   "#ffd166");
      ctx.beginPath();
      ctx.arc(cx, cy, R, startA, fillEnd);
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth   = 16;
      ctx.lineCap     = "round";
      ctx.stroke();

      // tip bloom
      var tipX = cx + Math.cos(fillEnd) * R;
      var tipY = cy + Math.sin(fillEnd) * R;
      var bloom = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 24);
      bloom.addColorStop(0, "rgba(255,215,100,0.55)");
      bloom.addColorStop(1, "rgba(255,215,100,0)");
      ctx.beginPath();
      ctx.arc(tipX, tipY, 24, 0, Math.PI * 2);
      ctx.fillStyle = bloom;
      ctx.fill();
    }

    // inner pulse ring
    var pulseR = R * 0.76 + Math.sin(pulseT) * 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,59,48," + (0.10 + Math.sin(pulseT) * 0.07) + ")";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // second pulse ring (offset phase)
    var pulseR2 = R * 0.60 + Math.sin(pulseT + 1.8) * 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,209,102," + (0.06 + Math.sin(pulseT + 1.8) * 0.04) + ")";
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    // center text
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    // emoji
    var emojiFontSize = Math.round(R * 0.30);
    ctx.font      = emojiFontSize + "px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(levelInfo.emoji, cx, cy - R * 0.30);

    // big percentage
    var bigFont = Math.round(R * 0.54);
    ctx.font      = "800 " + bigFont + "px 'Bebas Neue', 'Arial Black', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(Math.round(prog) + "%", cx, cy + R * 0.06);

    // level name
    ctx.font      = "700 " + Math.round(R * 0.165) + "px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(levelInfo.name || "CARGANDO", cx, cy + R * 0.37);

    // sub label
    ctx.font      = "500 " + Math.round(R * 0.115) + "px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.fillText("AL SIGUIENTE NIVEL", cx, cy + R * 0.57);

    // update stat chips
    if (dataLoaded) {
      var xpEl = document.getElementById("mp-xp-val");
      var stEl = document.getElementById("mp-streak-val");
      var coEl = document.getElementById("mp-compliance-val");
      if (xpEl && xpEl.textContent === "—") xpEl.textContent = levelInfo.xp;
      if (stEl && stEl.textContent === "—") stEl.textContent = levelInfo.streak + " días";
      if (coEl && coEl.textContent === "—") coEl.textContent = levelInfo.compliance + "%";
    }
  }

  // ── boot ─────────────────────────────────────────────────────────
  window.addEventListener("resize", function () {
    resize();
    spawnParticles();
  });
  resize();
  draw();

  // Wait for app.js to fill the level bar, then read data
  function tryLoad(attempt) {
    var d = readData();
    if (d.pct > 0 || attempt > 10) {
      progTarget      = d.pct;
      levelInfo.emoji = d.emoji;
      levelInfo.name  = d.name;
      levelInfo.xp    = d.xp;
      levelInfo.streak    = d.streak;
      levelInfo.compliance = d.compliance;
      dataLoaded = true;
    } else {
      setTimeout(function () { tryLoad(attempt + 1); }, 300);
    }
  }
  setTimeout(function () { tryLoad(0); }, 500);
})();
