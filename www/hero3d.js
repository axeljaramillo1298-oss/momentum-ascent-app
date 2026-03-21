/* hero3d.js — Escena 3D wireframe con Canvas 2D puro. Sin dependencias. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  /* ── SIZING ─────────────────────────────────────────────────── */
  function resize() {
    var hero = canvas.parentElement;
    canvas.width  = hero ? hero.offsetWidth  : window.innerWidth;
    canvas.height = hero ? hero.offsetHeight : Math.round(window.innerHeight * 0.9);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ── 3D MATH ─────────────────────────────────────────────────── */
  var FOV = 900;

  function project(p) {
    // Centro desplazado a la derecha (65%) para no tapar el texto
    var cx = canvas.width  * 0.65;
    var cy = canvas.height * 0.50;
    var z  = p.z + FOV;
    if (z <= 0) return null;
    var s = FOV / z;
    return { x: cx + p.x * s, y: cy - p.y * s, s: s };
  }

  function rotX(p, a) {
    var cos = Math.cos(a), sin = Math.sin(a);
    return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos };
  }
  function rotY(p, a) {
    var cos = Math.cos(a), sin = Math.sin(a);
    return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos };
  }
  function rotZ(p, a) {
    var cos = Math.cos(a), sin = Math.sin(a);
    return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: p.z };
  }
  function applyRot(p, rx, ry, rz) {
    return rotZ(rotY(rotX(p, rx), ry), rz);
  }

  /* ── ICOSAEDRO ───────────────────────────────────────────────── */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var ICO_VERTS_RAW = [
    [ 0,  1,  PHI], [ 0, -1,  PHI], [ 0,  1, -PHI], [ 0, -1, -PHI],
    [ 1,  PHI,  0], [-1,  PHI,  0], [ 1, -PHI,  0], [-1, -PHI,  0],
    [ PHI,  0,  1], [-PHI,  0,  1], [ PHI,  0, -1], [-PHI,  0, -1]
  ];
  var ICO_EDGES = [
    [0,1],[0,4],[0,5],[0,8],[0,9],
    [1,6],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,5],[2,10],[2,11],
    [3,6],[3,7],[3,10],[3,11],
    [4,5],[4,8],[4,10],
    [5,9],[5,11],
    [6,7],[6,8],[6,10],
    [7,9],[7,11],
    [8,10],[9,11]
  ];
  var ICO_R = 160;
  var icoVerts = ICO_VERTS_RAW.map(function (v) {
    var len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return { x: (v[0]/len)*ICO_R, y: (v[1]/len)*ICO_R, z: (v[2]/len)*ICO_R };
  });

  /* ── ANILLOS ─────────────────────────────────────────────────── */
  function makeRing(r, segs) {
    var pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
    }
    return pts;
  }
  var RING1 = makeRing(230, 80);
  var RING2 = makeRing(290, 80);
  var RING3 = makeRing(195, 80);
  var RING4 = makeRing(360, 80);

  /* ── DODECAEDRO PEQUEÑO ──────────────────────────────────────── */
  var DODEC_VERTS_RAW = [
    [ 1, 1, 1],[-1, 1, 1],[ 1,-1, 1],[-1,-1, 1],
    [ 1, 1,-1],[-1, 1,-1],[ 1,-1,-1],[-1,-1,-1],
    [0, 1/PHI, PHI],[0,-1/PHI, PHI],[0, 1/PHI,-PHI],[0,-1/PHI,-PHI],
    [ 1/PHI, PHI,0],[-1/PHI, PHI,0],[ 1/PHI,-PHI,0],[-1/PHI,-PHI,0],
    [ PHI, 0, 1/PHI],[ PHI, 0,-1/PHI],[-PHI, 0, 1/PHI],[-PHI, 0,-1/PHI]
  ];
  var DODEC_EDGES = [
    [0,8],[0,12],[0,16],[1,9],[1,13],[1,18],
    [2,9],[2,14],[2,16],[3,8],[3,15],[3,18],
    [4,10],[4,12],[4,17],[5,10],[5,13],[5,19],
    [6,11],[6,14],[6,17],[7,11],[7,15],[7,19],
    [8,9],[10,11],[12,13],[14,15],[16,17],[18,19]
  ];
  var DR = 72;
  var dodecVerts = DODEC_VERTS_RAW.map(function (v) {
    var len = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return { x:(v[0]/len)*DR, y:(v[1]/len)*DR, z:(v[2]/len)*DR };
  });
  var DODEC_OFFSET = { x: -170, y: 120, z: 20 };

  /* ── OCTAEDRO ────────────────────────────────────────────────── */
  var OCT_VERTS = [
    { x: 0, y: 55, z: 0 }, { x: 0, y:-55, z: 0 },
    { x: 55, y: 0, z: 0 }, { x:-55, y: 0, z: 0 },
    { x: 0, y: 0, z: 55 }, { x: 0, y: 0, z:-55 }
  ];
  var OCT_EDGES = [
    [0,2],[0,3],[0,4],[0,5],
    [1,2],[1,3],[1,4],[1,5],
    [2,4],[2,5],[3,4],[3,5]
  ];
  var OCT_OFFSET = { x: 200, y:-140, z: 30 };

  /* ── PARTÍCULAS ──────────────────────────────────────────────── */
  var PART_COUNT = 220;
  var parts = [];
  for (var i = 0; i < PART_COUNT; i++) {
    var r   = 280 + Math.random() * 320;
    var phi = Math.random() * Math.PI * 2;
    var the = Math.random() * Math.PI;
    parts.push({
      x: r * Math.sin(the) * Math.cos(phi),
      y: r * Math.sin(the) * Math.sin(phi),
      z: r * Math.cos(the),
      r: 0.8 + Math.random() * 2.0,
      col: Math.random() < 0.35 ? "#ff3b30" : Math.random() < 0.6 ? "#f5c04a" : "#ffffff",
      speed: 0.003 + Math.random() * 0.006,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /* ── SATÉLITES ORBITALES ─────────────────────────────────────── */
  var sats = [
    { orbitR: 240, orbitTilt: 0.6,  speed: 0.55, phase: 0,    size: 12, col: "#ff6b35" },
    { orbitR: 310, orbitTilt: -0.9, speed: 0.33, phase: 2.1,  size: 8,  col: "#f5c04a" },
    { orbitR: 200, orbitTilt: 1.2,  speed: 0.72, phase: 1.0,  size: 6,  col: "#ff3b30" },
    { orbitR: 380, orbitTilt: 0.3,  speed: 0.20, phase: 3.5,  size: 10, col: "#ffffff" },
  ];

  /* ── MOUSE ───────────────────────────────────────────────────── */
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener("mousemove", function (e) {
    tmx = (e.clientX / window.innerWidth  - 0.5) * 1.2;
    tmy = (e.clientY / window.innerHeight - 0.5) * 0.9;
  });

  /* ── DRAW HELPERS ────────────────────────────────────────────── */
  function drawEdges(verts, edges, color, alpha, rx, ry, rz, ox, oy, oz) {
    ox = ox || 0; oy = oy || 0; oz = oz || 0;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    for (var e = 0; e < edges.length; e++) {
      var a = applyRot(verts[edges[e][0]], rx, ry, rz);
      var b = applyRot(verts[edges[e][1]], rx, ry, rz);
      a = { x: a.x + ox, y: a.y + oy, z: a.z + oz };
      b = { x: b.x + ox, y: b.y + oy, z: b.z + oz };
      var pa = project(a), pb = project(b);
      if (!pa || !pb) continue;
      var depth = Math.min(pa.s, pb.s);
      ctx.globalAlpha = alpha * Math.min(1, depth * 2.5);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  function drawRingLine(pts, rx, ry, rz, color, alpha) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = color;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < pts.length; i++) {
      var p = applyRot(pts[i], rx, ry, rz);
      var q = project(p);
      if (!q) continue;
      if (!started) { ctx.moveTo(q.x, q.y); started = true; }
      else          { ctx.lineTo(q.x, q.y); }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawSphere(r, segs, rx, ry, rz, color, alpha) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = 0.5;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 0;
    var step = Math.PI / segs;
    // Latitude lines
    for (var lat = 1; lat < segs; lat++) {
      var theta = lat * step;
      ctx.beginPath();
      var started = false;
      for (var j = 0; j <= segs * 2; j++) {
        var phi = (j / (segs * 2)) * Math.PI * 2;
        var p = {
          x: r * Math.sin(theta) * Math.cos(phi),
          y: r * Math.sin(theta) * Math.sin(phi),
          z: r * Math.cos(theta)
        };
        p = applyRot(p, rx, ry, rz);
        var q = project(p);
        if (!q) continue;
        if (!started) { ctx.moveTo(q.x, q.y); started = true; }
        else          { ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
    // Longitude lines
    for (var lon = 0; lon < segs * 2; lon++) {
      var phi2 = (lon / (segs * 2)) * Math.PI * 2;
      ctx.beginPath();
      var started2 = false;
      for (var k = 0; k <= segs; k++) {
        var theta2 = (k / segs) * Math.PI;
        var p2 = {
          x: r * Math.sin(theta2) * Math.cos(phi2),
          y: r * Math.sin(theta2) * Math.sin(phi2),
          z: r * Math.cos(theta2)
        };
        p2 = applyRot(p2, rx, ry, rz);
        var q2 = project(p2);
        if (!q2) continue;
        if (!started2) { ctx.moveTo(q2.x, q2.y); started2 = true; }
        else           { ctx.lineTo(q2.x, q2.y); }
      }
      ctx.stroke();
    }
  }

  function drawGlowDot(x, y, r, color, alpha) {
    var grd = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    grd.addColorStop(0, color);
    grd.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, alpha * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── CENTRAL GLOW ────────────────────────────────────────────── */
  function drawCentralGlow() {
    var cx = canvas.width * 0.65;
    var cy = canvas.height * 0.50;
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260);
    grd.addColorStop(0.0, "rgba(255,59,48,0.10)");
    grd.addColorStop(0.4, "rgba(255,107,53,0.05)");
    grd.addColorStop(0.8, "rgba(245,192,74,0.02)");
    grd.addColorStop(1.0, "transparent");
    ctx.globalAlpha = 1;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, 260, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── GRID FLOOR ──────────────────────────────────────────────── */
  function drawGrid(rx, ry, rz, t) {
    var size = 500, step = 60;
    ctx.strokeStyle = "#ff3b30";
    ctx.lineWidth   = 0.4;
    var pulseAlpha  = 0.08 + Math.sin(t * 0.5) * 0.04;
    for (var x = -size; x <= size; x += step) {
      ctx.beginPath();
      ctx.globalAlpha = 0;
      var started = false;
      for (var gz = -size; gz <= size; gz += 20) {
        var p = applyRot({ x: x, y: -180, z: gz }, rx, ry, rz);
        var q = project(p);
        if (!q) continue;
        var a = pulseAlpha * Math.min(1, q.s * 3);
        ctx.globalAlpha = a;
        if (!started) { ctx.moveTo(q.x, q.y); started = true; }
        else          { ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
    for (var gz2 = -size; gz2 <= size; gz2 += step) {
      ctx.beginPath();
      var started2 = false;
      for (var x2 = -size; x2 <= size; x2 += 20) {
        var p2 = applyRot({ x: x2, y: -180, z: gz2 }, rx, ry, rz);
        var q2 = project(p2);
        if (!q2) continue;
        var a2 = pulseAlpha * Math.min(1, q2.s * 3);
        ctx.globalAlpha = a2;
        if (!started2) { ctx.moveTo(q2.x, q2.y); started2 = true; }
        else           { ctx.lineTo(q2.x, q2.y); }
      }
      ctx.stroke();
    }
  }

  /* ── MAIN LOOP ───────────────────────────────────────────────── */
  var t = 0;

  function draw() {
    requestAnimationFrame(draw);
    t += 0.012;

    // Smooth mouse
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Rotaciones globales basadas en tiempo + mouse
    var ry = t * 0.10 + mx * 0.25;
    var rx = t * 0.06 - my * 0.18;
    var rz = t * 0.03;

    // --- FONDO GLOW ---
    drawCentralGlow();

    // --- GRID FLOOR ---
    drawGrid(0.55 + my * 0.05, ry * 0.5, 0, t);

    // --- ICOSAEDRO PRINCIPAL ---
    ctx.shadowBlur  = 12;
    ctx.shadowColor = "#ff3b30";
    drawEdges(icoVerts, ICO_EDGES, "#ff3b30", 0.75, rx, ry, rz, 0, 0, 0);
    ctx.shadowBlur = 0;

    // Esfera de latitudes/longitudes encima del icosaedro
    drawSphere(165, 8, rx, ry, rz, "rgba(255,59,48,0.25)", 0.35);

    // --- ANILLOS ---
    drawRingLine(RING1, rx * 0.4 + 1.05, ry * 0.7 + t * 0.09, rz, "#f5c04a", 0.55);
    drawRingLine(RING2, rx * 0.3 - 0.80, ry * 0.5 - t * 0.07, rz * 0.5, "#ff6b35", 0.40);
    drawRingLine(RING3, Math.PI/2 + rx * 0.2, ry * 0.8 + t * 0.13, rz, "#ff3b30", 0.45);
    drawRingLine(RING4, rx * 0.5 + 0.35, ry * 0.4 - t * 0.045, 0, "rgba(245,192,74,0.4)", 0.25);

    // --- DODECAEDRO ---
    ctx.shadowBlur  = 8;
    ctx.shadowColor = "#f5c04a";
    var drx = rx + t * 0.18, dry = ry + t * 0.24;
    drawEdges(dodecVerts, DODEC_EDGES, "#f5c04a", 0.65, drx, dry, rz,
              DODEC_OFFSET.x, DODEC_OFFSET.y, DODEC_OFFSET.z);
    ctx.shadowBlur = 0;

    // --- OCTAEDRO ---
    ctx.shadowBlur  = 8;
    ctx.shadowColor = "#ff6b35";
    var orx = -rx + t * 0.22, ory = -ry + t * 0.16;
    drawEdges(OCT_VERTS, OCT_EDGES, "#ff6b35", 0.65, orx, ory, rz,
              OCT_OFFSET.x, OCT_OFFSET.y, OCT_OFFSET.z);
    ctx.shadowBlur = 0;

    // --- SATÉLITES ---
    for (var si = 0; si < sats.length; si++) {
      var s = sats[si];
      var sa = t * s.speed + s.phase;
      var sp = {
        x: Math.cos(sa) * s.orbitR,
        y: Math.sin(sa) * s.orbitR * Math.cos(s.orbitTilt),
        z: Math.sin(sa) * s.orbitR * Math.sin(s.orbitTilt)
      };
      sp = applyRot(sp, rx * 0.3, ry * 0.5, 0);
      var sq = project(sp);
      if (sq) {
        var sr = s.size * sq.s * 1.8;
        if (sr > 0.5) {
          drawGlowDot(sq.x, sq.y, sr * 0.5, s.col, 0.85 * Math.min(1, sq.s * 2));
        }
      }
    }

    // --- PARTÍCULAS ---
    for (var pi = 0; pi < parts.length; pi++) {
      var p = parts[pi];
      var angle = t * p.speed + p.phase;
      var pp = applyRot(
        { x: p.x, y: p.y * Math.cos(angle * 0.1), z: p.z },
        rx * 0.15, ry * 0.25 + t * 0.018, 0
      );
      var pq = project(pp);
      if (!pq) continue;
      var pr = p.r * Math.min(1.5, pq.s * 2.5);
      if (pr < 0.3) continue;
      ctx.globalAlpha = 0.5 * Math.min(1, pq.s * 2.2) * (0.7 + Math.sin(t * p.speed * 8 + p.phase) * 0.3);
      ctx.fillStyle   = p.col;
      ctx.beginPath();
      ctx.arc(pq.x, pq.y, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- LINEAS CONECTORAS ---
    ctx.globalAlpha = 0;
    [DODEC_OFFSET, OCT_OFFSET].forEach(function (off) {
      var a = project({ x: off.x, y: off.y, z: off.z });
      var b = project({ x: 0, y: 0, z: 0 });
      if (!a || !b) return;
      var grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, "#ff3b30");
      grad.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 0.8;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    ctx.globalAlpha = 1;
  }

  draw();

  // Fade in
  setTimeout(function () { canvas.classList.add("ready"); }, 80);

})();
