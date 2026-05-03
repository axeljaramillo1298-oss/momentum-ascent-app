(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 1.8);
  var mouseX = 0;
  var mouseY = 0;
  var smoothX = 0;
  var smoothY = 0;
  var tick = 0;
  var FOV = 860;
  var scene = {
    cx: 0,
    cy: 0,
    floorY: 0
  };

  var balls = [
    {
      kind: "soccer",
      x: 150,
      y: 16,
      z: 160,
      radius: 92,
      drift: 18,
      orbit: 0,
      label: "PICK TOP",
      labelColor: "rgba(255,112,72,0.56)"
    },
    {
      kind: "basketball",
      x: 292,
      y: -160,
      z: 30,
      radius: 54,
      drift: 16,
      orbit: 0.95,
      label: "EDGE 74%",
      labelColor: "rgba(245,192,74,0.5)"
    },
    {
      kind: "tennis",
      x: -28,
      y: -198,
      z: -60,
      radius: 34,
      drift: 12,
      orbit: 2.05,
      label: "LIVE DATA",
      labelColor: "rgba(202,255,96,0.44)"
    },
    {
      kind: "baseball",
      x: 328,
      y: 116,
      z: -44,
      radius: 38,
      drift: 10,
      orbit: 1.52,
      label: "RISK",
      labelColor: "rgba(255,242,232,0.34)"
    }
  ];

  var sparks = [];
  for (var i = 0; i < 120; i++) {
    sparks.push({
      x: (Math.random() - 0.5) * 920,
      y: (Math.random() - 0.5) * 520,
      z: -220 + Math.random() * 520,
      size: 0.8 + Math.random() * 2.4,
      hue: i % 3 === 0 ? "255,112,72" : i % 3 === 1 ? "245,192,74" : "255,238,220",
      speed: 0.0015 + Math.random() * 0.004,
      phase: Math.random() * Math.PI * 2
    });
  }

  function resize() {
    var hero = canvas.parentElement;
    var width = hero ? hero.offsetWidth : window.innerWidth;
    var height = hero ? hero.offsetHeight : Math.round(window.innerHeight * 0.88);
    canvas.width = Math.round(width * DPR);
    canvas.height = Math.round(height * DPR);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scene.cx = width * 0.69;
    scene.cy = height * 0.49;
    scene.floorY = height * 0.76;
  }

  function project(x, y, z) {
    var depth = FOV / (FOV + z);
    return {
      x: scene.cx + x * depth,
      y: scene.cy + y * depth,
      scale: depth
    };
  }

  function drawGlow(x, y, radius, color, alpha) {
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawBackdrop(width, height) {
    drawGlow(scene.cx + 110, scene.cy - 30, 280, "rgba(255,104,72,0.08)", 0.32);
    drawGlow(scene.cx + 220, scene.cy - 170, 170, "rgba(245,192,74,0.06)", 0.18);
    drawGlow(scene.cx - 160, scene.cy - 190, 120, "rgba(202,255,96,0.04)", 0.12);

    ctx.save();
    ctx.translate(scene.cx + 12, scene.floorY - 12);
    ctx.scale(1.3, 0.42);
    ctx.strokeStyle = "rgba(255,132,92,0.08)";
    ctx.lineWidth = 1.2;
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(tick * (0.08 + i * 0.02) + i * 0.38);
      ctx.globalAlpha = 0.18 - i * 0.03;
      ctx.beginPath();
      ctx.ellipse(0, 0, 120 + i * 70, 48 + i * 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(scene.cx + 40, scene.floorY + 8);
    ctx.scale(1.35, 0.36);
    ctx.fillStyle = "rgba(255,104,72,0.02)";
    ctx.beginPath();
    ctx.arc(0, 0, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var beam = ctx.createLinearGradient(scene.cx + 36, scene.cy - 280, scene.cx + 36, scene.floorY + 90);
    beam.addColorStop(0, "rgba(255,255,255,0.04)");
    beam.addColorStop(0.2, "rgba(255,210,180,0.03)");
    beam.addColorStop(0.55, "rgba(255,94,66,0.01)");
    beam.addColorStop(1, "transparent");
    ctx.fillStyle = beam;
    ctx.fillRect(scene.cx - 18, scene.cy - 280, 110, scene.floorY - scene.cy + 320);

    ctx.save();
    ctx.strokeStyle = "rgba(255,170,120,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scene.cx - 210, scene.floorY - 8);
    ctx.quadraticCurveTo(scene.cx + 8, scene.floorY - 96, scene.cx + 244, scene.floorY - 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(scene.cx - 188, scene.floorY + 12);
    ctx.quadraticCurveTo(scene.cx + 20, scene.floorY - 52, scene.cx + 270, scene.floorY + 26);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(scene.cx - 12, scene.floorY - 10, 340, Math.PI * 0.24, Math.PI * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(scene.cx + 24, scene.floorY - 8, 260, Math.PI * 0.24, Math.PI * 0.84);
    ctx.stroke();
    ctx.restore();
  }

  function drawSparks() {
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      s.y += Math.sin(tick * 1.8 + s.phase) * 0.08;
      s.z += Math.sin(tick * s.speed * 40 + s.phase) * 0.18;
      var p = project(s.x + smoothX * 20, s.y + smoothY * 18, s.z);
      var alpha = 0.06 + p.scale * 0.2;
      ctx.fillStyle = "rgba(" + s.hue + "," + alpha + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.size * p.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
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

  function drawChip(x, y, text, color, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    ctx.fillStyle = "rgba(10,12,20,0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    var width = Math.max(82, text.length * 7.2) * scale;
    var height = 28 * scale;
    roundRect(-width / 2, -height / 2, width, height, 14 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff5ea";
    ctx.font = Math.round(10 * scale) + "px Space Grotesk, sans-serif";
    ctx.font = "700 " + Math.round(10 * scale) + "px Space Grotesk, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  function drawShadow(x, y, rx, ry, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpecular(x, y, r, angle, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    var spec = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, -r * 0.16, -r * 0.16, r * 0.7);
    spec.addColorStop(0, "rgba(255,255,255," + alpha + ")");
    spec.addColorStop(0.55, "rgba(255,255,255,0.12)");
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSoccer(panel) {
    var x = panel.x;
    var y = panel.y;
    var r = panel.r;
    var rot = tick * 0.7 + panel.phase;
    var base = ctx.createRadialGradient(x - r * 0.35, y - r * 0.44, r * 0.1, x, y, r);
    base.addColorStop(0, "#ffffff");
    base.addColorStop(0.68, "#e6ebf2");
    base.addColorStop(1, "#bcc4cf");
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#12161d";
    polygon(x, y, r * 0.24, 5, rot);
    ctx.fill();

    for (var i = 0; i < 5; i++) {
      var a = rot + i * (Math.PI * 2 / 5);
      var px = x + Math.cos(a) * r * 0.52;
      var py = y + Math.sin(a) * r * 0.46;
      polygon(px, py, r * 0.13, 5, a * 1.08);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.08;
    for (var j = 0; j < 7; j++) {
      ctx.beginPath();
      ctx.arc(x, y, r * (0.18 + j * 0.12), 0.1 + j * 0.2, 2.6 + j * 0.14);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(10,14,18,0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.985, 0, Math.PI * 2);
    ctx.stroke();
    drawSpecular(x, y, r, -0.4, 0.42);
  }

  function drawBasketball(panel) {
    var x = panel.x;
    var y = panel.y;
    var r = panel.r;
    var rot = tick * 0.95 + panel.phase;
    var grad = ctx.createRadialGradient(x - r * 0.34, y - r * 0.36, r * 0.1, x, y, r);
    grad.addColorStop(0, "#ffbe78");
    grad.addColorStop(0.58, "#ee8a3c");
    grad.addColorStop(1, "#b9541b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(74,28,10,0.82)";
    ctx.lineWidth = Math.max(2, r * 0.06);

    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, -1.15 + rot * 0.04, 1.15 + rot * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, Math.PI - 1.15 + rot * 0.04, Math.PI + 1.15 + rot * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r, y + Math.sin(rot) * r * 0.04);
    ctx.quadraticCurveTo(x, y - r * 0.14, x + r, y - Math.sin(rot) * r * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rot) * r * 0.08, y - r);
    ctx.quadraticCurveTo(x - r * 0.18, y, x + Math.cos(rot) * r * 0.08, y + r);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(84,36,14,0.55)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.985, 0, Math.PI * 2);
    ctx.stroke();
    drawSpecular(x, y, r, -0.28, 0.22);
  }

  function drawTennis(panel) {
    var x = panel.x;
    var y = panel.y;
    var r = panel.r;
    var rot = tick * 1.1 + panel.phase;
    var grad = ctx.createRadialGradient(x - r * 0.34, y - r * 0.35, r * 0.08, x, y, r);
    grad.addColorStop(0, "#f7ffbd");
    grad.addColorStop(0.62, "#c7ea45");
    grad.addColorStop(1, "#85b521");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(246,255,222,0.95)";
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.arc(x - r * 0.22 * Math.cos(rot), y, r * 0.82, -1.05, 1.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.22 * Math.cos(rot), y, r * 0.82, Math.PI - 1.05, Math.PI + 1.05);
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84);
      ctx.lineTo(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    drawSpecular(x, y, r, -0.2, 0.2);
  }

  function drawBaseball(panel) {
    var x = panel.x;
    var y = panel.y;
    var r = panel.r;
    var grad = ctx.createRadialGradient(x - r * 0.34, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.72, "#eceff4");
    grad.addColorStop(1, "#cdd3db");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(219,76,72,0.9)";
    ctx.lineWidth = Math.max(1.6, r * 0.06);
    ctx.beginPath();
    ctx.arc(x - r * 0.54, y, r * 0.98, -0.86, 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.54, y, r * 0.98, Math.PI - 0.86, Math.PI + 0.86);
    ctx.stroke();

    for (var i = -3; i <= 3; i++) {
      var seamY = y + i * (r * 0.11);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.39, seamY - 2);
      ctx.lineTo(x - r * 0.28, seamY + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.28, seamY - 2);
      ctx.lineTo(x + r * 0.39, seamY + 2);
      ctx.stroke();
    }
    ctx.restore();
    drawSpecular(x, y, r, -0.34, 0.38);
  }

  function polygon(x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var ang = rotation + i * (Math.PI * 2 / sides);
      var px = x + Math.cos(ang) * radius;
      var py = y + Math.sin(ang) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function buildBallState(ball, index) {
    var wave = tick * 0.9 + ball.orbit;
    var x = ball.x + Math.sin(wave) * ball.drift + smoothX * 26;
    var y = ball.y + Math.cos(wave * 1.2) * ball.drift * 0.7 + smoothY * 18;
    var z = ball.z + Math.sin(wave * 0.8) * 42;
    var p = project(x, y, z);
    return {
      kind: ball.kind,
      label: ball.label,
      labelColor: ball.labelColor,
      x: p.x,
      y: p.y,
      z: z,
      scale: p.scale,
      r: ball.radius * p.scale,
      shadowX: scene.cx + x * 0.88 * p.scale,
      shadowY: scene.floorY + z * 0.03 + y * 0.06,
      phase: tick * (0.4 + index * 0.07)
    };
  }

  function drawBall(panel) {
    drawGlow(panel.x, panel.y, panel.r * 1.44, "rgba(255,108,74,0.06)", 0.12);
    drawShadow(panel.shadowX, panel.shadowY, panel.r * 0.92, panel.r * 0.28, 0.08 + panel.scale * 0.08);

    if (panel.kind === "soccer") drawSoccer(panel);
    else if (panel.kind === "basketball") drawBasketball(panel);
    else if (panel.kind === "tennis") drawTennis(panel);
    else drawBaseball(panel);

    if (panel.kind !== "baseball") {
      drawChip(panel.x, panel.y + panel.r + 30 * panel.scale, panel.label, panel.labelColor, Math.max(0.72, panel.scale * 0.94));
    }
  }

  function drawConnectors(panels) {
    var anchorX = scene.cx + 18 + smoothX * 18;
    var anchorY = scene.cy + 30 + smoothY * 10;
    ctx.strokeStyle = "rgba(255,132,92,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 10]);
    for (var i = 0; i < panels.length; i++) {
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.quadraticCurveTo((anchorX + panels[i].x) * 0.52, panels[i].y - 26, panels[i].x, panels[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function render() {
    tick += 0.016;
    smoothX += (mouseX - smoothX) * 0.05;
    smoothY += (mouseY - smoothY) * 0.05;

    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    drawBackdrop(width, height);
    drawSparks();

    var panels = [];
    for (var i = 0; i < balls.length; i++) {
      panels.push(buildBallState(balls[i], i));
    }
    panels.sort(function (a, b) { return a.z - b.z; });

    drawConnectors(panels);
    for (var j = 0; j < panels.length; j++) {
      drawBall(panels[j]);
    }

    if (!canvas.classList.contains("ready")) {
      canvas.classList.add("ready");
    }
    requestAnimationFrame(render);
  }

  window.addEventListener("mousemove", function (event) {
    var rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(render);
})();
