/* hero3d.js — Escena 3D premium v2. Canvas 2D puro, sin dependencias. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  /* ── SIZING ─────────────────────────────────────────────────────── */
  function resize() {
    var hero = canvas.parentElement;
    canvas.width  = hero ? hero.offsetWidth  : window.innerWidth;
    canvas.height = hero ? hero.offsetHeight : Math.round(window.innerHeight * 0.9);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ── 3D MATH ─────────────────────────────────────────────────────── */
  var FOV = 950;

  function project(p) {
    var cx = canvas.width  * 0.60;
    var cy = canvas.height * 0.48;
    var z  = p.z + FOV;
    if (z <= 0) return null;
    var s = FOV / z;
    return { x: cx + p.x * s, y: cy - p.y * s, s: s };
  }

  function rotX(p, a) { var c=Math.cos(a),s=Math.sin(a); return {x:p.x, y:p.y*c-p.z*s, z:p.y*s+p.z*c}; }
  function rotY(p, a) { var c=Math.cos(a),s=Math.sin(a); return {x:p.x*c+p.z*s, y:p.y, z:-p.x*s+p.z*c}; }
  function rotZ(p, a) { var c=Math.cos(a),s=Math.sin(a); return {x:p.x*c-p.y*s, y:p.x*s+p.y*c, z:p.z}; }
  function rot3(p, rx, ry, rz) { return rotZ(rotY(rotX(p, rx), ry), rz); }

  /* ── ICOSAEDRO ───────────────────────────────────────────────────── */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var IV = [
    [0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],
    [1,PHI,0],[-1,PHI,0],[1,-PHI,0],[-1,-PHI,0],
    [PHI,0,1],[-PHI,0,1],[PHI,0,-1],[-PHI,0,-1]
  ];
  var IE = [
    [0,1],[0,4],[0,5],[0,8],[0,9],
    [1,6],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,5],[2,10],[2,11],
    [3,6],[3,7],[3,10],[3,11],
    [4,5],[4,8],[4,10],[5,9],[5,11],
    [6,7],[6,8],[6,10],[7,9],[7,11],[8,10],[9,11]
  ];
  var IR = 195;
  var icoV = IV.map(function(v){
    var l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return {x:v[0]/l*IR, y:v[1]/l*IR, z:v[2]/l*IR};
  });

  /* ── DODECAEDRO ──────────────────────────────────────────────────── */
  var DV = [
    [1,1,1],[-1,1,1],[1,-1,1],[-1,-1,1],
    [1,1,-1],[-1,1,-1],[1,-1,-1],[-1,-1,-1],
    [0,1/PHI,PHI],[0,-1/PHI,PHI],[0,1/PHI,-PHI],[0,-1/PHI,-PHI],
    [1/PHI,PHI,0],[-1/PHI,PHI,0],[1/PHI,-PHI,0],[-1/PHI,-PHI,0],
    [PHI,0,1/PHI],[PHI,0,-1/PHI],[-PHI,0,1/PHI],[-PHI,0,-1/PHI]
  ];
  var DE = [
    [0,8],[0,12],[0,16],[1,9],[1,13],[1,18],[2,9],[2,14],[2,16],
    [3,8],[3,15],[3,18],[4,10],[4,12],[4,17],[5,10],[5,13],[5,19],
    [6,11],[6,14],[6,17],[7,11],[7,15],[7,19],
    [8,9],[10,11],[12,13],[14,15],[16,17],[18,19]
  ];
  var DR2 = 82;
  var dodecV = DV.map(function(v){
    var l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return {x:v[0]/l*DR2, y:v[1]/l*DR2, z:v[2]/l*DR2};
  });
  var DO = {x:-190, y:135, z:25};

  /* ── OCTAEDRO ────────────────────────────────────────────────────── */
  var OV = [{x:0,y:62,z:0},{x:0,y:-62,z:0},{x:62,y:0,z:0},{x:-62,y:0,z:0},{x:0,y:0,z:62},{x:0,y:0,z:-62}];
  var OE = [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]];
  var OO = {x:215, y:-155, z:20};

  /* ── ANILLOS ─────────────────────────────────────────────────────── */
  function makeRing(r, n) {
    var pts = [];
    for (var i=0;i<=n;i++) { var a=(i/n)*Math.PI*2; pts.push({x:Math.cos(a)*r, y:Math.sin(a)*r, z:0}); }
    return pts;
  }
  var R1 = makeRing(265, 100);
  var R2 = makeRing(330, 100);
  var R3 = makeRing(210, 100);
  var R4 = makeRing(400, 100);

  /* ── PARTÍCULAS ──────────────────────────────────────────────────── */
  var PCOLS = ["#ff3b30","#ff6b35","#f5c04a","#ffffff","#ff8c60","#ffb347"];
  var parts = [];
  for (var i=0;i<280;i++) {
    var r=260+Math.random()*370, phi=Math.random()*Math.PI*2, the=Math.random()*Math.PI;
    parts.push({
      x: r*Math.sin(the)*Math.cos(phi), y: r*Math.sin(the)*Math.sin(phi), z: r*Math.cos(the),
      size: 0.7+Math.random()*2.2,
      col: PCOLS[Math.floor(Math.random()*PCOLS.length)],
      phase: Math.random()*Math.PI*2,
      speed: 0.004+Math.random()*0.007,
    });
  }

  /* ── SATÉLITES con trail ─────────────────────────────────────────── */
  var sats = [
    {R:255, tilt:0.62, spd:0.52, ph:0,   sz:14, col:"#ff6b35", trail:[]},
    {R:325, tilt:-0.88,spd:0.31, ph:2.1, sz:10, col:"#f5c04a", trail:[]},
    {R:205, tilt:1.20, spd:0.70, ph:1.0, sz:7,  col:"#ff3b30", trail:[]},
    {R:395, tilt:0.28, spd:0.19, ph:3.5, sz:11, col:"#fff",    trail:[]},
  ];
  var TRAIL_LEN = 18;

  /* ── NODOS (vértices brillantes del icosaedro) ───────────────────── */
  // Se calculan en cada frame

  /* ── MOUSE ───────────────────────────────────────────────────────── */
  var mx=0,my=0,tmx=0,tmy=0;
  window.addEventListener("mousemove",function(e){
    tmx=(e.clientX/window.innerWidth -0.5)*1.4;
    tmy=(e.clientY/window.innerHeight-0.5)*1.0;
  });

  /* ── HELPERS ─────────────────────────────────────────────────────── */
  function glowDot(x,y,r,col,alpha) {
    if (r<0.3||alpha<0.01) return;
    var g=ctx.createRadialGradient(x,y,0,x,y,r*5);
    g.addColorStop(0,col); g.addColorStop(1,"transparent");
    ctx.globalAlpha=alpha*0.45; ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(x,y,r*5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=alpha; ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  function drawEdges(verts,edges,col,alpha,rx,ry,rz,ox,oy,oz,glowW,pulseT) {
    ox=ox||0;oy=oy||0;oz=oz||0;glowW=glowW||10;
    for (var e=0;e<edges.length;e++) {
      var a3=rot3(verts[edges[e][0]],rx,ry,rz);
      var b3=rot3(verts[edges[e][1]],rx,ry,rz);
      a3={x:a3.x+ox,y:a3.y+oy,z:a3.z+oz};
      b3={x:b3.x+ox,y:b3.y+oy,z:b3.z+oz};
      var pa=project(a3), pb=project(b3);
      if (!pa||!pb) continue;
      var dep=Math.min(pa.s,pb.s);
      var alph=alpha*Math.min(1,dep*2.8);
      if (alph<0.02) continue;
      // pulse: brighter at certain phase
      if (pulseT!==undefined) {
        var pulse=0.5+0.5*Math.sin(pulseT+e*0.4);
        alph=Math.min(1,alph*(0.7+pulse*0.5));
      }
      ctx.globalAlpha=alph;
      ctx.shadowBlur=glowW; ctx.shadowColor=col;
      ctx.strokeStyle=col; ctx.lineWidth=1.1;
      ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.stroke();
    }
    ctx.shadowBlur=0;
  }

  function drawRing(pts,rx,ry,rz,col,alpha,lineW,blur) {
    ctx.strokeStyle=col; ctx.lineWidth=lineW||1.2;
    ctx.shadowBlur=blur||16; ctx.shadowColor=col;
    ctx.beginPath(); var started=false;
    for (var i=0;i<pts.length;i++) {
      var p=rot3(pts[i],rx,ry,rz);
      var q=project(p); if (!q) continue;
      var a=alpha*Math.min(1,q.s*3.5);
      ctx.globalAlpha=a;
      if(!started){ctx.moveTo(q.x,q.y);started=true;} else {ctx.lineTo(q.x,q.y);}
    }
    ctx.stroke(); ctx.shadowBlur=0;
  }

  function drawNebula() {
    var cx=canvas.width*0.60, cy=canvas.height*0.48;
    // Outer nebula
    var g1=ctx.createRadialGradient(cx,cy,0,cx,cy,380);
    g1.addColorStop(0.0,"rgba(255,59,48,0.08)");
    g1.addColorStop(0.35,"rgba(255,107,53,0.05)");
    g1.addColorStop(0.65,"rgba(245,192,74,0.025)");
    g1.addColorStop(1.0,"transparent");
    ctx.globalAlpha=1; ctx.fillStyle=g1;
    ctx.beginPath(); ctx.arc(cx,cy,380,0,Math.PI*2); ctx.fill();
    // Bright core
    var g2=ctx.createRadialGradient(cx,cy,0,cx,cy,80);
    g2.addColorStop(0.0,"rgba(255,120,80,0.18)");
    g2.addColorStop(0.5,"rgba(255,59,48,0.06)");
    g2.addColorStop(1.0,"transparent");
    ctx.fillStyle=g2;
    ctx.beginPath(); ctx.arc(cx,cy,80,0,Math.PI*2); ctx.fill();
  }

  function drawGrid(ry,t) {
    var sz=460,step=55;
    var pulse=0.07+Math.sin(t*0.45)*0.035;
    ctx.lineWidth=0.45;
    for (var x=-sz;x<=sz;x+=step) {
      ctx.beginPath(); var st=false;
      for (var z2=-sz;z2<=sz;z2+=18) {
        var p=rot3({x:x,y:-195,z:z2},0.52,ry*0.45,0);
        var q=project(p); if(!q)continue;
        var a=pulse*Math.min(1,q.s*3.5);
        ctx.globalAlpha=a;
        ctx.strokeStyle="#ff3b30";
        if(!st){ctx.moveTo(q.x,q.y);st=true;}else{ctx.lineTo(q.x,q.y);}
      }
      ctx.stroke();
    }
    for (var z3=-sz;z3<=sz;z3+=step) {
      ctx.beginPath(); var st2=false;
      for (var x2=-sz;x2<=sz;x2+=18) {
        var p2=rot3({x:x2,y:-195,z:z3},0.52,ry*0.45,0);
        var q2=project(p2); if(!q2)continue;
        var a2=pulse*Math.min(1,q2.s*3.5);
        ctx.globalAlpha=a2;
        if(!st2){ctx.moveTo(q2.x,q2.y);st2=true;}else{ctx.lineTo(q2.x,q2.y);}
      }
      ctx.stroke();
    }
  }

  function drawSatTrail(trail,col) {
    for (var i=1;i<trail.length;i++) {
      var a=(i/trail.length)*0.55;
      ctx.globalAlpha=a*a;
      ctx.strokeStyle=col;
      ctx.lineWidth=2.5*(i/trail.length);
      ctx.shadowBlur=8; ctx.shadowColor=col;
      ctx.beginPath();
      ctx.moveTo(trail[i-1].x,trail[i-1].y);
      ctx.lineTo(trail[i].x,trail[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur=0;
  }

  /* ── ANIMATE ─────────────────────────────────────────────────────── */
  var t=0;

  function draw() {
    requestAnimationFrame(draw);
    t+=0.013;
    mx+=(tmx-mx)*0.05; my+=(tmy-my)*0.05;

    var W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.globalAlpha=1;

    var ry=t*0.11+mx*0.28;
    var rx=t*0.065-my*0.20;
    var rz=t*0.028;

    // 1. NEBULOSA fondo
    drawNebula();

    // 2. GRID FLOOR
    drawGrid(ry, t);

    // 3. ANILLOS con diferente glow
    drawRing(R4, rx*0.22+0.30, ry*0.38-t*0.042, 0, "rgba(245,192,74,0.5)", 0.30, 0.8, 10);
    drawRing(R1, rx*0.42+1.08, ry*0.68+t*0.095, rz, "#f5c04a", 0.70, 1.6, 22);
    drawRing(R2, rx*0.30-0.82, ry*0.52-t*0.072, rz*0.5, "#ff6b35", 0.55, 1.3, 18);
    drawRing(R3, Math.PI/2+rx*0.22, ry*0.78+t*0.13, rz, "#ff3b30", 0.60, 1.4, 20);

    // 4. DODECAEDRO
    ctx.shadowBlur=14; ctx.shadowColor="#f5c04a";
    drawEdges(dodecV,DE,"#f5c04a",0.72,rx+t*0.19,ry+t*0.25,rz,DO.x,DO.y,DO.z,12,t*2.1);
    ctx.shadowBlur=0;

    // 5. OCTAEDRO
    ctx.shadowBlur=12; ctx.shadowColor="#ff6b35";
    drawEdges(OV,OE,"#ff6b35",0.68,-rx+t*0.23,-ry+t*0.17,rz,OO.x,OO.y,OO.z,10,t*1.8);
    ctx.shadowBlur=0;

    // 6. ICOSAEDRO principal — doble capa (glow exterior + wireframe nítido)
    // Capa glow exterior (más opaca, más blur)
    ctx.shadowBlur=28; ctx.shadowColor="#ff3b30";
    drawEdges(icoV,IE,"rgba(255,59,48,0.5)",0.55,rx,ry,rz,0,0,0,28);
    ctx.shadowBlur=0;
    // Capa nítida interior
    ctx.shadowBlur=10; ctx.shadowColor="#ff6b35";
    drawEdges(icoV,IE,"#ff5540",0.88,rx,ry,rz,0,0,0,10,t*3.5);
    ctx.shadowBlur=0;

    // 7. NODOS en vértices del icosaedro
    for (var vi=0;vi<icoV.length;vi++) {
      var vp=rot3(icoV[vi],rx,ry,rz);
      var vq=project(vp);
      if (!vq) continue;
      var vpulse=0.6+0.4*Math.sin(t*2.8+vi*0.9);
      glowDot(vq.x,vq.y,2.5*vq.s*vpulse,"#ff7055",0.85*Math.min(1,vq.s*2.5));
    }

    // 8. SATÉLITES con trail
    for (var si=0;si<sats.length;si++) {
      var s=sats[si];
      var sa=t*s.spd+s.ph;
      var sp={
        x:Math.cos(sa)*s.R,
        y:Math.sin(sa)*s.R*Math.cos(s.tilt),
        z:Math.sin(sa)*s.R*Math.sin(s.tilt)
      };
      sp=rot3(sp,rx*0.35,ry*0.55,0);
      var sq=project(sp);
      if (sq) {
        // Acumular trail
        s.trail.push({x:sq.x,y:sq.y});
        if (s.trail.length>TRAIL_LEN) s.trail.shift();
        // Dibujar trail
        if (s.trail.length>2) drawSatTrail(s.trail,s.col);
        // Dibujar satélite
        var ssize=s.sz*sq.s*2.0;
        if (ssize>0.5) glowDot(sq.x,sq.y,ssize*0.55,s.col,0.92*Math.min(1,sq.s*2.2));
      }
    }

    // 9. PARTÍCULAS
    for (var pi=0;pi<parts.length;pi++) {
      var p=parts[pi];
      var pp=rot3({x:p.x,y:p.y,z:p.z},rx*0.14,ry*0.22+t*0.019,0);
      var pq=project(pp); if (!pq) continue;
      var pr=p.size*Math.min(1.6,pq.s*2.8);
      if (pr<0.25) continue;
      ctx.globalAlpha=(0.45+0.35*Math.sin(t*p.speed*9+p.phase))*Math.min(1,pq.s*2.2);
      ctx.shadowBlur=4; ctx.shadowColor=p.col;
      ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(pq.x,pq.y,pr,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;

    // 10. LÍNEAS CONECTORAS (dashed)
    [[DO.x,DO.y,DO.z],[OO.x,OO.y,OO.z]].forEach(function(off){
      var a3=rot3({x:off[0],y:off[1],z:off[2]},rx*0.3,ry*0.5,0);
      var pa=project(a3), pb=project({x:0,y:0,z:0});
      if (!pa||!pb) return;
      var grad=ctx.createLinearGradient(pa.x,pa.y,pb.x,pb.y);
      grad.addColorStop(0,"rgba(255,107,53,0.35)");
      grad.addColorStop(1,"transparent");
      ctx.globalAlpha=0.22; ctx.strokeStyle=grad;
      ctx.lineWidth=0.9; ctx.setLineDash([5,10]);
      ctx.shadowBlur=6; ctx.shadowColor="#ff6b35";
      ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur=0;
    });

    ctx.globalAlpha=1;
  }

  draw();
  setTimeout(function(){ canvas.classList.add("ready"); }, 80);

})();
