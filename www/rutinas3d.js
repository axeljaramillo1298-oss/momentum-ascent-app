/* rutinas3d.js — Wireframe fitness figure. Canvas 2D puro, sin dependencias. */
(function () {
  "use strict";

  var canvas = document.getElementById("rutinas-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 1.8);
  var FOV = 860;
  var t = 0;
  var mx = 0, my = 0, tmx = 0, tmy = 0;

  /* ── SKELETON JOINTS (3D world coords) ────────────────────────── */
  var J = {
    headC:   { x: 0,    y: 215,  z: 0   },
    neck:    { x: 0,    y: 182,  z: 0   },
    lShould: { x: -72,  y: 164,  z: 0   },
    rShould: { x:  72,  y: 164,  z: 0   },
    lElbow:  { x: -92,  y:  94,  z: 22  },
    rElbow:  { x:  92,  y:  94,  z: -22 },
    lWrist:  { x: -96,  y:  16,  z: 36  },
    rWrist:  { x:  96,  y:  16,  z: -36 },
    chest:   { x: 0,    y: 146,  z: 0   },
    lPec:    { x: -40,  y: 148,  z: 14  },
    rPec:    { x:  40,  y: 148,  z: -14 },
    waist:   { x: 0,    y:  68,  z: 0   },
    lWaistS: { x: -30,  y:  70,  z: 6   },
    rWaistS: { x:  30,  y:  70,  z: -6  },
    lHip:    { x: -44,  y:  50,  z: 0   },
    rHip:    { x:  44,  y:  50,  z: 0   },
    lKnee:   { x: -48,  y: -62,  z: 0   },
    rKnee:   { x:  48,  y: -62,  z: 0   },
    lAnkle:  { x: -52,  y: -172, z: 0   },
    rAnkle:  { x:  52,  y: -172, z: 0   },
    lFoot:   { x: -58,  y: -186, z: 10  },
    rFoot:   { x:  58,  y: -186, z: -10 }
  };

  /* ── BONES [from, to, color, width, group] ─────────────────────── */
  var BONES = [
    /* spine */
    ["neck",   "chest",   "#ff6b35", 2.2, "spine"],
    ["chest",  "waist",   "#ff6b35", 2.2, "spine"],
    /* collar */
    ["neck",   "lShould", "#ff8f70", 1.6, "upper"],
    ["neck",   "rShould", "#ff8f70", 1.6, "upper"],
    /* arms */
    ["lShould","lElbow",  "#f5c04a", 2.6, "arms"],
    ["lElbow", "lWrist",  "#f5c04a", 2.2, "arms"],
    ["rShould","rElbow",  "#f5c04a", 2.6, "arms"],
    ["rElbow", "rWrist",  "#f5c04a", 2.2, "arms"],
    /* torso outline */
    ["lShould","lHip",    "#ff6b35", 1.8, "torso"],
    ["rShould","rHip",    "#ff6b35", 1.8, "torso"],
    /* chest cross */
    ["lShould","lPec",    "#ff6b35", 1.2, "torso"],
    ["rShould","rPec",    "#ff6b35", 1.2, "torso"],
    ["lPec",   "rPec",    "#ff7550", 1.0, "torso"],
    ["lPec",   "lWaistS", "#ff6b35", 1.2, "torso"],
    ["rPec",   "rWaistS", "#ff6b35", 1.2, "torso"],
    ["lWaistS","rWaistS", "#ff8f70", 0.9, "torso"],
    /* hips */
    ["waist",  "lHip",    "#ff8f70", 1.5, "lower"],
    ["waist",  "rHip",    "#ff8f70", 1.5, "lower"],
    ["lHip",   "rHip",    "#ff8f70", 1.2, "lower"],
    /* legs */
    ["lHip",   "lKnee",   "#ffd36e", 2.6, "legs"],
    ["lKnee",  "lAnkle",  "#ffd36e", 2.2, "legs"],
    ["lAnkle", "lFoot",   "#ffd36e", 1.4, "legs"],
    ["rHip",   "rKnee",   "#ffd36e", 2.6, "legs"],
    ["rKnee",  "rAnkle",  "#ffd36e", 2.2, "legs"],
    ["rAnkle", "rFoot",   "#ffd36e", 1.4, "legs"]
  ];

  /* ── MUSCLE LABELS ─────────────────────────────────────────────── */
  var LABELS = [
    { text: "PECHO",   joint: "lPec",    dx: -88, dy: 8,  color: "#ff6b35" },
    { text: "BRAZOS",  joint: "lElbow",  dx: -92, dy: 0,  color: "#f5c04a" },
    { text: "CORE",    joint: "waist",   dx:  88, dy: 0,  color: "#ff8f70" },
    { text: "PIERNAS", joint: "lKnee",   dx: -92, dy: 0,  color: "#ffd36e" }
  ];

  /* ── ORBITAL RINGS ─────────────────────────────────────────────── */
  var RINGS = [
    { tiltX: 0.28, tiltZ: 0.0,  r: 215, spd:  0.20, col: "rgba(255,107,53,0.55)",  lw: 1.1 },
    { tiltX: 0.82, tiltZ: 0.4,  r: 175, spd: -0.16, col: "rgba(245,192,74,0.40)",  lw: 0.8 },
    { tiltX: 0.1,  tiltZ: 1.0,  r: 262, spd:  0.13, col: "rgba(255,143,112,0.28)", lw: 0.6 }
  ];

  /* ring dots */
  var RDOTS = [];
  RINGS.forEach(function (ring, ri) {
    for (var i = 0; i < 3; i++) {
      RDOTS.push({ ri: ri, phase: (i / 3) * Math.PI * 2 });
    }
  });

  /* ── AMBIENT PARTICLES ─────────────────────────────────────────── */
  var PARTS = [];
  var PCOLS = ["#ff6b35","#f5c04a","#ffffff","#ff8f70","#ffd36e"];
  for (var pi = 0; pi < 60; pi++) {
    var pr = 220 + Math.random() * 380;
    var pa = Math.random() * Math.PI * 2;
    var pb = Math.random() * Math.PI;
    PARTS.push({
      x: pr * Math.sin(pb) * Math.cos(pa),
      y: pr * Math.sin(pb) * Math.sin(pa),
      z: pr * Math.cos(pb),
      size:  0.5 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      col:   PCOLS[Math.floor(Math.random() * PCOLS.length)]
    });
  }

  /* ── MATH ──────────────────────────────────────────────────────── */
  function resize() {
    var parent = canvas.parentElement;
    var w = parent ? parent.offsetWidth  : window.innerWidth;
    var h = parent ? parent.offsetHeight : 340;
    if (h < 260) h = 260;
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function rotY(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }
  function rotX(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }
  function rotZ(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }

  function cx() { return canvas.clientWidth  * 0.76; }
  function cy() { return canvas.clientHeight * 0.50; }

  function project(p) {
    var z = p.z + FOV;
    if (z <= 0) return null;
    var s = FOV / z;
    return { x: cx() + p.x * s, y: cy() - p.y * s, s: s };
  }

  function drawGlow(x, y, r, col, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ── DRAW RINGS ────────────────────────────────────────────────── */
  function drawRings(ry, time) {
    RINGS.forEach(function (ring) {
      var steps = 64;
      ctx.save();
      ctx.strokeStyle = ring.col;
      ctx.lineWidth = ring.lw;
      ctx.shadowBlur = 10;
      ctx.shadowColor = ring.col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i <= steps; i++) {
        var angle = (i / steps) * Math.PI * 2 + time * ring.spd;
        var p = { x: Math.cos(angle) * ring.r, y: 0, z: Math.sin(angle) * ring.r };
        p = rotX(p, ring.tiltX);
        p = rotZ(p, ring.tiltZ);
        p = rotY(p, ry * 0.12);
        p.y += 110; /* center on torso */
        var q = project(p);
        if (!q) continue;
        if (!started) { ctx.moveTo(q.x, q.y); started = true; }
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawRingDots(ry, time) {
    RDOTS.forEach(function (dot) {
      var ring = RINGS[dot.ri];
      var angle = time * ring.spd + dot.phase;
      var p = { x: Math.cos(angle) * ring.r, y: 0, z: Math.sin(angle) * ring.r };
      p = rotX(p, ring.tiltX);
      p = rotZ(p, ring.tiltZ);
      p = rotY(p, ry * 0.12);
      p.y += 110;
      var q = project(p);
      if (!q) return;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = ring.col;
      ctx.shadowBlur = 16; ctx.shadowColor = ring.col;
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  /* ── DRAW HEAD ─────────────────────────────────────────────────── */
  function drawHead(q, time) {
    if (!q) return;
    var r = 27 * q.s;
    drawGlow(q.x, q.y, r * 2.4, "rgba(255,107,53,0.22)", 0.5);
    /* fill */
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(255,100,55,0.4)";
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    /* rim */
    var pulse = 0.55 + 0.35 * Math.sin(time * 2.0);
    ctx.globalAlpha = 0.60 * pulse;
    ctx.strokeStyle = "#ff6b35";
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 14; ctx.shadowColor = "rgba(255,90,50,0.7)";
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    /* outer ring */
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(q.x, q.y, r * 1.22, 0, Math.PI * 2); ctx.stroke();
    /* cross hair */
    ctx.globalAlpha = 0.20;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(q.x - r, q.y); ctx.lineTo(q.x + r, q.y);
    ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x, q.y + r);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ── DRAW BONES ────────────────────────────────────────────────── */
  function drawBones(proj, time) {
    BONES.forEach(function (bone, bi) {
      var a = proj[bone[0]], b = proj[bone[1]];
      if (!a || !b) return;
      var col   = bone[2];
      var w     = bone[3] * Math.min(1.5, ((a.s + b.s) * 0.5) * 1.8);
      var pulse = 0.48 + 0.42 * Math.sin(time * 1.5 + bi * 0.38);

      /* glow pass */
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = w * 3.8;
      ctx.lineCap     = "round";
      ctx.globalAlpha = 0.18 * pulse;
      ctx.shadowBlur  = 16; ctx.shadowColor = col;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();

      /* sharp line */
      ctx.strokeStyle = col;
      ctx.lineWidth   = w;
      ctx.lineCap     = "round";
      ctx.globalAlpha = 0.68 * pulse;
      ctx.shadowBlur  = 7; ctx.shadowColor = col;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
    });
  }

  /* ── DRAW JOINT NODES ──────────────────────────────────────────── */
  function drawJoints(proj, time) {
    var keys = Object.keys(proj);
    keys.forEach(function (key, i) {
      var q = proj[key];
      if (!q) return;
      var r = 2.8 * Math.min(1.3, q.s * 1.4);
      var pulse = 0.45 + 0.55 * Math.sin(time * 2.4 + i * 0.52);
      ctx.globalAlpha = 0.78 * pulse;
      ctx.fillStyle = "#fff2e4";
      ctx.shadowBlur = 9; ctx.shadowColor = "rgba(255,130,70,0.95)";
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  /* ── DRAW MUSCLE LABELS ────────────────────────────────────────── */
  function drawLabels(proj, time) {
    LABELS.forEach(function (lbl, li) {
      var q = proj[lbl.joint];
      if (!q) return;
      var pulse = 0.55 + 0.40 * Math.sin(time * 1.6 + li * 0.8);
      var tx = q.x + lbl.dx;
      var ty = q.y + lbl.dy;
      var lineEndX = lbl.dx < 0 ? tx + 56 : tx - 56;

      /* connector line */
      ctx.globalAlpha = 0.28 * pulse;
      ctx.strokeStyle = lbl.color;
      ctx.lineWidth   = 0.8;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.moveTo(lineEndX, ty); ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.setLineDash([]);

      /* label pill */
      ctx.save();
      ctx.font = "bold 9px 'Space Grotesk', sans-serif";
      var tw = ctx.measureText(lbl.text).width + 18;
      var lx = lbl.dx < 0 ? tx - tw : tx;
      ctx.globalAlpha = 0.76 * pulse;
      ctx.fillStyle = "rgba(6,8,16,0.88)";
      ctx.strokeStyle = lbl.color;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 12; ctx.shadowColor = lbl.color;
      ctx.beginPath();
      ctx.roundRect(lx, ty - 12, tw, 24, 12);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(lbl.text, lx + tw / 2, ty);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  /* ── MAIN LOOP ─────────────────────────────────────────────────── */
  function loop() {
    requestAnimationFrame(loop);
    t += 0.012;
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;

    var w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    var ry = t * 0.11 + mx * 0.28;
    var rx = my * 0.10;

    /* background atmosphere */
    drawGlow(cx(), cy(), 220, "rgba(255,65,42,0.12)", 0.5);
    drawGlow(cx(), cy() - 60, 130, "rgba(255,190,90,0.07)", 0.4);
    drawGlow(cx() - 160, cy() + 80, 100, "rgba(255,65,42,0.06)", 0.3);

    /* rings */
    drawRings(ry, t);
    drawRingDots(ry, t);

    /* project all joints */
    var proj = {};
    var keys = Object.keys(J);
    keys.forEach(function (key) {
      var p = rotY(J[key], ry);
      p = rotX(p, rx);
      proj[key] = project(p);
    });

    /* head */
    drawHead(proj.headC, t);

    /* skeleton */
    drawBones(proj, t);
    drawJoints(proj, t);

    /* labels */
    drawLabels(proj, t);

    /* ambient particles */
    PARTS.forEach(function (pt) {
      var p = rotY({ x: pt.x, y: pt.y, z: pt.z }, ry * 0.14);
      var q = project(p);
      if (!q) return;
      var r = pt.size * Math.min(1.6, q.s * 2.2);
      if (r < 0.2) return;
      ctx.globalAlpha = 0.07 + 0.10 * Math.sin(t * 0.9 + pt.phase);
      ctx.fillStyle = pt.col;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  window.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    tmx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
    tmy = ((e.clientY - rect.top)  / rect.height - 0.5) * 1.2;
  });

  resize();
  window.addEventListener("resize", resize);
  setTimeout(function () { canvas.classList.add("ready"); }, 80);
  loop();
})();
