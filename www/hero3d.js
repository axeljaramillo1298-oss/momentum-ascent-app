/* hero3d.js - Escena 3D de producto para el home. Canvas 2D puro. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 1.8);
  var FOV = 980;
  var mx = 0;
  var my = 0;
  var tmx = 0;
  var tmy = 0;
  var t = 0;

  var cards = [
    {
      title: "CHECK-IN",
      subtitle: "10 min activos",
      kind: "progress",
      pos: { x: 238, y: 106, z: 120 },
      size: { w: 172, h: 116 },
      rot: { x: 0.24, y: -0.5, z: 0.1 },
      accent: "#ff6b35",
      glow: "rgba(255,107,53,0.28)"
    },
    {
      title: "RACHA",
      subtitle: "14 dias",
      kind: "streak",
      pos: { x: -224, y: 22, z: 110 },
      size: { w: 186, h: 124 },
      rot: { x: -0.14, y: 0.46, z: -0.06 },
      accent: "#f5c04a",
      glow: "rgba(245,192,74,0.24)"
    },
    {
      title: "COACH",
      subtitle: "Presion real",
      kind: "message",
      pos: { x: 138, y: -156, z: 40 },
      size: { w: 160, h: 96 },
      rot: { x: 0.12, y: -0.16, z: 0.05 },
      accent: "#ff8f70",
      glow: "rgba(255,143,112,0.2)"
    },
    {
      title: "DIETA",
      subtitle: "Plan activo",
      kind: "nutrition",
      pos: { x: -58, y: -182, z: -10 },
      size: { w: 150, h: 88 },
      rot: { x: 0.18, y: 0.08, z: -0.02 },
      accent: "#ffd36e",
      glow: "rgba(255,211,110,0.18)"
    },
    {
      title: "XP",
      subtitle: "+24% momentum",
      kind: "bars",
      pos: { x: 300, y: -24, z: -18 },
      size: { w: 132, h: 84 },
      rot: { x: -0.12, y: -0.6, z: 0.1 },
      accent: "#ff5a49",
      glow: "rgba(255,90,73,0.18)"
    }
  ];

  var particles = [];
  var pcols = ["#ff6b35", "#f5c04a", "#fff0de"];

  function resize() {
    var hero = canvas.parentElement;
    var w = hero ? hero.offsetWidth : window.innerWidth;
    var h = hero ? hero.offsetHeight : Math.round(window.innerHeight * 0.9);
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function project(p) {
    var cx = canvas.clientWidth * 0.64;
    var cy = canvas.clientHeight * 0.5;
    var z = p.z + FOV;
    if (z <= 0) return null;
    var s = FOV / z;
    return { x: cx + p.x * s, y: cy - p.y * s, s: s };
  }

  function rotX(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }

  function rotY(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }

  function rotZ(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }

  function rot3(p, rx, ry, rz) {
    return rotZ(rotY(rotX(p, rx), ry), rz);
  }

  function blend(a, b, n) {
    return a + (b - a) * n;
  }

  function blendPoint(a, b, n) {
    return { x: blend(a.x, b.x, n), y: blend(a.y, b.y, n) };
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawGlow(x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function quadPath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function quadPoint(points, u, v) {
    var left = blendPoint(points[0], points[3], v);
    var right = blendPoint(points[1], points[2], v);
    return blendPoint(left, right, u);
  }

  function drawBackground() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var cx = w * 0.63;
    var cy = h * 0.48;

    drawGlow(cx, cy, 340, "rgba(255,83,58,0.09)", 0.42);
    drawGlow(cx + 30, cy + 150, 220, "rgba(245,192,74,0.06)", 0.24);
    drawGlow(cx - 180, cy - 140, 130, "rgba(255,255,255,0.04)", 0.12);

    var haze = ctx.createLinearGradient(0, 0, 0, h);
    haze.addColorStop(0, "rgba(255,255,255,0.02)");
    haze.addColorStop(0.45, "rgba(255,120,82,0.05)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    var beam = ctx.createLinearGradient(cx, cy - 260, cx, cy + 300);
    beam.addColorStop(0, "rgba(255,255,255,0.12)");
    beam.addColorStop(0.25, "rgba(255,205,166,0.08)");
    beam.addColorStop(0.65, "rgba(255,102,72,0.035)");
    beam.addColorStop(1, "transparent");
    ctx.fillStyle = beam;
    ctx.fillRect(cx - 50, cy - 260, 100, 600);
  }

  function drawFloor(ry, time) {
    var size = 560;
    var step = 54;
    var pulse = 0.02 + Math.sin(time * 0.5) * 0.008;
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255,96,75,0.9)";
    for (var x = -size; x <= size; x += step) {
      ctx.beginPath();
      var started = false;
      for (var z = -size; z <= size; z += 20) {
        var p = rot3({ x: x, y: -220, z: z }, 0.5, ry * 0.4, 0);
        var q = project(p);
        if (!q) continue;
        ctx.globalAlpha = pulse * Math.min(1, q.s * 3.3);
        if (!started) {
          ctx.moveTo(q.x, q.y);
          started = true;
        } else {
          ctx.lineTo(q.x, q.y);
        }
      }
      ctx.stroke();
    }

    for (var zz = -size; zz <= size; zz += step) {
      ctx.beginPath();
      var started2 = false;
      for (var xx = -size; xx <= size; xx += 20) {
        var p2 = rot3({ x: xx, y: -220, z: zz }, 0.5, ry * 0.4, 0);
        var q2 = project(p2);
        if (!q2) continue;
        ctx.globalAlpha = pulse * Math.min(1, q2.s * 3.3);
        if (!started2) {
          ctx.moveTo(q2.x, q2.y);
          started2 = true;
        } else {
          ctx.lineTo(q2.x, q2.y);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPhoneAura(time) {
    var cx = canvas.clientWidth * 0.64;
    var cy = canvas.clientHeight * 0.51;
    var pulse = 0.86 + Math.sin(time * 1.5) * 0.08;

    drawGlow(cx, cy, 130, "rgba(255,88,66,0.18)", 0.25 * pulse);
    drawGlow(cx, cy + 16, 88, "rgba(245,192,74,0.14)", 0.24 * pulse);

    ctx.globalAlpha = 0.45 * pulse;
    ctx.strokeStyle = "rgba(255,186,142,0.22)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 24, 130, 46, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.22 * pulse;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 24, 192, 74, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawConnector(points, anchor, color) {
    var center = quadPoint(points, 0.5, 0.5);
    var g = ctx.createLinearGradient(center.x, center.y, anchor.x, anchor.y);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.22;
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawPanelLabel(x, y, text, color, scale) {
    var paddingX = 10 * scale;
    var paddingY = 7 * scale;
    ctx.save();
    ctx.font = (10 * scale) + "px 'Space Grotesk', sans-serif";
    var width = ctx.measureText(text).width + paddingX * 2;
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.fillStyle = "rgba(13,14,18,0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundedRect(x - width / 2, y - 14 * scale, width, 28 * scale, 14 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff7f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawPanelInterior(points, card) {
    var topBarStart = quadPoint(points, 0.1, 0.18);
    var topBarEnd = quadPoint(points, 0.72, 0.18);
    var subBarStart = quadPoint(points, 0.1, 0.31);
    var subBarEnd = quadPoint(points, 0.48, 0.31);

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topBarStart.x, topBarStart.y);
    ctx.lineTo(topBarEnd.x, topBarEnd.y);
    ctx.stroke();

    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(subBarStart.x, subBarStart.y);
    ctx.lineTo(subBarEnd.x, subBarEnd.y);
    ctx.stroke();

    if (card.kind === "progress") {
      var a = quadPoint(points, 0.14, 0.58);
      var b = quadPoint(points, 0.82, 0.58);
      var fillEnd = quadPoint(points, 0.64, 0.58);
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = card.accent;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(fillEnd.x, fillEnd.y);
      ctx.stroke();
    } else if (card.kind === "streak") {
      for (var i = 0; i < 4; i++) {
        var barBase = 0.14 + i * 0.15;
        var height = [0.18, 0.34, 0.52, 0.42][i];
        var bottom = quadPoint(points, barBase, 0.82);
        var top = quadPoint(points, barBase, 0.82 - height);
        ctx.lineWidth = 7;
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = i === 2 ? card.accent : "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.moveTo(bottom.x, bottom.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
      }
    } else if (card.kind === "message") {
      for (var j = 0; j < 3; j++) {
        var bubbleY = 0.48 + j * 0.13;
        var start = quadPoint(points, 0.14, bubbleY);
        var end = quadPoint(points, j === 1 ? 0.58 : 0.78, bubbleY);
        ctx.lineWidth = 4;
        ctx.globalAlpha = j === 1 ? 0.75 : 0.36;
        ctx.strokeStyle = j === 1 ? card.accent : "rgba(255,255,255,0.32)";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    } else if (card.kind === "nutrition") {
      var circle = quadPoint(points, 0.2, 0.62);
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = card.accent;
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, 7, 0, Math.PI * 2);
      ctx.fill();
      for (var k = 0; k < 2; k++) {
        var ns = quadPoint(points, 0.34, 0.56 + k * 0.14);
        var ne = quadPoint(points, 0.78, 0.56 + k * 0.14);
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.5 - k * 0.12;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(ns.x, ns.y);
        ctx.lineTo(ne.x, ne.y);
        ctx.stroke();
      }
    } else if (card.kind === "bars") {
      for (var b = 0; b < 5; b++) {
        var x = 0.18 + b * 0.14;
        var topY = 0.82 - [0.16, 0.28, 0.48, 0.62, 0.76][b];
        var bottomPt = quadPoint(points, x, 0.82);
        var topPt = quadPoint(points, x, topY);
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = b >= 3 ? card.accent : "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.moveTo(bottomPt.x, bottomPt.y);
        ctx.lineTo(topPt.x, topPt.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPanel(card, globalRx, globalRy, anchor) {
    var w = card.size.w;
    var h = card.size.h;
    var corners = [
      { x: -w / 2, y: h / 2, z: 0 },
      { x: w / 2, y: h / 2, z: 0 },
      { x: w / 2, y: -h / 2, z: 0 },
      { x: -w / 2, y: -h / 2, z: 0 }
    ];
    var points = [];

    for (var i = 0; i < corners.length; i++) {
      var p = rot3(corners[i], card.rot.x, card.rot.y + globalRy, card.rot.z);
      p = { x: p.x + card.pos.x, y: p.y + card.pos.y, z: p.z + card.pos.z };
      p = rot3(p, globalRx, globalRy * 0.2, 0);
      var q = project(p);
      if (!q) return;
      points.push(q);
    }

    var center = quadPoint(points, 0.5, 0.5);
    var scale = Math.max(0.82, Math.min(1.24, center.s || 1));
    drawConnector(points, anchor, card.glow);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,12,18,0.72)";
    ctx.strokeStyle = card.accent;
    ctx.lineWidth = 1.1;
    ctx.shadowBlur = 24;
    ctx.shadowColor = card.glow;
    quadPath(points);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(blend(points[1].x, points[2].x, 0.28), blend(points[1].y, points[2].y, 0.28));
    ctx.lineTo(blend(points[0].x, points[3].x, 0.28), blend(points[0].y, points[3].y, 0.28));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawPanelInterior(points, card);
    drawPanelLabel(center.x, center.y - (58 * scale), card.title, card.accent, 0.9 * scale);

    ctx.save();
    ctx.fillStyle = "#fff7f0";
    ctx.font = (11 * scale) + "px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.82;
    ctx.fillText(card.subtitle, center.x, center.y + 48 * scale);
    ctx.restore();
  }

  function drawSignalArcs(time) {
    var cx = canvas.clientWidth * 0.64;
    var cy = canvas.clientHeight * 0.52;
    for (var i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.14 + i * 0.05;
      ctx.strokeStyle = i === 1 ? "rgba(245,192,74,0.32)" : "rgba(255,104,76,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 12, 118 + i * 58, 44 + i * 18, 0, time * 0.18 + i * 0.12, time * 0.18 + Math.PI + i * 0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(globalRx, globalRy) {
    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      var pp = rot3(
        { x: particle.x, y: particle.y, z: particle.z },
        globalRx * 0.12,
        globalRy * 0.18 + t * 0.018,
        0
      );
      var pq = project(pp);
      if (!pq) continue;
      var radius = particle.size * Math.min(1.6, pq.s * 2.4);
      if (radius < 0.24) continue;
      ctx.globalAlpha = (0.1 + 0.16 * Math.sin(t * particle.speed * 10 + particle.phase)) * Math.min(1, pq.s * 2.1);
      ctx.fillStyle = particle.col;
      ctx.beginPath();
      ctx.arc(pq.x, pq.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  for (var p = 0; p < 96; p++) {
    var radius = 240 + Math.random() * 420;
    var phi = Math.random() * Math.PI * 2;
    var theta = Math.random() * Math.PI;
    particles.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.sin(theta) * Math.sin(phi),
      z: radius * Math.cos(theta),
      size: 0.5 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.006,
      col: pcols[Math.floor(Math.random() * pcols.length)]
    });
  }

  function loop() {
    requestAnimationFrame(loop);
    t += 0.013;
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    var ry = t * 0.08 + mx * 0.22;
    var rx = t * 0.03 - my * 0.12;
    var anchor = { x: w * 0.64, y: h * 0.54 };

    drawBackground();
    drawFloor(ry, t);
    drawSignalArcs(t);
    drawPhoneAura(t);

    var ordered = cards.slice().sort(function (a, b) {
      return a.pos.z - b.pos.z;
    });
    for (var i = 0; i < ordered.length; i++) {
      drawPanel(ordered[i], rx, ry, anchor);
    }

    drawParticles(rx, ry);
  }

  window.addEventListener("mousemove", function (e) {
    tmx = (e.clientX / window.innerWidth - 0.5) * 1.1;
    tmy = (e.clientY / window.innerHeight - 0.5) * 0.8;
  });

  resize();
  window.addEventListener("resize", resize);
  setTimeout(function () { canvas.classList.add("ready"); }, 80);
  loop();
})();
