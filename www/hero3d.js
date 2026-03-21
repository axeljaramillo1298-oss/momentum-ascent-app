/* hero3d.js - Escena 3D premium para Momentum Ascent. Canvas 2D puro. */
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
    var cx = canvas.clientWidth * 0.62;
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

  function roundedPath(x, y, w, h, r) {
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

  function drawRing(radius, ry, tilt, color, alpha, lineW) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i <= 120; i++) {
      var ang = (i / 120) * Math.PI * 2;
      var point = { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius, z: 0 };
      point = rot3(point, tilt, ry, 0);
      var q = project(point);
      if (!q) continue;
      if (!started) {
        ctx.moveTo(q.x, q.y);
        started = true;
      } else {
        ctx.lineTo(q.x, q.y);
      }
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawGlassPanel(center, w, h, rx, ry, rz, stroke, fill, alpha, barCount) {
    var corners = [
      { x: -w / 2, y: h / 2, z: 0 },
      { x: w / 2, y: h / 2, z: 0 },
      { x: w / 2, y: -h / 2, z: 0 },
      { x: -w / 2, y: -h / 2, z: 0 }
    ];
    var projected = [];
    for (var i = 0; i < corners.length; i++) {
      var p = rot3(corners[i], rx, ry, rz);
      p = { x: p.x + center.x, y: p.y + center.y, z: p.z + center.z };
      var q = project(p);
      if (!q) return;
      projected.push(q);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.shadowBlur = 16;
    ctx.shadowColor = stroke;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (var j = 1; j < projected.length; j++) ctx.lineTo(projected[j].x, projected[j].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (barCount > 0) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * 0.7;
      for (var k = 1; k <= barCount; k++) {
        var p1 = {
          x: blend(projected[0].x, projected[3].x, k / (barCount + 1)),
          y: blend(projected[0].y, projected[3].y, k / (barCount + 1))
        };
        var p2 = {
          x: blend(projected[1].x, projected[2].x, k / (barCount + 1)),
          y: blend(projected[1].y, projected[2].y, k / (barCount + 1))
        };
        ctx.beginPath();
        ctx.moveTo(blend(p1.x, p2.x, 0.16), blend(p1.y, p2.y, 0.16));
        ctx.lineTo(blend(p1.x, p2.x, 0.84), blend(p1.y, p2.y, 0.84));
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  var particles = [];
  var pcols = ["#ff3b30", "#ff6b35", "#f5c04a", "#ffffff", "#a0cfff"];
  for (var p = 0; p < 220; p++) {
    var radius = 220 + Math.random() * 420;
    var phi = Math.random() * Math.PI * 2;
    var theta = Math.random() * Math.PI;
    particles.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.sin(theta) * Math.sin(phi),
      z: radius * Math.cos(theta),
      size: 0.6 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.006,
      col: pcols[Math.floor(Math.random() * pcols.length)]
    });
  }

  var satellites = [
    { r: 230, tilt: 0.4, speed: 0.46, phase: 0.4, size: 12, col: "#ff6b35", trail: [] },
    { r: 310, tilt: -0.82, speed: 0.22, phase: 1.8, size: 10, col: "#f5c04a", trail: [] },
    { r: 186, tilt: 1.12, speed: 0.66, phase: 2.4, size: 7, col: "#ff3b30", trail: [] }
  ];

  function drawBackground() {
    var cx = canvas.clientWidth * 0.62;
    var cy = canvas.clientHeight * 0.48;
    drawGlow(cx, cy, 380, "rgba(255,78,66,0.12)", 0.45);
    drawGlow(cx, cy + 140, 260, "rgba(245,192,74,0.08)", 0.35);

    var beam = ctx.createLinearGradient(cx, cy - 260, cx, cy + 300);
    beam.addColorStop(0, "rgba(255,255,255,0.14)");
    beam.addColorStop(0.22, "rgba(255,180,145,0.11)");
    beam.addColorStop(0.55, "rgba(255,79,60,0.06)");
    beam.addColorStop(1, "transparent");
    ctx.fillStyle = beam;
    ctx.fillRect(cx - 48, cy - 260, 96, 560);
  }

  function drawGrid(ry, time) {
    var size = 520;
    var step = 56;
    var pulse = 0.045 + Math.sin(time * 0.6) * 0.018;
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = "#ff4a3c";
    for (var x = -size; x <= size; x += step) {
      ctx.beginPath();
      var started = false;
      for (var z = -size; z <= size; z += 18) {
        var point = rot3({ x: x, y: -210, z: z }, 0.5, ry * 0.4, 0);
        var q = project(point);
        if (!q) continue;
        ctx.globalAlpha = pulse * Math.min(1, q.s * 3.2);
        if (!started) { ctx.moveTo(q.x, q.y); started = true; }
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    for (var zz = -size; zz <= size; zz += step) {
      ctx.beginPath();
      var started2 = false;
      for (var xx = -size; xx <= size; xx += 18) {
        var point2 = rot3({ x: xx, y: -210, z: zz }, 0.5, ry * 0.4, 0);
        var q2 = project(point2);
        if (!q2) continue;
        ctx.globalAlpha = pulse * Math.min(1, q2.s * 3.2);
        if (!started2) { ctx.moveTo(q2.x, q2.y); started2 = true; }
        else ctx.lineTo(q2.x, q2.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCore(time) {
    var cx = canvas.clientWidth * 0.62;
    var cy = canvas.clientHeight * 0.48;
    var pulse = 0.92 + Math.sin(time * 1.7) * 0.08;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.88;
    ctx.shadowBlur = 30;
    ctx.shadowColor = "rgba(255,98,66,0.24)";

    var outer = ctx.createLinearGradient(0, -220, 0, 220);
    outer.addColorStop(0, "rgba(255,255,255,0.18)");
    outer.addColorStop(0.25, "rgba(255,166,124,0.15)");
    outer.addColorStop(0.55, "rgba(255,84,60,0.1)");
    outer.addColorStop(1, "rgba(255,84,60,0.02)");
    ctx.fillStyle = outer;
    roundedPath(-34, -220, 68, 440, 30);
    ctx.fill();

    var inner = ctx.createLinearGradient(0, -168, 0, 168);
    inner.addColorStop(0, "rgba(255,255,255,0.78)");
    inner.addColorStop(0.2, "rgba(255,214,176,0.42)");
    inner.addColorStop(0.62, "rgba(255,116,74,0.18)");
    inner.addColorStop(1, "rgba(255,116,74,0.04)");
    ctx.fillStyle = inner;
    roundedPath(-9, -168, 18, 336, 11);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7 * pulse;
    ctx.strokeStyle = "rgba(255,196,148,0.52)";
    ctx.lineWidth = 1.1;
    for (var y = -140; y <= 140; y += 34) {
      ctx.beginPath();
      ctx.moveTo(-44, y);
      ctx.lineTo(44, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.82 * pulse;
    ctx.fillStyle = "rgba(255,120,82,0.16)";
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(255,116,74,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 92, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawSatTrail(trail, col) {
    for (var i = 1; i < trail.length; i++) {
      var a = (i / trail.length) * 0.5;
      ctx.globalAlpha = a * a;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4 * (i / trail.length);
      ctx.shadowBlur = 8;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function loop() {
    requestAnimationFrame(loop);
    t += 0.013;
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    var ry = t * 0.11 + mx * 0.28;
    var rx = t * 0.04 - my * 0.16;

    drawBackground();
    drawGrid(ry, t);
    drawRing(255, ry * 0.35 + t * 0.03, 1.08 + rx * 0.24, "rgba(245,192,74,0.24)", 0.3, 1.2);
    drawRing(330, ry * 0.24 - t * 0.02, 0.18, "rgba(255,107,53,0.14)", 0.18, 1.0);
    drawRing(212, ry * 0.52 + t * 0.08, Math.PI / 2 + rx * 0.1, "rgba(255,59,48,0.16)", 0.18, 1.0);

    drawCore(t);

    drawGlassPanel({ x: 214, y: 118, z: 40 }, 126, 84, 0.28, -0.52 + ry * 0.12, 0.12, "rgba(255,176,132,0.28)", "rgba(255,255,255,0.035)", 0.84, 3);
    drawGlassPanel({ x: -186, y: -24, z: 80 }, 142, 96, -0.18, 0.36 + ry * 0.1, -0.08, "rgba(255,120,92,0.24)", "rgba(255,255,255,0.028)", 0.72, 3);
    drawGlassPanel({ x: 54, y: -128, z: -20 }, 112, 66, 0.16, -0.08 + ry * 0.06, 0.04, "rgba(160,208,255,0.18)", "rgba(255,255,255,0.024)", 0.56, 2);

    for (var s = 0; s < satellites.length; s++) {
      var sat = satellites[s];
      var ang = t * sat.speed + sat.phase;
      var point = {
        x: Math.cos(ang) * sat.r,
        y: Math.sin(ang) * sat.r * Math.cos(sat.tilt),
        z: Math.sin(ang) * sat.r * Math.sin(sat.tilt)
      };
      point = rot3(point, rx * 0.28, ry * 0.4, 0);
      var q = project(point);
      if (!q) continue;
      sat.trail.push({ x: q.x, y: q.y });
      if (sat.trail.length > 18) sat.trail.shift();
      if (sat.trail.length > 2) drawSatTrail(sat.trail, sat.col);
      drawGlow(q.x, q.y, sat.size * q.s * 3.2, sat.col, 0.24 * Math.min(1, q.s * 2.4));
      ctx.fillStyle = sat.col;
      ctx.globalAlpha = 0.9 * Math.min(1, q.s * 2.2);
      ctx.beginPath();
      ctx.arc(q.x, q.y, sat.size * q.s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      var pp = rot3({ x: particle.x, y: particle.y, z: particle.z }, rx * 0.12, ry * 0.18 + t * 0.018, 0);
      var pq = project(pp);
      if (!pq) continue;
      var radius = particle.size * Math.min(1.6, pq.s * 2.6);
      if (radius < 0.24) continue;
      ctx.globalAlpha = (0.22 + 0.3 * Math.sin(t * particle.speed * 10 + particle.phase)) * Math.min(1, pq.s * 2.1);
      ctx.fillStyle = particle.col;
      ctx.beginPath();
      ctx.arc(pq.x, pq.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  window.addEventListener("mousemove", function (e) {
    tmx = (e.clientX / window.innerWidth - 0.5) * 1.2;
    tmy = (e.clientY / window.innerHeight - 0.5) * 0.9;
  });

  resize();
  window.addEventListener("resize", resize);
  setTimeout(function () { canvas.classList.add("ready"); }, 80);
  loop();
})();
