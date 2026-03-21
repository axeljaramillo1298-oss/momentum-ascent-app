/* hero3d.js — Escena 3D premium. THREE cargado via script tag CDN en index.html */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  /* ─── SIZE HELPERS ──────────────────────────────────────── */
  function W() { return canvas.offsetWidth  || window.innerWidth; }
  function H() { return canvas.offsetHeight || window.innerHeight * 0.88; }

  /* ─── RENDERER ──────────────────────────────────────────── */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  /* ─── SCENE + CAMERA ────────────────────────────────────── */
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(48, W() / H(), 0.1, 120);
  // Cámara desplazada hacia la derecha para dejar el texto a la izquierda libre
  camera.position.set(3.5, 0.4, 9);
  camera.lookAt(3.5, 0, 0);

  /* ─── LIGHTS ────────────────────────────────────────────── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  var redLight = new THREE.PointLight(0xff3b30, 8, 18);
  redLight.position.set(0, 3, 5);
  scene.add(redLight);

  var goldLight = new THREE.PointLight(0xf5c04a, 5, 14);
  goldLight.position.set(7, -2, 4);
  scene.add(goldLight);

  var rimLight = new THREE.PointLight(0x4488ff, 2, 12);
  rimLight.position.set(3.5, -5, -3);
  scene.add(rimLight);

  var fillLight = new THREE.PointLight(0xff6b35, 3, 10);
  fillLight.position.set(-2, 1, 6);
  scene.add(fillLight);

  /* ─── HELPER ────────────────────────────────────────────── */
  function mat(color, emissive, emissiveInt) {
    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.95,
      roughness: 0.10,
      emissive: new THREE.Color(emissive || color),
      emissiveIntensity: emissiveInt || 0.06,
    });
  }

  /* ─── MAIN OBJECT — icosaedro grande ───────────────────── */
  var icoG = new THREE.IcosahedronGeometry(2.0, 1);
  var icoM = mat(0x100606, 0xff3b30, 0.08);
  var ico  = new THREE.Mesh(icoG, icoM);
  ico.position.set(3.5, 0, 0);
  scene.add(ico);

  // Wireframe rojo encima
  var wG = new THREE.IcosahedronGeometry(2.04, 1);
  var wM = new THREE.MeshBasicMaterial({ color: 0xff3b30, wireframe: true, transparent: true, opacity: 0.28 });
  var wire = new THREE.Mesh(wG, wM);
  wire.position.copy(ico.position);
  scene.add(wire);

  // Halo / glow esfera exterior
  var haloG = new THREE.SphereGeometry(2.45, 32, 32);
  var haloM = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.04, side: THREE.BackSide });
  var halo  = new THREE.Mesh(haloG, haloM);
  halo.position.copy(ico.position);
  scene.add(halo);

  /* ─── SEGUNDO OBJETO — dodecaedro dorado pequeño ───────── */
  var dG = new THREE.DodecahedronGeometry(0.72, 0);
  var dM = mat(0x1a1005, 0xf5c04a, 0.14);
  var dodec = new THREE.Mesh(dG, dM);
  dodec.position.set(1.2, 1.8, 1.5);
  scene.add(dodec);

  var dwG = new THREE.DodecahedronGeometry(0.74, 0);
  var dwM = new THREE.MeshBasicMaterial({ color: 0xf5c04a, wireframe: true, transparent: true, opacity: 0.35 });
  var dwire = new THREE.Mesh(dwG, dwM);
  dwire.position.copy(dodec.position);
  scene.add(dwire);

  /* ─── TERCER OBJETO — octaedro naranja ──────────────────── */
  var oG = new THREE.OctahedronGeometry(0.5, 0);
  var oM = mat(0x160a02, 0xff6b35, 0.18);
  var oct = new THREE.Mesh(oG, oM);
  oct.position.set(5.8, -1.2, 0.5);
  scene.add(oct);

  /* ─── ANILLOS ORBITALES ─────────────────────────────────── */
  function ring(radius, tube, color, opacity, rx, ry, rz) {
    var g = new THREE.TorusGeometry(radius, tube, 8, 120);
    var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
    var mesh = new THREE.Mesh(g, m);
    mesh.position.set(3.5, 0, 0);
    mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    scene.add(mesh);
    return mesh;
  }

  var r1 = ring(3.0,  0.018, 0xf5c04a, 0.50,  Math.PI / 3.5,  0.4,  0);
  var r2 = ring(3.8,  0.012, 0xff6b35, 0.30, -Math.PI / 4,    0.8,  0);
  var r3 = ring(2.4,  0.014, 0xff3b30, 0.38,  Math.PI / 2.1, -0.6,  0);
  var r4 = ring(4.6,  0.008, 0xf5c04a, 0.15,  0.3,           -0.3, Math.PI / 6);

  /* ─── GRID FLOOR ────────────────────────────────────────── */
  var gridHelper = new THREE.GridHelper(22, 22, 0xff3b30, 0x330505);
  gridHelper.position.set(3.5, -3.5, 0);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.22;
  scene.add(gridHelper);

  /* ─── PARTÍCULAS ────────────────────────────────────────── */
  var COUNT = 380;
  var pArr  = new Float32Array(COUNT * 3);
  var cArr  = new Float32Array(COUNT * 3);
  var colors3 = [
    new THREE.Color(0xff3b30),
    new THREE.Color(0xf5c04a),
    new THREE.Color(0xff6b35),
    new THREE.Color(0xffffff),
  ];
  for (var i = 0; i < COUNT; i++) {
    var r   = 3.2 + Math.random() * 5.5;
    var phi = Math.random() * Math.PI * 2;
    var the = Math.random() * Math.PI;
    pArr[i * 3]     = 3.5 + r * Math.sin(the) * Math.cos(phi);
    pArr[i * 3 + 1] = r * Math.sin(the) * Math.sin(phi);
    pArr[i * 3 + 2] = r * Math.cos(the);
    var c = colors3[Math.floor(Math.random() * colors3.length)];
    cArr[i * 3]     = c.r;
    cArr[i * 3 + 1] = c.g;
    cArr[i * 3 + 2] = c.b;
  }
  var pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
  pGeo.setAttribute("color",    new THREE.BufferAttribute(cArr, 3));
  var pMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.72 });
  var pts  = new THREE.Points(pGeo, pMat);
  scene.add(pts);

  /* ─── SATÉLITES PEQUEÑOS ────────────────────────────────── */
  function sat(r, color, x, y, z) {
    var g = new THREE.OctahedronGeometry(r, 0);
    var m = mat(color, color, 0.2);
    var mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }
  var s1 = sat(0.20, 0xff6b35, 3.5, 0, 0);
  var s2 = sat(0.14, 0xf5c04a, 3.5, 0, 0);
  var s3 = sat(0.10, 0xff3b30, 3.5, 0, 0);
  var s4 = sat(0.08, 0xffffff, 3.5, 0, 0);

  /* ─── LÍNEAS CONECTORAS (wireframe lines) ───────────────── */
  function lineTo(from, to, color) {
    var pts = [new THREE.Vector3(from[0], from[1], from[2]),
               new THREE.Vector3(to[0],   to[1],   to[2])];
    var g = new THREE.BufferGeometry().setFromPoints(pts);
    var m = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.25 });
    scene.add(new THREE.Line(g, m));
  }
  lineTo([3.5, 0, 0], [1.2, 1.8, 1.5], 0xff6b35);
  lineTo([3.5, 0, 0], [5.8, -1.2, 0.5], 0xf5c04a);

  /* ─── MOUSE ─────────────────────────────────────────────── */
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener("mousemove", function (e) {
    tmx = (e.clientX / window.innerWidth  - 0.5) * 2;
    tmy = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ─── RESIZE ────────────────────────────────────────────── */
  function onResize() {
    renderer.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  /* ─── ANIMATE ───────────────────────────────────────────── */
  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();

    // Smooth mouse
    mx += (tmx - mx) * 0.055;
    my += (tmy - my) * 0.055;

    // Main object rotation
    ico.rotation.x  = t * 0.065 + my * 0.20;
    ico.rotation.y  = t * 0.110 + mx * 0.20;
    wire.rotation.copy(ico.rotation);
    halo.rotation.y = ico.rotation.y * 0.4;

    // Dodecaedro spin
    dodec.rotation.x = t * 0.18 + mx * 0.1;
    dodec.rotation.y = t * 0.25;
    dwire.rotation.copy(dodec.rotation);

    // Octaedro spin
    oct.rotation.x = -t * 0.22;
    oct.rotation.z =  t * 0.18 + my * 0.12;

    // Rings orbit
    r1.rotation.z =  t * 0.09;
    r2.rotation.z = -t * 0.07;
    r3.rotation.z =  t * 0.13;
    r4.rotation.z = -t * 0.045;

    // Satélites orbitan alrededor del icosaedro
    var or1 = 3.2, sp1 = 0.48;
    s1.position.set(3.5 + Math.cos(t * sp1) * or1,
                    Math.sin(t * sp1) * 1.6,
                    Math.sin(t * sp1 + 1.2) * 1.0);
    s1.rotation.y = t * 1.4;

    var or2 = 4.0, sp2 = 0.33;
    s2.position.set(3.5 + Math.cos(t * sp2 + 2.1) * or2,
                    Math.sin(t * sp2 + 2.1) * 2.2,
                    0.6);
    s2.rotation.x = t * 0.8;

    var or3 = 2.5, sp3 = 0.65;
    s3.position.set(3.5 + Math.cos(t * sp3 + 4.0) * or3,
                    -0.8,
                    Math.sin(t * sp3 + 4.0) * or3);

    var or4 = 5.2, sp4 = 0.22;
    s4.position.set(3.5 + Math.cos(t * sp4 + 1.0) * or4,
                    Math.sin(t * sp4 + 0.5) * 3.0,
                    Math.cos(t * sp4) * 1.5);

    // Particles drift
    pts.rotation.y =  t * 0.022;
    pts.rotation.x = -t * 0.009;

    // Grid floor breathing
    gridHelper.position.y = -3.5 + Math.sin(t * 0.4) * 0.15;
    gridHelper.material.opacity = 0.18 + Math.sin(t * 0.6) * 0.06;

    // Camera parallax
    camera.position.x += (3.5 + mx * 0.6 - camera.position.x) * 0.032;
    camera.position.y += (-my * 0.45 - camera.position.y) * 0.032;
    camera.lookAt(3.5 + mx * 0.2, my * 0.1, 0);

    // Lights pulse
    redLight.intensity  = 8  + Math.sin(t * 1.1) * 2.5;
    goldLight.intensity = 5  + Math.sin(t * 0.7 + 1.0) * 1.5;
    fillLight.intensity = 3  + Math.sin(t * 0.9 + 2.0) * 1.0;

    renderer.render(scene, camera);
  }

  animate();

  // Fade in al arrancar
  setTimeout(function () {
    canvas.classList.add("ready");
  }, 120);

})();
