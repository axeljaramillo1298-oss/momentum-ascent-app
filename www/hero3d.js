/* hero3d.js v3 — Escena 3D producto premium. Canvas 2D puro, sin dependencias. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 1.8);
  var FOV = 980;
  var mx = 0, my = 0, tmx = 0, tmy = 0, t = 0;

  /* ── ICOSAHEDRON CORE ─────────────────────────────────────────── */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var ICO_R = 52;
  var icoRaw = [
    [-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],
    [0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],
    [PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]
  ];
  var icoVerts = icoRaw.map(function(v) {
    var len = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return { x: v[0]/len*ICO_R, y: v[1]/len*ICO_R, z: v[2]/len*ICO_R };
  });
  var icoEdges = [
    [0,1],[0,5],[0,7],[0,10],[0,11],
    [1,5],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,6],[2,10],[2,11],
    [3,4],[3,6],[3,8],[3,9],
    [4,5],[4,9],[4,11],
    [5,9],[5,11],
    [6,7],[6,8],[6,10],
    [7,8],[7,10],
    [8,9],[10,11]
  ];

  /* ── PRODUCT PANELS ───────────────────────────────────────────── */
  var cards = [
    { title:"PICKS",     subtitle:"senal del dia",    kind:"progress",
      pos:{x:248,y:112,z:120}, size:{w:172,h:116},
      rot:{x:0.24,y:-0.5,z:0.1},  accent:"#ff6b35", glow:"rgba(255,107,53,0.3)" },
    { title:"EDGE",      subtitle:"+14% valor",        kind:"streak",
      pos:{x:-230,y:26,z:110},  size:{w:186,h:124},
      rot:{x:-0.14,y:0.46,z:-0.06}, accent:"#f5c04a", glow:"rgba(245,192,74,0.26)" },
    { title:"IA",        subtitle:"analisis activo",   kind:"message",
      pos:{x:145,y:-162,z:40},  size:{w:160,h:96},
      rot:{x:0.12,y:-0.16,z:0.05}, accent:"#ff8f70", glow:"rgba(255,143,112,0.22)" },
    { title:"MERCADO",   subtitle:"linea activa",      kind:"nutrition",
      pos:{x:-62,y:-188,z:-10}, size:{w:150,h:88},
      rot:{x:0.18,y:0.08,z:-0.02}, accent:"#ffd36e", glow:"rgba(255,211,110,0.2)" },
    { title:"CONF",      subtitle:"82 sobre 100",     kind:"bars",
      pos:{x:310,y:-28,z:-18},  size:{w:132,h:84},
      rot:{x:-0.12,y:-0.6,z:0.1},  accent:"#ff5a49", glow:"rgba(255,90,73,0.2)" }
  ];
  /* Staggered entrance timestamps */
  cards.forEach(function(c, i) { c._birth = i * 0.38 + 0.18; });

  /* ── DATA FLOW PARTICLES (core → cards) ──────────────────────── */
  var flows = [];
  cards.forEach(function(card, ci) {
    for (var i = 0; i < 5; i++) {
      flows.push({
        cardIndex: ci,
        t: Math.random(),
        speed: 0.0035 + Math.random() * 0.003,
        size: 1.6 + Math.random() * 1.4
      });
    }
  });

  /* ── PULSE WAVE RINGS ─────────────────────────────────────────── */
  var pulses = [
    { r: 0,   maxR: 240, speed: 0.55, col:"rgba(255,90,60,0.7)"  },
    { r: 80,  maxR: 240, speed: 0.55, col:"rgba(245,192,74,0.5)" },
    { r: 160, maxR: 240, speed: 0.55, col:"rgba(255,90,60,0.7)"  }
  ];

  /* ── AMBIENT PARTICLES ────────────────────────────────────────── */
  var particles = [];
  var pcols = ["#ff6b35","#f5c04a","#fff0de","#ff8f70","#ffd36e","#ff5a49"];
  for (var pi = 0; pi < 120; pi++) {
    var pr = 240 + Math.random() * 440;
    var pphi = Math.random() * Math.PI * 2;
    var ptheta = Math.random() * Math.PI;
    particles.push({
      x: pr * Math.sin(ptheta) * Math.cos(pphi),
      y: pr * Math.sin(ptheta) * Math.sin(pphi),
      z: pr * Math.cos(ptheta),
      size:  0.5 + Math.random() * 1.9,
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.006,
      col:   pcols[Math.floor(Math.random() * pcols.length)]
    });
  }

  /* ── MATH ─────────────────────────────────────────────────────── */
  function resize() {
    var hero = canvas.parentElement;
    var w = hero ? hero.offsetWidth  : window.innerWidth;
    var h = hero ? hero.offsetHeight : Math.round(window.innerHeight * 0.9);
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function project(p) {
    var cx = canvas.clientWidth  * 0.64;
    var cy = canvas.clientHeight * 0.50;
    var z  = p.z + FOV;
    if (z <= 0) return null;
    var s = FOV / z;
    return { x: cx + p.x * s, y: cy - p.y * s, s: s };
  }

  function rotX(p,a){ var c=Math.cos(a),s=Math.sin(a); return {x:p.x,y:p.y*c-p.z*s,z:p.y*s+p.z*c}; }
  function rotY(p,a){ var c=Math.cos(a),s=Math.sin(a); return {x:p.x*c+p.z*s,y:p.y,z:-p.x*s+p.z*c}; }
  function rotZ(p,a){ var c=Math.cos(a),s=Math.sin(a); return {x:p.x*c-p.y*s,y:p.x*s+p.y*c,z:p.z}; }
  function rot3(p,rx,ry,rz){ return rotZ(rotY(rotX(p,rx),ry),rz); }
  function blend(a,b,n){ return a+(b-a)*n; }
  function bPt(a,b,n){ return {x:blend(a.x,b.x,n), y:blend(a.y,b.y,n)}; }

  function roundedRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  function drawGlow(x,y,r,color,alpha){
    var g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color); g.addColorStop(1,"transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function quadPath(pts){
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath();
  }

  function quadPt(pts,u,v){
    return bPt(bPt(pts[0],pts[3],v), bPt(pts[1],pts[2],v), u);
  }

  function cardCenterWorld(card, globalRx, globalRy){
    var p = rot3(card.pos, globalRx, globalRy*0.2, 0);
    return project(p);
  }

  /* ── BACKGROUND ATMOSPHERE ────────────────────────────────────── */
  function drawBackground(){
    var w=canvas.clientWidth, h=canvas.clientHeight;
    var cx=w*0.63, cy=h*0.48;
    drawGlow(cx,      cy,       400, "rgba(255,78,50,0.09)",  0.5);
    drawGlow(cx+40,   cy+160,   260, "rgba(245,192,74,0.06)", 0.3);
    drawGlow(cx-200,  cy-160,   170, "rgba(255,255,255,0.04)",0.16);
    drawGlow(cx+310,  cy-90,    200, "rgba(255,55,35,0.07)",  0.22);
    drawGlow(cx-260,  cy+80,    180, "rgba(245,192,74,0.05)", 0.18);

    var haze = ctx.createLinearGradient(0,0,0,h);
    haze.addColorStop(0,"rgba(255,255,255,0.025)");
    haze.addColorStop(0.4,"rgba(255,115,80,0.04)");
    haze.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = haze; ctx.fillRect(0,0,w,h);

    /* vertical light column */
    var beam = ctx.createLinearGradient(cx,cy-280,cx,cy+320);
    beam.addColorStop(0,"rgba(255,255,255,0.1)");
    beam.addColorStop(0.22,"rgba(255,200,160,0.07)");
    beam.addColorStop(0.65,"rgba(255,100,70,0.025)");
    beam.addColorStop(1,"transparent");
    ctx.fillStyle = beam; ctx.fillRect(cx-55,cy-280,110,640);
  }

  /* ── PERSPECTIVE FLOOR GRID ───────────────────────────────────── */
  function drawFloor(ry, time){
    var size=620, step=54;
    var pulse = 0.019 + Math.sin(time*0.5)*0.008;
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255,96,75,0.9)";

    function drawLine(axis, fixed, range, step2){
      ctx.beginPath(); var started=false;
      for(var v=range[0];v<=range[1];v+=step2){
        var coords = axis==="x"
          ? {x:fixed,y:-220,z:v}
          : {x:v,y:-220,z:fixed};
        var p = rot3(coords,0.5,ry*0.4,0);
        var q = project(p);
        if(!q) continue;
        ctx.globalAlpha = pulse * Math.min(1, q.s*3.4);
        if(!started){ ctx.moveTo(q.x,q.y); started=true; }
        else ctx.lineTo(q.x,q.y);
      }
      ctx.stroke();
    }

    for(var x=-size;x<=size;x+=step) drawLine("x",x,[-size,size],20);
    for(var z=-size;z<=size;z+=step) drawLine("z",z,[-size,size],20);
    ctx.globalAlpha = 1;
  }

  /* ── PULSE RINGS FROM CORE ────────────────────────────────────── */
  function drawPulseWaves(){
    var cx=canvas.clientWidth*0.64, cy=canvas.clientHeight*0.5;
    for(var i=0;i<pulses.length;i++){
      var pw = pulses[i];
      pw.r += pw.speed;
      if(pw.r > pw.maxR) pw.r = 0;
      var alpha = (1 - pw.r/pw.maxR) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = pw.col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy+14, pw.r*1.12, pw.r*0.44, 0, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ── ICOSAHEDRON ENERGY CORE ──────────────────────────────────── */
  function drawCore(ry, rx, time){
    var cx=canvas.clientWidth*0.64, cy=canvas.clientHeight*0.5;
    var pulse = 0.82 + Math.sin(time*2.4)*0.14;
    var icoRy = time*0.38 + ry*0.28;
    var icoRx = time*0.19 + rx*0.18;

    /* outer atmospheric glow */
    drawGlow(cx, cy, 120*pulse, "rgba(255,80,55,0.2)",  0.38);
    drawGlow(cx, cy,  72*pulse, "rgba(255,200,100,0.18)",0.30);

    /* ring halo */
    ctx.globalAlpha = 0.28 * pulse;
    ctx.strokeStyle = "rgba(255,160,90,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 58*pulse, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.12 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, 82*pulse, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;

    /* wireframe */
    var proj = icoVerts.map(function(v){
      var p = rot3(v, icoRx, icoRy, 0);
      return project(p);
    });

    /* glow pass */
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(255,120,80,0.8)";
    for(var e=0;e<icoEdges.length;e++){
      var a=proj[icoEdges[e][0]], b=proj[icoEdges[e][1]];
      if(!a||!b) continue;
      var ep = 0.28 + 0.55*Math.sin(time*2.6+e*0.44);
      ctx.globalAlpha = 0.22 * ep;
      ctx.strokeStyle = "rgba(255,140,90,1)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    ctx.restore();

    /* sharp inner pass */
    for(var e2=0;e2<icoEdges.length;e2++){
      var a2=proj[icoEdges[e2][0]], b2=proj[icoEdges[e2][1]];
      if(!a2||!b2) continue;
      var ep2 = 0.22 + 0.42*Math.sin(time*2.6+e2*0.44);
      ctx.globalAlpha = 0.14 * ep2;
      ctx.strokeStyle = "rgba(255,220,180,1)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(a2.x,a2.y); ctx.lineTo(b2.x,b2.y); ctx.stroke();
    }

    /* vertex nodes */
    for(var vi=0;vi<proj.length;vi++){
      var vq = proj[vi];
      if(!vq) continue;
      var vp = 0.5 + 0.5*Math.sin(time*3.2+vi*0.9);
      ctx.globalAlpha = 0.55*vp;
      ctx.fillStyle = "rgba(255,200,140,1)";
      ctx.shadowBlur = 6; ctx.shadowColor = "rgba(255,120,80,0.9)";
      ctx.beginPath(); ctx.arc(vq.x,vq.y,1.8,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* core dot */
    ctx.globalAlpha = 0.95*pulse;
    ctx.fillStyle = "#fff0e0";
    ctx.shadowBlur = 22; ctx.shadowColor = "rgba(255,80,50,0.9)";
    ctx.beginPath(); ctx.arc(cx,cy,4.5,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  /* ── DATA FLOWS (core → card) ─────────────────────────────────── */
  function drawDataFlows(globalRx, globalRy){
    var anchor = {x: canvas.clientWidth*0.64, y: canvas.clientHeight*0.5};
    for(var i=0;i<flows.length;i++){
      var f = flows[i];
      f.t += f.speed;
      if(f.t > 1) f.t -= 1;

      var card = cards[f.cardIndex];
      var age = t - card._birth;
      if(age < 0.5) continue;

      var cc = cardCenterWorld(card, globalRx, globalRy);
      if(!cc) continue;

      var pt = {
        x: blend(anchor.x, cc.x, f.t),
        y: blend(anchor.y, cc.y, f.t)
      };
      var fadeA = Math.sin(f.t * Math.PI) * 0.65;

      ctx.globalAlpha = fadeA;
      ctx.fillStyle = card.accent;
      ctx.shadowBlur = 10;
      ctx.shadowColor = card.accent;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, f.size, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      /* tiny tail */
      if(f.t > 0.04){
        var tailT = Math.max(0, f.t - 0.04);
        var tailPt = {
          x: blend(anchor.x, cc.x, tailT),
          y: blend(anchor.y, cc.y, tailT)
        };
        var tg = ctx.createLinearGradient(tailPt.x,tailPt.y,pt.x,pt.y);
        tg.addColorStop(0,"transparent");
        tg.addColorStop(1,card.accent);
        ctx.globalAlpha = fadeA*0.35;
        ctx.strokeStyle = tg;
        ctx.lineWidth = f.size * 0.9;
        ctx.beginPath();
        ctx.moveTo(tailPt.x,tailPt.y); ctx.lineTo(pt.x,pt.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ── SCAN BEAM ────────────────────────────────────────────────── */
  function drawScanBeam(time){
    var w=canvas.clientWidth, h=canvas.clientHeight;
    /* sweeps left→right over ~9s of t, then resets */
    var phase = (time * 0.014) % 1;
    var x = (-0.05 + phase * 1.1) * w;
    var g = ctx.createLinearGradient(x-40,0,x+40,0);
    g.addColorStop(0,"transparent");
    g.addColorStop(0.5,"rgba(255,180,140,0.055)");
    g.addColorStop(1,"transparent");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x-40,0,80,h);
  }

  /* ── SIGNAL ARCS ──────────────────────────────────────────────── */
  function drawSignalArcs(time){
    var cx=canvas.clientWidth*0.64, cy=canvas.clientHeight*0.52;
    for(var i=0;i<3;i++){
      ctx.globalAlpha = 0.13 + i*0.05;
      ctx.strokeStyle = i===1 ? "rgba(245,192,74,0.32)" : "rgba(255,104,76,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx,cy+12, 118+i*58, 44+i*18, 0,
        time*0.18+i*0.12, time*0.18+Math.PI+i*0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ── PHONE AURA ───────────────────────────────────────────────── */
  function drawPhoneAura(time){
    var cx=canvas.clientWidth*0.64, cy=canvas.clientHeight*0.51;
    var p = 0.86 + Math.sin(time*1.5)*0.09;
    drawGlow(cx,cy,  140,"rgba(255,88,66,0.18)",0.28*p);
    drawGlow(cx,cy+18,95,"rgba(245,192,74,0.14)",0.26*p);
    ctx.globalAlpha = 0.44*p;
    ctx.strokeStyle = "rgba(255,186,142,0.22)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(cx,cy+26,138,50,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.2*p;
    ctx.beginPath(); ctx.ellipse(cx,cy+26,204,80,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ── CONNECTOR LINE ───────────────────────────────────────────── */
  function drawConnector(pts, anchor, color){
    var center = quadPt(pts,0.5,0.5);
    var g = ctx.createLinearGradient(center.x,center.y,anchor.x,anchor.y);
    g.addColorStop(0,color); g.addColorStop(1,"transparent");
    ctx.globalAlpha = 0.2; ctx.strokeStyle = g; ctx.lineWidth = 1;
    ctx.setLineDash([7,10]);
    ctx.beginPath(); ctx.moveTo(center.x,center.y); ctx.lineTo(anchor.x,anchor.y); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  /* ── PANEL LABEL CHIP ─────────────────────────────────────────── */
  function drawPanelLabel(x,y,text,color,scale){
    ctx.save();
    ctx.font = (10*scale)+"px 'Space Grotesk',sans-serif";
    var pw = ctx.measureText(text).width + 20*scale;
    ctx.shadowBlur = 16; ctx.shadowColor = color;
    ctx.fillStyle = "rgba(10,12,18,0.9)";
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    roundedRect(x-pw/2, y-14*scale, pw, 28*scale, 14*scale);
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff7f0"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text,x,y);
    ctx.restore();
  }

  /* ── PANEL INTERIOR ───────────────────────────────────────────── */
  function drawPanelInterior(pts, card, time){
    var tbs = quadPt(pts,0.1,0.18), tbe = quadPt(pts,0.72,0.18);
    var sbs = quadPt(pts,0.1,0.31), sbe = quadPt(pts,0.48,0.31);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tbs.x,tbs.y); ctx.lineTo(tbe.x,tbe.y); ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.moveTo(sbs.x,sbs.y); ctx.lineTo(sbe.x,sbe.y); ctx.stroke();

    if(card.kind==="progress"){
      var a=quadPt(pts,0.14,0.58), b=quadPt(pts,0.82,0.58);
      /* animated fill */
      var fill = 0.38 + 0.26*Math.sin(time*0.7);
      var fe = quadPt(pts,0.14+fill*0.68,0.58);
      ctx.lineWidth=5; ctx.globalAlpha=0.26; ctx.strokeStyle="rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.globalAlpha=0.9; ctx.strokeStyle=card.accent;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(fe.x,fe.y); ctx.stroke();
      /* glow tip */
      ctx.globalAlpha=0.8; ctx.shadowBlur=8; ctx.shadowColor=card.accent;
      ctx.beginPath(); ctx.arc(fe.x,fe.y,3,0,Math.PI*2); ctx.fillStyle=card.accent; ctx.fill();
      ctx.shadowBlur=0;
    } else if(card.kind==="streak"){
      var heights=[0.18,0.34,0.52,0.42];
      for(var i=0;i<4;i++){
        var animated = i===2 ? heights[i]+0.08*Math.sin(time*1.4) : heights[i];
        var btm=quadPt(pts,0.14+i*0.15,0.82), top=quadPt(pts,0.14+i*0.15,0.82-animated);
        ctx.lineWidth=7; ctx.globalAlpha=0.72;
        ctx.strokeStyle=i===2?card.accent:"rgba(255,255,255,0.3)";
        if(i===2){ ctx.shadowBlur=10; ctx.shadowColor=card.accent; }
        ctx.beginPath(); ctx.moveTo(btm.x,btm.y); ctx.lineTo(top.x,top.y); ctx.stroke();
        ctx.shadowBlur=0;
      }
    } else if(card.kind==="message"){
      for(var j=0;j<3;j++){
        var by=0.48+j*0.13;
        var s=quadPt(pts,0.14,by), e=quadPt(pts,j===1?0.58:0.78,by);
        ctx.lineWidth=4; ctx.globalAlpha=j===1?0.8:0.38;
        ctx.strokeStyle=j===1?card.accent:"rgba(255,255,255,0.32)";
        if(j===1){ ctx.shadowBlur=8; ctx.shadowColor=card.accent; }
        ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(e.x,e.y); ctx.stroke();
        ctx.shadowBlur=0;
      }
      /* blinking cursor */
      var cur=quadPt(pts,0.58,0.48);
      ctx.globalAlpha=0.5+0.5*Math.sin(time*4);
      ctx.fillStyle=card.accent;
      ctx.beginPath(); ctx.arc(cur.x,cur.y,2,0,Math.PI*2); ctx.fill();
    } else if(card.kind==="nutrition"){
      var circ=quadPt(pts,0.2,0.62);
      ctx.globalAlpha=0.8; ctx.fillStyle=card.accent;
      ctx.shadowBlur=8; ctx.shadowColor=card.accent;
      ctx.beginPath(); ctx.arc(circ.x,circ.y,7,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      for(var k=0;k<2;k++){
        var ns=quadPt(pts,0.34,0.56+k*0.14), ne=quadPt(pts,0.78,0.56+k*0.14);
        ctx.lineWidth=4; ctx.globalAlpha=0.5-k*0.12; ctx.strokeStyle="rgba(255,255,255,0.55)";
        ctx.beginPath(); ctx.moveTo(ns.x,ns.y); ctx.lineTo(ne.x,ne.y); ctx.stroke();
      }
    } else if(card.kind==="bars"){
      var barH=[0.16,0.28,0.48,0.62,0.76];
      for(var bk=0;bk<5;bk++){
        var animated2 = bk>=3 ? barH[bk]+0.06*Math.sin(time*1.2+bk*0.8) : barH[bk];
        var bx=0.18+bk*0.14;
        var botPt=quadPt(pts,bx,0.82), topPt=quadPt(pts,bx,0.82-animated2);
        ctx.lineWidth=6; ctx.globalAlpha=0.82;
        ctx.strokeStyle=bk>=3?card.accent:"rgba(255,255,255,0.28)";
        if(bk>=3){ ctx.shadowBlur=8; ctx.shadowColor=card.accent; }
        ctx.beginPath(); ctx.moveTo(botPt.x,botPt.y); ctx.lineTo(topPt.x,topPt.y); ctx.stroke();
        ctx.shadowBlur=0;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ── DRAW PANEL ───────────────────────────────────────────────── */
  function drawPanel(card, globalRx, globalRy, anchor){
    var age = t - card._birth;
    if(age < 0) return;

    /* easeOutBack entrance */
    var ent = Math.min(1, age/0.55);
    var c1=1.70158, c3=c1+1;
    var ease = ent===1 ? 1 : 1 + c3*Math.pow(ent-1,3) + c1*Math.pow(ent-1,2);
    ease = Math.max(0, Math.min(1.08, ease));
    if(ease < 0.02) return;

    var w=card.size.w*ease, h=card.size.h*ease;
    var corners=[
      {x:-w/2,y:h/2,z:0},{x:w/2,y:h/2,z:0},
      {x:w/2,y:-h/2,z:0},{x:-w/2,y:-h/2,z:0}
    ];
    var pts=[];
    for(var i=0;i<corners.length;i++){
      var p = rot3(corners[i], card.rot.x, card.rot.y+globalRy, card.rot.z);
      p = {x:p.x+card.pos.x, y:p.y+card.pos.y, z:p.z+card.pos.z};
      p = rot3(p, globalRx, globalRy*0.2, 0);
      var q = project(p);
      if(!q) return;
      pts.push(q);
    }

    var center = quadPt(pts,0.5,0.5);
    var scale = Math.max(0.82, Math.min(1.24, center.s || 1));
    drawConnector(pts, anchor, card.glow);

    /* card body */
    ctx.save();
    ctx.globalAlpha = 0.92 * ease;
    ctx.fillStyle = "rgba(9,11,18,0.74)";
    ctx.strokeStyle = card.accent;
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 28;
    ctx.shadowColor = card.glow;
    quadPath(pts); ctx.fill(); ctx.stroke();

    /* glass specular top strip */
    ctx.globalAlpha = 0.24 * ease;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y);
    ctx.lineTo(blend(pts[1].x,pts[2].x,0.24), blend(pts[1].y,pts[2].y,0.24));
    ctx.lineTo(blend(pts[0].x,pts[3].x,0.24), blend(pts[0].y,pts[3].y,0.24));
    ctx.closePath(); ctx.fill();
    ctx.restore();

    if(ease > 0.55){
      drawPanelInterior(pts, card, t);
      drawPanelLabel(center.x, center.y-(58*scale), card.title, card.accent, 0.9*scale);
      ctx.save();
      ctx.fillStyle = "#fff7f0";
      ctx.font = (11*scale)+"px 'Space Grotesk',sans-serif";
      ctx.textAlign = "center"; ctx.globalAlpha = 0.8*ease;
      ctx.fillText(card.subtitle, center.x, center.y+50*scale);
      ctx.restore();
    }
  }

  /* ── AMBIENT PARTICLES ────────────────────────────────────────── */
  function drawParticles(globalRx, globalRy){
    for(var i=0;i<particles.length;i++){
      var pt = particles[i];
      var pp = rot3({x:pt.x,y:pt.y,z:pt.z}, globalRx*0.12, globalRy*0.18+t*0.018, 0);
      var pq = project(pp);
      if(!pq) continue;
      var r = pt.size * Math.min(1.6, pq.s*2.4);
      if(r < 0.24) continue;
      ctx.globalAlpha = (0.1+0.16*Math.sin(t*pt.speed*10+pt.phase)) * Math.min(1, pq.s*2.1);
      ctx.fillStyle = pt.col;
      ctx.beginPath(); ctx.arc(pq.x,pq.y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── MAIN LOOP ────────────────────────────────────────────────── */
  function loop(){
    requestAnimationFrame(loop);
    t += 0.013;
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    var w=canvas.clientWidth, h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);

    var ry = t*0.08 + mx*0.22;
    var rx = t*0.03 - my*0.12;
    var anchor = {x: w*0.64, y: h*0.54};

    drawBackground();
    drawFloor(ry, t);
    drawPulseWaves();
    drawSignalArcs(t);
    drawPhoneAura(t);
    drawScanBeam(t);
    drawCore(ry, rx, t);

    var ordered = cards.slice().sort(function(a,b){ return a.pos.z-b.pos.z; });
    for(var i=0;i<ordered.length;i++) drawPanel(ordered[i], rx, ry, anchor);

    drawDataFlows(rx, ry);
    drawParticles(rx, ry);
  }

  window.addEventListener("mousemove", function(e){
    tmx = (e.clientX/window.innerWidth - 0.5) * 1.1;
    tmy = (e.clientY/window.innerHeight - 0.5) * 0.8;
  });

  resize();
  window.addEventListener("resize", resize);
  setTimeout(function(){ canvas.classList.add("ready"); }, 80);
  loop();
})();
