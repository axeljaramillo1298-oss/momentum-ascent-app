/**
 * hero3d.js — Escena 3D premium para el hero de index.html
 * Usa Three.js via CDN importmap definido en index.html
 */
import * as THREE from 'three';

const canvas = document.getElementById('hero-canvas');
if (!canvas) throw new Error('[hero3d] canvas no encontrado');

/* ─── RENDERER ─────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setClearColor(0x000000, 0);
renderer.setSize(canvas.clientWidth || window.innerWidth * 0.55, canvas.clientHeight || window.innerHeight);

/* ─── SCENE + CAMERA ────────────────────────────────── */
const scene  = new THREE.Scene();
const W = () => canvas.clientWidth  || 800;
const H = () => canvas.clientHeight || 600;
const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
camera.position.set(0, 0, 7);

/* ─── LIGHTS ────────────────────────────────────────── */
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const redLight = new THREE.PointLight(0xff3b30, 6, 14);
redLight.position.set(-3, 2.5, 4);
scene.add(redLight);

const goldLight = new THREE.PointLight(0xf5c04a, 3, 10);
goldLight.position.set(3.5, -1.5, 3);
scene.add(goldLight);

const blueRim = new THREE.PointLight(0x4488ff, 1.2, 12);
blueRim.position.set(0, -4, -2);
scene.add(blueRim);

/* ─── MAIN SHAPE: icosaedro metálico ────────────────── */
const icoGeo = new THREE.IcosahedronGeometry(1.65, 1);
const icoMat = new THREE.MeshStandardMaterial({
  color:             0x120808,
  metalness:         0.96,
  roughness:         0.10,
  emissive:          new THREE.Color(0xff3b30),
  emissiveIntensity: 0.06,
});
const ico = new THREE.Mesh(icoGeo, icoMat);
scene.add(ico);

/* ─── WIREFRAME OVERLAY ─────────────────────────────── */
const wireGeo = new THREE.IcosahedronGeometry(1.68, 1);
const wireMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, wireframe: true, transparent: true, opacity: 0.22 });
const wire = new THREE.Mesh(wireGeo, wireMat);
scene.add(wire);

/* ─── OUTER GLOW SPHERE ─────────────────────────────── */
const glowGeo = new THREE.SphereGeometry(2.0, 32, 32);
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.035, side: THREE.BackSide });
const glow = new THREE.Mesh(glowGeo, glowMat);
scene.add(glow);

/* ─── ORBITING RINGS ────────────────────────────────── */
function makeRing(radius, tube, color, opacity, rx, ry) {
  const g = new THREE.TorusGeometry(radius, tube, 8, 120);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = rx;
  mesh.rotation.y = ry;
  scene.add(mesh);
  return mesh;
}
const ring1 = makeRing(2.55, 0.014, 0xf5c04a, 0.40,  Math.PI / 3.8,  0.3);
const ring2 = makeRing(3.20, 0.009, 0xff6b35, 0.22, -Math.PI / 4,    0.8);
const ring3 = makeRing(2.00, 0.010, 0xff3b30, 0.30,  Math.PI / 2.2, -0.5);

/* ─── PARTICLES ─────────────────────────────────────── */
const PARTICLE_COUNT = 260;
const pPos = new Float32Array(PARTICLE_COUNT * 3);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const r   = 2.8 + Math.random() * 4.5;
  const phi = Math.random() * Math.PI * 2;
  const the = Math.random() * Math.PI;
  pPos[i * 3]     = r * Math.sin(the) * Math.cos(phi);
  pPos[i * 3 + 1] = r * Math.sin(the) * Math.sin(phi);
  pPos[i * 3 + 2] = r * Math.cos(the);
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.55 });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

/* ─── SMALL FLOATING SATELLITES ─────────────────────── */
function satellite(radius, color) {
  const g = new THREE.OctahedronGeometry(radius);
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.15, emissive: color, emissiveIntensity: 0.12 });
  return new THREE.Mesh(g, m);
}
const sat1 = satellite(0.18, 0xff6b35);
const sat2 = satellite(0.12, 0xf5c04a);
const sat3 = satellite(0.10, 0xff3b30);
scene.add(sat1, sat2, sat3);

/* ─── MOUSE PARALLAX ────────────────────────────────── */
let mx = 0, my = 0;
let targetMx = 0, targetMy = 0;
window.addEventListener('mousemove', e => {
  targetMx = (e.clientX / window.innerWidth  - 0.5) * 2;
  targetMy = (e.clientY / window.innerHeight - 0.5) * 2;
});

/* ─── RESIZE ────────────────────────────────────────── */
function onResize() {
  renderer.setSize(W(), H());
  camera.aspect = W() / H();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

/* ─── ANIMATE ───────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Smooth mouse follow
  mx += (targetMx - mx) * 0.06;
  my += (targetMy - my) * 0.06;

  // Main shape rotation + mouse tilt
  ico.rotation.x  = t * 0.07  + my * 0.18;
  ico.rotation.y  = t * 0.13  + mx * 0.18;
  wire.rotation.x = ico.rotation.x;
  wire.rotation.y = ico.rotation.y;
  glow.rotation.y = ico.rotation.y * 0.5;

  // Rings orbit at different speeds
  ring1.rotation.z =  t * 0.10;
  ring2.rotation.z = -t * 0.07;
  ring3.rotation.z =  t * 0.14;

  // Satellites orbit
  const s1x = Math.cos(t * 0.55) * 2.3;
  const s1y = Math.sin(t * 0.55) * 1.4;
  const s1z = Math.sin(t * 0.55 + 1) * 0.9;
  sat1.position.set(s1x, s1y, s1z);
  sat1.rotation.y = t * 1.2;

  const s2x = Math.cos(t * 0.38 + 2.1) * 2.8;
  const s2y = Math.sin(t * 0.38 + 2.1) * 2.0;
  sat2.position.set(s2x, s2y, 0.4);
  sat2.rotation.x = t * 0.9;

  const s3x = Math.cos(t * 0.62 + 4) * 2.0;
  const s3z = Math.sin(t * 0.62 + 4) * 2.0;
  sat3.position.set(s3x, -0.5, s3z);

  // Particles slow drift
  particles.rotation.y  =  t * 0.025;
  particles.rotation.x  = -t * 0.010;

  // Camera parallax
  camera.position.x += (mx * 0.35 - camera.position.x) * 0.035;
  camera.position.y += (-my * 0.25 - camera.position.y) * 0.035;
  camera.lookAt(scene.position);

  // Dynamic light pulse
  redLight.intensity  = 6 + Math.sin(t * 1.1) * 1.8;
  goldLight.intensity = 3 + Math.sin(t * 0.7 + 1) * 1.0;

  renderer.render(scene, camera);
}

animate();
